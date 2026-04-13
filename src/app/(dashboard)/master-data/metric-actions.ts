'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Database } from '@/types/database'

export type ActionResponse = { error: string } | { success: boolean; data?: unknown }

type MetricDefinitionInsert = Database['public']['Tables']['program_metric_definitions']['Insert']

// ─── Admin guard (reusable) ─────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', supabase: null, user: null }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return { error: 'Hanya admin yang bisa melakukan aksi ini.', supabase: null, user: null }
  }
  return { error: null, supabase, user }
}

// ─── Get metric definitions for a program ──────────────────────────────────

export async function getMetricDefinitions(programId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('program_metric_definitions')
    .select('*')
    .eq('program_id', programId)
    .order('display_order', { ascending: true })

  if (error) return { error: error.message, data: null }
  return { error: null, data }
}

// ─── Apply a template to a program ─────────────────────────────────────────

export async function applyMetricTemplate(
  programId: string,
  metrics: Omit<MetricDefinitionInsert, 'program_id'>[]
): Promise<ActionResponse> {
  const { error: authError, supabase } = await requireAdmin()
  if (authError || !supabase) return { error: authError! }

  // Delete existing metric definitions for this program
  await supabase
    .from('program_metric_definitions')
    .delete()
    .eq('program_id', programId)

  if (metrics.length === 0) {
    revalidatePath('/master-data')
    return { success: true }
  }

  const rows = metrics.map(m => ({ ...m, program_id: programId }))
  const { error } = await supabase.from('program_metric_definitions').insert(rows)
  if (error) return { error: error.message }

  revalidatePath('/master-data')
  revalidatePath(`/master-data/programs/${programId}/metrics`)
  return { success: true }
}

// ─── Create a single metric definition ─────────────────────────────────────

export async function createMetricDefinition(
  data: MetricDefinitionInsert
): Promise<ActionResponse> {
  const { error: authError, supabase } = await requireAdmin()
  if (authError || !supabase) return { error: authError! }

  const { error } = await supabase.from('program_metric_definitions').insert(data)
  if (error) {
    if (error.code === '23505') return { error: `Metric key "${data.metric_key}" sudah ada di program ini.` }
    return { error: error.message }
  }

  revalidatePath('/master-data')
  revalidatePath(`/master-data/programs/${data.program_id}/metrics`)
  return { success: true }
}

// ─── Update a metric definition ─────────────────────────────────────────────

export async function updateMetricDefinition(
  id: string,
  data: Database['public']['Tables']['program_metric_definitions']['Update']
): Promise<ActionResponse> {
  const { error: authError, supabase } = await requireAdmin()
  if (authError || !supabase) return { error: authError! }

  const { error } = await supabase
    .from('program_metric_definitions')
    .update(data)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/master-data')
  return { success: true }
}

// ─── Delete a metric definition ─────────────────────────────────────────────

export async function deleteMetricDefinition(id: string): Promise<ActionResponse> {
  const { error: authError, supabase } = await requireAdmin()
  if (authError || !supabase) return { error: authError! }

  const { error } = await supabase
    .from('program_metric_definitions')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/master-data')
  return { success: true }
}

// ─── Reorder metric definitions ─────────────────────────────────────────────

export async function reorderMetricDefinitions(
  updates: { id: string; display_order: number }[]
): Promise<ActionResponse> {
  const { error: authError, supabase } = await requireAdmin()
  if (authError || !supabase) return { error: authError! }

  const promises = updates.map(u =>
    supabase
      .from('program_metric_definitions')
      .update({ display_order: u.display_order })
      .eq('id', u.id)
  )

  await Promise.all(promises)
  revalidatePath('/master-data')
  return { success: true }
}

// ─── Upsert daily metric values ─────────────────────────────────────────────

export async function upsertDailyMetricValues(
  values: {
    period_id: string
    program_id: string
    metric_definition_id: string
    date: string
    value: number | null
  }[]
): Promise<ActionResponse> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const rows = values.map(v => ({ ...v, created_by: user.id }))

  const { error } = await supabase
    .from('daily_metric_values')
    .upsert(rows, {
      onConflict: 'period_id,program_id,metric_definition_id,date'
    })

  if (error) return { error: error.message }

  revalidatePath('/input-harian')
  revalidatePath('/dashboard')
  return { success: true }
}
