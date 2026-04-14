'use server'

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import { 
  calculateProgramHealth, 
  aggregateByMetricGroup, 
  ProgramWithRelations,
  ProgramHealthResult,
  getHealthStatus,
  getPerformanceGrade
} from '@/lib/dashboard-calculator'

export type Milestone = Database['public']['Tables']['program_milestones']['Row']
export type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
export type MetricDefinition = Database['public']['Tables']['program_metric_definitions']['Row']
export type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']

export type Program = Database['public']['Tables']['programs']['Row'] & {
  program_pics: { profile_id: string }[]
  program_milestones: Milestone[]
  program_metric_definitions: MetricDefinition[]
}

export type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
export type Period = Database['public']['Tables']['periods']['Row']

export type ProgramPerformance = ProgramWithRelations & {
  health: ProgramHealthResult
  achievementRp: number
  achievementUser: number
  percentageRp: number
  percentageUser: number
  qualitativePercentage: number
  totalMilestones: number
  completedMilestones: number
  team: { id: string, name: string }[]
}

export interface PICPerformance {
  picId: string
  picName: string
  programCount: number
  avgHealthScore: number
  status: ProgramHealthResult['status']
  grade: { label: string, color: string }
}

export interface TVDashboardData {
  activePeriod: Period | null
  aggregate: {
    healthScore: number
    metricGroups: Record<string, { actual: number, target: number, isComputed: boolean }>
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

import { getUnifiedDashboardData, DashboardSummary } from '@/lib/dashboard-service'

export async function getTVDashboardData(): Promise<TVDashboardData> {
  const supabase = createClient()
  
  // 1. Fetch data from unified service (No PIC filter for TV)
  const data = await getUnifiedDashboardData({
    isAdmin: true // TV always sees everything
  })

  if (!data.activePeriod) {
    return {
      activePeriod: null,
      aggregate: { healthScore: 0, metricGroups: {}, tercapai: 0, menujuTarget: 0, perluPerhatian: 0 },
      programs: [],
      pics: [],
      rawInputs: [],
      metricDefinitions: [],
      metricValues: []
    }
  }

  // 2. Fetch profiles for PIC Mapping
  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const profileMap = new Map(profiles?.map(p => [p.id, p.name]))

  // 3. Decorate programs for TV view
  const programPerformance: ProgramPerformance[] = data.summary.programHealths.map(ph => {
    const prog = ph.program
    
    const progInputs = data.dailyInputs.filter(i => i.program_id === prog.id)
    const achievementRp = progInputs.reduce((sum, i) => sum + (i.achievement_rp || 0), 0)
    const achievementUser = progInputs.reduce((sum, i) => sum + (i.achievement_user || 0), 0)
    
    const totalMilestones = prog.program_milestones?.length || 0
    const completedMilestones = prog.program_milestones?.filter(ms => 
      data.milestoneCompletions.find(c => c.milestone_id === ms.id && c.is_completed)
    ).length || 0
    const qualitativePercentage = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0

    const team = prog.program_pics?.map(pp => ({
      id: pp.profile_id,
      name: profileMap.get(pp.profile_id) || '??'
    })) || []

    return {
      ...prog,
      health: ph,
      achievementRp,
      achievementUser,
      percentageRp: prog.monthly_target_rp ? (achievementRp / prog.monthly_target_rp) * 100 : 0,
      percentageUser: prog.monthly_target_user ? (achievementUser / prog.monthly_target_user) * 100 : 0,
      qualitativePercentage,
      totalMilestones,
      completedMilestones,
      team
    }
  })

  // 4. PIC Performance
  const picMap = new Map<string, { picId: string, picName: string, healthSum: number, count: number }>()
  programPerformance.forEach(prog => {
    prog.team.forEach(member => {
      const existing = picMap.get(member.id) || { picId: member.id, picName: member.name, healthSum: 0, count: 0 }
      existing.healthSum += prog.health.healthScore
      existing.count += 1
      picMap.set(member.id, existing)
    })
  })

  const picPerformance: PICPerformance[] = Array.from(picMap.values()).map(pic => {
    const avgHealth = pic.healthSum / pic.count
    return {
      picId: pic.picId,
      picName: pic.picName,
      programCount: pic.count,
      avgHealthScore: avgHealth,
      status: getHealthStatus(avgHealth),
      grade: getPerformanceGrade(avgHealth)
    }
  })

  return {
    activePeriod: data.activePeriod,
    aggregate: {
      healthScore: data.summary.overallHealth,
      metricGroups: data.summary.aggregates as any,
      tercapai: data.summary.statusCounts.tercapai,
      menujuTarget: data.summary.statusCounts.menujuTarget,
      perluPerhatian: data.summary.statusCounts.perluPerhatian
    },
    programs: programPerformance,
    pics: picPerformance,
    rawInputs: data.dailyInputs,
    metricDefinitions: data.programs.flatMap(p => p.program_metric_definitions || []),
    metricValues: data.metricValues
  }
}
