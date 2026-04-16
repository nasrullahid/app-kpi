'use client'

import { useMemo } from 'react'
import { formatRupiah, cn } from '@/lib/utils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine
} from 'recharts'
import { TrendingUp, Users, Target, CheckSquare, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react'
import { getPreviousPeriodLabel } from '@/lib/utils'
import { RadialProgressCard } from '@/components/dashboard/radial-progress-card'

import { Database } from '@/types/database'
import { ProgramWithRelations } from '../actions'

type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']
type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
type Period = Database['public']['Tables']['periods']['Row']

import { DashboardSummary } from '@/lib/dashboard-service'

interface TargetClientProps {
  programs: ProgramWithRelations[]
  dailyInputs: DailyInput[]
  activePeriod: Period
  milestoneCompletions: MilestoneCompletion[]
  metricValues: MetricValue[]
  summary: DashboardSummary
  previousMetricValues?: MetricValue[]
  previousDailyInputs?: DailyInput[]
  previousSummary?: DashboardSummary
  isCustomDateRange?: boolean
  startDate?: string
  endDate?: string
}

function KpiCard({ label, value, sub, subColor, icon: Icon, accent, comparison }: {
  label: string
  value: string
  sub?: string
  subColor?: string
  icon: React.ElementType
  accent: string
  comparison?: { value: number; label: string }
}) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative flex flex-col justify-between transition-all hover:shadow-md hover:z-20 min-w-0">
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
        <div className={cn("absolute top-0 right-0 p-4 opacity-5", accent)}>
          <Icon className="w-20 h-20" />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black tracking-[0.15em] text-slate-400 uppercase mb-3 truncate" title={label}>{label}</p>
        <div className="flex items-end gap-2 w-full flex-wrap" style={{ containerType: 'inline-size' }}>
          <span className={cn(
            "font-black text-slate-800 leading-none whitespace-nowrap drop-shadow-sm",
            "text-[min(2.25rem,11cqw)] sm:text-[min(2.5rem,11cqw)] lg:text-[min(3rem,11cqw)]",
          )} title={String(value)}>
            {value}
          </span>
          {sub && <span className={cn("text-[10px] sm:text-xs font-bold mb-1 whitespace-nowrap shrink-0", subColor || 'text-slate-400')} title={sub}>{sub}</span>}
        </div>
      </div>
      {comparison && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
          <div className="group/tooltip relative flex items-center gap-1.5">
            <span className={cn(
              "text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5",
              comparison.value > 0 ? "bg-emerald-100 text-emerald-700" : 
              comparison.value < 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"
            )}>
              {comparison.value > 0 ? <ArrowUpRight className="h-3 w-3" /> : comparison.value < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
              {Math.abs(comparison.value).toFixed(1)}%
            </span>
            <Info className="h-3.5 w-3.5 text-slate-300 hover:text-slate-500 cursor-help transition-colors" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50 shadow-xl border border-white/10">
              {comparison.label}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function TargetClient({
  programs,
  dailyInputs,
  activePeriod,
  milestoneCompletions,
  metricValues,
  isCustomDateRange,
  summary: dashboardSummary,
  previousSummary,
  startDate,
  endDate
}: TargetClientProps) {
  const prevPeriodLabel = useMemo(() => getPreviousPeriodLabel(startDate, endDate), [startDate, endDate])

  // ── Collect primary revenue + user metrics from all programs ────────────
  const summary = useMemo(() => {
    const agg = dashboardSummary.aggregates
    const prevAgg = previousSummary?.aggregates

    // totalTarget is the full monthly goal (absolute)
    // target is the prorated goal (relative to selection)
    const monthlyTargetRp = agg.revenue?.totalTarget || 0
    const proRataRp = agg.revenue?.target || 0
    const totalAchievedRp = agg.revenue?.actual || 0
    const prevAchievedRp = prevAgg?.revenue?.actual || 0

    const monthlyTargetUser = agg.user_acquisition?.totalTarget || 0
    const proRataUser = agg.user_acquisition?.target || 0
    const totalAchievedUser = agg.user_acquisition?.actual || 0
    const prevAchievedUser = prevAgg?.user_acquisition?.actual || 0

    // Milestones
    let totalMilestones = 0, completedMilestones = 0
    programs.forEach(prog => {
      const msIds = prog.program_milestones?.map(m => m.id) || []
      totalMilestones += msIds.length
      completedMilestones += milestoneCompletions.filter(c => msIds.includes(c.milestone_id) && c.is_completed).length
    })

    return {
      totalTargetRp: monthlyTargetRp, 
      totalAchievedRp,
      totalTargetUser: monthlyTargetUser, 
      totalAchievedUser,
      totalMilestones, completedMilestones,
      rpPct: monthlyTargetRp > 0 ? (totalAchievedRp / monthlyTargetRp) * 100 : 0,
      userPct: monthlyTargetUser > 0 ? (totalAchievedUser / monthlyTargetUser) * 100 : 0,
      proRataRp,
      proRataUser,
      rpGrowth: prevAchievedRp > 0
      ? ((totalAchievedRp - prevAchievedRp) / prevAchievedRp) * 100
      : totalAchievedRp > 0 ? 100 : 0,

      userGrowth: prevAchievedUser > 0
      ? ((totalAchievedUser - prevAchievedUser) / prevAchievedUser) * 100
      : totalAchievedUser > 0 ? 100 : 0,
      hasPrevData: prevAchievedRp > 0 || prevAchievedUser > 0,
    }
  }, [dashboardSummary, previousSummary, programs, milestoneCompletions])

  // ── Revenue cumulative trend ─────────────────────────────────────────────
  const rpTrend = useMemo(() => {
    const daysInMonth = activePeriod.working_days || 30
    
    // Determine the range of dates to show in the chart
    const dateRange: string[] = []
    if (startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      const current = new Date(start)
      while (current <= end) {
        dateRange.push(current.toISOString().split('T')[0])
        current.setDate(current.getDate() + 1)
      }
    } else {
      const today = new Date().getDate()
      for (let i = 1; i <= Math.min(today, 30); i++) {
        dateRange.push(`${activePeriod.year}-${String(activePeriod.month).padStart(2, '0')}-${String(i).padStart(2, '0')}`)
      }
    }

    let cumulative = 0
    let cumulativeTarget = 0

    // Per-program daily target sum
    const totalDailyTarget = programs.reduce((sum, p) => {
      return sum + (p.daily_target_rp !== null ? Number(p.daily_target_rp) : (Number(p.monthly_target_rp || 0) / daysInMonth))
    }, 0)

    // Flatten all daily metric values with revenue group
    const revenueMetricIds = new Set<string>()
    programs.forEach(p => {
      const defs = p.program_metric_definitions || []
      defs.filter(d => d.metric_group === 'revenue' && d.is_primary).forEach(d => revenueMetricIds.add(d.id))
    })

    const rpByDate = new Map<string, number>()
    metricValues
      .filter(mv => revenueMetricIds.has(mv.metric_definition_id))
      .forEach(mv => {
        rpByDate.set(mv.date, (rpByDate.get(mv.date) || 0) + Number(mv.value || 0))
      })
    dailyInputs.forEach(inp => {
      if ((inp.achievement_rp || 0) > 0) {
        rpByDate.set(inp.date, (rpByDate.get(inp.date) || 0) + Number(inp.achievement_rp || 0))
      }
    })

    return dateRange.map((dateStr, i) => {
      const achieved = rpByDate.get(dateStr) || 0
      cumulative += achieved
      cumulativeTarget += totalDailyTarget

      const displayLabel = startDate && endDate 
        ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(dateStr))
        : String(i + 1)

      return {
        day: displayLabel,
        realisasi: cumulative,
        targetIdeal: cumulativeTarget
      }
    })
  }, [activePeriod, programs, metricValues, dailyInputs, startDate, endDate])

  // ── Bar chart: Rp per program ────────────────────────────────────────────
  const rpBarData = useMemo(() => {
    return programs
      .map(prog => {
        const defs = prog.program_metric_definitions || []
        const revDef = defs.find(d => d.metric_group === 'revenue' && d.is_primary)
        if (revDef) {
          const vals = metricValues.filter(mv => mv.metric_definition_id === revDef.id && mv.program_id === prog.id)
          const achieved = vals.reduce((s, v) => s + Number(v.value || 0), 0)
          const target = revDef.monthly_target || 0
          return { name: prog.name, achieved, target, pct: target > 0 ? (achieved / target) * 100 : 0 }
        }
        // Legacy
        const inputs = dailyInputs.filter(i => i.program_id === prog.id)
        const achievedCurrent = inputs.reduce((s, i) => s + Number(i.achievement_rp || 0), 0)
        const targetCurrent = prog.monthly_target_rp || 0
        return { name: prog.name, achieved: achievedCurrent, target: targetCurrent, pct: targetCurrent > 0 ? (achievedCurrent / targetCurrent) * 100 : 0 }
      })
      .filter(d => d.target > 0)
      .sort((a, b) => b.pct - a.pct)
  }, [programs, metricValues, dailyInputs])

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Target}
          label="Total Target Rp"
          accent="text-indigo-600"
          value={formatRupiah(summary.totalTargetRp)}
          sub={`Sisa Target: ${formatRupiah(Math.max(0, summary.totalTargetRp - summary.totalAchievedRp))}`}
          subColor="text-slate-400"
        />
        <KpiCard
          icon={TrendingUp}
          label="Total Capaian Rp"
          accent="text-emerald-600"
          value={formatRupiah(summary.totalAchievedRp)}
          sub={`${summary.rpPct.toFixed(1)}% dari target`}
          subColor={summary.rpPct >= 100 ? 'text-emerald-600 font-black' : summary.rpPct >= 60 ? 'text-amber-600' : 'text-red-500'}
          comparison={isCustomDateRange ? { value: summary.rpGrowth, label: prevPeriodLabel } : undefined}
        />
        <KpiCard
          icon={Users}
          label="Total Target User"
          accent="text-violet-600"
          value={summary.totalTargetUser.toLocaleString()}
          sub={`Sisa Target: ${Math.max(0, summary.totalTargetUser - summary.totalAchievedUser).toLocaleString()} user`}
          subColor="text-slate-400"
        />
        <KpiCard
          icon={CheckSquare}
          label="Total Capaian User"
          accent="text-cyan-600"
          value={summary.totalAchievedUser.toLocaleString()}
          sub={`${summary.userPct.toFixed(1)}% dari target`}
          subColor={summary.userPct >= 100 ? 'text-emerald-600 font-black' : summary.userPct >= 60 ? 'text-amber-600' : 'text-red-500'}
          comparison={isCustomDateRange ? { value: summary.userGrowth, label: prevPeriodLabel } : undefined}
        />
      </div>

      {/* ── Progress charts summary ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Rp chart */}
        <RadialProgressCard
          title="Capaian Pendapatan"
          value={summary.totalAchievedRp}
          target={summary.totalTargetRp}
          percentage={summary.rpPct}
          displayValue={formatRupiah(summary.totalAchievedRp)}
          displayTarget={formatRupiah(summary.totalTargetRp)}
          unitLabel=""
          color={summary.rpPct >= 100 ? '#10b981' : summary.rpPct >= 60 ? '#6366f1' : '#f59e0b'}
        />

        {/* User chart */}
        <RadialProgressCard
          title="Capaian User/Peserta"
          value={summary.totalAchievedUser}
          target={summary.totalTargetUser}
          percentage={summary.userPct}
          displayValue={`${summary.totalAchievedUser.toLocaleString()} user`}
          displayTarget={summary.totalTargetUser.toLocaleString()}
          unitLabel="user"
          color={summary.userPct >= 100 ? '#10b981' : summary.userPct >= 60 ? '#8b5cf6' : '#f59e0b'}
        />

        {/* Milestone chart */}
        <RadialProgressCard
          title="Milestone Selesai"
          value={summary.completedMilestones}
          target={summary.totalMilestones}
          percentage={summary.totalMilestones > 0 ? (summary.completedMilestones / summary.totalMilestones) * 100 : 0}
          displayValue={`${summary.completedMilestones} selesai`}
          displayTarget={String(summary.totalMilestones)}
          unitLabel="milestone"
          color="#14b8a6"
        />
      </div>

      {/* ── Charts ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line: cumulative Rp vs target ideal */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 text-sm">Akumulasi Pendapatan vs Target</h3>
            <div className="flex gap-4 text-[10px] font-bold text-slate-400">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-indigo-500" />Realisasi</span>
              <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-slate-400" />Target</span>
            </div>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rpTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                <YAxis tickFormatter={(v: number) => v >= 1e9 ? `${(v/1e9).toFixed(1)}M` : v >= 1e6 ? `${(v/1e6).toFixed(0)}jt` : String(v)} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={50} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v: unknown) => [formatRupiah(Number(v || 0)), '']}
                  labelFormatter={(l: unknown) => `Hari ke-${l}`}
                />
                <ReferenceLine y={summary.proRataRp} stroke="#ef4444" strokeDasharray="4 4" opacity={0.5} label={{ value: 'IDEAL', position: 'right', fill: '#ef4444', fontSize: 10 }} />
                <Line type="monotone" dataKey="targetIdeal" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="realisasi" stroke="#6366f1" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar: Rp per program */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 text-sm mb-4">Capaian Pendapatan per Program</h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rpBarData} layout="vertical" margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => v >= 1e6 ? `${(v/1e6).toFixed(0)}jt` : String(v)} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.length > 20 ? v.substring(0, 20) + '...' : v} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v: unknown) => [formatRupiah(Number(v || 0)), '']}
                />
                <Bar dataKey="achieved" name="achieved" radius={[0, 6, 6, 0]} maxBarSize={14}>
                  {rpBarData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.pct >= 100 ? '#10b981' : entry.pct >= 60 ? '#6366f1' : '#f59e0b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
