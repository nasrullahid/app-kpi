'use client'

import { useState, useMemo } from 'react'
import { ProgramWithRelations } from './actions'
import { Database } from '@/types/database'
import { calculateProgramHealth, ProgramWithRelations as CalcProgramWithRelations } from '@/lib/dashboard-calculator'
import { formatRupiah, cn } from '@/lib/utils'
import { formatMetricValue } from '@/lib/formula-evaluator'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts'
import {
  HeartPulse, Layers, Target, CheckSquare,
  Search
} from 'lucide-react'

type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']
type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
type Period = Database['public']['Tables']['periods']['Row']

interface OverviewClientProps {
  programs: ProgramWithRelations[]
  dailyInputs: DailyInput[]
  activePeriod: Period
  milestoneCompletions: MilestoneCompletion[]
  metricValues: MetricValue[]
  profiles: { id: string; name: string }[]
  prorationFactor: number
  previousMetricValues?: MetricValue[]
  previousDailyInputs?: DailyInput[]
  isCustomDateRange?: boolean
}

// ── Status helpers ───────────────────────────────────────────────────────────
function getStatusLabelAndColor(score: number): { label: string; dot: string; badge: string } {
  if (score >= 100) return { label: 'Excellent', dot: 'bg-blue-500',   badge: 'text-blue-700 bg-blue-50 border-blue-200' }
  if (score >= 80)  return { label: 'Baik',      dot: 'bg-emerald-500', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  if (score >= 60)  return { label: 'Cukup',     dot: 'bg-amber-400',   badge: 'text-amber-700 bg-amber-50 border-amber-200' }
  if (score >= 40)  return { label: 'Perlu Perhatian', dot: 'bg-orange-500', badge: 'text-orange-700 bg-orange-50 border-orange-200' }
  return { label: 'Kritis', dot: 'bg-red-500', badge: 'text-red-700 bg-red-50 border-red-200' }
}

function getProgressColor(score: number) {
  if (score >= 100) return 'bg-blue-500'
  if (score >= 80)  return 'bg-emerald-500'
  if (score >= 60)  return 'bg-amber-400'
  if (score >= 40)  return 'bg-orange-500'
  return 'bg-red-500'
}

function getBannerInfo(score: number) {
  if (score < 40)  return { text: 'TARGET JAUH TERTINGGAL — FOKUS DAN KEJAR SEKARANG! 💪', bg: 'from-red-600 to-rose-700' }
  if (score < 60)  return { text: 'MASIH ADA WAKTU — TINGKATKAN INTENSITAS! 🔥', bg: 'from-amber-500 to-orange-600' }
  if (score < 80)  return { text: 'PROGRES BAGUS — JANGAN KENDUR! 🎯', bg: 'from-indigo-500 to-indigo-600' }
  if (score < 100) return { text: 'HAMPIR SAMPAI — SATU LANGKAH LAGI! 🚀', bg: 'from-indigo-600 to-violet-700' }
  return { text: 'TARGET TERCAPAI — LUAR BIASA! 🏆', bg: 'from-emerald-500 to-teal-600' }
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, iconClass, comparison }: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  iconClass?: string
  comparison?: { value: number; label: string }
}) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden transition-all hover:shadow-md">
      <div className="absolute top-0 right-0 p-4 opacity-5">
        <Icon className="w-20 h-20" />
      </div>
      <div>
        <p className="text-xs font-black tracking-[0.15em] text-slate-400 uppercase mb-3">{label}</p>
        <div className="flex items-end gap-2">
          <span className={cn("text-4xl font-black text-slate-800", iconClass)}>{value}</span>
          {sub && <span className="text-sm text-slate-400 font-semibold mb-1">{sub}</span>}
        </div>
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

// ── Individual Program Card ───────────────────────────────────────────────────
function ProgramCard({ program, health, metricValues, milestoneCompletions, profiles }: {
  program: ProgramWithRelations
  health: ReturnType<typeof calculateProgramHealth>
  metricValues: MetricValue[]
  milestoneCompletions: MilestoneCompletion[]
  profiles: { id: string; name: string }[]
}) {
  const { label, dot, badge } = getStatusLabelAndColor(health.healthScore)
  const isQualitative = health.isQualitativeOnly

  const defs = program.program_metric_definitions || []
  const primaryMetrics = defs.filter(m => m.is_primary && m.is_target_metric)
  const secondaryMetrics = defs.filter(m => !m.is_primary && m.input_type === 'manual')

  // Milestone progress for qualitative
  const msIds = program.program_milestones?.map(m => m.id) || []
  const completedMs = milestoneCompletions.filter(c => msIds.includes(c.milestone_id) && c.is_completed).length
  const totalMs = msIds.length

  const teamNames = (program.program_pics || []).map(pic => {
    const p = profiles.find(pr => pr.id === pic.profile_id)
    return p?.name || '??'
  })

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-200 p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {program.department && (
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full">
                {program.department}
              </span>
            )}
          </div>
          <h3 className="font-bold text-slate-800 text-base leading-tight truncate">{program.name}</h3>
          {teamNames.length > 0 && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              PIC: {teamNames.join(' · ')}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-2xl font-black text-slate-800">{health.healthScore.toFixed(0)}%</span>
          <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border flex items-center gap-1", badge)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
            {label}
          </span>
        </div>
      </div>

      {/* Primary Metric Progress Bars */}
      <div className="space-y-3">
        {isQualitative ? (
          <>
            <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
              <span>Milestone</span>
              <span>{completedMs}/{totalMs} selesai</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", getProgressColor(health.healthScore))}
                style={{ width: `${totalMs > 0 ? (completedMs / totalMs) * 100 : 0}%` }}
              />
            </div>
            {/* Recent milestones */}
            <div className="space-y-1 pt-1">
              {program.program_milestones?.slice(0, 3).map(ms => {
                const done = milestoneCompletions.some(c => c.milestone_id === ms.id && c.is_completed)
                return (
                  <div key={ms.id} className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{done ? '✓' : '○'}</span>
                    <span className={done ? 'text-emerald-600 font-medium line-through' : ''}>{ms.title}</span>
                  </div>
                )
              })}
            </div>
          </>
        ) : primaryMetrics.length > 0 ? (
          primaryMetrics.map(m => {
            const vals = metricValues.filter(mv => mv.metric_definition_id === m.id && mv.program_id === program.id)
            const achieved = vals.reduce((sum, v) => sum + Number(v.value || 0), 0)
            const target = m.monthly_target || 0
            const pct = target > 0 ? Math.min((achieved / target) * 100, 100) : 0
            const isCurrency = m.data_type === 'currency'

            return (
              <div key={m.id} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-500">{m.label}</span>
                  <span className="font-bold text-slate-700">
                    {isCurrency ? formatRupiah(achieved) : formatMetricValue(achieved, m.data_type, m.unit_label)}
                    <span className="text-slate-400 font-normal"> / {isCurrency ? formatRupiah(target) : target}</span>
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700", getProgressColor(pct))}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })
        ) : (
          // Legacy (no custom metrics)
          <>
            {(program.monthly_target_rp || 0) > 0 && (() => {
              const achieved = 0 // legacy fallback — no metric values
              const pct = 0
              return (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-500">Target Rp</span>
                    <span className="font-bold text-slate-700">{formatRupiah(achieved)} / {formatRupiah(program.monthly_target_rp || 0)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })()}
          </>
        )}
      </div>

      {/* Secondary Metrics Chips */}
      {secondaryMetrics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
          {secondaryMetrics.map(m => {
            const vals = metricValues.filter(mv => mv.metric_definition_id === m.id && mv.program_id === program.id)
            const val = vals.reduce((sum, v) => sum + Number(v.value || 0), 0)
            return (
              <span key={m.id} className="text-[10px] font-bold px-2 py-1 bg-slate-100 text-slate-500 rounded-full border border-slate-200">
                {m.label}: {m.data_type === 'currency' ? formatRupiah(val) : formatMetricValue(val, m.data_type, m.unit_label)}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function OverviewClient({
  programs,
  dailyInputs,
  activePeriod,
  milestoneCompletions,
  metricValues,
  profiles,
  prorationFactor,
  previousMetricValues = [],
  previousDailyInputs = [],
  isCustomDateRange
}: OverviewClientProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDept, setFilterDept] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy, setSortBy] = useState<'health' | 'name'>('health')

  // ── Computed stats ───────────────────────────────────────────────────────
  const programHealths = useMemo(() =>
    programs.map(p => ({
      program: p,
      health: calculateProgramHealth(
        p as CalcProgramWithRelations,
        metricValues,
        dailyInputs,
        milestoneCompletions,
        prorationFactor
      )
    })),
    [programs, metricValues, dailyInputs, milestoneCompletions, prorationFactor]
  )

  const overallHealth = useMemo(() => {
    if (programHealths.length === 0) return 0
    return programHealths.reduce((sum, ph) => sum + ph.health.healthScore, 0) / programHealths.length
  }, [programHealths])

  const prevOverallHealth = useMemo(() => {
    if (!isCustomDateRange || programs.length === 0) return null
    const prevHealths = programs.map(p => 
      calculateProgramHealth(
        p as CalcProgramWithRelations,
        previousMetricValues,
        previousDailyInputs,
        milestoneCompletions,
        prorationFactor
      )
    )
    return prevHealths.reduce((sum, ph) => sum + ph.healthScore, 0) / prevHealths.length
  }, [programs, previousMetricValues, previousDailyInputs, milestoneCompletions, prorationFactor, isCustomDateRange])

  const healthGrowth = prevOverallHealth !== null && prevOverallHealth > 0 
    ? ((overallHealth - prevOverallHealth) / prevOverallHealth) * 100 
    : 0

  const totalMilestones = programs.reduce((sum, p) => sum + (p.program_milestones?.length || 0), 0)
  const completedMilestones = programs.reduce((sum, p) => {
    const ids = p.program_milestones?.map(m => m.id) || []
    return sum + milestoneCompletions.filter(c => ids.includes(c.milestone_id) && c.is_completed).length
  }, 0)
  const targetTercapai = programHealths.filter(ph => ph.health.healthScore >= 100).length

  const prevTargetTercapai = useMemo(() => {
    if (!isCustomDateRange || programs.length === 0) return null
    const prevHealths = programs.map(p => 
      calculateProgramHealth(
        p as CalcProgramWithRelations,
        previousMetricValues,
        previousDailyInputs,
        milestoneCompletions,
        prorationFactor
      )
    )
    return prevHealths.filter(h => h.healthScore >= 100).length
  }, [programs, previousMetricValues, previousDailyInputs, milestoneCompletions, prorationFactor, isCustomDateRange])

  const targetGrowth = (prevTargetTercapai !== null && prevTargetTercapai > 0)
    ? ((targetTercapai - prevTargetTercapai) / prevTargetTercapai) * 100
    : (prevTargetTercapai === 0 && targetTercapai > 0) ? 100 : 0

  // ── Departments list ─────────────────────────────────────────────────────
  const departments = useMemo(() => {
    const depts = Array.from(new Set(programs.map(p => p.department).filter(Boolean))) as string[]
    return depts.sort()
  }, [programs])

  // ── Filtered + sorted programs ───────────────────────────────────────────
  const filteredPrograms = useMemo(() => {
    return programHealths
      .filter(({ program, health }) => {
        const q = searchQuery.toLowerCase()
        const matchSearch = !q || program.name.toLowerCase().includes(q)
        const matchDept = filterDept === 'all' || program.department === filterDept
        const status = getStatusLabelAndColor(health.healthScore).label.toLowerCase()
        const matchStatus = filterStatus === 'all' || status.includes(filterStatus)
        return matchSearch && matchDept && matchStatus
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.program.name.localeCompare(b.program.name)
        return b.health.healthScore - a.health.healthScore
      })
  }, [programHealths, searchQuery, filterDept, filterStatus, sortBy])

  // ── Health Trend chart (global health per day) ────────────────────────────
  const trendData = useMemo(() => {
    const today = new Date().getDate()
    return Array.from({ length: Math.min(today, 30) }, (_, i) => {
      const day = i + 1
      const dateStr = `${activePeriod.year}-${String(activePeriod.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const subInputs = dailyInputs.filter(inp => inp.date <= dateStr)
      const subMetrics = metricValues.filter(mv => mv.date <= dateStr)
      const dayFactor = day / (activePeriod.working_days || 30)
      const dayHealths = programs.map(p =>
        calculateProgramHealth(p as CalcProgramWithRelations, subMetrics, subInputs, milestoneCompletions, dayFactor)
      )
      const avg = dayHealths.length > 0 ? dayHealths.reduce((s, h) => s + h.healthScore, 0) / dayHealths.length : 0
      return { day: String(day), health: Math.min(Math.round(avg), 150) }
    })
  }, [activePeriod, programs, dailyInputs, metricValues, milestoneCompletions])

  // ── Bar chart: % health per program ─────────────────────────────────────
  const barData = useMemo(() =>
    [...programHealths]
      .sort((a, b) => b.health.healthScore - a.health.healthScore)
      .map(ph => ({
        name: ph.program.name.length > 14 ? ph.program.name.substring(0, 14) + '…' : ph.program.name,
        health: Math.min(Math.round(ph.health.healthScore), 150),
      })),
    [programHealths]
  )

  const banner = getBannerInfo(overallHealth)
  const { label: statusLabel, dot, badge } = getStatusLabelAndColor(overallHealth)

  return (
    <div className="space-y-6">
      {/* ── Row 1: KPI Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Health Score */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5"><HeartPulse className="w-20 h-20" /></div>
          <p className="text-xs font-black tracking-[0.15em] text-slate-400 uppercase mb-3">Health Score</p>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-black text-slate-800">{overallHealth.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border", badge)}>
              <span className={cn("h-2 w-2 rounded-full", dot)} />
              {statusLabel}
            </span>
            {isCustomDateRange && prevOverallHealth !== null && (
               <span className={cn(
                "text-xs font-bold px-1.5 py-0.5 rounded",
                healthGrowth > 0 ? "bg-emerald-100 text-emerald-700" : 
                healthGrowth < 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"
              )}>
                {healthGrowth > 0 ? '+' : ''}{healthGrowth.toFixed(1)}% vs prev
              </span>
            )}
          </div>
        </div>

        <KpiCard icon={Layers} label="Program Aktif" value={programs.length} sub={`${departments.length} dept`} />
        <KpiCard 
          icon={Target} 
          label="Target Tercapai" 
          value={targetTercapai} 
          sub={`/ ${programs.length} prog`} 
          iconClass="text-emerald-600" 
          comparison={isCustomDateRange && prevTargetTercapai !== null ? { value: targetGrowth, label: 'vs periode sblmnya' } : undefined}
        />
        <KpiCard icon={CheckSquare} label="Milestone Done" value={completedMilestones} sub={`/ ${totalMilestones} tugas`} iconClass="text-indigo-600" />
      </div>

      {/* ── Row 2: Motivational Banner ───────────────────────────── */}
      <div className={cn(
        "bg-gradient-to-r p-4 rounded-2xl text-center font-black tracking-widest text-sm sm:text-base text-white shadow-md",
        banner.bg
      )}>
        {banner.text}
      </div>

      {/* ── Row 3: Filter Bar + Program Cards ───────────────────── */}
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari program..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm font-medium bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-slate-700 placeholder-slate-400"
            />
          </div>

          <select
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="px-3 py-2.5 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700"
          >
            <option value="all">Dept: Semua</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700"
          >
            <option value="all">Status: Semua</option>
            <option value="excellent">Excellent</option>
            <option value="baik">Baik</option>
            <option value="cukup">Cukup</option>
            <option value="perlu">Perlu Perhatian</option>
            <option value="kritis">Kritis</option>
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'health' | 'name')}
            className="px-3 py-2.5 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700"
          >
            <option value="health">Urutkan: Health Score</option>
            <option value="name">Urutkan: Nama</option>
          </select>
        </div>

        {/* Program Cards Grid */}
        <div className="text-xs text-slate-400 font-medium">
          Menampilkan {filteredPrograms.length} dari {programs.length} program
        </div>
        {filteredPrograms.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredPrograms.map(({ program, health }) => (
              <ProgramCard
                key={program.id}
                program={program}
                health={health}
                metricValues={metricValues}
                milestoneCompletions={milestoneCompletions}
                profiles={profiles}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-slate-400">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Tidak ada program yang cocok</p>
          </div>
        )}
      </div>

      {/* ── Row 4: Charts ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line: Health Trend */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 text-sm">Tren Health Score Harian (%)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} />
                <YAxis domain={[0, 120]} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Health Score']}
                  labelFormatter={label => `Hari ke-${label}`}
                />
                <Line type="monotone" dataKey="health" stroke="#6366f1" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar: % per program */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 text-sm">% Capaian per Program (bulan ini)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 10, left: -20, bottom: 20 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" domain={[0, 120]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={90} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v) => [`${Number(v)}%`, 'Health Score']}
                />
                <Bar dataKey="health" radius={[0, 6, 6, 0]} maxBarSize={16}>
                  {barData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.health >= 100 ? '#10b981' : entry.health >= 60 ? '#6366f1' : '#f59e0b'} />
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
