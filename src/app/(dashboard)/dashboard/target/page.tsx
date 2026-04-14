import { getDashboardData } from '../actions'
import { TargetClient } from './target-client'
import { Suspense } from 'react'
import { Target } from 'lucide-react'
import { DashboardDateFilter } from '@/components/dashboard-date-filter'

export const dynamic = 'force-dynamic'

export default async function TargetPage({
  searchParams,
}: {
  searchParams: { startDate?: string; endDate?: string }
}) {
  const data = await getDashboardData(searchParams.startDate, searchParams.endDate)

  const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(
    new Date(2024, (data.activePeriod?.month ?? 1) - 1, 1)
  )

  return (
    <div className="space-y-6 mb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-slate-400">
            <Target className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Dashboard KPI</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Metrik Utama</h1>
          <p className="text-sm text-slate-500">Target Rp, User, dan Milestone kuantitatif semua program.</p>
        </div>

        {data.activePeriod && (
          <div className="flex flex-col sm:flex-row items-end gap-3 shrink-0">
            <DashboardDateFilter />
            <div className="bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl flex items-center gap-3 shrink-0 h-10">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-bold text-indigo-900">
                Periode: {monthName} {data.activePeriod.year} · {data.activePeriod.working_days} HK
              </span>
            </div>
          </div>
        )}
      </div>

      {!data.activePeriod ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-10 text-center text-amber-800">
          <h3 className="font-bold text-lg mb-2">Belum Ada Periode Aktif</h3>
          <p className="text-sm">Admin harus mengatur periode aktif di Master Data.</p>
        </div>
      ) : (
        <Suspense fallback={<div className="h-96 w-full animate-pulse bg-slate-100 rounded-2xl" />}>
          <TargetClient
            programs={data.programs}
            dailyInputs={data.dailyInputs}
            activePeriod={data.activePeriod}
            milestoneCompletions={data.milestoneCompletions}
            metricValues={data.metricValues}
            previousMetricValues={data.previousMetricValues}
            previousDailyInputs={data.previousDailyInputs}
            isCustomDateRange={data.isCustomDateRange}
          />
        </Suspense>
      )}
    </div>
  )
}
