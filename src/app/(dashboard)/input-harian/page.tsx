import { createClient } from '@/lib/supabase/server'
import { InputFormClient } from './input-form-client'

export const dynamic = 'force-dynamic'

export default async function InputHarianPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // 1. Fetch Active Period
  const { data: activePeriod } = await supabase
    .from('periods')
    .select('*')
    .eq('is_active', true)
    .single()

  // 2. Fetch Active Programs
  const { data: activePrograms } = await supabase
    .from('programs')
    .select('id, name, target_type')
    .eq('is_active', true)
    .order('name')

  // 3. Fetch User's Past Inputs for the Active Period
  let pastInputs: any[] = []
  if (activePeriod) {
    const { data } = await supabase
      .from('daily_inputs')
      .select(`
        *,
        programs (
          name,
          target_type
        )
      `)
      .eq('period_id', activePeriod.id)
      .eq('created_by', user.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    
    pastInputs = data || []
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Pencapaian Harian</h2>
        <p className="text-slate-500">Catat dan pantau aktivitas harian Anda terhadap target program berjalan.</p>
      </div>

      {!activePeriod ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-red-800">Tidak Ada Periode Aktif</h3>
          <p className="text-red-600 mt-2 max-w-lg mx-auto">
            Input harian saat ini terkunci karena Admin belum mengaktifkan periode bulan ini di Master Data. Silakan hubungi Admin Anda.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">Periode Aktif Saat Ini</span>
              <span className="text-lg font-semibold text-indigo-900">Bulan {activePeriod.month} Tahun {activePeriod.year}</span>
            </div>
            <div className="bg-white px-4 py-2 rounded-lg text-sm font-medium text-slate-700 shadow-sm border border-slate-100">
              Total Hari Kerja: <span className="font-bold text-indigo-600">{activePeriod.working_days} Hari</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            {activePrograms && activePrograms.length > 0 ? (
              <InputFormClient 
                programs={activePrograms} 
                pastInputs={pastInputs} 
              />
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-500 font-medium">Belum ada satupun program aktif yang bisa diinput.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
