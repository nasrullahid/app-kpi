import { createClient } from '@/lib/supabase/server'
import { DashboardClient } from './dashboard-client'
import { Database } from '@/types/database'

type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
type Program = Database['public']['Tables']['programs']['Row']

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createClient()
  
  // 1. Session and Profile
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  // 2. Active Period
  const { data: activePeriod } = await supabase.from('periods').select('*').eq('is_active', true).single()

  let programsQuery = supabase.from('programs').select('*').eq('is_active', true)
  if (!isAdmin && user) {
    // PIC can only see their own programs based on assigned pic_id
    programsQuery = programsQuery.eq('pic_id', user.id)
  }
  const { data: programs } = await programsQuery

  // 4. Daily Inputs
  let dailyInputs: DailyInput[] = []
  if (activePeriod && programs && (programs as Program[]).length > 0) {
    const programIds = (programs as Program[]).map((p: Program) => p.id)
    const { data: inputs } = await supabase
      .from('daily_inputs')
      .select('*')
      .eq('period_id', activePeriod.id)
      .in('program_id', programIds)
      .order('date', { ascending: true }) // important for chronogical grouping
      
    dailyInputs = inputs || []
  }

  return (
    <div className="space-y-6 mb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard Keuangan & Kinerja</h2>
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
        <DashboardClient 
          programs={programs} 
          dailyInputs={dailyInputs} 
          activePeriod={activePeriod}
          isAdmin={isAdmin}
        />
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center text-slate-500">
          <p className="font-medium text-lg">Tidak ada data program yang ditemukan.</p>
          {!isAdmin && <p className="text-sm mt-2">Belum ada program aktif yang ditugaskan atas nama Anda.</p>}
        </div>
      )}
    </div>
  )
}
