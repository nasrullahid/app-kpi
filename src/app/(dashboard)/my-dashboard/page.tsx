import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUnifiedDashboardData } from '@/lib/dashboard-service'
import { OverviewClient } from '../dashboard/dashboard-client'
import { Suspense } from 'react'
import { User } from 'lucide-react'
import { DashboardDateFilter } from '@/components/dashboard-date-filter'

export const dynamic = 'force-dynamic'

export default async function MyDashboardPage({
  searchParams,
}: {
  searchParams: { startDate?: string; endDate?: string }
}) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') {
    redirect('/dashboard')
  }

  // We intentionally force isAdmin to false here so it ONLY fetches programs PIC is assigned to
  const data = await getUnifiedDashboardData({
    profileId: user.id,
    isAdmin: false, 
    startDate: searchParams.startDate,
    endDate: searchParams.endDate,
    includePrevious: true
  })

  const { data: profiles } = await supabase.from('profiles').select('id, name')

  const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(
    new Date(2024, (data.activePeriod?.month ?? 1) - 1, 1)
  )

  return (
    <div className="space-y-6 mb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-indigo-500">
            <User className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Personal KPI</span>
          </div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">My Dashboard</h1>
          </div>
          <p className="text-sm text-slate-500">Pantau progres kinerja program yang ditugaskan khusus kepada Anda.</p>
        </div>

        {data.activePeriod && (
          <div className="flex flex-col sm:flex-row items-end gap-3 shrink-0">
            <DashboardDateFilter />
            <div className="bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl flex items-center gap-3 shrink-0 h-10">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-bold text-indigo-900">
                Periode: Bulan {monthName} Tahun {data.activePeriod.year} · {data.activePeriod.working_days} HK
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      {!data.activePeriod ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-10 text-center text-amber-800">
          <h3 className="font-bold text-lg mb-2">Belum Ada Periode Aktif</h3>
          <p className="text-sm">Admin harus mengatur periode aktif di Master Data agar dashboard dapat menampilkan kalkulasi.</p>
        </div>
      ) : data.programs.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-12 flex flex-col items-center text-center text-slate-500">
           <User className="h-12 w-12 text-slate-300 mb-4" />
          <p className="font-bold text-slate-700 text-lg">Belum ada program untuk Anda</p>
          <p className="text-sm text-slate-400 mt-1 max-w-sm">Saat ini tidak ada program aktif yang ditugaskan ke Anda. Hubungi Admin untuk ditugaskan sebagai PIC program.</p>
        </div>
      ) : (
        <Suspense fallback={<div className="h-96 w-full animate-pulse bg-slate-100 rounded-2xl" />}>
          <OverviewClient
            programs={data.programs}
            profiles={profiles || []}
            summary={data.summary}
            previousSummary={data.previousData?.summary}
            startDate={searchParams.startDate}
            endDate={searchParams.endDate}
            metricValues={data.metricValues}
            dailyInputs={data.dailyInputs}
            activePeriod={data.activePeriod}
            milestoneCompletions={data.milestoneCompletions}
            isPersonalMode={true}
          />
        </Suspense>
      )}
    </div>
  )
}
