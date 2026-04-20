'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

export type ActionResponse = { error: string } | { success: boolean; data?: unknown }

async function checkAccess(supabase: SupabaseClient<Database>, userId: string, programId: string) {
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
  if (profile?.role === 'admin') return true

  const { data } = await supabase
    .from('program_pics')
    .select('id')
    .eq('program_id', programId)
    .eq('profile_id', userId)
    .single()
  
  return !!data
}

export async function submitDailyInput(data: {
  program_id: string
  date: string
  achievement_rp?: number | null
  achievement_user?: number | null
  qualitative_status?: 'not_started' | 'in_progress' | 'completed' | null
  notes?: string | null
}): Promise<ActionResponse> {
  const supabase = createClient()
  
  // Verify User
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Verify access to program
  const hasAccess = await checkAccess(supabase, user.id, data.program_id)
  if (!hasAccess) return { error: 'Anda tidak ditugaskan untuk program ini.' }

  // Get active period
  const { data: period } = await supabase
    .from('periods')
    .select('id, is_locked')
    .eq('is_active', true)
    .single()

  if (!period) return { error: 'Tidak ada periode aktif saat ini. Hubungi Admin.' }
  if (period.is_locked) return { error: 'Periode ini sudah dikunci oleh Admin. Data tidak dapat ditambah.' }

  const payload = {
    ...data,
    period_id: period.id,
    created_by: user.id
  }

  const { error } = await supabase.from('daily_inputs').insert(payload)

  if (error) {
    console.error('Submit Input Error:', error)
    return { error: error.message }
  }

  revalidatePath('/input-harian')
  return { success: true }
}

export async function updateDailyInput(id: string, data: {
  date: string
  achievement_rp?: number | null
  achievement_user?: number | null
  qualitative_status?: 'not_started' | 'in_progress' | 'completed' | null
  notes?: string | null
}): Promise<ActionResponse> {
  const supabase = createClient()
  
  // Verify User
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Check if period is locked
  const { data: currentInput } = await supabase
    .from('daily_inputs')
    .select('period_id, periods(is_locked)')
    .eq('id', id)
    .single()

  const isLocked = (currentInput?.periods as unknown as { is_locked: boolean | null })?.is_locked
  if (isLocked) return { error: 'Periode untuk data ini sudah dikunci oleh Admin.' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  let query = supabase.from('daily_inputs').update(data).eq('id', id)
  
  if (!isAdmin) {
    query = query.eq('created_by', user.id)
  }

  const { error } = await query

  if (error) {
    console.error('Update Input Error:', error)
    return { error: error.message }
  }

  revalidatePath('/input-harian')
  return { success: true }
}

export async function deleteDailyInput(id: string): Promise<ActionResponse> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Check if period is locked
  const { data: currentInput } = await supabase
    .from('daily_inputs')
    .select('period_id, periods(is_locked)')
    .eq('id', id)
    .single()

  const isLocked = (currentInput?.periods as unknown as { is_locked: boolean | null })?.is_locked
  if (isLocked) return { error: 'Periode untuk data ini sudah dikunci oleh Admin.' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  let query = supabase.from('daily_inputs').delete().eq('id', id)
  if (!isAdmin) {
    query = query.eq('created_by', user.id)
  }

  const { error } = await query

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/input-harian')
  return { success: true }
}

/**
 * MILESTONE SUBMISSIONS
 */

export async function submitMilestoneCompletion(data: {
  milestone_id: string
  is_completed: boolean
  notes?: string | null
  evidence_url?: string | null
}): Promise<ActionResponse> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Get active period
  const { data: period } = await supabase
    .from('periods')
    .select('id, is_locked')
    .eq('is_active', true)
    .single()

  if (!period) return { error: 'Tidak ada periode aktif.' }
  if (period.is_locked) return { error: 'Periode dikunci.' }

  const { milestone_id, is_completed, notes, evidence_url } = data

  // Verify access to program through milestone
  const { data: milestone } = await supabase
    .from('program_milestones')
    .select('program_id')
    .eq('id', milestone_id)
    .single()

  if (!milestone) return { error: 'Milestone tidak ditemukan.' }
  
  const hasAccess = await checkAccess(supabase, user.id, milestone.program_id)
  if (!hasAccess) return { error: 'Anda tidak memiliki akses ke program milestone ini.' }

  const { error } = await supabase
    .from('milestone_completions')
    .upsert({
      milestone_id,
      period_id: period.id,
      is_completed,
      notes,
      evidence_url,
      completed_at: is_completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'milestone_id,period_id'
    })

  if (error) {
    console.error('Milestone Submit Error:', error)
    return { error: error.message }
  }

  revalidatePath('/input-harian')
  revalidatePath('/dashboard')
  return { success: true }
}

/**
 * CUSTOM METRIC VALUES (Phase 2)
 */

export async function submitDailyMetricValues(
  programId: string,
  date: string,
  values: { metric_definition_id: string; value: number | null }[]
): Promise<ActionResponse> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: period } = await supabase
    .from('periods')
    .select('id, is_locked')
    .eq('is_active', true)
    .single()

  if (!period) return { error: 'Tidak ada periode aktif saat ini.' }
  if (period.is_locked) return { error: 'Periode ini sudah dikunci oleh Admin.' }

  // Verify access
  const hasAccess = await checkAccess(supabase, user.id, programId)
  if (!hasAccess) return { error: 'Anda tidak memiliki akses ke program ini.' }

  const rows = values.map(v => ({
    period_id: period.id,
    program_id: programId,
    metric_definition_id: v.metric_definition_id,
    date,
    value: v.value,
    created_by: user.id,
  }))

  const { error } = await supabase
    .from('daily_metric_values')
    .upsert(rows, {
      onConflict: 'period_id,program_id,metric_definition_id,date'
    })

  if (error) {
    console.error('Submit Metric Values Error:', error)
    return { error: error.message }
  }

  revalidatePath('/input-harian')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function upsertSingleMetricValue(params: {
  programId: string;
  metricDefinitionId: string;
  date: string;
  value: number | null;
}): Promise<ActionResponse> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: period } = await supabase
    .from('periods')
    .select('id, is_locked')
    .eq('is_active', true)
    .single()

  if (!period) return { error: 'Tidak ada periode aktif saat ini.' }
  if (period.is_locked) return { error: 'Periode ini sudah dikunci oleh Admin.' }

  // Verify access
  const hasAccess = await checkAccess(supabase, user.id, params.programId)
  if (!hasAccess) return { error: 'Anda tidak memiliki akses ke program ini.' }

  const row = {
    period_id: period.id,
    program_id: params.programId,
    metric_definition_id: params.metricDefinitionId,
    date: params.date,
    value: params.value,
    created_by: user.id,
  }

  const { error } = await supabase
    .from('daily_metric_values')
    .upsert(row, {
      onConflict: 'period_id,program_id,metric_definition_id,date'
    })

  if (error) {
    console.error('Upsert Single Metric Error:', error)
    return { error: error.message }
  }

  // We don't want to revalidate path here immediately if it's frequent inline edit, 
  // but to keep consistency for other clients, it's safer to revalidate.
  revalidatePath('/input-harian')
  return { success: true }
}

export async function upsertDailyMetricTarget(params: {
  programId: string;
  metricDefinitionId: string;
  date: string;
  targetValue: number | null;
}): Promise<ActionResponse> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Check role
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya Admin yang dapat mengatur target' }

  const { data: period } = await supabase
    .from('periods')
    .select('id, is_locked')
    .eq('is_active', true)
    .single()

  if (!period) return { error: 'Tidak ada periode aktif saat ini.' }

  // Note: we allow editing targets even if period is locked (Admin only)
  // because targets are plans, not achievements.

  const { error } = await supabase
    .from('daily_metric_values')
    .upsert({
      period_id: period.id,
      program_id: params.programId,
      metric_definition_id: params.metricDefinitionId,
      date: params.date,
      target_value: params.targetValue,
    }, {
      onConflict: 'period_id,program_id,metric_definition_id,date'
    })

  if (error) {
    console.error('Upsert Target Error:', error)
    return { error: error.message }
  }

  revalidatePath('/input-harian')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function autoDistributeTargets(params: {
  programId: string;
  metricDefinitionId: string;
}): Promise<ActionResponse> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Check role
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya Admin yang dapat melakukan distribusi otomatis' }

  // 1. Get Active Period, Metric Definition, and Program
  const { data: period } = await supabase
    .from('periods')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!period) return { error: 'Tidak ada periode aktif.' }

  const { data: metricDef } = await supabase
    .from('program_metric_definitions')
    .select('*')
    .eq('id', params.metricDefinitionId)
    .single()

  if (!metricDef) return { error: 'Metrik tidak ditemukan.' }

  const { data: program } = await supabase
    .from('programs')
    .select('*')
    .eq('id', params.programId)
    .single()

  if (!program) return { error: 'Program tidak ditemukan.' }

  // 2. Identify Mon-Fri dates in the period
  const totalDaysInMonth = new Date(period.year, period.month, 0).getDate()
  const workingDates: string[] = []

  for (let d = 1; d <= totalDaysInMonth; d++) {
    const date = new Date(period.year, period.month - 1, d)
    const dayOfWeek = date.getDay() 
    
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      workingDates.push(`${period.year}-${String(period.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }

  if (workingDates.length === 0) return { error: 'Tidak ada hari kerja ditemukan pada periode ini.' }

  // 3. Determine Daily Target
  // Priority: 
  // 1. Manual daily_target from programs table (for revenue/user_count)
  // 2. Pro-rata from monthly_target
  
  let dailyTarget = 0
  const isRevenue = metricDef.metric_key === 'revenue'
  const isUser = metricDef.metric_key === 'user_count'

  if (isRevenue && program.daily_target_rp !== null) {
    dailyTarget = Number(program.daily_target_rp)
  } else if (isUser && program.daily_target_user !== null) {
    dailyTarget = Number(program.daily_target_user)
  } else if (metricDef.monthly_target) {
    const targetCount = period.working_days || workingDates.length
    dailyTarget = Number(metricDef.monthly_target) / targetCount
  } else {
    return { error: 'Target tidak ditemukan (bulanan maupun harian).' }
  }
  
  // 4. Distribute
  const targetCount = period.working_days || workingDates.length
  const datesToFill = workingDates.slice(0, targetCount)
  
  const rows = datesToFill.map(date => ({
    period_id: period.id,
    program_id: params.programId,
    metric_definition_id: params.metricDefinitionId,
    date,
    target_value: dailyTarget,
  }))

  const { error } = await supabase
    .from('daily_metric_values')
    .upsert(rows, {
      onConflict: 'period_id,program_id,metric_definition_id,date'
    })

  if (error) {
    console.error('Auto Distribute Error:', error)
    return { error: error.message }
  }

  revalidatePath('/input-harian')
  revalidatePath('/dashboard')
  return { success: true }
}
