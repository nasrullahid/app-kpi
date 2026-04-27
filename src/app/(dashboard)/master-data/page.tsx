import { createClient } from '@/lib/supabase/server'
import { ProgramClient } from './program-client'
import { PeriodClient } from './period-client'

export const dynamic = 'force-dynamic'

export default async function MasterDataPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const supabase = createClient()
  
  // Get active tab, default to 'periode'
  const activeTab = searchParams.tab || 'periode'

  // Get user role
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id).single()
  const isAdmin = profile?.role === 'admin'

  // Fetch Data
  const { data: programs } = await supabase
    .from('programs')
    .select('*, program_pics(profile_id), program_milestones(*), program_metric_definitions(*)')
    .order('created_at', { ascending: false })

  const { data: periods } = await supabase
    .from('periods')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false })

  const { data: picProfiles } = await supabase
    .from('profiles')
    .select('id, name, whatsapp_number')
    .eq('role', 'pic')
    .order('name', { ascending: true })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Master Data</h2>
        <p className="text-slate-500">Kelola daftar program dan periode target perusahaan.</p>
        
        {!isAdmin && (
          <div className="mt-2 text-sm text-amber-700 bg-amber-50 px-4 py-2 border border-amber-200 rounded-md max-w-max">
            Anda login sebagai PIC. Akun Anda memiliki hak akses <strong>Read-Only</strong> di halaman ini.
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Tabs Header */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-4">
          <a
            href="?tab=periode"
            className={`px-6 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'periode'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            Pengaturan Periode
          </a>
          <a
            href="?tab=program"
            className={`px-6 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'program'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            Program & Target
          </a>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'periode' ? (
            <PeriodClient periods={periods || []} programs={programs || []} isAdmin={isAdmin} />
          ) : (
            <ProgramClient 
              programs={programs || []} 
              isAdmin={isAdmin} 
              picProfiles={picProfiles || []}
            />
          )}
        </div>
      </div>
    </div>
  )
}
