import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
export { type ProgramWithRelations } from './dashboard-calculator'
import { 
  calculateProgramHealth, 
  aggregateByMetricGroup, 
  ProgramWithRelations,
  ProgramHealthResult 
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
  
  // 1. Active Period
  let periodQuery = supabase.from('periods').select('*')
  if (options.periodId) {
    periodQuery = periodQuery.eq('id', options.periodId)
  } else {
    periodQuery = periodQuery.eq('is_active', true)
  }
  const { data: activePeriod } = await periodQuery.single()

  if (!activePeriod) {
    return {
      programs: [],
      dailyInputs: [],
      milestoneCompletions: [],
      metricValues: [],
      activePeriod: null,
      prorationFactor: 1,
      summary: {
        overallHealth: 0,
        statusCounts: { tercapai: 0, menujuTarget: 0, perluPerhatian: 0 },
        aggregates: {},
        programHealths: []
      }
    }
  }

  // 2. Programs
  let programsQuery = supabase
    .from('programs')
    .select('*, program_pics(profile_id), program_milestones(*), program_metric_definitions(*)')
    .eq('is_active', true)

  if (options.profileId && !options.isAdmin) {
    const { data: myTeamPrograms } = await supabase
      .from('program_pics')
      .select('program_id')
      .eq('profile_id', options.profileId)
    const myProgramIds = myTeamPrograms?.map(tp => tp.program_id) || []
    programsQuery = programsQuery.in('id', myProgramIds)
  }

  const { data: programsData } = await (programsQuery as unknown as { data: ProgramWithRelations[] | null })
  const programs = (programsData || []) as ProgramWithRelations[]
  const programIds = programs.map(p => p.id)

  // 3. Daily Inputs
  let dailyInputs: DailyInput[] = []
  if (programIds.length > 0) {
    let q = supabase.from('daily_inputs').select('*').in('program_id', programIds)
    if (options.startDate && options.endDate) {
      q = q.gte('date', options.startDate).lte('date', options.endDate)
    } else {
      q = q.eq('period_id', activePeriod.id)
    }
    const { data } = await q
    dailyInputs = data || []
  }

  // 4. Metric Values
  let metricValues: MetricValue[] = []
  if (programIds.length > 0) {
    let q = supabase.from('daily_metric_values').select('*').in('program_id', programIds)
    if (options.startDate && options.endDate) {
      q = q.gte('date', options.startDate).lte('date', options.endDate)
    } else {
      q = q.eq('period_id', activePeriod.id)
    }
    const { data } = await q
    metricValues = data || []
  }

  // 5. Milestone Completions
  const milestoneIds = programs.flatMap(p => p.program_milestones?.map(m => m.id) || [])
  let milestoneCompletionsQuery = supabase.from('milestone_completions').select('*').in('milestone_id', milestoneIds)
  
  if (options.startDate && options.endDate) {
    milestoneCompletionsQuery = milestoneCompletionsQuery
      .gte('completed_at', options.startDate)
      .lte('completed_at', options.endDate + 'T23:59:59')
  } else {
    milestoneCompletionsQuery = milestoneCompletionsQuery.eq('period_id', activePeriod.id)
  }

  const { data: milestoneCompletions } = milestoneIds.length > 0
    ? await milestoneCompletionsQuery
    : { data: [] }

  // 6. Proration Factor & Summary
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

  const processSummary = (inputs: DailyInput[], values: MetricValue[]) => {
    const programHealths = programs.map(p => {
      const health = calculateProgramHealth(
        p, 
        values, 
        inputs, 
        (milestoneCompletions || []) as MilestoneCompletion[], 
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

    const aggregates = aggregateByMetricGroup(programs, values, prorationFactor, workingDays)

    return {
      overallHealth,
      statusCounts,
      aggregates,
      programHealths
    }
  }

  const summary = processSummary(dailyInputs, metricValues)

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

    // Fetch previous daily inputs
    const { data: prevInp } = await supabase.from('daily_inputs').select('*').in('program_id', programIds).gte('date', prevStartStr).lte('date', prevEndStr)
    const pDailyInputs = prevInp || []

    // Fetch previous metric values
    const { data: prevMV } = await supabase.from('daily_metric_values').select('*').in('program_id', programIds).gte('date', prevStartStr).lte('date', prevEndStr)
    const pMetricValues = prevMV || []

    previousData = {
      dailyInputs: pDailyInputs,
      metricValues: pMetricValues,
      summary: processSummary(pDailyInputs, pMetricValues)
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
