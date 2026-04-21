'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Database } from '@/types/database'
import { ProgramWithRelations, MetricValue, DailyInput, MilestoneCompletion } from './actions'
import { 
  calculateProgramHealth, 
  isAdsProgram, 
  isMouProgram,
  aggregateAdsMetrics, 
  buildAdsDailySeries,
  buildTargetTrendSeries,
  MetricComparison,
  AggregateItem
} from '@/lib/dashboard-calculator'
import { formatRupiah, cn } from '@/lib/utils'
import { exportDashboardToExcel } from '@/lib/export-spreadsheet'
import { formatMetricValue } from '@/lib/formula-evaluator'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ComposedChart, Legend, Line, AreaChart, Area, Cell, ReferenceLine
} from 'recharts'
import {
  HeartPulse, Layers, Target, CheckSquare,
  Search, ArrowUpRight, ArrowDownRight, TrendingUp, Handshake, FileDown,
  Users, Info
} from 'lucide-react'

import { DashboardSummary } from '@/lib/dashboard-service'
import { RadialProgressCard } from '@/components/dashboard/radial-progress-card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ProgramDetailView } from '@/components/dashboard/program-detail-view'

interface OverviewClientProps {
  programs: ProgramWithRelations[]
  profiles: { id: string; name: string }[]
  summary: DashboardSummary
  previousSummary?: DashboardSummary
  startDate?: string
  endDate?: string
  metricValues: MetricValue[]
  dailyInputs: DailyInput[]
  activePeriod: Database['public']['Tables']['periods']['Row']
  milestoneCompletions: MilestoneCompletion[]
  isPersonalMode?: boolean
}

type TabType = 'overview' | 'target' | 'ads' | 'mou'

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
  if (score < 105) return { text: 'ALHAMDULILLAH TARGET TERCAPAI 🏆', bg: 'bg-emerald-50', border: 'border-emerald-200', textCol: 'text-emerald-800' }
  return { text: 'MASYAALLAH WOW TARGET TERLAMPAUI! 🚀', bg: 'bg-blue-50', border: 'border-blue-200', textCol: 'text-blue-800' }
}



interface KpiCardProps {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  accentColor?: string
  comparison?: MetricComparison
  tooltip?: string
}

function KpiCard({ icon: Icon, label, value, sub, accentColor, comparison, tooltip }: KpiCardProps) {
  const getStatusDisplay = (comp: MetricComparison) => {
    const isPositive = (comp.percentage ?? 0) >= 0
    const isImproving = comp.status === 'improving' || comp.status === 'ahead' || comp.status === 'sehat'
    const isDeclining = comp.status === 'declining' || comp.status === 'behind' || comp.status === 'kritis'
    
    // Status colors
    const colorClass = isImproving ? "text-emerald-600" : 
                       isDeclining ? "text-rose-600" : "text-slate-500"

    if (comp.type === 'flow' || comp.type === 'ratio') {
      return (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[#E5E7EB]">
          <span className={cn("text-[12px] font-medium flex items-center gap-0.5", colorClass)}>
            {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(comp.percentage ?? 0).toFixed(1)}%
          </span>
          <span className="text-[12px] text-slate-400">{comp.label}</span>
        </div>
      )
    }

    if (comp.type === 'target') {
      return (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[#E5E7EB]">
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
            comp.status === 'ahead' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
            comp.status === 'behind' ? "bg-rose-50 text-rose-700 border-rose-100" :
            "bg-slate-50 text-slate-700 border-slate-100"
          )}>
            {comp.status === 'ahead' ? 'On Track' : comp.status === 'behind' ? 'Behind' : 'Steady'}
          </span>
          <span className="text-[12px] text-slate-400">{comp.label}</span>
        </div>
      )
    }

    if (comp.type === 'index' || comp.type === 'status') {
       // Index uses status dots
       const dotColor = comp.status === 'sehat' ? 'bg-emerald-500' :
                        comp.status === 'perhatian' ? 'bg-amber-400' :
                        comp.status === 'kritis' ? 'bg-red-500' : 'bg-slate-300'
       return (
         <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[#E5E7EB]">
           <div className={cn("h-2 w-2 rounded-full", dotColor)} />
           <span className="text-[12px] text-slate-500 font-medium capitalize">{comp.status || 'Normal'}</span>
           <span className="text-[12px] text-slate-400 ml-auto">{comp.label}</span>
         </div>
       )
    }

    return null
  }

  return (
    <div className="bg-white p-4 rounded-xl border border-[#E5E7EB] flex flex-col justify-between relative overflow-hidden group">
      {/* 3px Vertical Accent */}
      {accentColor && (
        <div 
          className="absolute left-0 top-0 bottom-0 w-[3px]" 
          style={{ backgroundColor: accentColor }}
        />
      )}
      
      <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none transition-opacity group-hover:opacity-10">
        <Icon className="w-16 h-16" />
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <p className="text-[10px] font-bold tracking-[0.05em] text-[#6B7280] uppercase truncate" title={label}>{label}</p>
          {tooltip && (
            <div className="text-slate-300 hover:text-indigo-500 transition-colors cursor-help" title={tooltip}>
              <Info className="h-3 w-3" />
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-2 w-full flex-wrap min-w-0">
          <span className="text-[clamp(1.125rem,4vw,1.5rem)] font-bold text-[#111827] leading-tight tabular-nums break-words" title={String(value)}>
            {value}
          </span>
          {sub && <span className="text-[12px] text-[#6B7280] font-normal truncate min-w-0">{sub}</span>}
        </div>
      </div>

      {comparison && getStatusDisplay(comparison)}
    </div>
  )
}

// ── Individual Program Card ───────────────────────────────────────────────────
function ProgramCard({ program, health, profiles, onClick }: {
  program: ProgramWithRelations
  health: ReturnType<typeof calculateProgramHealth>
  profiles: { id: string; name: string }[]
  onClick?: () => void
}) {
  const { label, badge, accent } = getStatusLabelAndColor(health.healthScore)
  const isQualitative = health.isQualitativeOnly
  const evaluatedMetrics = health.calculatedMetrics || {}

  // Primary metrics derived from metric definitions (mapped in calculator)
  const defs = program.program_metric_definitions || []
  const primaryMetrics = defs.filter(m => m.is_primary && m.is_target_metric)
  const secondaryMetrics = defs.filter(m => !m.is_primary)

  // Milestone progress for qualitative/hybrid
  const milestones = program.program_milestones || []

  const pics = (program.program_pics || []).map(pic => profiles.find(pr => pr.id === pic.profile_id)).filter(Boolean)

  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-xl border border-[#E5E7EB] transition-all duration-300 overflow-hidden group flex flex-col relative cursor-pointer hover:border-[#534AB7] hover:shadow-md active:scale-[0.99]"
    >
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
              // Use absolute monthly target from calculator, or definition, or fallback
              const target = health.absoluteTargets?.[m.metric_key] || m.monthly_target || health.effectiveTargets?.[m.metric_key] || 0
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
  metricValues,
  dailyInputs,
  activePeriod,
  milestoneCompletions,
  isPersonalMode,
}: OverviewClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  // Sync activeTab with URL ?tab=...
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null)
  
  useEffect(() => {
    const tab = searchParams.get('tab') as TabType
    if (tab && ['overview', 'target', 'ads', 'mou'].includes(tab)) {
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
  const [selectedOmzetProgramId, setSelectedOmzetProgramId] = useState<'all' | string>('all')

  // Process data for easy access
  const programHealths = summary.programHealths
  const globalKPIs = summary.globalKPIs

  // ── Calculated Data for Omzet Tab ──────────────────────────────────────────
  const filteredOmzetSummary = useMemo(() => {
    if (selectedOmzetProgramId === 'all') {
      const revenueAchievement = (summary.aggregates.revenue.actual / (summary.aggregates.revenue.totalTarget || 1)) * 100
      return {
        aggregates: summary.aggregates,
        health: revenueAchievement,
        targetTrend: summary.targetTrend,
        previousAggregates: previousSummary?.aggregates
      }
    }

    const program = programs.find(p => p.id === selectedOmzetProgramId)
    const ph = summary.programHealths.find(h => h.programId === selectedOmzetProgramId)
    const prevPh = previousSummary?.programHealths.find(h => h.programId === selectedOmzetProgramId)

    if (!program || !ph) return null

    const actualRevenue = ph.calculatedMetrics?.revenue || 0
    const actualUser = ph.calculatedMetrics?.user_count || ph.calculatedMetrics?.user_acquisition || 0
    const targetRevenue = ph.absoluteTargets?.revenue || 0
    const targetUser = ph.absoluteTargets?.user_count || ph.absoluteTargets?.user_acquisition || 0
    
    // Calculate required daily for this program
    const todayIso = new Date().toISOString().split('T')[0]
    const hasTodayData =
      metricValues.some(v => v.date === todayIso && v.program_id === selectedOmzetProgramId && v.value !== null) ||
      dailyInputs.some(v => v.date === todayIso && v.program_id === selectedOmzetProgramId)

    const workingDays      = activePeriod?.working_days || 30
    const totalCalendarDays = new Date(activePeriod.year, activePeriod.month, 0).getDate()
    const today            = new Date().getDate()
    const calendarElapsed  = hasTodayData ? today : Math.max(0, today - 1)
    const workingDaysElapsed = Math.round((calendarElapsed / totalCalendarDays) * workingDays)
    const prorationFactor    = Math.min(workingDaysElapsed / workingDays, 1)
    const remainingDays      = Math.max(1, workingDays - workingDaysElapsed)
    const remainingTarget    = Math.max(0, targetRevenue - actualRevenue)
    const requiredDaily      = remainingTarget / remainingDays
    

    // Calculate target comparison for this program
    const actualProgress = targetRevenue > 0 ? actualRevenue / targetRevenue : 0
    const comparison: MetricComparison = {
      value: actualRevenue,
      type: 'target',
      label: 'vs expected progress',
      status: actualProgress >= prorationFactor ? 'ahead' : 'behind'
    }

    // Recalculate trend for this single program
    const trend = buildTargetTrendSeries(
      [program],
      metricValues,
      dailyInputs,
      activePeriod,
      targetRevenue,
      targetUser,
      startDate,
      endDate
    )

    const healthResult = ( actualRevenue / (targetRevenue || 1) ) * 100

    return {
      aggregates: {
        revenue: { 
          actual: actualRevenue, 
          totalTarget: targetRevenue,
          requiredDaily,
          comparison
        },
        user_acquisition: { 
          actual: actualUser, 
          totalTarget: targetUser,
          comparison: {
            value: actualUser,
            type: 'target',
            label: 'vs expected progress',
            status: (targetUser > 0 ? actualUser / targetUser : 0) >= prorationFactor ? 'ahead' : 'behind'
          }
        }
      },
      health: healthResult,
      targetTrend: trend,
      previousAggregates: prevPh ? {
        revenue: { 
          actual: prevPh.calculatedMetrics?.revenue || 0, 
          totalTarget: prevPh.absoluteTargets?.revenue || 0 
        },
        user_acquisition: { 
          actual: prevPh.calculatedMetrics?.user_count || prevPh.calculatedMetrics?.user_acquisition || 0, 
          totalTarget: prevPh.absoluteTargets?.user_count || prevPh.absoluteTargets?.user_acquisition || 0 
        }
      } : undefined
    }
  }, [selectedOmzetProgramId, summary, previousSummary, programs, metricValues, dailyInputs, activePeriod, startDate, endDate])

  const omzetSummary = filteredOmzetSummary || { 
    aggregates: summary.aggregates, 
    health: (summary.aggregates.revenue.actual / (summary.aggregates.revenue.totalTarget || 1)) * 100,
    targetTrend: summary.targetTrend, 
    previousAggregates: previousSummary?.aggregates 
  }
  const [metricX, setMetricX] = useState('ads_spent')
  const [metricY, setMetricY] = useState('roas')

  const filteredProgramHealths = useMemo(() => {
    if (selectedOmzetProgramId === 'all') return programHealths
    return programHealths.filter(ph => ph.programId === selectedOmzetProgramId)
  }, [programHealths, selectedOmzetProgramId])
  
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
  [targetAdsPrograms, metricValuesByProgram, metricX, metricY])

  const mouProgramHealths = useMemo(() => 
    programHealths.filter(ph => isMouProgram(ph.program.program_metric_definitions || [])),
    [programHealths]
  )

  const handleExport = () => {
    if (!activePeriod) return
    exportDashboardToExcel({
      programHealths,
      metricValues,
      dailyInputs,
      milestoneCompletions,
      activePeriod,
      globalHealth: globalKPIs.avgHealth,
    })
  }

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

  const currentHealth = (activeTab === 'target' && selectedOmzetProgramId !== 'all') 
    ? (omzetSummary.health)
    : globalKPIs.avgHealth

  const banner = getBannerInfo(currentHealth)

  const missingInputPrograms = useMemo(() => {
    if (!activePeriod || programs.length === 0) return [];
    
    // Check if today is a working day within active period (approximate by matching year/month)
    const today = new Date();
    if (today.getFullYear() !== activePeriod.year || (today.getMonth() + 1) !== activePeriod.month) return [];

    const pad = (n: number) => n.toString().padStart(2, '0')
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

    const missing: ProgramWithRelations[] = [];
    for (const p of programs) {
        // Only programs with at least one manual metric need daily input
        const hasManualMetrics = (p.program_metric_definitions || []).some(m => m.input_type === 'manual')
        if (!hasManualMetrics) continue;
        
        const hasInputToday = 
            metricValues.some(mv => mv.program_id === p.id && mv.date === todayStr && mv.value !== null) ||
            dailyInputs.some(di => di.program_id === p.id && di.date === todayStr);
            
        if (!hasInputToday) {
            missing.push(p)
        }
    }
    return missing;
  }, [programs, metricValues, dailyInputs, activePeriod]);

  return (
    <div className="space-y-6 pb-24">
      {missingInputPrograms.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl flex sm:items-center items-start gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="bg-amber-100 p-1.5 rounded-lg shrink-0 mt-0.5 sm:mt-0">
            <Info className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold">Peringatan Kelengkapan Data</p>
            <p className="text-[12px] opacity-90 mt-0.5">
              Anda memiliki <strong className="font-bold">{missingInputPrograms.length} program</strong> yang belum diinput data aktual harian untuk hari ini.
            </p>
          </div>
          <button 
            onClick={() => router.push('/input-harian')}
            className="text-[11px] bg-white text-amber-700 font-bold px-3 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0 shadow-sm"
          >
             Input Sekarang
          </button>
        </div>
      )}

      {/* ── Tab Switcher ─────────────────────────────────────────── */}
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
          Omzet
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
        <button
          onClick={() => handleTabChange('mou')}
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
            activeTab === 'mou' ? "bg-white text-[#534AB7] border border-[#E5E7EB] shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
          )}
        >
          <Handshake className="h-3.5 w-3.5" />
          Program MoU
        </button>
      </div>

      <button
        onClick={handleExport}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E5E7EB] rounded-xl text-[13px] font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-sm w-fit"
      >
        <FileDown className="h-4 w-4" />
        {isPersonalMode ? 'Export My Data' : 'Export Spreadsheet'}
      </button>
    </div>
      
      {/* Motivational Banner relocated here (Global) */}
      <div className={cn("px-8 py-10 rounded-2xl border flex flex-col items-center justify-center text-center gap-6 shadow-sm transition-all", banner.bg, banner.border)}>
        <div className={cn("p-4 rounded-full shadow-inner", banner.bg === 'bg-[#FCEBEB]' ? 'bg-white' : 'bg-white/50')}>
           <div className={cn("h-6 w-6 rounded-full animate-pulse", getStatusLabelAndColor(globalKPIs.avgHealth).dot)} />
        </div>
        <h2 className={cn("text-xl md:text-2xl font-black tracking-tight max-w-xl leading-tight uppercase", banner.textCol)}>
          {banner.text}
        </h2>
        <div className="h-1 w-24 rounded-full bg-slate-200/50" />
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
              tooltip="Health Score adalah rata-rata pencapaian target dari metrik utama (Omzet & User) di seluruh program aktif."
              comparison={globalKPIs.comparison} 
            />
            <KpiCard 
              icon={Layers} 
              label="Program aktif" 
              value={globalKPIs.activeProgramsCount} 
              sub={`dari ${globalKPIs.totalPrograms} total`} 
              accentColor="#378ADD"
              comparison={undefined}
              tooltip="Jumlah program yang sedang berjalan dan dipantau pada periode ini."
            />
            <KpiCard 
              icon={Target} 
              label="Target tercapai" 
              value={globalKPIs.targetsHit} 
              sub={`program periode ini`} 
              accentColor="#639922"
              tooltip="Jumlah program yang sudah mencapai atau melampaui 100% target utamanya bulan ini."
              comparison={undefined}
            />
            <KpiCard 
              icon={CheckSquare} 
              label="Milestone done" 
              value={globalKPIs.completedMilestones} 
              sub={`dari ${globalKPIs.totalMilestones} total`} 
              accentColor="#534AB7"
              tooltip="Total tugas/milestone yang sudah diselesaikan dari seluruh program berbasis pencapaian (kualitatif)."
              comparison={undefined}
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
                <ProgramCard 
                  key={ph.program.id} 
                  program={ph.program} 
                  health={ph} 
                  profiles={profiles} 
                  onClick={() => setSelectedProgramId(ph.program.id)}
                />
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
          {/* Header with Filter */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">Capaian Omzet & User</h2>
            <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              <select 
                value={selectedOmzetProgramId} 
                onChange={e => setSelectedOmzetProgramId(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-slate-600 focus:ring-0 px-3 py-1 cursor-pointer"
              >
                <option value="all">Semua Program</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 1: KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard 
              icon={Layers} 
              label="Total capaian Omzet" 
              value={formatRupiah(omzetSummary.aggregates.revenue?.actual || 0)} 
              sub={`Target: ${formatRupiah(omzetSummary.aggregates.revenue?.totalTarget || 0)} | Sisa: ${formatRupiah(Math.max(0, (omzetSummary.aggregates.revenue?.totalTarget || 0) - (omzetSummary.aggregates.revenue?.actual || 0)))}`}
              accentColor="#639922"
              comparison={(omzetSummary.aggregates.revenue as AggregateItem)?.comparison}
            />
            <KpiCard 
              icon={TrendingUp} 
              label="Target Harian Dibutuhkan" 
              value={formatRupiah((omzetSummary.aggregates.revenue as AggregateItem)?.requiredDaily || 0)} 
              sub={`Target normal: ${formatRupiah(
                (omzetSummary.aggregates.revenue as AggregateItem)?.totalTarget / 
                (activePeriod?.working_days || 30)
              )}/hari`}
              accentColor="#534AB7"
              tooltip="Omzet yang harus dicapai setiap hari di sisa hari kerja untuk mencapai target 100%. Lebih tinggi dari target normal jika program tertinggal dari jadwal"
            />
             <KpiCard 
              icon={HeartPulse} 
              label="Tingkat Capaian" 
              value={`${Math.round(omzetSummary.health)}%`} 
              sub={selectedOmzetProgramId === 'all' ? 'Rata-rata Global' : 'Program ini'}
              accentColor={getStatusLabelAndColor(omzetSummary.health).accent}
              comparison={{
                value: omzetSummary.health,
                type: 'index',
                label: '● Health Rate',
                status: getStatusLabelAndColor(omzetSummary.health).label.toLowerCase() as 'sehat' | 'perhatian' | 'kritis'
              }}
            />
          </div>

          {/* Row 2: Visuals (Radial + Trend) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
             {/* Radial Card Column */}
             <div className="lg:col-span-4 gap-6">
                <RadialProgressCard 
                  title="Revenue Progress"
                  value={(omzetSummary.aggregates.revenue as AggregateItem)?.actual || 0}
                  target={(omzetSummary.aggregates.revenue as AggregateItem)?.totalTarget || 0}
                  percentage={((omzetSummary.aggregates.revenue as AggregateItem)?.actual / ((omzetSummary.aggregates.revenue as AggregateItem)?.totalTarget || 1)) * 100}
                  displayValue={formatRupiah((omzetSummary.aggregates.revenue as AggregateItem)?.actual || 0)}
                  displayTarget={formatRupiah((omzetSummary.aggregates.revenue as AggregateItem)?.totalTarget || 0)}
                  unitLabel="Rp"
                  color="#639922"
                  className="h-full"
                />
             </div>

             {/* Omzet Trend Chart Column */}
             <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <h3 className="font-bold text-slate-800 mb-6 text-sm flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <TrendingUp className="h-4 w-4 text-[#534AB7]" />
                  </div>
                  Tren harian Omzet & Perolehan User
                </h3>
                <div className="h-[460px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={omzetSummary.targetTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis 
                        yAxisId="left" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#94a3b8' }} 
                        tickFormatter={(v) => v >= 1000000 ? `Rp${(v/1000000).toFixed(1)}jt` : `Rp${(v/1000).toFixed(0)}rb`} 
                        domain={[0, (dataMax: number) => {
                          const target = omzetSummary.targetTrend?.[0]?.targetRevenue || 0
                          return Math.max(dataMax, target) * 1.1
                        }]}
                      />
                      <YAxis 
                        yAxisId="right" 
                        orientation="right" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#378ADD' }} 
                        domain={[0, (dataMax: number) => {
                          const target = omzetSummary.targetTrend?.[0]?.targetUser || 0
                          return Math.max(dataMax, target) * 1.2
                        }]}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', boxShadow: 'none' }}
                        formatter={(
                          /* eslint-disable @typescript-eslint/no-explicit-any */
                          v: any, 
                          name: any
                          /* eslint-enable @typescript-eslint/no-explicit-any */
                        ) => {
                          const n = String(name || '')
                          if (n.includes('Revenue') || n.toLowerCase().includes('omzet')) return [formatRupiah(Number(v || 0)), 'Omzet']
                          if (n.toLowerCase().includes('user')) return [v, 'User Baru']
                          return [v, n]
                        }}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Bar yAxisId="left" dataKey="actualRevenue" name="Omzet Harian" fill="#639922" radius={[4, 4, 0, 0]} barSize={20} />
                      <Line yAxisId="right" type="monotone" dataKey="actualUser" name="User Harian" stroke="#378ADD" strokeWidth={3} dot={{ r: 4, fill: '#378ADD' }} activeDot={{ r: 6 }} />
                      
                      {omzetSummary.targetTrend && omzetSummary.targetTrend.length > 0 && (
                        <ReferenceLine yAxisId="left" y={(omzetSummary.aggregates.revenue as AggregateItem)?.requiredDaily || 0} stroke="#639922" strokeDasharray="5 5" label={{ position: 'right', value: 'Target Harian Dibutuhkan', fill: '#639922', fontSize: 10 }} />
                      )}
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
                <BarChart data={filteredProgramHealths.sort((a, b) => (b.calculatedMetrics?.revenue || 0) - (a.calculatedMetrics?.revenue || 0)).slice(0, 10)}>
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
              comparison={adsAggregate.comparisons?.ad_spend || summary.aggregates.ad_spend?.comparison}
              tooltip="Total anggaran iklan yang sudah dikeluarkan oleh semua program berbayar (Meta, Google, dll)."
            />
            <KpiCard 
              icon={Target} 
              label="Total goals" 
              value={adsAggregate.totalGoals} 
              sub="jumlah closing" 
              accentColor="#639922" 
              comparison={summary.aggregates.user_acquisition?.comparison}
              tooltip="Total closing/pembelian yang berhasil dari semua program iklan."
            />
            <KpiCard 
              icon={HeartPulse} 
              label="Avg ROAS" 
              value={`${adsAggregate.avgRoas.toFixed(2)}x`} 
              sub={adsAggregate.avgRoas >= 1 ? "Profitable (>1x)" : "Ditinjau (<1x)"}
              accentColor="#534AB7" 
              comparison={adsAggregate.comparisons?.roas}
              tooltip="ROAS (Return on Ad Spend): Setiap Rp1 yang dikeluarkan untuk iklan menghasilkan Rp berapa? Angka di atas 1x berarti untung. Di atas 3x dianggap sangat baik."
            />
            <KpiCard 
              icon={CheckSquare} 
              label="Avg CPP" 
              value={formatRupiah(adsAggregate.avgCpp)} 
              sub="biaya per goal"
              accentColor={adsAggregate.avgCpp > 60000 ? "#E24B4A" : "#639922"} 
              comparison={adsAggregate.comparisons?.cpp}
              tooltip="CPP (Cost per Purchase/Goal): Rata-rata biaya yang dikeluarkan untuk mendapatkan satu closing. Semakin kecil semakin efisien."
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
                        <tr 
                          key={ph.program.id} 
                          className="hover:bg-slate-50 transition-colors group cursor-pointer"
                          onClick={() => setSelectedProgramId(ph.program.id)}
                        >
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
      {activeTab === 'mou' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* MoU Aggregates */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <RadialProgressCard 
              title="Kesehatan MoU"
              value={mouProgramHealths.length > 0 ? mouProgramHealths.reduce((s, ph) => s + ph.healthScore, 0) / mouProgramHealths.length : 0} 
              percentage={mouProgramHealths.length > 0 ? mouProgramHealths.reduce((s, ph) => s + ph.healthScore, 0) / mouProgramHealths.length : 0} 
              target={100}
              displayValue={(mouProgramHealths.length > 0 ? mouProgramHealths.reduce((s, ph) => s + ph.healthScore, 0) / mouProgramHealths.length : 0).toFixed(1) + "%"}
              displayTarget="100"
              unitLabel="%"
              color="#534AB7"
            />
            <KpiCard 
              icon={Users} 
              label="Total Closing MoU" 
              value={mouProgramHealths.reduce((s, ph) => s + (ph.calculatedMetrics?.user_count || ph.calculatedMetrics?.user_acquisition || 0), 0)}
              sub="akumulasi periode ini"
              accentColor="#639922"
            />
            <KpiCard 
              icon={CheckSquare} 
              label="Milestones Done" 
              value={mouProgramHealths.reduce((s, ph) => s + (ph.program.program_milestones?.filter(m => milestoneCompletions.some(mc => mc.milestone_id === m.id && mc.is_completed)).length || 0), 0)}
              sub={`dari ${mouProgramHealths.reduce((s, ph) => s + (ph.program.program_milestones?.length || 0), 0)} total`}
              accentColor="#378ADD"
            />
            <KpiCard 
              icon={Handshake} 
              label="Program Kerja Sama" 
              value={mouProgramHealths.length}
              sub="aktif dalam sistem"
              accentColor="#534AB7"
            />
          </div>

          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-[#E5E7EB] bg-slate-50/50 flex items-center justify-between">
              <h3 className="font-semibold text-[#111827] text-sm flex items-center gap-2">
                <Handshake className="h-4 w-4 text-[#534AB7]" />
                Performa Program Kerja Sama (MoU)
              </h3>
              <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                {mouProgramHealths.length} Program Aktif
              </div>
            </div>

            {/* MoU Aggregates Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-slate-50/30">
              <div className="bg-white p-4 rounded-xl border border-[#E5E7EB] shadow-sm">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Total Closing MoU</p>
                <div className="text-2xl font-black text-[#111827]">
                  {mouProgramHealths.reduce((sum, ph) => {
                    return sum + (ph.calculatedMetrics?.user_count || ph.calculatedMetrics?.user_acquisition || 0)
                  }, 0)}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-medium italic">Akumulasi seluruh program MoU</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-[#E5E7EB] shadow-sm">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Total Milestone Done</p>
                <div className="text-2xl font-black text-[#534AB7]">
                  {mouProgramHealths.reduce((sum, ph) => {
                    const progMilestones = ph.program.program_milestones || []
                    const doneForProg = progMilestones.filter(m => 
                      milestoneCompletions.some(mc => mc.milestone_id === m.id)
                    ).length
                    return sum + doneForProg
                  }, 0)}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">dari {mouProgramHealths.reduce((sum, ph) => sum + (ph.program.program_milestones?.length || 0), 0)} total milestone</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-[#E5E7EB] shadow-sm">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Avg Health MoU</p>
                <div className="text-2xl font-black text-emerald-600">
                  {mouProgramHealths.length > 0 
                    ? Math.round(mouProgramHealths.reduce((sum, ph) => sum + ph.healthScore, 0) / mouProgramHealths.length)
                    : 0}%
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-medium italic">Rata-rata kesehatan kerja sama</p>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                    <th className="px-6 py-4">Program</th>
                    <th className="px-6 py-4">PIC / Team</th>
                    <th className="px-6 py-4 text-center">Closing / User</th>
                    <th className="px-6 py-4 text-center">Milestones</th>
                    <th className="px-6 py-4 text-center">Health</th>
                    <th className="px-6 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {mouProgramHealths.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                        Belum ada program dengan tipe MoU / Kerja Sama.
                      </td>
                    </tr>
                  ) : (
                    programHealths
                      .filter(ph => isMouProgram(ph.program.program_metric_definitions || []))
                      .map(ph => {
                        const metrics = ph.calculatedMetrics || {}
                        const userActual = metrics.user_count || metrics.user_acquisition || 0
                        const userTarget = ph.absoluteTargets?.user_count || ph.absoluteTargets?.user_acquisition || 0
                        const userPct = userTarget > 0 ? (userActual / userTarget) * 100 : 0
                        
                        const programMilestones = ph.program.program_milestones || []
                        const completedMilestones = programMilestones.filter(m => 
                          milestoneCompletions.some(mc => mc.milestone_id === m.id)
                        ).length
                        const totalMilestones = programMilestones.length
                        const milestonePct = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0

                        const pics = (ph.program.program_pics || [])
                          .map(pic => profiles.find(pr => pr.id === pic.profile_id))
                          .filter(Boolean)

                        return (
                          <tr 
                            key={ph.program.id} 
                            className="hover:bg-slate-50 transition-colors group cursor-pointer"
                            onClick={() => setSelectedProgramId(ph.program.id)}
                          >
                            <td className="px-6 py-4">
                              <div className="font-semibold text-[#111827] text-[13px] group-hover:text-[#534AB7] transition-colors">{ph.program.name}</div>
                              {ph.program.department && <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{ph.program.department}</div>}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex -space-x-1.5">
                                {pics.slice(0, 3).map(p => (
                                  <div key={p!.id} className="h-6 w-6 rounded-full bg-[#EEEDFE] border-2 border-white flex items-center justify-center text-[9px] font-bold text-[#534AB7] uppercase shadow-sm">
                                    {p!.name?.[0]}
                                  </div>
                                ))}
                                {pics.length > 3 && (
                                  <div className="h-6 w-6 rounded-full bg-slate-50 border-2 border-white flex items-center justify-center text-[9px] font-bold text-slate-500 shadow-sm">
                                    +{pics.length - 3}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col items-center gap-1.5 min-w-[120px]">
                                <div className="flex justify-between w-full text-[11px] font-bold">
                                  <span className="text-[#111827]">{userActual}</span>
                                  <span className="text-slate-400">/ {userTarget}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div 
                                    className={cn("h-full transition-all duration-1000", getProgressColor(userPct))}
                                    style={{ width: `${Math.min(userPct, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                                <div className="flex justify-between w-full text-[11px] font-bold">
                                  <span className="text-slate-700">{completedMilestones}</span>
                                  <span className="text-slate-400">/ {totalMilestones}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-[#534AB7] opacity-80 transition-all duration-1000"
                                    style={{ width: `${Math.min(milestonePct, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-sm font-bold text-[#111827] tabular-nums">{Math.round(ph.healthScore)}%</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight border whitespace-nowrap", getStatusLabelAndColor(ph.healthScore).badge)}>
                                {getStatusLabelAndColor(ph.healthScore).label}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Program Detail Side Panel (Drill Down) */}
      <Sheet open={!!selectedProgramId} onOpenChange={(open) => !open && setSelectedProgramId(null)}>
        <SheetContent className="sm:max-w-xl md:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-sm font-bold text-[#6B7280] uppercase tracking-widest">Detail Program</SheetTitle>
            <SheetDescription className="hidden">Menampilkan detail statistik dan performa harian.</SheetDescription>
          </SheetHeader>
          
          {selectedProgramId && (() => {
            const ph = programHealths.find(p => p.program.id === selectedProgramId)
            if (!ph) return null
            return (
              <ProgramDetailView 
                program={ph.program} 
                health={ph} 
                metricValues={metricValues} 
                dailyInputs={dailyInputs}
              />
            )
          })()}
        </SheetContent>
      </Sheet>
    </div>
  )
}
