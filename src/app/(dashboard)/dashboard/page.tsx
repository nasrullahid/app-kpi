import { createClient } from '@/lib/supabase/server'
import { DashboardClient } from './dashboard-client'
import { Database } from '@/types/database'
import { Suspense } from 'react'

type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
type Milestone = Database['public']['Tables']['program_milestones']['Row']

type ProgramWithRelations = Database['public']['Tables']['programs']['Row'] & {
  program_pics: { profile_id: string }[]
  program_milestones: Milestone[]
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { startDate?: string; endDate?: string }
}) {
  const supabase = createClient()
  const { startDate, endDate } = searchParams
  
  // 1. Session and Profile
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  // 2. Active Period
  const { data: activePeriod } = await supabase.from('periods').select('*').eq('is_active', true).single()

  // 3. Programs and Team Access
  let programsQuery = supabase
    .from('programs')
    .select('*, program_pics(profile_id), program_milestones(*)')
    .eq('is_active', true)

  if (!isAdmin && user) {
    // PIC can only see programs where they are in the team
    const { data: myTeamPrograms } = await supabase
      .from('program_pics')
      .select('program_id')
      .eq('profile_id', user.id)
    
    const myProgramIds = myTeamPrograms?.map(tp => tp.program_id) || []
    programsQuery = programsQuery.in('id', myProgramIds)
  }
  const { data: programs } = await (programsQuery as any) as { data: ProgramWithRelations[] | null }

  // 4. Milestone Completions (Fetch all for these programs to ensure persistence)
  const allMilestoneIds = programs?.flatMap(p => p.program_milestones?.map((m: Milestone) => m.id)) || []
  const { data: milestoneCompletions } = await supabase
    .from('milestone_completions')
    .select('*')
    .in('milestone_id', allMilestoneIds)

  // 5. PIC Profiles for display names
  const { data: picProfiles } = await supabase
    .from('profiles')
    .select('id, name')

  // 6. Daily Inputs
  let dailyInputs: DailyInput[] = []
  if (activePeriod && programs && programs.length > 0) {
    const programIds = programs.map(p => p.id)
    
    let query = supabase
      .from('daily_inputs')
      .select('*')
      .in('program_id', programIds)
    
    if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate)
    } else {
      query = query.eq('period_id', activePeriod.id)
    }

    const { data: inputs } = await query.order('date', { ascending: true })
    dailyInputs = inputs || []
  }

  const filterStrings = {
    startDate: startDate || '',
    endDate: endDate || ''
  }

  return (
    <div className="space-y-6 mb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard Key Performance Indicator</h2>
          <p className="text-slate-500">
            Pantau progres kinerja {isAdmin ? 'perusahaan secara global' : `program Anda (${profile?.name})`}.
          </p>
        </div>
        
        {activePeriod && (
          <div className="bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl flex items-center gap-3">
             <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
             <div className="text-sm font-semibold text-indigo-900">
               Bulan: {activePeriod.month} / {activePeriod.year} ({activePeriod.working_days} Hari Kerja)
             </div>
          </div>
        )}
      </div>

      {!activePeriod ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center text-amber-800">
          <h3 className="font-bold text-lg mb-2">Belum Ada Periode Aktif</h3>
          <p>Admin harus mengatur periode aktif terlebih dahulu di Master Data agar dashboard dapat menampilkan kalkulasi.</p>
        </div>
      ) : programs && programs.length > 0 ? (
        <Suspense fallback={<div className="h-96 w-full animate-pulse bg-slate-100 rounded-xl" />}>
          <DashboardClient 
            programs={programs || []} 
            dailyInputs={dailyInputs} 
            activePeriod={activePeriod}
            initialFilters={filterStrings}
            milestoneCompletions={milestoneCompletions || []}
            picProfiles={picProfiles || []}
          />
        </Suspense>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center text-slate-500">
          <p className="font-medium text-lg">Tidak ada data program yang ditemukan.</p>
          {!isAdmin && <p className="text-sm mt-2">Belum ada program aktif yang ditugaskan atas nama Anda.</p>}
        </div>
      )}
    </div>
  )
}
