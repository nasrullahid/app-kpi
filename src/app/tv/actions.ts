'use server'

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import { 
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

export type UnifiedMetric = {
  key: string
  label: string
  achieved: number
  target: number
  unit: string
  dataType: string
}

export type ProgramPerformance = ProgramWithRelations & {
  health: ProgramHealthResult
  unifiedPrimaryMetrics: UnifiedMetric[]
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

import { getUnifiedDashboardData } from '@/lib/dashboard-service'

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
    
    // Use unified metrics from calculated results
    const definitions = prog.program_metric_definitions || []
    
    // Identify primary candidates: explicitly marked OR belonging to core groups
    const coreGroupKeys = ['revenue', 'user_acquisition']
    const coreMetricKeys = ['revenue', 'user_count', 'omzet', 'closing']
    
    const primaryDefs = definitions.filter(m => 
      m.is_primary || 
      coreGroupKeys.includes(m.metric_group || '') || 
      coreMetricKeys.includes(m.metric_key?.toLowerCase() || '')
    ).filter(m => m.is_target_metric)
    // Sort to keep revenue first, then user_count, then others
    .sort((a, b) => {
      const getPriority = (m: MetricDefinition) => {
        const k = m.metric_key?.toLowerCase()
        const g = m.metric_group
        if (g === 'revenue' || k === 'revenue' || k === 'omzet') return 1
        if (g === 'user_acquisition' || k === 'user_count' || k === 'closing') return 2
        return 3
      }
      return getPriority(a) - getPriority(b)
    })

    const unifiedPrimaryMetrics: UnifiedMetric[] = primaryDefs.map(m => ({
      key: m.metric_key,
      label: m.label,
      achieved: ph.calculatedMetrics?.[m.metric_key] || 0,
      target: ph.effectiveTargets?.[m.metric_key] || 0,
      unit: m.unit_label || '',
      dataType: m.data_type
    }))

    // Fallback for legacy programs without primary metric definitions
    if (unifiedPrimaryMetrics.length === 0 && !ph.isQualitativeOnly) {
      if ((prog.monthly_target_rp || 0) > 0) {
        unifiedPrimaryMetrics.push({
          key: 'revenue',
          label: 'Omzet',
          achieved: ph.calculatedMetrics?.['revenue'] || 0,
          target: ph.effectiveTargets?.['revenue'] || prog.monthly_target_rp || 0,
          unit: 'Rp',
          dataType: 'currency'
        })
      }
      if ((prog.monthly_target_user || 0) > 0) {
        unifiedPrimaryMetrics.push({
          key: 'user_count',
          label: 'User',
          achieved: ph.calculatedMetrics?.['user_count'] || 0,
          target: ph.effectiveTargets?.['user_count'] || prog.monthly_target_user || 0,
          unit: 'user',
          dataType: 'integer'
        })
      }
    }
    
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
      unifiedPrimaryMetrics,
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
      metricGroups: data.summary.aggregates as Record<string, { actual: number; target: number; isComputed: boolean }>,
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
