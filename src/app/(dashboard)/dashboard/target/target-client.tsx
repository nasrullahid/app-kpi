'use client'

import { useMemo } from 'react'
import { formatRupiah, cn } from '@/lib/utils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine
} from 'recharts'
import { TrendingUp, Users, Target, CheckSquare } from 'lucide-react'

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
  prorationFactor?: number
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
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
      <div className={cn("absolute top-0 right-0 p-4 opacity-5", accent)}>
        <Icon className="w-20 h-20" />
      </div>
      <div>
        <p className="text-xs font-black tracking-[0.15em] text-slate-400 uppercase mb-2">{label}</p>
        <p className="text-3xl font-black text-slate-800 mb-1">{value}</p>
        {sub && <p className={cn("text-xs font-bold mb-2", subColor || 'text-slate-400')}>{sub}</p>}
      </div>
      {comparison && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
          <span className={cn(
            "text-xs font-bold px-1.5 py-0.5 rounded",
            comparison.value > 0 ? "bg-emerald-100 text-emerald-700" : 
            comparison.value < 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"
          )}>
            {comparison.value > 0 ? '+' : ''}{comparison.value.toFixed(1)}%
          </span>
          <span className="text-[10px] uppercase font-bold text-slate-400">{comparison.label}</span>
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
  prorationFactor = 1,
  summary: dashboardSummary,
  previousSummary
}: TargetClientProps) {
  // ── Collect primary revenue + user metrics from all programs ────────────
  const summary = useMemo(() => {
    const agg = dashboardSummary.aggregates
    const prevAgg = previousSummary?.aggregates

    const totalTargetRp = agg.revenue?.target || 0
    const totalAchievedRp = agg.revenue?.actual || 0
    const prevAchievedRp = prevAgg?.revenue?.actual || 0

    const totalTargetUser = agg.user_acquisition?.target || 0
    const totalAchievedUser = agg.user_acquisition?.actual || 0
    const prevAchievedUser = prevAgg?.user_acquisition?.actual || 0

    // Milestones
    let totalMilestones = 0, completedMilestones = 0
    programs.forEach(prog => {
      const msIds = prog.program_milestones?.map(m => m.id) || []
      totalMilestones += msIds.length
      completedMilestones += milestoneCompletions.filter(c => msIds.includes(c.milestone_id) && c.is_completed).length
    })

    // Current ideal targets (respecting manual targets via proration)
    const proRataRp = totalTargetRp * prorationFactor
    const proRataUser = totalTargetUser * prorationFactor

    return {
      totalTargetRp, totalAchievedRp,
      totalTargetUser, totalAchievedUser,
      totalMilestones, completedMilestones,
      rpPct: totalTargetRp > 0 ? (totalAchievedRp / totalTargetRp) * 100 : 0,
      userPct: totalTargetUser > 0 ? (totalAchievedUser / totalTargetUser) * 100 : 0,
      proRataRp,
      proRataUser,
      rpGrowth: prevAchievedRp > 0 ? ((totalAchievedRp - prevAchievedRp) / prevAchievedRp) * 100 : 0,
      userGrowth: prevAchievedUser > 0 ? ((totalAchievedUser - prevAchievedUser) / prevAchievedUser) * 100 : 0,
      hasPrevData: prevAchievedRp > 0 || prevAchievedUser > 0,
    }
  }, [dashboardSummary, previousSummary, programs, milestoneCompletions, prorationFactor])

  // ── Revenue cumulative trend ─────────────────────────────────────────────
  const rpTrend = useMemo(() => {
    const today = new Date().getDate()
    const daysInMonth = activePeriod.working_days || 30
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

    return Array.from({ length: Math.min(today, 30) }, (_, i) => {
      const day = i + 1
      const dateStr = `${activePeriod.year}-${String(activePeriod.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      cumulative += rpByDate.get(dateStr) || 0
      cumulativeTarget += totalDailyTarget
      
      return {
        day: String(day),
        realisasi: cumulative,
        targetIdeal: cumulativeTarget
      }
    })
  }, [activePeriod, programs, metricValues, dailyInputs])

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
          return { name: prog.name.substring(0, 14), achieved, target, pct: target > 0 ? (achieved / target) * 100 : 0 }
        }
        // Legacy
        const inputs = dailyInputs.filter(i => i.program_id === prog.id)
        const achieved = inputs.reduce((s, i) => s + Number(i.achievement_rp || 0), 0)
        const target = prog.monthly_target_rp || 0
        return { name: prog.name.substring(0, 14), achieved, target, pct: target > 0 ? (achieved / target) * 100 : 0 }
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
          sub={`Pro-rata hari ini: ${formatRupiah(summary.proRataRp)}`}
          subColor="text-slate-400"
        />
        <KpiCard
          icon={TrendingUp}
          label="Total Capaian Rp"
          accent="text-emerald-600"
          value={formatRupiah(summary.totalAchievedRp)}
          sub={`${summary.rpPct.toFixed(1)}% dari target`}
          subColor={summary.rpPct >= 100 ? 'text-emerald-600 font-black' : summary.rpPct >= 60 ? 'text-amber-600' : 'text-red-500'}
          comparison={isCustomDateRange ? { value: summary.rpGrowth, label: 'vs periode sblmnya' } : undefined}
        />
        <KpiCard
          icon={Users}
          label="Total Target User"
          accent="text-violet-600"
          value={summary.totalTargetUser.toLocaleString()}
          sub={`Pro-rata: ${Math.round(summary.proRataUser).toLocaleString()} user`}
          subColor="text-slate-400"
        />
        <KpiCard
          icon={CheckSquare}
          label="Total Capaian User"
          accent="text-cyan-600"
          value={summary.totalAchievedUser.toLocaleString()}
          sub={`${summary.userPct.toFixed(1)}% dari target`}
          subColor={summary.userPct >= 100 ? 'text-emerald-600 font-black' : summary.userPct >= 60 ? 'text-amber-600' : 'text-red-500'}
          comparison={isCustomDateRange ? { value: summary.userGrowth, label: 'vs periode sblmnya' } : undefined}
        />
      </div>

      {/* ── Progress bars summary ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Rp bar */}
        <div className="md:col-span-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Capaian Pendapatan</p>
          <div className="flex justify-between text-sm font-bold mb-2">
            <span className="text-slate-600">{formatRupiah(summary.totalAchievedRp)}</span>
            <span className="text-slate-400">{summary.rpPct.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700",
                summary.rpPct >= 100 ? 'bg-emerald-500' : summary.rpPct >= 60 ? 'bg-indigo-500' : 'bg-amber-500'
              )}
              style={{ width: `${Math.min(summary.rpPct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">Target: {formatRupiah(summary.totalTargetRp)}</p>
        </div>

        {/* User bar */}
        <div className="md:col-span-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Capaian User/Peserta</p>
          <div className="flex justify-between text-sm font-bold mb-2">
            <span className="text-slate-600">{summary.totalAchievedUser.toLocaleString()} user</span>
            <span className="text-slate-400">{summary.userPct.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700",
                summary.userPct >= 100 ? 'bg-emerald-500' : summary.userPct >= 60 ? 'bg-violet-500' : 'bg-amber-500'
              )}
              style={{ width: `${Math.min(summary.userPct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">Target: {summary.totalTargetUser.toLocaleString()} user</p>
        </div>

        {/* Milestone bar */}
        <div className="md:col-span-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Milestone Selesai</p>
          <div className="flex justify-between text-sm font-bold mb-2">
            <span className="text-slate-600">{summary.completedMilestones} selesai</span>
            <span className="text-slate-400">
              {summary.totalMilestones > 0 ? ((summary.completedMilestones / summary.totalMilestones) * 100).toFixed(0) : 0}%
            </span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-700"
              style={{ width: `${summary.totalMilestones > 0 ? (summary.completedMilestones / summary.totalMilestones) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">Total: {summary.totalMilestones} milestone</p>
        </div>
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
                <ReferenceLine y={summary.totalTargetRp} stroke="#ef4444" strokeDasharray="4 4" opacity={0.5} label={{ value: 'TARGET', position: 'right', fill: '#ef4444', fontSize: 10 }} />
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
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
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
