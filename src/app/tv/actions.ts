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
    metricGroups: Record<string, { actual: number, target: number, totalTarget: number, isComputed: boolean }>
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
    
    const isMoU = (prog.target_type as string) === 'mou'
    const coreMetricKeys = ['revenue', 'user_count', 'omzet', 'closing', 'leads', 'prospek', 'agreement_leads', 'mou_signed']
    
    const primaryDefs = definitions.filter(m => 
      m.is_primary || 
      m.is_target_metric || 
      (isMoU && coreMetricKeys.includes(m.metric_key?.toLowerCase() || ''))
    )
    // Sort to keep revenue first, then user_count, then others
    .sort((a, b) => {
      const getPriority = (m: MetricDefinition) => {
        const k = m.metric_key?.toLowerCase()
        const g = m.metric_group
        // For general view: Revenue 1, Acq 2, Leads 3
        // If MoU, we might want Leads 1, Acq 2
        if (g === 'leads' || k === 'leads' || k === 'prospek' || k === 'agreement_leads') return 1
        if (g === 'revenue' || k === 'revenue' || k === 'omzet') return 2
        if (g === 'user_acquisition' || k === 'user_count' || k === 'closing' || k === 'mou_signed') return 3
        return 4
      }
      return getPriority(a) - getPriority(b)
    })

    // --- Group and Sum Unified Metrics (Summing by Revenue/Acquisition) ---
    const unifiedMetricsMap = new Map<string, UnifiedMetric>()
    
    primaryDefs.forEach(m => {
      const k = m.metric_key?.toLowerCase()
      const g = m.metric_group || 
                (['revenue', 'omzet', 'pemasukan', 'revenue_from_paid_traffic'].includes(k) ? 'revenue' : 
                 (['user_count', 'closing', 'leads_converted', 'pembelian', 'mou_signed'].includes(k) || k.includes('closing')) ? 'user_acquisition' :
                 null)
      
      if (!g) {
        // Standalone primary metric or ungrouped core metric (e.g. leads, prospek)
        const key = m.metric_key
        unifiedMetricsMap.set(key, {
          key,
          label: m.label,
          achieved: ph.calculatedMetrics?.[key] || 0,
          target: m.data_type === 'currency' ? (m.monthly_target || 0) : Math.round(m.monthly_target || 0),
          unit: m.unit_label || '',
          dataType: m.data_type
        })
        return
      }

      const existing = unifiedMetricsMap.get(g)
      const achieved = ph.calculatedMetrics?.[m.metric_key] || 0
      const absoluteTarget = m.monthly_target || 0
      if (existing) {
        existing.achieved += achieved
        existing.target += (m.data_type === 'currency' ? absoluteTarget : Math.round(absoluteTarget))
      } else {
        let label = m.label
        if (prog.target_type === 'mou') {
          if (g === 'leads' || m.metric_key === 'leads' || m.metric_key === 'prospek' || m.metric_key === 'prospek_kerja_sama') label = 'Prospek Baru'
          else if (g === 'user_acquisition' || m.metric_key === 'user_count' || m.metric_key === 'mou_signed' || m.metric_key === 'tanda_tangan_mou') label = 'Tanda Tangan MoU'
          else if (g === 'conversion' || m.metric_key === 'conversion_rate') label = 'Konversi Kumulatif'
        }

        unifiedMetricsMap.set(g || m.metric_key, {
          key: g || m.metric_key,
          label,
          achieved,
          target: m.data_type === 'currency' ? absoluteTarget : Math.round(absoluteTarget),
          unit: m.unit_label || '',
          dataType: m.data_type
        })
      }
    })

    // --- Special MoU Cumulative Conversion Metric ---
    if (prog.target_type === 'mou' && !unifiedMetricsMap.has('conversion')) {
      const convMetric = ph.calculatedMetrics?.['conversion_rate'] || 0
      unifiedMetricsMap.set('conversion', {
        key: 'conversion',
        label: 'Konversi Kumulatif',
        achieved: convMetric,
        target: 0,
        unit: '%',
        dataType: 'float'
      })
    }

    // --- Enhanced legacy target merging ---
    // Merge Revenue
    const existingRev = unifiedMetricsMap.get('revenue')
    const legacyRevTarget = prog.monthly_target_rp || 0
    if (legacyRevTarget > 0 && !ph.isQualitativeOnly && !isMoU) {
      if (!existingRev) {
        unifiedMetricsMap.set('revenue', {
          key: 'revenue',
          label: 'Omzet',
          achieved: ph.calculatedMetrics?.['revenue'] || 0,
          target: legacyRevTarget,
          unit: 'Rp',
          dataType: 'currency'
        })
      } else if (existingRev.target === 0) {
        existingRev.target = legacyRevTarget
      }
    }

    // Merge Leads for MoU (MoU uses monthly_target_rp for leads target)
    const existingLeads = unifiedMetricsMap.get('leads') || Array.from(unifiedMetricsMap.values()).find(m => m.key === 'agreement_leads' || m.key === 'leads' || m.key === 'prospek')
    if (isMoU && legacyRevTarget > 0) {
      if (existingLeads) {
        if (existingLeads.target === 0) existingLeads.target = legacyRevTarget
      } else {
        unifiedMetricsMap.set('leads', {
          key: 'leads',
          label: 'Prospek',
          achieved: ph.calculatedMetrics?.['agreement_leads'] || ph.calculatedMetrics?.['leads'] || 0,
          target: legacyRevTarget,
          unit: 'prospek',
          dataType: 'integer'
        })
      }
    }
    
    // Merge User Acquisition
    const existingAcq = unifiedMetricsMap.get('user_acquisition')
    const legacyUserTarget = prog.monthly_target_user || 0
    if (legacyUserTarget > 0 && !ph.isQualitativeOnly) {
      if (!existingAcq) {
        unifiedMetricsMap.set('user_acquisition', {
          key: 'user_acquisition',
          label: isMoU ? 'Tanda Tangan MoU' : 'Closing',
          achieved: ph.calculatedMetrics?.['mou_signed'] || ph.calculatedMetrics?.['user_count'] || 0,
          target: legacyUserTarget,
          unit: isMoU ? 'mou' : 'user',
          dataType: 'integer'
        })
      } else if (existingAcq.target === 0) {
        existingAcq.target = legacyUserTarget
      }
    }

    // ── Add Lead to MoU Rate (Conversion) ──
    if (isMoU) {
      const totalLeadsCumulative = ph.calculatedMetrics?.['mou_total_leads_raw'] || 0
      const totalTTDCumulative = ph.calculatedMetrics?.['mou_total_ttd_raw'] || 0
      const rate = totalLeadsCumulative > 0 ? (totalTTDCumulative / totalLeadsCumulative) : 0
      
      unifiedMetricsMap.set('conversion_rate', {
        key: 'conversion_rate',
        label: 'Lead to MoU Rate',
        achieved: rate,
        target: 0,
        unit: '%',
        dataType: 'percentage'
      })
    }

    const unifiedPrimaryMetrics = Array.from(unifiedMetricsMap.values())
    
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
      metricGroups: data.summary.aggregates as Record<string, { actual: number; target: number; totalTarget: number; isComputed: boolean }>,
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
