'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ActionResponse = { error: string } | { success: boolean; data?: any }

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

  // Get active period
  const { data: period } = await supabase
    .from('periods')
    .select('id')
    .eq('is_active', true)
    .single()

  if (!period) return { error: 'Tidak ada periode aktif saat ini. Hubungi Admin.' }

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

  // Must only update their own records (enforced by RLS as well as code check if needed)
  const { error } = await supabase
    .from('daily_inputs')
    .update(data)
    .eq('id', id)
    .eq('created_by', user.id) // secondary lock

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

  const { error } = await supabase
    .from('daily_inputs')
    .delete()
    .eq('id', id)
    .eq('created_by', user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/input-harian')
  return { success: true }
}
