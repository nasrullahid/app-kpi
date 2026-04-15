'use client'

import { useState, useMemo } from 'react'
import { ProgramWithRelations } from './actions'
import { Database } from '@/types/database'
import { calculateProgramHealth } from '@/lib/dashboard-calculator'
import { formatRupiah, cn } from '@/lib/utils'
import { formatMetricValue } from '@/lib/formula-evaluator'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts'
import {
  HeartPulse, Layers, Target, CheckSquare,
  Search, Info, ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import { getPreviousPeriodLabel } from '@/lib/utils'

type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']
type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
type Period = Database['public']['Tables']['periods']['Row']

import { DashboardSummary } from '@/lib/dashboard-service'

interface OverviewClientProps {
  programs: ProgramWithRelations[]
  dailyInputs: DailyInput[]
  activePeriod: Period
  metricValues: MetricValue[]
  profiles: { id: string; name: string }[]
  prorationFactor: number
  summary: DashboardSummary
  previousMetricValues?: MetricValue[]
  previousDailyInputs?: DailyInput[]
  previousSummary?: DashboardSummary
  isCustomDateRange?: boolean
  startDate?: string
  endDate?: string
}

type TabType = 'overview' | 'target' | 'ads'

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
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between relative transition-all hover:shadow-md hover:z-20">
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <Icon className="w-20 h-20" />
        </div>
      </div>
      <div>
        <p className="text-xs font-black tracking-[0.15em] text-slate-400 uppercase mb-3 truncate" title={label}>{label}</p>
        <div className="flex items-end gap-2 w-full flex-wrap" style={{ containerType: 'inline-size' }}>
          <span className={cn(
            "font-black text-slate-800 leading-none whitespace-nowrap drop-shadow-sm",
            "text-[min(2.25rem,11cqw)] sm:text-[min(2.5rem,11cqw)] lg:text-[min(3rem,11cqw)]",
            iconClass
          )} title={String(value)}>
            {value}
          </span>
          {sub && <span className="text-[10px] sm:text-xs text-slate-400 font-bold mb-1 whitespace-nowrap shrink-0">{sub}</span>}
        </div>
      </div>
      {comparison && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
          <div className="group/tooltip relative flex items-center gap-1.5">
            <span className={cn(
              "text-xs font-bold px-1 py-0.5 rounded flex items-center gap-0.5",
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

// ── Individual Program Card ───────────────────────────────────────────────────
function ProgramCard({ program, health, profiles }: {
  program: ProgramWithRelations
  health: ReturnType<typeof calculateProgramHealth>
  profiles: { id: string; name: string }[]
}) {
  const { label, dot, badge } = getStatusLabelAndColor(health.healthScore)
  const isQualitative = health.isQualitativeOnly
  const evaluatedMetrics = health.calculatedMetrics || {}

  const defs = program.program_metric_definitions || []
  const primaryMetrics = defs.filter(m => m.is_primary && m.is_target_metric)
  const secondaryMetrics = defs.filter(m => !m.is_primary)

  // Milestone progress for qualitative/hybrid
  const milestones = program.program_milestones || []

  const pics = (program.program_pics || []).map(pic => profiles.find(pr => pr.id === pic.profile_id)).filter(Boolean)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all duration-300 overflow-hidden group flex flex-col">
      {/* Top Banner Accent */}
      <div className={cn("h-1.5 w-full", dot)} />
      
      <div className="p-5 flex-1 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              {program.department && (
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">
                  {program.department}
                </span>
              )}
              <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border", badge)}>
                {label}
              </span>
            </div>
            <h3 className="font-extrabold text-slate-800 text-lg leading-tight group-hover:text-indigo-600 transition-colors line-clamp-2" title={program.name}>
              {program.name}
            </h3>
          </div>

          <div className="flex flex-col items-end shrink-0 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
            <span className="text-2xl font-black text-slate-800 leading-none">{Math.round(health.healthScore)}%</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Health</span>
          </div>
        </div>

        {/* PIC Avatars & Team */}
        {pics.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {pics.slice(0, 3).map((p, i) => (
                <div key={p?.id} className="h-7 w-7 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-indigo-700 uppercase" title={p?.name}>
                  {p?.name?.[0]}
                </div>
              ))}
              {pics.length > 3 && (
                <div className="h-7 w-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500">
                  +{pics.length - 3}
                </div>
              )}
            </div>
            <span className="text-[11px] font-medium text-slate-400 truncate">
              {pics.map(p => p?.name).join(', ')}
            </span>
          </div>
        )}

        {/* Progress Section */}
        <div className="space-y-4">
          {primaryMetrics.length > 0 ? (
            primaryMetrics.map(m => {
              const actual = evaluatedMetrics[m.metric_key] || 0
              const target = m.monthly_target || 0
              const pct = target > 0 ? (actual / target) * 100 : 0
              return (
                <div key={m.id} className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-bold text-slate-500 uppercase tracking-wider">{m.label}</span>
                    <span className="font-black text-slate-800">
                      {formatMetricValue(actual, m.data_type, m.unit_label)}
                      <span className="text-slate-400 font-medium ml-1">/ {formatMetricValue(target, m.data_type, m.unit_label)}</span>
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                    <div
                      className={cn("h-full rounded-full transition-all duration-1000", getProgressColor(pct))}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })
          ) : isQualitative && milestones.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Project Progress</span>
                <span className="font-black text-slate-800">{Math.round(health.healthScore)}%</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                <div
                  className={cn("h-full rounded-full transition-all duration-1000", getProgressColor(health.healthScore))}
                  style={{ width: `${Math.min(health.healthScore, 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="py-2 text-[11px] text-slate-400 font-medium italic">Tidak ada parameter target utama.</div>
          )}
        </div>

        {/* Secondary Metrics Grid */}
        {secondaryMetrics.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-4 border-t border-slate-100">
            {secondaryMetrics.slice(0, 6).map(m => {
              const val = evaluatedMetrics[m.metric_key]
              if (val === undefined || val === null) return null
              return (
                <div key={m.id} className="bg-slate-50/80 p-2 rounded-xl border border-slate-100 flex flex-col gap-0.5 min-w-0" style={{ containerType: 'inline-size' }}>
                  <span className="text-[9px] font-bold text-slate-400 uppercase truncate leading-none mb-1">{m.label}</span>
                  <span className="text-[min(0.875rem,24cqw)] font-black text-slate-700 leading-tight whitespace-nowrap">
                    {formatMetricValue(val, m.data_type, m.unit_label)}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex-1" /> // Spacer
        )}
      </div>

      {/* Footer Sparkline Decoration (Dummy placeholder for aesthetic) */}
      <div className="h-1 bg-slate-50 flex items-end">
        <div className="w-full h-full bg-indigo-50/30 group-hover:bg-indigo-100/50 transition-colors" />
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function OverviewClient({
  programs,
  activePeriod,
  metricValues,
  profiles,
  summary,
  previousSummary,
  isCustomDateRange,
  startDate,
  endDate
}: OverviewClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDept, setFilterDept] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy] = useState<'health' | 'name'>('health')

  // Process data from summary
  const programHealths = summary.programHealths
  const globalKPIs = summary.globalKPIs
  const overallHealth = summary.overallHealth

  const prevGlobalKPIs = previousSummary?.globalKPIs || null
  const healthGrowth = (prevGlobalKPIs && prevGlobalKPIs.avgHealth > 0)
    ? ((globalKPIs.avgHealth - prevGlobalKPIs.avgHealth) / prevGlobalKPIs.avgHealth) * 100
    : 0

  const targetGrowth = (prevGlobalKPIs && prevGlobalKPIs.targetsHit > 0)
    ? ((globalKPIs.targetsHit - prevGlobalKPIs.targetsHit) / prevGlobalKPIs.targetsHit) * 100
    : (prevGlobalKPIs?.targetsHit === 0 && globalKPIs.targetsHit > 0) ? 100 : 0

  const prevPeriodLabel = useMemo(() => getPreviousPeriodLabel(startDate, endDate), [startDate, endDate])

  const departments = useMemo(() => {
    const depts = Array.from(new Set(programs.map(p => p.department).filter(Boolean))) as string[]
    return depts.sort()
  }, [programs])

  const filteredPrograms = useMemo(() =>
    programHealths.filter(ph => {
      const matchesSearch = ph.program.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesDept = filterDept === 'all' || ph.program.department === filterDept
      if (filterStatus === 'all') return matchesSearch && matchesDept
      const statusKey = ph.status.toLowerCase().replace(' ', '_')
      return statusKey === filterStatus && matchesSearch && matchesDept
    }).sort((a, b) => {
      if (sortBy === 'health') return b.healthScore - a.healthScore
      return a.program.name.localeCompare(b.program.name)
    }),
    [programHealths, searchQuery, filterDept, filterStatus, sortBy]
  )

  // ── Charts Data ────────────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const dateRange: string[] = []
    if (startDate && endDate) {
      const start = new Date(startDate); const end = new Date(endDate); const cur = new Date(start)
      while (cur <= end) { dateRange.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }
    } else {
      const today = new Date().getDate()
      for (let i = 1; i <= Math.min(today, 31); i++) dateRange.push(`${activePeriod.year}-${String(activePeriod.month).padStart(2, '0')}-${String(i).padStart(2, '0')}`)
    }
    // Optimization: avoid nested O(N^2) by grouping values once
    const metricsByDate = new Map<string, MetricValue[]>()
    metricValues.forEach(mv => { const l = metricsByDate.get(mv.date) || []; l.push(mv); metricsByDate.set(mv.date, l) })
    
    return dateRange.map(d => {
      // This is a simplified trend for redesign phase
      const displayLabel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(d))
      return { day: displayLabel, health: Math.round(overallHealth) } // Simplified for now
    })
  }, [startDate, endDate, activePeriod, metricValues, overallHealth])

  const barData = useMemo(() =>
    [...programHealths].sort((a, b) => b.healthScore - a.healthScore).slice(0, 10).map(ph => ({
      name: ph.program.name,
      healthScore: Math.min(Math.round(ph.healthScore), 150),
    })),
    [programHealths]
  )

  const banner = getBannerInfo(globalKPIs.avgHealth)

  return (
    <div className="space-y-6 pb-24">
      {/* ── Tab Switcher ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-slate-100/80 backdrop-blur-sm border border-slate-200 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('overview')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
            activeTab === 'overview' ? "bg-white text-indigo-600 shadow-sm border border-indigo-100" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
          )}
        >
          <HeartPulse className="h-4 w-4" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab('target')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
            activeTab === 'target' ? "bg-white text-indigo-600 shadow-sm border border-indigo-100" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
          )}
        >
          <Target className="h-4 w-4" />
          Target
        </button>
        <button
          onClick={() => setActiveTab('ads')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
            activeTab === 'ads' ? "bg-white text-indigo-600 shadow-sm border border-indigo-100" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
          )}
        >
          <Layers className="h-4 w-4" />
          Ads Perform
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Row 1: KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={HeartPulse} label="Health Score" value={`${Math.round(globalKPIs.avgHealth)}%`} sub={globalKPIs.healthStatus} comparison={isCustomDateRange && prevGlobalKPIs ? { value: healthGrowth, label: prevPeriodLabel } : undefined} />
            <KpiCard icon={Layers} label="Program Aktif" value={globalKPIs.activeProgramsCount} sub={`dari ${globalKPIs.totalPrograms} total`} />
            <KpiCard icon={Target} label="Target Tercapai" value={globalKPIs.targetsHit} sub={`program bulan ini`} iconClass="text-emerald-600" comparison={isCustomDateRange && prevGlobalKPIs ? { value: targetGrowth, label: prevPeriodLabel } : undefined} />
            <KpiCard icon={CheckSquare} label="Milestone Done" value={globalKPIs.completedMilestones} sub={`dari ${globalKPIs.totalMilestones} total`} iconClass="text-indigo-600" />
          </div>

          {/* Row 2: Charts (Moved up for visibility) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
             <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                  <HeartPulse className="w-48 h-48" />
                </div>
                <h3 className="font-extrabold text-slate-800 mb-6 text-base flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 rounded-xl">
                    <HeartPulse className="h-5 w-5 text-indigo-600" />
                  </div>
                  Tren Kesehatan Bisnis Global
                </h3>
                <div className="h-72">
                   <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} />
                        <YAxis hide domain={[0, 120]} />
                        <Tooltip 
                          contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }} 
                          itemStyle={{ fontWeight: 800, fontSize: 12 }}
                        />
                        <Line type="monotone" dataKey="health" stroke="#6366f1" strokeWidth={4} dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0, fill: '#6366f1' }} animationDuration={2000} />
                      </LineChart>
                   </ResponsiveContainer>
                </div>
             </div>
             
             <div className="lg:col-span-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="font-extrabold text-slate-800 mb-6 text-base flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 rounded-xl">
                    <Target className="h-5 w-5 text-emerald-600" />
                  </div>
                  Top Performers
                </h3>
                <div className="h-72">
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} layout="vertical" margin={{ left: -20 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} width={100} tickFormatter={v => v.length > 12 ? v.slice(0, 10) + '...' : v} />
                        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 16, border: 'none' }} />
                        <Bar dataKey="healthScore" radius={[0, 8, 8, 0]} maxBarSize={20}>
                          {barData.map((e, i) => <Cell key={i} fill={e.healthScore >= 100 ? '#10b981' : '#6366f1'} />)}
                        </Bar>
                      </BarChart>
                   </ResponsiveContainer>
                </div>
             </div>
          </div>

          {/* Motivational Banner */}
          <div className={cn("bg-gradient-to-r p-5 rounded-3xl text-center font-black tracking-[0.2em] text-xs sm:text-sm text-white shadow-lg relative overflow-hidden", banner.bg)}>
            <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px] pointer-events-none" />
            <span className="relative z-10">{banner.text}</span>
          </div>

          {/* Search & Program Grid */}
          <div className="space-y-6 pt-2">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-200/60">
              <div className="relative flex-1 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <input type="text" placeholder="Cari program..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 text-sm bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 text-slate-700 font-bold transition-all placeholder:text-slate-300 shadow-sm" />
              </div>
              <div className="flex gap-2">
                <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="px-4 py-3 text-sm font-bold bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 text-slate-600 shadow-sm">
                  <option value="all">Semua Dept</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-4 py-3 text-sm font-bold bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 text-slate-600 shadow-sm">
                  <option value="all">Semua Status</option>
                  <option value="excellent">Excellent</option>
                  <option value="baik">Baik</option>
                  <option value="cukup">Cukup</option>
                  <option value="perlu_perhatian">Perlu Perhatian</option>
                  <option value="kritis">Kritis</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-6">
              {filteredPrograms.map(ph => (
                <ProgramCard key={ph.program.id} program={ph.program} health={ph} profiles={profiles} />
              ))}
            </div>
            
            {filteredPrograms.length === 0 && (
              <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center gap-4">
                <div className="p-4 bg-white rounded-full shadow-sm">
                  <Search className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-slate-400 font-bold tracking-wide">Tidak ada program yang sesuai dengan kriteria.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'target' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Row 1: Target Aggregate Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard 
              icon={Target} 
              label="Total Capaian Rp" 
              value={formatRupiah(summary.aggregates.revenue?.actual || 0)} 
              sub={`/ ${formatRupiah(summary.aggregates.revenue?.totalTarget || 0)}`} 
              iconClass="text-emerald-600"
            />
            <KpiCard 
              icon={HeartPulse} 
              label="Progres Rp" 
              value={`${Math.round((summary.aggregates.revenue?.actual / (summary.aggregates.revenue?.target || 1)) * 100)}%`} 
              sub="vs pro-rata"
            />
            <KpiCard 
              icon={Layers} 
              label="Total Capaian User" 
              value={summary.aggregates.user_acquisition?.actual || 0} 
              sub={`/ ${summary.aggregates.user_acquisition?.totalTarget || 0} user`} 
              iconClass="text-indigo-600"
            />
            <KpiCard 
              icon={CheckSquare} 
              label="Progres User" 
              value={`${Math.round((summary.aggregates.user_acquisition?.actual / (summary.aggregates.user_acquisition?.target || 1)) * 100)}%`} 
              sub="vs pro-rata"
            />
          </div>

          {/* Revenue Bar Chart (Full Width) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-500" />
              Capaian Pendapatan per Program (Rp)
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={programHealths.sort((a, b) => (b.calculatedMetrics?.revenue || 0) - (a.calculatedMetrics?.revenue || 0)).slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="program.name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v.length > 12 ? v.substring(0, 10) + '...' : v} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `Rp${v/1000000}jt`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(v) => [formatRupiah(Number(v)), 'Pendapatan']}
                  />
                  <Bar dataKey="calculatedMetrics.revenue" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ads' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Row 1: Ads Aggregate Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={Layers} label="Total Ads Spent" value={formatRupiah(summary.adsMetrics.totalAdsSpent)} iconClass="text-rose-600" />
            <KpiCard icon={Target} label="Total Goals" value={summary.adsMetrics.totalGoals} sub="closing" iconClass="text-emerald-600" />
            <KpiCard icon={HeartPulse} label="Avg ROAS" value={`${summary.adsMetrics.avgRoas.toFixed(2)}x`} iconClass="text-indigo-600" />
            <KpiCard icon={CheckSquare} label="Avg CPP" value={formatRupiah(summary.adsMetrics.avgCpp)} iconClass="text-amber-600" />
          </div>

          {/* Dual Axis Ads Chart */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Layers className="h-4 w-4 text-rose-500" />
                Ads Performance: Spent vs ROAS
              </h3>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.adsDailySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis hide yAxisId="left" />
                  <YAxis hide yAxisId="right" orientation="right" />
                  <Tooltip 
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(v, name) => [name === 'x' ? formatRupiah(Number(v)) : `${Number(v).toFixed(2)}x`, name === 'x' ? 'Spent' : 'ROAS']}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="x" name="Spent" stroke="#f43f5e" strokeWidth={3} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="y" name="ROAS" stroke="#6366f1" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ads Performance Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-4 border-b border-slate-100 bg-slate-50/50">
               <h3 className="font-bold text-slate-800 text-sm">Detail Performa Ads per Program</h3>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-left text-xs">
                 <thead>
                   <tr className="bg-slate-100/50 text-slate-400 font-black uppercase tracking-widest border-b border-slate-100">
                     <th className="px-4 py-3">Program</th>
                     <th className="px-4 py-3 text-right">Ads Spent</th>
                     <th className="px-4 py-3 text-right">Goals</th>
                     <th className="px-4 py-3 text-right">ROAS</th>
                     <th className="px-4 py-3 text-right">CPP</th>
                     <th className="px-4 py-3 text-right">CR</th>
                     <th className="px-4 py-3 text-center">Status</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {programHealths
                    .filter(ph => (ph.program.program_metric_definitions || []).some(m => m.metric_group === 'ad_spend' || ['ads_spent', 'leads', 'roas'].includes(m.metric_key))) 
                    .map(ph => {
                      const m = ph.calculatedMetrics || {}
                      return (
                        <tr key={ph.program.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-700">{ph.program.name}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatRupiah(m.ads_spent || 0)}</td>
                          <td className="px-4 py-3 text-right font-medium">{m.user_count || 0}</td>
                          <td className="px-4 py-3 text-right font-black text-indigo-600">{(m.roas || 0).toFixed(2)}x</td>
                          <td className="px-4 py-3 text-right font-medium">{formatRupiah(m.cpp || 0)}</td>
                          <td className="px-4 py-3 text-right font-medium">{(m.conversion_rate || 0).toFixed(1)}%</td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-tight px-2 py-1 rounded-full border",
                              getStatusLabelAndColor(ph.healthScore).badge
                            )}>
                              {getStatusLabelAndColor(ph.healthScore).label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      )}
    </div>
  )
}
