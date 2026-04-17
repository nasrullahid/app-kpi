import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
export { type ProgramWithRelations } from './dashboard-calculator'
import { 
  calculateProgramHealth, 
  aggregateByMetricGroup, 
  aggregateGlobalKPIs,
  aggregateAdsMetrics,
  buildAdsDailySeries,
  buildHealthTrendSeries,
  buildTargetTrendSeries,
  ProgramWithRelations,
  ProgramHealthResult,
  HealthTrendPoint,
  TargetTrendPoint
} from './dashboard-calculator'

type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']
type Period = Database['public']['Tables']['periods']['Row']

export interface DashboardSummary {
  overallHealth: number
  statusCounts: {
    tercapai: number
    menujuTarget: number
    perluPerhatian: number
  }
  aggregates: ReturnType<typeof aggregateByMetricGroup>
  globalKPIs: ReturnType<typeof aggregateGlobalKPIs>
  adsMetrics: ReturnType<typeof aggregateAdsMetrics>
  adsDailySeries: ReturnType<typeof buildAdsDailySeries>
  healthTrend: HealthTrendPoint[]
  targetTrend: TargetTrendPoint[]
  programHealths: (ProgramHealthResult & { program: ProgramWithRelations })[]
}

export interface UnifiedDashboardData {
  programs: ProgramWithRelations[]
  dailyInputs: DailyInput[]
  milestoneCompletions: MilestoneCompletion[]
  metricValues: MetricValue[]
  activePeriod: Period | null
  prorationFactor: number
  summary: DashboardSummary
  previousData?: {
    dailyInputs: DailyInput[]
    metricValues: MetricValue[]
    summary: DashboardSummary
  }
}

/**
 * Core service to fetch and process dashboard data.
 * Used by main dashboard, target dashboard, and TV dashboard.
 */
export async function getUnifiedDashboardData(options: {
  profileId?: string
  isAdmin?: boolean
  startDate?: string
  endDate?: string
  periodId?: string
  includePrevious?: boolean
}): Promise<UnifiedDashboardData> {
  const supabase = createClient()
  
  // 1 & 2. Fetch Active Period and Programs in parallel
  const [periodResult, programsResult] = await Promise.all([
    (async () => {
      let q = supabase.from('periods').select('*')
      if (options.periodId) {
        q = q.eq('id', options.periodId)
      } else {
        q = q.eq('is_active', true)
      }
      return q.single()
    })(),
    (async () => {
      let q = supabase
        .from('programs')
        .select('*, program_pics(profile_id), program_milestones(*), program_metric_definitions(*)')
        .eq('is_active', true)

      if (options.profileId && !options.isAdmin) {
        const { data: myTeamPrograms } = await supabase
          .from('program_pics')
          .select('program_id')
          .eq('profile_id', options.profileId)
        const myProgramIds = myTeamPrograms?.map(tp => tp.program_id) || []
        q = q.in('id', myProgramIds)
      }
      return q.order('name') as unknown as Promise<{ data: ProgramWithRelations[] | null }>
    })()
  ])

  const activePeriod = periodResult.data
  const programs = (programsResult.data || []) as ProgramWithRelations[]
  const programIds = programs.map(p => p.id)

  if (!activePeriod || programs.length === 0) {
    return {
      programs: programs,
      dailyInputs: [],
      milestoneCompletions: [],
      metricValues: [],
      activePeriod: activePeriod || null,
      prorationFactor: 1,
      summary: {
        overallHealth: 0,
        statusCounts: { tercapai: 0, menujuTarget: 0, perluPerhatian: 0 },
        aggregates: {},
        globalKPIs: {
          avgHealth: 0,
          activeProgramsCount: 0,
          totalPrograms: 0,
          targetsHit: 0,
          totalMilestones: 0,
          completedMilestones: 0,
          healthStatus: 'KRITIS'
        },
        adsMetrics: {
          totalAdsSpent: 0,
          totalRevenue: 0,
          totalGoals: 0,
          totalLeads: 0,
          avgRoas: 0,
          avgCpp: 0,
          avgCr: 0
        },
        adsDailySeries: [],
        healthTrend: [],
        targetTrend: [],
        programHealths: []
      }
    }
  }

  // 3, 4, 5. Fetch all data for the period/range in parallel
  const milestoneIds = programs.flatMap(p => p.program_milestones?.map(m => m.id) || [])

  const [inputsResult, metricsResult, milestoneResult] = await Promise.all([
    // Daily Inputs
    (async () => {
      let q = supabase.from('daily_inputs').select('*').in('program_id', programIds)
      if (options.startDate && options.endDate) {
        q = q.gte('date', options.startDate).lte('date', options.endDate)
      } else {
        q = q.eq('period_id', activePeriod.id)
      }
      return q
    })(),
    // Metric Values
    (async () => {
      let q = supabase.from('daily_metric_values').select('*').in('program_id', programIds)
      if (options.startDate && options.endDate) {
        q = q.gte('date', options.startDate).lte('date', options.endDate)
      } else {
        q = q.eq('period_id', activePeriod.id)
      }
      return q
    })(),
    // Milestone Completions
    (async () => {
      if (milestoneIds.length === 0) return { data: [] }
      let q = supabase.from('milestone_completions').select('*').in('milestone_id', milestoneIds)
      if (options.startDate && options.endDate) {
        q = q.gte('completed_at', options.startDate).lte('completed_at', options.endDate + 'T23:59:59')
      } else {
        q = q.eq('period_id', activePeriod.id)
      }
      return q
    })()
  ])

  const dailyInputs = inputsResult.data || []
  const metricValues = metricsResult.data || []
  const milestoneCompletions = milestoneResult.data || []

  // 6. Indexing for O(1) Lookups in Calculator
  const metricValuesByProgram = new Map<string, MetricValue[]>()
  metricValues.forEach(mv => {
    const list = metricValuesByProgram.get(mv.program_id) || []
    list.push(mv)
    metricValuesByProgram.set(mv.program_id, list)
  })

  const dailyInputsByProgram = new Map<string, DailyInput[]>()
  dailyInputs.forEach(di => {
    const list = dailyInputsByProgram.get(di.program_id) || []
    list.push(di)
    dailyInputsByProgram.set(di.program_id, list)
  })

  const milestoneCompletionsByMilestone = new Map<string, MilestoneCompletion>()
  milestoneCompletions.forEach(mc => {
    milestoneCompletionsByMilestone.set(mc.milestone_id, mc as MilestoneCompletion)
  })

  // 7. Proration Factor & Summary
  const workingDays = activePeriod.working_days || 30
  const today = new Date().getDate()
  
  let prorationFactor = 1
  if (options.startDate && options.endDate) {
    const start = new Date(options.startDate)
    const end = new Date(options.endDate)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const daysInSelection = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    prorationFactor = daysInSelection / workingDays
  } else {
    prorationFactor = Math.min(today / workingDays, 1)
  }

  const processSummary = (
    valsByProg: Map<string, MetricValue[]>, 
    inputsByProg: Map<string, DailyInput[]>,
    compsByMilestone: Map<string, MilestoneCompletion>
  ) => {
    const programHealths = programs.map(p => {
      const health = calculateProgramHealth(
        p, 
        valsByProg, 
        inputsByProg, 
        compsByMilestone, 
        prorationFactor,
        workingDays
      )
      return { ...health, program: p }
    })

    const overallHealth = programHealths.length > 0
      ? programHealths.reduce((sum, ph) => sum + ph.healthScore, 0) / programHealths.length
      : 0

    const statusCounts = {
      tercapai: programHealths.filter(ph => ph.healthScore >= 100).length,
      menujuTarget: programHealths.filter(ph => ph.healthScore >= 60 && ph.healthScore < 100).length,
      perluPerhatian: programHealths.filter(ph => ph.healthScore < 60).length
    }

    const aggregates = aggregateByMetricGroup(programs, valsByProg, inputsByProg, prorationFactor)

    // Calculate Global KPIs for Overview Tab
    const globalKPIs = aggregateGlobalKPIs(
      programHealths,
      programs,
      Array.from(compsByMilestone.values())
    )

    // Calculate Ads Metrics for Ads Tab
    const adsMetrics = aggregateAdsMetrics(programs, valsByProg)

    // Calculate Ads Daily Series for Ads Tab Chart
    // Default chart: spend vs roas
    const adsDailySeries = buildAdsDailySeries(programs, valsByProg, 'ads_spent', 'roas')

    // Calculate Global Health Trend for Overview Tab
    const healthTrend = buildHealthTrendSeries(
      programs,
      Array.from(valsByProg.values()).flat(),
      Array.from(inputsByProg.values()).flat(),
      Array.from(compsByMilestone.values()),
      activePeriod,
      options.startDate,
      options.endDate
    )

    return {
      overallHealth,
      statusCounts,
      aggregates,
      globalKPIs,
      adsMetrics,
      adsDailySeries,
      healthTrend,
      targetTrend: buildTargetTrendSeries(
        programs,
        Array.from(valsByProg.values()).flat(),
        Array.from(inputsByProg.values()).flat(),
        activePeriod,
        undefined,
        undefined,
        options.startDate,
        options.endDate
      ),
      programHealths
    }
  }

  const summary = processSummary(metricValuesByProgram, dailyInputsByProgram, milestoneCompletionsByMilestone)

  let previousData: UnifiedDashboardData['previousData'] = undefined
  if (options.includePrevious && options.startDate && options.endDate) {
    const start = new Date(options.startDate)
    const end = new Date(options.endDate)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const daysInSelection = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    
    const prevEnd = new Date(start)
    prevEnd.setDate(prevEnd.getDate() - 1)
    const prevStart = new Date(prevEnd)
    prevStart.setDate(prevStart.getDate() - daysInSelection + 1)
    
    const prevStartStr = prevStart.toISOString().split('T')[0]
    const prevEndStr = prevEnd.toISOString().split('T')[0]

    // Fetch previous data in parallel
    const [prevInpRes, prevMVRes] = await Promise.all([
      supabase.from('daily_inputs').select('*').in('program_id', programIds).gte('date', prevStartStr).lte('date', prevEndStr),
      supabase.from('daily_metric_values').select('*').in('program_id', programIds).gte('date', prevStartStr).lte('date', prevEndStr)
    ])

    const pDailyInputs = prevInpRes.data || []
    const pMetricValues = prevMVRes.data || []

    // Index previous data
    const pMVByProg = new Map<string, MetricValue[]>()
    pMetricValues.forEach(mv => {
      const list = pMVByProg.get(mv.program_id) || []
      list.push(mv)
      pMVByProg.set(mv.program_id, list)
    })

    const pInpByProg = new Map<string, DailyInput[]>()
    pDailyInputs.forEach(di => {
      const list = pInpByProg.get(di.program_id) || []
      list.push(di)
      pInpByProg.set(di.program_id, list)
    })

    previousData = {
      dailyInputs: pDailyInputs,
      metricValues: pMetricValues,
      summary: processSummary(pMVByProg, pInpByProg, milestoneCompletionsByMilestone)
    }
  }

  return {
    programs,
    dailyInputs,
    metricValues,
    milestoneCompletions: (milestoneCompletions || []) as MilestoneCompletion[],
    activePeriod,
    prorationFactor,
    summary,
    previousData
  }
}
