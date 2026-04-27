'use server'

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'

export type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']
export type MetricDefinition = Database['public']['Tables']['program_metric_definitions']['Row']
export type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
export type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
export type Period = Database['public']['Tables']['periods']['Row']

import { redirect } from 'next/navigation'
import { getUnifiedDashboardData, ProgramWithRelations as InternalProgramWithRelations, DashboardSummary } from '@/lib/dashboard-service'

// Re-export type if needed or keep existing
export type ProgramWithRelations = InternalProgramWithRelations

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
  summary: DashboardSummary
  previousDailyInputs?: DailyInput[]
  previousMetricValues?: MetricValue[]
  previousSummary?: DashboardSummary
  isCustomDateRange?: boolean
}

/**
 * Centralized data fetching for all dashboard views.
 * Single shared function used by /dashboard, /dashboard/target, /dashboard/ads.
 */
export async function getDashboardData(
  startDate?: string,
  endDate?: string,
  periodId?: string
): Promise<DashboardData> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  const data = await getUnifiedDashboardData({
    profileId: user.id,
    isAdmin,
    startDate,
    endDate,
    periodId,
    includePrevious: true
  })

  // All profiles (still needed for PIC labels in some views)
  const { data: profiles } = await supabase.from('profiles').select('id, name')

  return {
    programs: data.programs as ProgramWithRelations[],
    dailyInputs: data.dailyInputs,
    previousDailyInputs: data.previousData?.dailyInputs,
    milestoneCompletions: data.milestoneCompletions,
    metricValues: data.metricValues,
    previousMetricValues: data.previousData?.metricValues,
    activePeriod: data.activePeriod,
    profiles: profiles || [],
    isAdmin,
    userName: profile?.name || user.email || '',
    prorationFactor: data.prorationFactor,
    summary: data.summary,
    previousSummary: data.previousData?.summary,
    isCustomDateRange: !!(startDate && endDate)
  }
}

