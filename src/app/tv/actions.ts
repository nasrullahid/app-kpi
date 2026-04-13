'use server'

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'

export type Milestone = Database['public']['Tables']['program_milestones']['Row']
export type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
export type MetricDefinition = Database['public']['Tables']['program_metric_definitions']['Row']
export type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']

export type Program = Database['public']['Tables']['programs']['Row'] & {
  program_pics: { profile_id: string }[]
  program_milestones: Milestone[]
}

export type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
export type Period = Database['public']['Tables']['periods']['Row']

export type ProgramPerformance = Database['public']['Tables']['programs']['Row'] & {
  achievementRp: number
  achievementUser: number
  percentageRp: number
  percentageUser: number
  status: 'TERCAPAI' | 'MENUJU TARGET' | 'PERLU PERHATIAN'
  latestQualitativeStatus: Database['public']['Enums']['qualitative_status'] | null
  qualitativePercentage: number
  totalMilestones: number
  completedMilestones: number
  team: { id: string, name: string }[]
  program_milestones: Milestone[]
}

export interface PICPerformance {
  picId: string
  picName: string
  programCount: number
  totalTargetRp: number
  totalAchievementRp: number
  totalTargetUser: number
  totalAchievementUser: number
  percentageRp: number
  status: 'TERCAPAI' | 'MENUJU TARGET' | 'PERLU PERHATIAN'
}

export interface TVDashboardData {
  activePeriod: Period | null
  aggregate: {
    totalTargetRp: number
    totalAchievementRp: number
    totalTargetUser: number
    totalAchievementUser: number
    percentageRp: number
    percentageUser: number
    tercapai: number
    menujuTarget: number
    perluPerhatian: number
  }
  programs: ProgramPerformance[]
  pics: PICPerformance[]
  rawInputs: DailyInput[]
  metricDefinitions: MetricDefinition[]
  metricValues: MetricValue[]
}

export async function getTVDashboardData(): Promise<TVDashboardData> {
  const supabase = createClient()
  
  // 1. Fetch Active Period
  const { data: activePeriod } = await supabase
    .from('periods')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!activePeriod) {
    return {
      activePeriod: null,
      aggregate: {
        totalTargetRp: 0,
        totalAchievementRp: 0,
        totalTargetUser: 0,
        totalAchievementUser: 0,
        percentageRp: 0,
        percentageUser: 0,
        tercapai: 0,
        menujuTarget: 0,
        perluPerhatian: 0
      },
      programs: [],
      pics: [],
      rawInputs: [],
      metricDefinitions: [],
      metricValues: []
    }
  }

  // 2. Fetch All Active Programs with Teams and Milestones
  const { data: allPrograms } = await supabase
    .from('programs')
    .select('*, program_pics(profile_id), program_milestones(*)')
    .eq('is_active', true)

  const rawPrograms = (allPrograms as Program[]) || []

  // 3. Fetch All Milestone Completions (Full persistence)
  const allMilestoneIds = rawPrograms.flatMap(p => p.program_milestones.map((m: Milestone) => m.id))
  const { data: milestoneCompletions } = await supabase
    .from('milestone_completions')
    .select('*')
    .in('milestone_id', allMilestoneIds)

  const completions = (milestoneCompletions as MilestoneCompletion[]) || []

  // 4. Fetch All Profiles
  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const profileMap = new Map(profiles?.map(p => [p.id, p.name]))

  // 5. Fetch All Daily Inputs for this Period
  const { data: allInputs } = await supabase
    .from('daily_inputs')
    .select('*')
    .eq('period_id', activePeriod.id)

  const inputs = (allInputs as DailyInput[]) || []

  // 6. Process Program Performance
  const programPerformance: ProgramPerformance[] = rawPrograms.map(prog => {
    const progInputs = inputs.filter(i => i.program_id === prog.id)
    const achievementRp = progInputs.reduce((sum, i) => sum + (i.achievement_rp || 0), 0)
    const achievementUser = progInputs.reduce((sum, i) => sum + (i.achievement_user || 0), 0)
    
    const percentageRp = prog.monthly_target_rp && prog.monthly_target_rp > 0 
      ? (achievementRp / prog.monthly_target_rp) * 100 
      : 0
    
    // Qualitative Progress
    const totalMilestones = prog.program_milestones.length
    const completedMilestones = prog.program_milestones.filter((ms: Milestone) => 
      completions.find(c => c.milestone_id === ms.id && c.is_completed)
    ).length
    const qualitativePercentage = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0

    let status: ProgramPerformance['status'] = 'PERLU PERHATIAN'
    if (prog.target_type === 'qualitative') {
      if (qualitativePercentage >= 100) status = 'TERCAPAI'
      else if (qualitativePercentage >= 50) status = 'MENUJU TARGET'
    } else {
      if (percentageRp >= 100) status = 'TERCAPAI'
      else if (percentageRp >= 50) status = 'MENUJU TARGET'
    }

    const team = prog.program_pics.map(pp => ({
      id: pp.profile_id,
      name: profileMap.get(pp.profile_id) || '??'
    }))

    return {
      ...prog,
      achievementRp,
      achievementUser,
      percentageRp,
      percentageUser: prog.monthly_target_user ? (achievementUser / prog.monthly_target_user) * 100 : 0,
      status,
      latestQualitativeStatus: null, // Legacy field
      qualitativePercentage,
      totalMilestones,
      completedMilestones,
      team
    }
  })

  // 7. Process PIC Performance (Aggregated by Unique PIC)
  const picMap = new Map<string, PICPerformance>()
  
  programPerformance.forEach(prog => {
    prog.team.forEach(member => {
      const existing = picMap.get(member.id) || {
        picId: member.id,
        picName: member.name,
        programCount: 0,
        totalTargetRp: 0,
        totalAchievementRp: 0,
        totalTargetUser: 0,
        totalAchievementUser: 0,
        percentageRp: 0,
        status: 'PERLU PERHATIAN'
      }

      existing.programCount += 1
      existing.totalTargetRp += (prog.monthly_target_rp || 0)
      existing.totalAchievementRp += prog.achievementRp
      existing.totalTargetUser += (prog.monthly_target_user || 0)
      existing.totalAchievementUser += prog.achievementUser
      
      picMap.set(member.id, existing)
    })
  })

  const picPerformance: PICPerformance[] = Array.from(picMap.values()).map(pic => {
    const percentageRp = pic.totalTargetRp > 0 ? (pic.totalAchievementRp / pic.totalTargetRp) * 100 : 0
    let status: PICPerformance['status'] = 'PERLU PERHATIAN'
    if (percentageRp >= 100) status = 'TERCAPAI'
    else if (percentageRp >= 50) status = 'MENUJU TARGET'
    
    return { ...pic, percentageRp, status }
  })

  // 8. Global Aggregates
  const totalTargetRp = programPerformance.reduce((sum, p) => sum + (p.monthly_target_rp || 0), 0)
  const totalAchievementRp = programPerformance.reduce((sum, p) => sum + p.achievementRp, 0)
  const totalTargetUser = programPerformance.reduce((sum, p) => sum + (p.monthly_target_user || 0), 0)
  const totalAchievementUser = programPerformance.reduce((sum, p) => sum + p.achievementUser, 0)
  
  const aggPercentageRp = totalTargetRp > 0 ? (totalAchievementRp / totalTargetRp) * 100 : 0

  // 9. Fetch Metric Definitions + Values
  const programIds = rawPrograms.map(p => p.id)

  const { data: metricDefData } = await supabase
    .from('program_metric_definitions')
    .select('*')
    .in('program_id', programIds)

  const { data: metricValueData } = await supabase
    .from('daily_metric_values')
    .select('*')
    .in('program_id', programIds)
    .eq('period_id', activePeriod.id)

  return {
    activePeriod,
    aggregate: {
      totalTargetRp,
      totalAchievementRp,
      totalTargetUser,
      totalAchievementUser,
      percentageRp: aggPercentageRp,
      percentageUser: totalTargetUser > 0 ? (totalAchievementUser / totalTargetUser) * 100 : 0,
      tercapai: programPerformance.filter(p => p.status === 'TERCAPAI').length,
      menujuTarget: programPerformance.filter(p => p.status === 'MENUJU TARGET').length,
      perluPerhatian: programPerformance.filter(p => p.status === 'PERLU PERHATIAN').length
    },
    programs: programPerformance,
    pics: picPerformance,
    rawInputs: inputs,
    metricDefinitions: (metricDefData as MetricDefinition[]) || [],
    metricValues: (metricValueData as MetricValue[]) || []
  }
}
