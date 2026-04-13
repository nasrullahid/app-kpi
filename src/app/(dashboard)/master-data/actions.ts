'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Define the type for the server actions response
export type ActionResponse = { error: string } | { success: boolean; data?: unknown }

/**
 * PROGRAMS
 */

export async function createProgram(data: {
  name: string
  department: string
  pic_ids: string[]
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

  const { pic_ids, ...programData } = data

  // Insert Program
  // Note: We'll set pic_id to the first PIC for legacy compatibility if needed
  const { data: program, error: progError } = await supabase
    .from('programs')
    .insert({
      ...programData,
      pic_id: pic_ids.length > 0 ? pic_ids[0] : null,
      pic_name: 'Team', // Legacy fallback
    })
    .select()
    .single()

  if (progError) {
    console.error('Create Program Error:', progError)
    return { error: progError.message }
  }

  // Insert Team Members
  if (pic_ids.length > 0) {
    const teamData = pic_ids.map(pid => ({
      program_id: program.id,
      profile_id: pid
    }))
    const { error: teamError } = await supabase.from('program_pics').insert(teamData)
    if (teamError) console.error('Team Insert Warning:', teamError)
  }

  revalidatePath('/master-data')
  revalidatePath('/dashboard')
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
  department: string
  pic_ids: string[]
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

  const { pic_ids, ...programData } = data

  // Update Program
  const { error: progError } = await supabase.from('programs')
    .update({
      ...programData,
      pic_id: pic_ids.length > 0 ? pic_ids[0] : null
    })
    .eq('id', id)

  if (progError) {
    console.error('Update Program Error:', progError)
    return { error: progError.message }
  }

  // Update Team Members (Delete and Re-insert)
  await supabase.from('program_pics').delete().eq('program_id', id)
  
  if (pic_ids.length > 0) {
    const teamData = pic_ids.map(pid => ({
      program_id: id,
      profile_id: pid
    }))
    const { error: teamError } = await supabase.from('program_pics').insert(teamData)
    if (teamError) console.error('Team Update Warning:', teamError)
  }

  revalidatePath('/master-data')
  revalidatePath('/dashboard')
  return { success: true }
}

/**
 * MILESTONES (TASKS)
 */

export async function addMilestone(data: {
  program_id: string
  title: string
  description?: string | null
  order?: number
}): Promise<ActionResponse> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa menambah tugas.' }

  const { error } = await supabase.from('program_milestones').insert(data)
  if (error) return { error: error.message }

  revalidatePath('/master-data')
  return { success: true }
}

export async function updateMilestone(id: string, data: {
  title: string
  description?: string | null
  order?: number
}): Promise<ActionResponse> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa mengubah tugas.' }

  const { error } = await supabase.from('program_milestones').update(data).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/master-data')
  return { success: true }
}

export async function deleteMilestone(id: string): Promise<ActionResponse> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa menghapus tugas.' }

  const { error } = await supabase.from('program_milestones').delete().eq('id', id)
  if (error) return { error: error.message }

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
  // We use a safe target like a dummy ID or just update all is feasible in small datasets
  await supabase.from('periods').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000')
  
  // 2. Set the requested one to active
  const { error } = await supabase.from('periods').update({ is_active: true }).eq('id', id)

  if (error) return { error: error.message }

  // Revalidate everything because active period changes global dashboards
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function updatePeriod(id: string, data: {
  month: number
  year: number
  working_days: number
}): Promise<ActionResponse> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa mengubah periode.' }

  const { error } = await supabase.from('periods').update(data).eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/master-data')
  return { success: true }
}

export async function deletePeriod(id: string): Promise<ActionResponse> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa menghapus periode.' }

  const { error } = await supabase.from('periods').delete().eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/master-data')
  return { success: true }
}

export async function togglePeriodLock(id: string, currentLock: boolean): Promise<ActionResponse> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa mengunci periode.' }

  const { error } = await supabase.from('periods')
    .update({ is_locked: !currentLock })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/master-data')
  revalidatePath('/input-harian')
  return { success: true }
}

