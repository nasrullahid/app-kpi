'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Database } from '@/types/database'
import { ProgramWithRelations, MetricValue } from './actions'
import { 
  calculateProgramHealth, 
  isAdsProgram, 
  aggregateAdsMetrics, 
  buildAdsDailySeries 
} from '@/lib/dashboard-calculator'
import { formatRupiah, cn, getPreviousPeriodLabel } from '@/lib/utils'
import { formatMetricValue } from '@/lib/formula-evaluator'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ComposedChart, Legend, Line, AreaChart, Area, Cell
} from 'recharts'
import {
  HeartPulse, Layers, Target, CheckSquare,
  Search, ArrowUpRight, ArrowDownRight, TrendingUp
} from 'lucide-react'

import { DashboardSummary } from '@/lib/dashboard-service'
import { RadialProgressCard } from '@/components/dashboard/radial-progress-card'

interface OverviewClientProps {
  programs: ProgramWithRelations[]
  profiles: { id: string; name: string }[]
  summary: DashboardSummary
  previousSummary?: DashboardSummary
  startDate?: string
  endDate?: string
  metricValues: MetricValue[]
}

type TabType = 'overview' | 'target' | 'ads'

// ── Status helpers ───────────────────────────────────────────────────────────
function getStatusLabelAndColor(score: number): { label: string; dot: string; badge: string, accent: string } {
  if (score >= 100) return { label: 'Excellent', dot: 'bg-blue-500',   badge: 'text-blue-700 bg-blue-50 border-blue-200',   accent: '#FCD34D' } // Gold/Excellent
  if (score >= 80)  return { label: 'Baik',      dot: 'bg-emerald-500', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200', accent: '#639922' } // Green
  if (score >= 60)  return { label: 'Cukup',     dot: 'bg-amber-400',   badge: 'text-amber-700 bg-amber-50 border-amber-200',   accent: '#EAB308' } // Amber
  if (score >= 40)  return { label: 'Perlu perhatian', dot: 'bg-orange-500', badge: 'text-orange-700 bg-orange-50 border-orange-200', accent: '#378ADD' } // Blue/Info
  return { label: 'Kritis', dot: 'bg-red-500', badge: 'text-red-700 bg-red-50 border-red-200', accent: '#E24B4A' } // Red
}

function getProgressColor(score: number) {
  if (score >= 100) return 'bg-blue-500'
  if (score >= 80)  return 'bg-emerald-500'
  if (score >= 60)  return 'bg-amber-400'
  if (score >= 40)  return 'bg-orange-500'
  return 'bg-red-500'
}

function getBannerInfo(score: number) {
  if (score < 40)  return { text: 'Target jauh tertinggal — fokus dan kejar sekarang! 💪', bg: 'bg-[#FCEBEB]', border: 'border-[#F7C1C1]', textCol: 'text-[#791F1F]' }
  if (score < 60)  return { text: 'Masih ada waktu — tingkatkan intensitas! 🔥', bg: 'bg-orange-50', border: 'border-orange-200', textCol: 'text-orange-800' }
  if (score < 80)  return { text: 'Progres bagus — jangan kendur! 🎯', bg: 'bg-blue-50', border: 'border-blue-200', textCol: 'text-blue-800' }
  if (score < 100) return { text: 'Hampir sampai — satu langkah lagi! 🚀', bg: 'bg-indigo-50', border: 'border-[#EEEDFE]', textCol: 'text-[#534AB7]' }
  return { text: 'Target tercapai — luar biasa! 🏆', bg: 'bg-emerald-50', border: 'border-emerald-200', textCol: 'text-emerald-800' }
}

function calculateGrowth(current: number, previous: number): number {
  if (current === 0 && previous === 0) return 0
  if (!previous || previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, accentColor, comparison }: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  accentColor?: string
  comparison?: { value: number; label: string }
}) {
  return (
    <div className="bg-white p-4 rounded-xl border border-[#E5E7EB] flex flex-col justify-between relative overflow-hidden">
      {/* 3px Vertical Accent */}
      {accentColor && (
        <div 
          className="absolute left-0 top-0 bottom-0 w-[3px]" 
          style={{ backgroundColor: accentColor }}
        />
      )}
      
      <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
        <Icon className="w-16 h-16" />
      </div>

      <div>
        <p className="text-[10px] font-bold tracking-[0.05em] text-[#6B7280] uppercase mb-2 truncate" title={label}>{label}</p>
        <div className="flex items-baseline gap-2 w-full flex-wrap min-w-0">
          <span className="text-[clamp(1rem,3.5vw,1.375rem)] font-semibold text-[#111827] leading-tight tabular-nums break-words" title={String(value)}>
            {value}
          </span>
          {sub && <span className="text-[12px] text-[#6B7280] font-normal truncate min-w-0">{sub}</span>}
        </div>
      </div>

      {comparison && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[#E5E7EB]">
          <span className={cn(
            "text-[12px] font-medium flex items-center gap-0.5",
            comparison.value > 0 ? "text-emerald-600" : 
            comparison.value < 0 ? "text-rose-600" : "text-slate-500"
          )}>
            {comparison.value > 0 ? <ArrowUpRight className="h-3 w-3" /> : comparison.value < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
            {Math.abs(comparison.value).toFixed(1)}%
          </span>
          <span className="text-[12px] text-slate-400">{comparison.label}</span>
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
  const { label, badge, accent } = getStatusLabelAndColor(health.healthScore)
  const isQualitative = health.isQualitativeOnly
  const evaluatedMetrics = health.calculatedMetrics || {}

  const defs = program.program_metric_definitions || []
  const primaryMetrics = defs.filter(m => m.is_primary && m.is_target_metric)
  const secondaryMetrics = defs.filter(m => !m.is_primary)

  // Synthetic primary metrics for legacy programs if no custom primary metrics exist
  if (primaryMetrics.length === 0 && !isQualitative) {
    const hasLegacyRp = (program.monthly_target_rp || 0) > 0 || (program.daily_target_rp || 0) > 0
    const hasLegacyUser = (program.monthly_target_user || 0) > 0 || (program.daily_target_user || 0) > 0
    
    if (hasLegacyRp) {
      primaryMetrics.push({
        id: 'legacy_rp',
        metric_key: 'revenue',
        label: 'Omzet',
        data_type: 'currency',
        unit_label: 'Rp'
      } as unknown as Database['public']['Tables']['program_metric_definitions']['Row'])
    }
    if (hasLegacyUser) {
      primaryMetrics.push({
        id: 'legacy_user',
        metric_key: 'user_count',
        label: 'Closing',
        data_type: 'integer',
        unit_label: 'user'
      } as unknown as Database['public']['Tables']['program_metric_definitions']['Row'])
    }
  }

  // Milestone progress for qualitative/hybrid
  const milestones = program.program_milestones || []

  const pics = (program.program_pics || []).map(pic => profiles.find(pr => pr.id === pic.profile_id)).filter(Boolean)

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] transition-all duration-300 overflow-hidden group flex flex-col relative">
      {/* Vertical Accent */}
      <div className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ backgroundColor: accent }} />
      
      <div className="p-4 flex-1 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pl-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              {program.department && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-[#6B7280] rounded">
                  {program.department}
                </span>
              )}
              <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border", badge)}>
                {label}
              </span>
            </div>
            <h3 className="font-semibold text-[#111827] text-base leading-tight group-hover:text-[#534AB7] transition-colors line-clamp-2" title={program.name}>
              {program.name}
            </h3>
          </div>

          <div className="flex flex-col items-end shrink-0 bg-slate-50 px-3 py-1.5 rounded-lg border border-[#E5E7EB]">
            <span className="text-xl font-semibold text-[#111827] leading-none">{Math.round(health.healthScore)}%</span>
            <span className="text-[9px] font-bold text-[#6B7280] uppercase mt-1">Health</span>
          </div>
        </div>

        {/* PIC Avatars */}
        {pics.length > 0 && (
          <div className="flex items-center gap-2 pl-1">
            <div className="flex -space-x-1.5">
              {pics.slice(0, 3).map((p) => (
                <div key={p?.id} className="h-6 w-6 rounded-full bg-[#EEEDFE] border-2 border-white flex items-center justify-center text-[9px] font-bold text-[#534AB7] uppercase" title={p?.name}>
                  {p?.name?.[0]}
                </div>
              ))}
              {pics.length > 3 && (
                <div className="h-6 w-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[9px] font-bold text-slate-500">
                  +{pics.length - 3}
                </div>
              )}
            </div>
            <span className="text-[11px] font-medium text-[#6B7280] truncate">
              {pics.map(p => p?.name).join(', ')}
            </span>
          </div>
        )}

        {/* Progress Section */}
        <div className="space-y-3 pl-1">
          {primaryMetrics.length > 0 ? (
            primaryMetrics.map(m => {
              const actual = evaluatedMetrics[m.metric_key] || 0
              // Use effective target from health result (handled fallback in backend)
              const target = health.effectiveTargets?.[m.metric_key] || m.monthly_target || 0
              const pct = target > 0 ? (actual / target) * 100 : 0
              return (
                <div key={m.id} className="space-y-1">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-medium text-[#6B7280] uppercase tracking-wider">{m.label}</span>
                    <span className="font-semibold text-[#111827] text-right ml-1 break-all">
                      {formatMetricValue(actual, m.data_type || 'integer', m.unit_label)}
                      <span className="text-[#6B7280] font-normal ml-1">/ {formatMetricValue(target, m.data_type || 'integer', m.unit_label)}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-1000", getProgressColor(pct))}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })
          ) : isQualitative && milestones.length > 0 ? (
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-medium text-[#6B7280] uppercase tracking-wider">Project Progress</span>
                <span className="font-semibold text-[#111827]">{Math.round(health.healthScore)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-1000", getProgressColor(health.healthScore))}
                  style={{ width: `${Math.min(health.healthScore, 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="py-1 text-[11px] text-[#6B7280] font-normal italic">Tidak ada parameter target utama.</div>
          )}
        </div>

        {/* Secondary Metrics Grid */}
        {secondaryMetrics.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-[#E5E7EB] pl-1">
            {secondaryMetrics.slice(0, 5).map(m => {
              const val = evaluatedMetrics[m.metric_key]
              if (val === undefined || val === null) return null
              return (
                <div key={m.id} className="bg-slate-50 px-2.5 py-1 rounded-lg border border-[#E5E7EB] flex items-baseline gap-1.5 transition-colors hover:bg-white min-w-0 flex-1">
                  <span className="text-[10px] font-medium text-[#6B7280] truncate shrink-0">{m.label}:</span>
                  <span className="text-[11px] font-semibold text-[#111827] break-all">
                    {formatMetricValue(val, m.data_type, m.unit_label)}
                  </span>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function OverviewClient({
  programs,
  profiles,
  summary,
  previousSummary,
  startDate,
  endDate,
  metricValues
}: OverviewClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  // Sync activeTab with URL ?tab=...
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  
  useEffect(() => {
    const tab = searchParams.get('tab') as TabType
    if (tab && ['overview', 'target', 'ads'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // Common filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDept, setFilterDept] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy] = useState<'health' | 'name'>('health')

  // Ads Specific States
  const [selectedAdsProgramId, setSelectedAdsProgramId] = useState('all')
  const [metricX, setMetricX] = useState('ads_spent')
  const [metricY, setMetricY] = useState('roas')

  // Process data from summary
  const programHealths = summary.programHealths
  const globalKPIs = summary.globalKPIs
  
  // ── Ads Data Processing ───────────────────────────────────────────────────
  const adsPrograms = useMemo(() => 
    programs.filter(p => isAdsProgram(p.program_metric_definitions || [])),
    [programs]
  )

  // Map metricValues for aggregation
  const metricValuesByProgram = useMemo(() => {
    const map = new Map<string, MetricValue[]>()
    metricValues.forEach(mv => {
      const list = map.get(mv.program_id) || []
      list.push(mv)
      map.set(mv.program_id, list)
    })
    return map
  }, [metricValues])

  const targetAdsPrograms = useMemo(() => 
    selectedAdsProgramId === 'all' 
      ? adsPrograms 
      : adsPrograms.filter(p => p.id === selectedAdsProgramId),
    [adsPrograms, selectedAdsProgramId]
  )

  const adsAggregate = useMemo(() => 
    aggregateAdsMetrics(targetAdsPrograms, metricValuesByProgram),
    [targetAdsPrograms, metricValuesByProgram]
  )

  const adsChartData = useMemo(() => 
    buildAdsDailySeries(targetAdsPrograms, metricValuesByProgram, metricX, metricY),
    [targetAdsPrograms, metricValuesByProgram, metricX, metricY]
  )

  const adsMetricOptionsX = [
    { key: 'ads_spent', label: 'Ads Spent' },
    { key: 'user_count', label: 'Goals' },
    { key: 'leads', label: 'Leads' },
    { key: 'cpm', label: 'CPM' },
    { key: 'cpc', label: 'CPC' },
  ]

  const adsMetricOptionsY = [
    { key: 'roas', label: 'ROAS' },
    { key: 'cpp', label: 'CPP/CPL' },
    { key: 'conversion_rate', label: 'CR %' },
    { key: 'user_count', label: 'Goals' },
    { key: 'leads', label: 'Leads' },
  ]

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
  const trendData = useMemo(() => 
    summary.healthTrend.map(tp => ({
      day: tp.displayDate,
      health: tp.health
    })),
    [summary.healthTrend]
  )

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
      <div className="flex items-center gap-1 p-1 bg-slate-50 border border-[#E5E7EB] rounded-xl w-fit">
        <button
          onClick={() => handleTabChange('overview')}
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
            activeTab === 'overview' ? "bg-white text-[#534AB7] border border-[#E5E7EB] shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
          )}
        >
          <HeartPulse className="h-3.5 w-3.5" />
          Ringkasan
        </button>
        <button
          onClick={() => handleTabChange('target')}
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
            activeTab === 'target' ? "bg-white text-[#534AB7] border border-[#E5E7EB] shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
          )}
        >
          <Target className="h-3.5 w-3.5" />
          Target
        </button>
        <button
          onClick={() => handleTabChange('ads')}
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
            activeTab === 'ads' ? "bg-white text-[#534AB7] border border-[#E5E7EB] shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          Iklan & Ads
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Row 1: KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard 
              icon={HeartPulse} 
              label="Health Score" 
              value={`${Math.round(globalKPIs.avgHealth)}%`} 
              sub={globalKPIs.healthStatus} 
              accentColor={getStatusLabelAndColor(globalKPIs.avgHealth).accent}
              comparison={previousSummary ? { 
                value: calculateGrowth(globalKPIs.avgHealth, previousSummary.globalKPIs.avgHealth), 
                label: prevPeriodLabel 
              } : undefined} 
            />
            <KpiCard 
              icon={Layers} 
              label="Program aktif" 
              value={globalKPIs.activeProgramsCount} 
              sub={`dari ${globalKPIs.totalPrograms} total`} 
              accentColor="#378ADD"
              comparison={previousSummary ? {
                value: calculateGrowth(globalKPIs.activeProgramsCount, previousSummary.globalKPIs.activeProgramsCount),
                label: prevPeriodLabel
              } : undefined}
            />
            <KpiCard 
              icon={Target} 
              label="Target tercapai" 
              value={globalKPIs.targetsHit} 
              sub={`program periode ini`} 
              accentColor="#639922"
              comparison={previousSummary ? { 
                value: calculateGrowth(globalKPIs.targetsHit, previousSummary.globalKPIs.targetsHit), 
                label: prevPeriodLabel 
              } : undefined} 
            />
            <KpiCard 
              icon={CheckSquare} 
              label="Milestone done" 
              value={globalKPIs.completedMilestones} 
              sub={`dari ${globalKPIs.totalMilestones} total`} 
              accentColor="#534AB7"
              comparison={previousSummary ? {
                value: calculateGrowth(globalKPIs.completedMilestones, previousSummary.globalKPIs.completedMilestones),
                label: prevPeriodLabel
              } : undefined}
            />
          </div>

          {/* Row 2: Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
             <div className="lg:col-span-8 bg-white p-6 rounded-xl border border-[#E5E7EB] relative overflow-hidden group">
                <h3 className="font-semibold text-[#111827] mb-6 text-sm flex items-center gap-3">
                  <div className="p-2 bg-[#EEEDFE] rounded-lg">
                    <HeartPulse className="h-4 w-4 text-[#534AB7]" />
                  </div>
                  Tren kesehatan bisnis global
                </h3>
                <div className="h-72">
                   <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="colorHealth" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#534AB7" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#534AB7" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} />
                        <YAxis hide domain={[0, 120]} />
                        <Tooltip 
                          contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', boxShadow: 'none' }} 
                          itemStyle={{ fontWeight: 600, fontSize: 12 }}
                        />
                        <Area type="monotone" dataKey="health" stroke="#534AB7" strokeWidth={3} fillOpacity={1} fill="url(#colorHealth)" />
                      </AreaChart>
                   </ResponsiveContainer>
                </div>
             </div>
             
             <div className="lg:col-span-4 bg-white p-6 rounded-xl border border-[#E5E7EB]">
                <h3 className="font-semibold text-[#111827] mb-6 text-sm flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <Target className="h-4 w-4 text-emerald-600" />
                  </div>
                  Top performers
                </h3>
                <div className="h-72">
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} layout="vertical" margin={{ left: -20 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} width={100} tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 10) + '...' : v} />
                        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB' }} />
                        <Bar dataKey="healthScore" radius={[0, 4, 4, 0]} maxBarSize={20}>
                          {barData.map((_e: unknown, i: number) => {
                            const opacities = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
                            return <Cell key={i} fill={`rgba(83, 74, 183, ${opacities[i] || 0.1})`} />
                          })}
                        </Bar>
                      </BarChart>
                   </ResponsiveContainer>
                </div>
             </div>
          </div>

          {/* Motivational Banner redesigned as a LARGE prominent card */}
          <div className={cn("px-8 py-10 rounded-2xl border flex flex-col items-center justify-center text-center gap-6 shadow-sm transition-all", banner.bg, banner.border)}>
            <div className={cn("p-4 rounded-full shadow-inner", banner.bg === 'bg-[#FCEBEB]' ? 'bg-white' : 'bg-white/50')}>
               <div className={cn("h-6 w-6 rounded-full animate-pulse", getStatusLabelAndColor(globalKPIs.avgHealth).dot)} />
            </div>
            <h2 className={cn("text-xl md:text-2xl font-black tracking-tight max-w-xl leading-tight uppercase", banner.textCol)}>
              {banner.text}
            </h2>
            <div className="h-1 w-24 rounded-full bg-slate-200/50" />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <KpiCard 
              icon={Target} 
              label="Total capaian Rp" 
              value={formatRupiah(summary.aggregates.revenue?.actual || 0)} 
              sub={summary.aggregates.revenue?.isComputed ? 'Estimasi' : 'Aktual'}
              accentColor="#639922"
              comparison={previousSummary ? {
                value: calculateGrowth(summary.aggregates.revenue?.actual || 0, previousSummary.aggregates.revenue?.actual || 0),
                label: prevPeriodLabel
              } : undefined}
            />
            <KpiCard 
              icon={TrendingUp} 
              label="Sisa target Rp" 
              value={formatRupiah(Math.max(0, (summary.aggregates.revenue?.totalTarget || 0) - (summary.aggregates.revenue?.actual || 0)))} 
              sub="jumlah sisa periode ini" 
              accentColor="#534AB7"
              comparison={previousSummary ? {
                value: calculateGrowth(
                  Math.max(0, (summary.aggregates.revenue?.totalTarget || 0) - (summary.aggregates.revenue?.actual || 0)),
                  Math.max(0, (previousSummary.aggregates.revenue?.totalTarget || 0) - (previousSummary.aggregates.revenue?.actual || 0))
                ),
                label: prevPeriodLabel
              } : undefined}
            />
            <KpiCard 
              icon={Layers} 
              label="Total capaian user" 
              value={summary.aggregates.user_acquisition?.actual || 0} 
              sub="User"
              accentColor="#378ADD"
              comparison={previousSummary ? {
                value: calculateGrowth(summary.aggregates.user_acquisition?.actual || 0, previousSummary.aggregates.user_acquisition?.actual || 0),
                label: prevPeriodLabel
              } : undefined}
            />
            <KpiCard 
              icon={CheckSquare} 
              label="Sisa target user" 
              value={Math.max(0, (summary.aggregates.user_acquisition?.totalTarget || 0) - (summary.aggregates.user_acquisition?.actual || 0))} 
              sub="user sisa target" 
              accentColor="#EAB308"
              comparison={previousSummary ? {
                value: calculateGrowth(
                  Math.max(0, (summary.aggregates.user_acquisition?.totalTarget || 0) - (summary.aggregates.user_acquisition?.actual || 0)),
                  Math.max(0, (previousSummary.aggregates.user_acquisition?.totalTarget || 0) - (previousSummary.aggregates.user_acquisition?.actual || 0))
                ),
                label: prevPeriodLabel
              } : undefined}
            />
             <KpiCard 
              icon={HeartPulse} 
              label="Progres global" 
              value={`${Math.round(summary.overallHealth)}%`} 
              sub={summary.globalKPIs.healthStatus}
              accentColor={getStatusLabelAndColor(summary.overallHealth).accent}
              comparison={previousSummary ? {
                value: calculateGrowth(summary.overallHealth, previousSummary.overallHealth),
                label: prevPeriodLabel
              } : undefined}
            />
          </div>

          {/* Row 2: Secondary Visuals (Radial + Trend) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
             {/* Radial Cards Column */}
             <div className="lg:col-span-4 grid grid-cols-1 gap-6">
                <RadialProgressCard 
                  title="Revenue Progress"
                  value={summary.aggregates.revenue?.actual || 0}
                  target={summary.aggregates.revenue?.totalTarget || 0}
                  percentage={(summary.aggregates.revenue?.actual / (summary.aggregates.revenue?.totalTarget || 1)) * 100}
                  displayValue={formatRupiah(summary.aggregates.revenue?.actual || 0)}
                  displayTarget={formatRupiah(summary.aggregates.revenue?.totalTarget || 0)}
                  unitLabel="Rp"
                  color="#639922"
                />
                <RadialProgressCard 
                  title="User Acquisition"
                  value={summary.aggregates.user_acquisition?.actual || 0}
                  target={summary.aggregates.user_acquisition?.totalTarget || 0}
                  percentage={(summary.aggregates.user_acquisition?.actual / (summary.aggregates.user_acquisition?.totalTarget || 1)) * 100}
                  displayValue={String(summary.aggregates.user_acquisition?.actual || 0)}
                  displayTarget={String(summary.aggregates.user_acquisition?.totalTarget || 0)}
                  unitLabel="user"
                  color="#378ADD"
                />
             </div>

             {/* Target Trend Chart Column */}
             <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <h3 className="font-bold text-slate-800 mb-6 text-sm flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <TrendingUp className="h-4 w-4 text-[#534AB7]" />
                  </div>
                  Tren akumulasi capaian vs target
                </h3>
                <div className="h-[460px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={summary.targetTrend}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis yAxisId="left" hide />
                      <Tooltip 
                        contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', boxShadow: 'none' }}
                        formatter={(v: unknown, name: unknown) => {
                          const n = String(name || '')
                          if (n.includes('Revenue')) return [formatRupiah(Number(v || 0)), n]
                          return [v as string | number, n]
                        }}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Area yAxisId="left" type="monotone" dataKey="actualRevenue" name="Capaian Rp" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                      <Line yAxisId="left" type="monotone" dataKey="targetRevenue" name="Target Rp (Prorata)" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                      <Bar yAxisId="left" dataKey="actualUser" name="Capaian User" fill="#378ADD" radius={[4, 4, 0, 0]} barSize={10} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
             </div>
          </div>

          {/* Revenue & User Bar Chart (Full Width) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-500" />
              Capaian Pendapatan & User per Program
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={programHealths.sort((a, b) => (b.calculatedMetrics?.revenue || 0) - (a.calculatedMetrics?.revenue || 0)).slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis 
                    dataKey="program.name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#94a3b8' }} 
                    tickFormatter={(v: string) => v.length > 12 ? v.substring(0, 10) + '...' : v} 
                  />
                  <YAxis 
                    yAxisId="left"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#94a3b8' }} 
                    tickFormatter={(v: number) => `Rp${v/1000000}jt`} 
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#94a3b8' }} 
                    tickFormatter={(v: number) => `${v} user`} 
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(val: unknown, name: unknown) => {
                      const label = String(name || '')
                      if (label === 'Pendapatan') return [formatRupiah(Number(val || 0)), label]
                      return [val as string | number, label]
                    }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingBottom: '10px' }} />
                  <Bar yAxisId="left" dataKey="calculatedMetrics.revenue" name="Pendapatan" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar yAxisId="right" dataKey="calculatedMetrics.user_count" name="Jumlah User" fill="#378ADD" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ads' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Filters for Ads */}
          <div className="flex flex-col sm:flex-row gap-3">
             <select 
               value={selectedAdsProgramId} 
               onChange={e => setSelectedAdsProgramId(e.target.value)}
               className="px-4 py-2 text-sm font-semibold bg-white border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#534AB7]/20 text-[#111827]"
             >
               <option value="all">Semua program iklan ({adsPrograms.length})</option>
               {adsPrograms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
             </select>
          </div>

          {/* Row 1: Ads Aggregate Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard 
              icon={Layers} 
              label="Total ads spent" 
              value={formatRupiah(adsAggregate.totalAdsSpent)} 
              sub="periode ini"
              accentColor="#378ADD" 
              comparison={previousSummary ? {
                value: calculateGrowth(adsAggregate.totalAdsSpent, previousSummary.adsMetrics.totalAdsSpent),
                label: prevPeriodLabel
              } : undefined}
            />
            <KpiCard 
              icon={Target} 
              label="Total goals" 
              value={adsAggregate.totalGoals} 
              sub="jumlah closing" 
              accentColor="#639922" 
              comparison={previousSummary ? {
                value: calculateGrowth(adsAggregate.totalGoals, previousSummary.adsMetrics.totalGoals),
                label: prevPeriodLabel
              } : undefined}
            />
            <KpiCard 
              icon={HeartPulse} 
              label="Avg ROAS" 
              value={`${adsAggregate.avgRoas.toFixed(2)}x`} 
              sub={adsAggregate.avgRoas >= 1 ? "Profitable (>1x)" : "Ditinjau (<1x)"}
              accentColor="#534AB7" 
              comparison={previousSummary ? {
                value: calculateGrowth(adsAggregate.avgRoas, previousSummary.adsMetrics.avgRoas),
                label: prevPeriodLabel
              } : undefined}
            />
            <KpiCard 
              icon={CheckSquare} 
              label="Avg CPP" 
              value={formatRupiah(adsAggregate.avgCpp)} 
              sub="biaya per goal"
              accentColor={adsAggregate.avgCpp > 60000 ? "#E24B4A" : "#639922"} 
              comparison={previousSummary ? {
                value: calculateGrowth(adsAggregate.avgCpp, previousSummary.adsMetrics.avgCpp),
                label: prevPeriodLabel
              } : undefined}
            />
          </div>

          {/* Performance Graph */}
          <div className="bg-white p-6 rounded-xl border border-[#E5E7EB]">
            <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
              <h3 className="font-semibold text-[#111827] text-sm flex items-center gap-3">
                <div className="p-2 bg-rose-50 rounded-lg">
                  <Layers className="h-4 w-4 text-rose-500" />
                </div>
                Grafik performa harian
              </h3>
              <div className="flex items-center gap-3 text-[11px] font-bold text-[#6B7280]">
                <span>Bandingkan:</span>
                <select 
                  value={metricX}
                  onChange={e => setMetricX(e.target.value)}
                  className="bg-slate-50 border border-[#E5E7EB] rounded-lg px-2 py-1 text-[#111827] outline-none"
                >
                  {adsMetricOptionsX.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
                <span>Dengan:</span>
                <select 
                   value={metricY}
                   onChange={e => setMetricY(e.target.value)}
                   className="bg-slate-50 border border-[#E5E7EB] rounded-lg px-2 py-1 text-[#111827] outline-none"
                >
                   {adsMetricOptionsY.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={adsChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis yAxisId="left" hide />
                  <YAxis yAxisId="right" orientation="right" hide />
                  <Tooltip 
                    contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', boxShadow: 'none' }}
                    formatter={(v: string | number | readonly (string | number)[] | undefined, name: string | number | undefined) => {
                      const label = adsMetricOptionsX.find(o => o.key === name || o.label === name)?.label || 
                                    adsMetricOptionsY.find(o => o.key === name || o.label === name)?.label || name
                      if (['ads_spent', 'cpp', 'cost_per_goal'].includes(name as string)) return [formatRupiah(Number(v)), label]
                      if (['roas', 'conversion_rate'].includes(name as string)) return [`${Number(v).toFixed(2)}${name === 'conversion_rate' ? '%' : 'x'}`, label]
                      return [v, label]
                    }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Bar yAxisId="left" dataKey="x" name={adsMetricOptionsX.find(o => o.key === metricX)?.label || metricX} fill="#F43F5F" radius={[4, 4, 0, 0]} barSize={20} />
                  <Line yAxisId="right" type="monotone" dataKey="y" name={adsMetricOptionsY.find(o => o.key === metricY)?.label || metricY} stroke="#534AB7" strokeWidth={3} dot={{ r: 3, fill: '#534AB7' }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Details Table */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
             <div className="px-6 py-4 border-b border-[#E5E7EB] bg-slate-50/50">
                <h3 className="font-semibold text-[#111827] text-sm italic">Detail performa iklan per program</h3>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead>
                   <tr className="border-b border-[#E5E7EB] text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                     <th className="px-6 py-3">Program</th>
                     <th className="px-6 py-3 text-right text-[#378ADD]">Ads Spent</th>
                     <th className="px-6 py-3 text-right text-[#639922]">Goals</th>
                     <th className="px-6 py-3 text-right text-[#534AB7]">ROAS</th>
                     <th className="px-6 py-3 text-right">CPP</th>
                     <th className="px-6 py-3 text-right">CR %</th>
                     <th className="px-6 py-3 text-center">Status</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-[#E5E7EB]">
                   {programHealths
                    .filter(ph => {
                      const isAds = isAdsProgram(ph.program.program_metric_definitions || [])
                      const matchesFilter = selectedAdsProgramId === 'all' || ph.program.id === selectedAdsProgramId
                      return isAds && matchesFilter
                    })
                    .map(ph => {
                      const metrics = ph.calculatedMetrics || {}
                      
                      // Robust extraction with synonyms
                      const getVal = (keys: string[]) => {
                        for (const k of keys) {
                          if (metrics[k] !== undefined && metrics[k] !== null) return metrics[k]
                        }
                        return 0
                      }

                      const spent = getVal(['ads_spent', 'ad_spend', 'budget_iklan', 'spent'])
                      const revenue = getVal(['revenue', 'omzet', 'pemasukan', 'revenue_from_paid_traffic'])
                      const goals = getVal(['user_count', 'closing', 'leads_converted', 'pembelian'])
                      const leads = getVal(['leads', 'lead_masuk', 'prospek', 'leads_count'])
                      
                      const roas = metrics.roas || (spent > 0 ? revenue / spent : 0)
                      const cpp = metrics.cpp || (goals > 0 ? spent / goals : 0)
                      const cr = metrics.conversion_rate || (leads > 0 ? (goals / leads) * 100 : 0)
                      
                      return (
                        <tr key={ph.program.id} className="hover:bg-slate-50 transition-colors group">
                           <td className="px-6 py-4 font-semibold text-[#111827] text-[13px]">{ph.program.name}</td>
                           <td className="px-6 py-4 text-right text-[#111827] text-[12px] font-medium">{formatRupiah(spent)}</td>
                           <td className="px-6 py-4 text-right text-[#111827] text-[12px] font-medium">{goals}</td>
                           <td className="px-6 py-4 text-right">
                              <span className={cn("px-2 py-0.5 rounded-lg text-[12px] font-bold", roas >= 1 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                                {roas.toFixed(2)}x
                              </span>
                           </td>
                           <td className="px-6 py-4 text-right text-[#6B7280] text-[12px]">{formatRupiah(cpp)}</td>
                           <td className="px-6 py-4 text-right text-[#6B7280] text-[12px]">{cr.toFixed(1)}%</td>
                           <td className="px-6 py-4 text-center">
                             <span className={cn("px-2 py-1 rounded-full text-[10px] font-bold tracking-tight border", getStatusLabelAndColor(ph.healthScore).badge)}>
                               {getStatusLabelAndColor(ph.healthScore).label.toLowerCase()}
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
