'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Define the type for the server actions response
export type ActionResponse = { error: string } | { success: boolean; data?: any }

/**
 * PROGRAMS
 */

export async function createProgram(data: {
  name: string
  pic_id: string | null
  pic_name: string
  pic_whatsapp?: string | null
  target_type: 'quantitative' | 'qualitative' | 'hybrid'
  monthly_target_rp?: number | null
  monthly_target_user?: number | null
  daily_target_rp?: number | null
  daily_target_user?: number | null
  qualitative_description?: string | null
}): Promise<ActionResponse> {
  const supabase = createClient()
  
  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa membuat program.' }

  const { error } = await supabase.from('programs').insert(data)

  if (error) {
    console.error('Create Program Error:', error)
    return { error: error.message }
  }

  revalidatePath('/master-data')
  return { success: true }
}

export async function toggleProgramStatus(id: string, currentStatus: boolean): Promise<ActionResponse> {
  const supabase = createClient()
  
  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa mengubah status.' }

  const { error } = await supabase.from('programs')
    .update({ is_active: !currentStatus })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/master-data')
  return { success: true }
}

export async function updateProgram(id: string, data: {
  name: string
  pic_id: string | null
  pic_name: string
  pic_whatsapp?: string | null
  target_type: 'quantitative' | 'qualitative' | 'hybrid'
  monthly_target_rp?: number | null
  monthly_target_user?: number | null
  daily_target_rp?: number | null
  daily_target_user?: number | null
  qualitative_description?: string | null
}): Promise<ActionResponse> {
  const supabase = createClient()
  
  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa mengubah program.' }

  const { error } = await supabase.from('programs')
    .update(data)
    .eq('id', id)

  if (error) {
    console.error('Update Program Error:', error)
    return { error: error.message }
  }

  revalidatePath('/master-data')
  return { success: true }
}

export async function deleteProgram(id: string): Promise<ActionResponse> {
  const supabase = createClient()
  
  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa menghapus program.' }

  const { error } = await supabase.from('programs').delete().eq('id', id)

  if (error) {
    console.error('Delete Program Error:', error)
    return { error: error.message }
  }

  revalidatePath('/master-data')
  return { success: true }
}


/**
 * PERIODS
 */

export async function createPeriod(data: {
  month: number
  year: number
  working_days: number
}): Promise<ActionResponse> {
  const supabase = createClient()
  
  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa membuat periode.' }

  const { error } = await supabase.from('periods').insert(data)

  if (error) {
    if (error.code === '23505') { // Unique constraint violation
      return { error: 'Periode untuk bulan dan tahun ini sudah ada.' }
    }
    return { error: error.message }
  }

  revalidatePath('/master-data')
  return { success: true }
}

export async function setActivePeriod(id: string): Promise<ActionResponse> {
  const supabase = createClient()
  
  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa mengatur periode aktif.' }

  // 1. Set all to inactive
  await supabase.from('periods').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000') // Trick to update all without matching null
  
  // 2. Set the requested one to active
  const { error } = await supabase.from('periods').update({ is_active: true }).eq('id', id)

  if (error) return { error: error.message }

  // Revalidate everything because active period changes global dashboards
  revalidatePath('/', 'layout')
  return { success: true }
}
