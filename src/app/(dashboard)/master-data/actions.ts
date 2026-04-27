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
  target_type: 'quantitative' | 'qualitative' | 'hybrid' | 'mou'
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

  // Phase 3: Unification - Automatically create metric definitions for legacy targets
  const metricsToInsert = []
  if (data.target_type === 'quantitative' || data.target_type === 'hybrid') {
    if (data.monthly_target_rp && data.monthly_target_rp > 0) {
      metricsToInsert.push({
        program_id: program.id,
        metric_key: 'revenue',
        label: 'Revenue',
        data_type: 'currency',
        input_type: 'manual',
        is_target_metric: true,
        is_primary: true,
        monthly_target: data.monthly_target_rp,
        target_direction: 'higher_is_better',
        unit_label: 'Rp',
        display_order: 1,
        metric_group: 'revenue'
      })
    }
  }

  if (data.target_type === 'quantitative' || data.target_type === 'hybrid' || data.target_type === 'mou') {
    if (data.monthly_target_user && data.monthly_target_user > 0) {
      metricsToInsert.push({
        program_id: program.id,
        metric_key: 'user_count',
        label: 'Closing/User',
        data_type: 'integer',
        input_type: 'manual',
        is_target_metric: true,
        is_primary: true,
        monthly_target: data.monthly_target_user,
        target_direction: 'higher_is_better',
        unit_label: 'user',
        display_order: 2,
        metric_group: 'user_acquisition'
      })
    }
  }

  if (metricsToInsert.length > 0) {
    const { error: metricError } = await supabase.from('program_metric_definitions').insert(metricsToInsert)
    if (metricError) console.error('Metric Unification Warning:', metricError)
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
  target_type: 'quantitative' | 'qualitative' | 'hybrid' | 'mou'
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

  // Phase 3: Unification - Automatically upsert metric definitions for legacy targets
  if (data.target_type === 'quantitative' || data.target_type === 'hybrid') {
    if (data.monthly_target_rp && data.monthly_target_rp > 0) {
      await supabase.from('program_metric_definitions').upsert({
        program_id: id,
        metric_key: 'revenue',
        label: 'Revenue',
        data_type: 'currency',
        input_type: 'manual',
        is_target_metric: true,
        is_primary: true,
        monthly_target: data.monthly_target_rp,
        target_direction: 'higher_is_better',
        unit_label: 'Rp',
        display_order: 1,
        metric_group: 'revenue'
      }, { onConflict: 'program_id,metric_key' })
    }
  }

  if (data.target_type === 'quantitative' || data.target_type === 'hybrid' || data.target_type === 'mou') {
    if (data.monthly_target_user && data.monthly_target_user > 0) {
      await supabase.from('program_metric_definitions').upsert({
        program_id: id,
        metric_key: 'user_count',
        label: 'Closing/User',
        data_type: 'integer',
        input_type: 'manual',
        is_target_metric: true,
        is_primary: true,
        monthly_target: data.monthly_target_user,
        target_direction: 'higher_is_better',
        unit_label: 'user',
        display_order: 2,
        metric_group: 'user_acquisition'
      }, { onConflict: 'program_id,metric_key' })
    }
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
  await supabase.from('periods').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000')
  
  // 2. Set the requested one to active
  const { error } = await supabase.from('periods').update({ is_active: true }).eq('id', id)

  if (error) return { error: error.message }

  // Revalidate everything because active period changes global dashboards
  revalidatePath('/', 'layout')
  return { success: true }
}

/**
 * Activate a new period while processing wizard decisions:
 * - 'skip': deactivate the program (is_active = false)
 * - 'fresh': keep program active, data starts from 0 (default behavior)
 * - 'carry': keep program active AND save a carry-over record so dashboard
 *            aggregates data from both old and new periods.
 */
export async function activatePeriodWithDecisions(
  periodId: string,
  fromPeriodId: string | null,
  decisions: Record<string, 'skip' | 'fresh' | 'carry'>
): Promise<ActionResponse> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Hanya admin yang bisa mengatur periode aktif.' }

  // 1. Deactivate programs marked as 'skip'
  const skipIds = Object.entries(decisions)
    .filter(([, d]) => d === 'skip')
    .map(([id]) => id)

  if (skipIds.length > 0) {
    const { error: skipError } = await supabase
      .from('programs')
      .update({ is_active: false })
      .in('id', skipIds)
    if (skipError) return { error: `Gagal menonaktifkan program: ${skipError.message}` }
  }

  // 2. Save carry-over settings for programs marked as 'carry'
  if (fromPeriodId) {
    const carryIds = Object.entries(decisions)
      .filter(([, d]) => d === 'carry')
      .map(([id]) => id)

    if (carryIds.length > 0) {
      const carrySettings = carryIds.map(programId => ({
        program_id: programId,
        period_id: periodId,
        carry_over_from_period_id: fromPeriodId,
      }))
      const { error: carryError } = await supabase
        .from('program_period_settings')
        .upsert(carrySettings, { onConflict: 'program_id,period_id' })
      if (carryError) console.error('Carry-over save warning:', carryError.message)
    }
  }

  // 3. Switch active period
  await supabase.from('periods').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000')
  const { error } = await supabase.from('periods').update({ is_active: true }).eq('id', periodId)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { success: true, data: { skipped: skipIds.length } }
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

