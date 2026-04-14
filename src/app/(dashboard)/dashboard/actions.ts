'use server'

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'

type Milestone = Database['public']['Tables']['program_milestones']['Row']
type MetricDefinition = Database['public']['Tables']['program_metric_definitions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']
type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
type Period = Database['public']['Tables']['periods']['Row']

export type ProgramWithRelations = Database['public']['Tables']['programs']['Row'] & {
  program_pics: { profile_id: string }[]
  program_milestones: Milestone[]
  program_metric_definitions: MetricDefinition[]
}

export interface DashboardData {
  programs: ProgramWithRelations[]
  dailyInputs: DailyInput[]
  milestoneCompletions: MilestoneCompletion[]
  metricValues: MetricValue[]
  activePeriod: Period | null
  profiles: { id: string; name: string }[]
  isAdmin: boolean
  userName: string
  prorationFactor: number
  previousDailyInputs?: DailyInput[]
  previousMetricValues?: MetricValue[]
  isCustomDateRange?: boolean
}

/**
 * Centralized data fetching for all dashboard views.
 * Single shared function used by /dashboard, /dashboard/target, /dashboard/ads.
 */
export async function getDashboardData(
  startDate?: string,
  endDate?: string
): Promise<DashboardData> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  // Active Period
  const { data: activePeriod } = await supabase
    .from('periods')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!activePeriod) {
    return {
      programs: [],
      dailyInputs: [],
      milestoneCompletions: [],
      metricValues: [],
      activePeriod: null,
      profiles: [],
      isAdmin,
      userName: profile?.name || user.email || '',
      prorationFactor: 1,
    }
  }

  // Programs
  let programsQuery = supabase
    .from('programs')
    .select('*, program_pics(profile_id), program_milestones(*), program_metric_definitions(*)')
    .eq('is_active', true)

  if (!isAdmin) {
    const { data: myTeamPrograms } = await supabase
      .from('program_pics')
      .select('program_id')
      .eq('profile_id', user.id)
    const myProgramIds = myTeamPrograms?.map(tp => tp.program_id) || []
    programsQuery = programsQuery.in('id', myProgramIds)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: programs } = await (programsQuery as any) as { data: ProgramWithRelations[] | null }
  const safePrograms = (programs || []) as ProgramWithRelations[]
  const programIds = safePrograms.map(p => p.id)

  // Milestone Completions
  const milestoneIds = safePrograms.flatMap(p => p.program_milestones?.map((m: Milestone) => m.id) || [])
  const { data: milestoneCompletions } = milestoneIds.length > 0
    ? await supabase.from('milestone_completions').select('*').in('milestone_id', milestoneIds)
    : { data: [] }

  // Calculate previous period dates if filters are active
  let prevStartStr = ''
  let prevEndStr = ''
  let daysInSelection = 30

  if (startDate && endDate) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    daysInSelection = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    
    const prevEnd = new Date(start)
    prevEnd.setDate(prevEnd.getDate() - 1)
    const prevStart = new Date(prevEnd)
    prevStart.setDate(prevStart.getDate() - daysInSelection + 1)
    
    prevStartStr = prevStart.toISOString().split('T')[0]
    prevEndStr = prevEnd.toISOString().split('T')[0]
  }

  // Daily Inputs
  let dailyInputs: DailyInput[] = []
  let previousDailyInputs: DailyInput[] = []

  if (programIds.length > 0) {
    let q = supabase.from('daily_inputs').select('*').in('program_id', programIds)
    if (startDate && endDate) {
      q = q.gte('date', startDate).lte('date', endDate)
    } else {
      q = q.eq('period_id', activePeriod.id)
    }
    const { data } = await q.order('date', { ascending: true })
    dailyInputs = data || []

    if (startDate && endDate) {
      const { data: prevData } = await supabase
        .from('daily_inputs')
        .select('*')
        .in('program_id', programIds)
        .gte('date', prevStartStr)
        .lte('date', prevEndStr)
      previousDailyInputs = prevData || []
    }
  }

  // Metric Values
  let metricValues: MetricValue[] = []
  let previousMetricValues: MetricValue[] = []
  
  if (programIds.length > 0) {
    let q = supabase
      .from('daily_metric_values')
      .select('*')
      .in('program_id', programIds)
      
    if (startDate && endDate) {
      q = q.gte('date', startDate).lte('date', endDate)
    } else {
      q = q.eq('period_id', activePeriod.id)
    }
    const { data } = await q
    metricValues = data || []

    if (startDate && endDate) {
      const { data: prevData } = await supabase
        .from('daily_metric_values')
        .select('*')
        .in('program_id', programIds)
        .gte('date', prevStartStr)
        .lte('date', prevEndStr)
      previousMetricValues = prevData || []
    }
  }

  // All profiles (for PIC names)
  const { data: profiles } = await supabase.from('profiles').select('id, name')

  // Proration factor
  const totalDays = activePeriod.working_days || 30
  let prorationFactor = 1

  if (startDate && endDate) {
    prorationFactor = daysInSelection / totalDays
  } else {
    const today = new Date().getDate()
    prorationFactor = Math.min(today / totalDays, 1)
  }

  return {
    programs: safePrograms,
    dailyInputs,
    previousDailyInputs,
    milestoneCompletions: milestoneCompletions || [],
    metricValues,
    previousMetricValues,
    activePeriod,
    profiles: profiles || [],
    isAdmin,
    userName: profile?.name || user.email || '',
    prorationFactor,
    isCustomDateRange: !!(startDate && endDate)
  }
}

