'use client'

import { useState, useEffect, useMemo } from 'react'
import { ProgramPerformance, DailyInput, Milestone } from '../actions'
import { Database } from '@/types/database'
import { formatRupiah, cn } from '@/lib/utils'
import { formatMetricValue } from '@/lib/formula-evaluator'
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Bar,
  ComposedChart,
  Line,
  LabelList
} from 'recharts'
import { CheckCircle2, ClipboardList, Target, TrendingUp, BarChart3 } from 'lucide-react'

type MetricDefinition = Database['public']['Tables']['program_metric_definitions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']

interface SlideProgramDetailProps {
  program: ProgramPerformance
  inputs: DailyInput[]
  metricDefinitions?: MetricDefinition[]
  metricValues?: MetricValue[]
}

// ── Ring Progress SVG ─────────────────────────────────────────────────────────
function RingProgress({
  value,
  max = 100,
  color = '#00d4ff',
  size = 140,
}: {
  value: number
  max?: number
  color?: string
  size?: number
}) {
  const pct   = Math.min(value / max, 1)
  const r     = 48
  const circ  = 2 * Math.PI * r
  const dash  = pct * circ

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ overflow: 'visible' }}>
      {/* track */}
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(0,150,255,0.1)" strokeWidth="10" />
      {/* progress arc */}
      <circle
        cx="60" cy="60" r={r} fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
      />
      <text
        x="60" y="54"
        fill="white" fontSize="22" fontWeight="800"
        textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Barlow Condensed', sans-serif"
      >
        {(pct * 100).toFixed(1)}%
      </text>
      <text
        x="60" y="74"
        fill="rgba(180,210,255,0.45)" fontSize="10"
        textAnchor="middle" dominantBaseline="middle"
      >
        Yield
      </text>
    </svg>
  )
}

// ── Card accent line ──────────────────────────────────────────────────────────
function AccentLine({ color = '#00d4ff', opacity = 0.6 }: { color?: string; opacity?: number }) {
  return (
    <div
      className="absolute top-0 left-0 right-0 h-0.5 pointer-events-none"
      style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity }}
    />
  )
}

// ── Shared card wrapper ───────────────────────────────────────────────────────
function Card({
  children,
  className,
  accentColor,
}: {
  children: React.ReactNode
  className?: string
  accentColor?: string
}) {
  return (
    <div
      className={cn('rounded-2xl border relative overflow-hidden', className)}
      style={{ background: '#0d1a2e', borderColor: 'rgba(0,200,255,0.12)' }}
    >
      <AccentLine color={accentColor} />
      {children}
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
      />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function SlideProgramDetail({ program, inputs, metricDefinitions = [], metricValues = [] }: SlideProgramDetailProps) {
  const [time, setTime]       = useState('')
  const [dateStr, setDateStr] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setDateStr(now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────────
  const isQualitative = program.target_type === 'qualitative'
  const isHybrid      = program.target_type === 'hybrid'

  // Custom metrics for TV display
  const tvMetrics = metricDefinitions
    .filter(m => m.is_target_metric && m.show_on_tv)
    .sort((a, b) => a.display_order - b.display_order)
  const hasCustomMetrics = tvMetrics.length > 0

  // Detect Ads Program
  const isAds = useMemo(() => {
    return metricDefinitions.some(m => 
      ['ad_spend', 'ads_spent', 'roas', 'cpp'].includes(m.metric_group || '') ||
      ['ads_spent', 'ad_spend', 'roas', 'cpp', 'budget_iklan'].includes(m.metric_key)
    )
  }, [metricDefinitions])

  // ── Chart data ──────────────────────────────────────────────────────────────
  const primaryMetric = 
    tvMetrics.find(m => m.metric_group === 'revenue') || 
    tvMetrics.find(m => m.metric_key === 'revenue') ||
    tvMetrics.find(m => m.metric_group === 'user_acquisition') ||
    tvMetrics[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chartData: any[] = []
  let chartMaxTarget = 0
  let chartLabel = isAds ? "Daily Performance (Spend vs ROAS)" : "Cumulative Analytics"

  if (isAds) {
    // Specialized Ads Chart: Daily Spend (Bar) vs ROAS (Line)
    const spendDef = metricDefinitions.find(m => m.metric_group === 'ad_spend' || m.metric_key === 'ad_spend' || m.metric_key === 'ads_spent')
    const revDef = metricDefinitions.find(m => m.metric_group === 'revenue' || m.metric_key === 'revenue')

    if (spendDef) {
      // Collect Spend values
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dataMap = new Map<string, any>()
      const spendValues = (metricValues || []).filter(mv => mv.metric_definition_id === spendDef.id)
      
      spendValues.forEach(sv => {
        dataMap.set(sv.date, { 
          date: sv.date, 
          displayDate: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(sv.date)),
          spend: Number(sv.value || 0),
          revenue: 0,
          roas: 0 
        })
      })

      // Collect Revenue (Unified)
      if (revDef) {
        (metricValues || []).filter(mv => mv.metric_definition_id === revDef.id).forEach(rv => {
          if (dataMap.has(rv.date)) {
            dataMap.get(rv.date)!.revenue += Number(rv.value || 0)
          }
        })
      }

      // Collect Revenue (Legacy Fallback)
      (inputs || []).forEach(di => {
        if (dataMap.has(di.date)) {
          dataMap.get(di.date)!.revenue += Number(di.achievement_rp || 0)
        }
      })

      // Calculate ROAS
      dataMap.forEach(v => {
        if (v.spend > 0) {
          v.roas = v.revenue / v.spend
        }
      })

      chartData = Array.from(dataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    }
  } else if (primaryMetric) {
    chartLabel = `Tren Capaian ${primaryMetric.label}`
    chartMaxTarget = primaryMetric.monthly_target || 0
    
    let mValues = (metricValues || []).filter(mv => mv.metric_definition_id === primaryMetric.id)
    if (mValues.length === 0) {
      mValues = (metricValues || []).filter(mv => {
        const def = metricDefinitions.find(d => d.id === mv.metric_definition_id)
        return def?.metric_key === primaryMetric.metric_key
      })
    }

    const sortedMValues = [...mValues].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    let cumulative = 0
    chartData = sortedMValues.map((mv, i) => {
      cumulative += Number(mv.value || 0)
      const targetPerDay = chartMaxTarget / 30
      return {
        date:        mv.date,
        displayDate: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(mv.date)),
        pencapaian:  cumulative,
        targetIdeal: targetPerDay * (i + 1)
      }
    })
  } 
  
  if (chartData.length === 0 && !isAds) {
    // Legacy fallback using inputs
    const sortedInputs = [...inputs].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    let cumulativeRp = 0
    chartMaxTarget = program.monthly_target_rp || 0
    const targetPerDay = chartMaxTarget / 30
    
    chartData = sortedInputs.map((input, i) => {
      cumulativeRp += Number(input.achievement_rp || 0)
      return {
        date:        input.date,
        displayDate: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(input.date)),
        pencapaian:  cumulativeRp,
        targetIdeal: targetPerDay * (i + 1)
      }
    })
  }

  // ── Robust Unified Metric Lookup ───────────────────────────────────────────
  // Summing metrics for accuracy (in case they weren't summed in actions.ts)
  const achievementRp = program.unifiedPrimaryMetrics
    .filter(m => ['revenue', 'omzet', 'revenue_target'].includes(m.key.toLowerCase()))
    .reduce((s, m) => s + m.achieved, 0)
  
  const targetRp = program.unifiedPrimaryMetrics
    .filter(m => ['revenue', 'omzet', 'revenue_target'].includes(m.key.toLowerCase()))
    .reduce((s, m) => s + m.target, 0) || program.monthly_target_rp || 0
    
  const gapRp = Math.round(Math.max(0, targetRp - achievementRp))

  const achievementUser = program.unifiedPrimaryMetrics
    .filter(m => ['user_count', 'user_acquisition', 'closing', 'leads'].includes(m.key.toLowerCase()))
    .reduce((s, m) => s + m.achieved, 0)
    
  const targetUserTotal = program.unifiedPrimaryMetrics
    .filter(m => ['user_count', 'user_acquisition', 'closing', 'leads'].includes(m.key.toLowerCase()))
    .reduce((s, m) => s + m.target, 0) || program.monthly_target_user || 0
    
  const gapUser = Math.round(Math.max(0, targetUserTotal - achievementUser))

  const motivationalMessage =
    program.health.healthScore >= 100
      ? 'MASYAA ALLAH WOW TARGET TERLAMPAUI 🚀'
      : program.health.healthScore >= 60
        ? 'ALHAMDULILLAH TERUS BERJUANG MENUJU TARGET 🌟'
        : 'CAPAI TARGET SEKARANG DAN DAPATKAN REWARDNYA 💪'

  const statusTheme: Record<string, string> = {
    'EXCELLENT':       'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    'BAIK':            'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    'CUKUP':           'text-amber-400   border-amber-500/30  bg-amber-500/10',
    'PERLU PERHATIAN': 'text-rose-400    border-rose-500/30   bg-rose-500/10',
    'KRITIS':          'text-rose-400    border-rose-600/50   bg-rose-600/15',
  }

  // ── Format helper ───────────────────────────────────────────────────────────
  const fmtVal = (v: number) =>
    v >= 1e9 ? (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'M'
    : v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'jt'
    : v >= 1e3 ? (v / 1e3).toFixed(0) + 'rb'
    : String(v)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="h-full w-full flex flex-col text-slate-100 overflow-hidden relative"
      style={{
        background: `
          radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,150,255,0.08) 0%, transparent 70%),
          radial-gradient(ellipse 40% 40% at 90% 80%,  rgba(0,80,180,0.06)  0%, transparent 60%),
          #04090f
        `,
      }}
    >
      {/* ── Textures ── */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)' }} />
      <div className="absolute inset-0 pointer-events-none z-0" style={{ backgroundImage: 'linear-gradient(rgba(0,150,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,150,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* ── HEADER ── */}
      <header className="relative z-10 flex items-center gap-6 px-10 py-4 border-b shrink-0" style={{ borderColor: 'rgba(0,200,255,0.12)', background: 'rgba(8,15,28,0.9)' }}>
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className={cn('px-4 py-1.5 rounded-lg border text-xs font-black uppercase tracking-widest shrink-0', statusTheme[program.health.status] ?? 'text-slate-400 border-slate-700 bg-slate-800/40')}>
              {program.health.status}
            </span>
            <span className="text-xs font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/5 px-4 py-1.5 rounded-lg border border-indigo-500/20 shrink-0">
              {isHybrid ? 'Misi & Angka' : isQualitative ? 'Fokus Misi' : 'Target Kuantitas'}
            </span>
          </div>
          <h1 className="text-5xl font-black uppercase tracking-tight leading-none text-white truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            {program.name}
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] shrink-0">Kolaborasi Tim (PIC)</span>
            <div className="flex -space-x-2">
              {program.team.map((m, i) => (
                <div key={i} title={m.name} className="h-8 w-8 rounded-full bg-indigo-700 flex items-center justify-center text-[10px] font-black text-white border-2" style={{ borderColor: '#04090f', boxShadow: '0 0 10px rgba(0,212,255,0.2)', outline: '1px solid rgba(0,212,255,0.4)' }}>
                  {m.name.substring(0, 2).toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center px-8 border-x shrink-0" style={{ borderColor: 'rgba(0,200,255,0.12)' }}>
          <div className="text-3xl font-black tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#ffcc44' }}>{time || '--:--:--'}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 text-center max-w-[200px]">{dateStr}</div>
        </div>

        <div className="flex flex-col items-end shrink-0">
          <div className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em] mb-1">Yield Performance</div>
          <div className="text-7xl font-black leading-none tracking-tighter" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: isQualitative ? '#a78bfa' : '#ffffff' }}>
            {program.health.healthScore.toFixed(1)}<span className="text-3xl" style={{ color: '#64748b' }}>%</span>
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="relative z-10 flex-1 grid gap-4 px-8 py-4 overflow-hidden" style={{ gridTemplateColumns: '1fr 2.2fr 0.8fr' }}>
        {/* LEFT: Checklist */}
        <Card className="p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h3 className="text-xs font-black text-cyan-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Checklist Misi
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
            {!program.program_milestones || program.program_milestones.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-25 gap-4">
                <Target className="h-16 w-16 text-cyan-500" />
                <p className="text-sm font-bold uppercase tracking-widest text-center">Belum ada<br />Milestone terdaftar</p>
              </div>
            ) : (
              program.program_milestones.map((ms: Milestone, i: number) => (
                <div key={i} className="rounded-xl p-4 flex items-center gap-4 border" style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(0,200,255,0.08)' }}>
                  <div className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-sm font-black" style={{ background: 'rgba(0,150,255,0.1)', color: '#00d4ff', border: '1px solid rgba(0,200,255,0.2)' }}>{i + 1}</div>
                  <p className="text-base font-bold text-slate-100 leading-snug">{ms.title}</p>
                </div>
              ))
            )}
          </div>
          <div className="mt-5 pt-5 border-t shrink-0" style={{ borderColor: 'rgba(0,200,255,0.1)' }}>
            <p className="text-sm text-cyan-300/60 font-medium italic leading-relaxed border-l-2 pl-3" style={{ borderColor: 'rgba(0,180,255,0.3)' }}>
              &quot;{program.qualitative_description || 'Fokus pada pencapaian target program harian.'}&quot;
            </p>
          </div>
        </Card>

        {/* CENTER: Metrics + Chart */}
        <div className="flex flex-col gap-4 overflow-hidden min-h-0">
          {!isQualitative ? (
            <>
              {/* Metric Row */}
              <div className={`grid gap-4 shrink-0 ${hasCustomMetrics ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2'}`}>
                {program.unifiedPrimaryMetrics.length > 0 ? (
                  program.unifiedPrimaryMetrics.map(metric => {
                    const achieved = metric.achieved
                    const target = metric.target
                    const pct = target > 0 ? (achieved / target) * 100 : 0
                    
                    // Detect if this is a "lower is better" metric from definitions
                    const originalDef = metricDefinitions.find(d => d.metric_key === metric.key)
                    const isLower = originalDef?.target_direction === 'lower_is_better'

                    return (
                      <Card key={metric.key} className="p-5 flex flex-col justify-between" accentColor="#00d4ff">
                        <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-2">{metric.label}</div>
                        <div className="flex flex-col gap-0.5 w-full" style={{ containerType: 'inline-size' }}>
                          <div className="text-[min(2rem,14cqw)] font-black text-white whitespace-nowrap leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                            {formatMetricValue(achieved, metric.dataType as 'integer' | 'currency' | 'percentage' | 'float' | 'boolean', metric.unit)}
                          </div>
                          <div className="text-[10px] text-slate-500 uppercase mb-2">
                            Target: {formatMetricValue(target, metric.dataType as 'integer' | 'currency' | 'percentage' | 'float' | 'boolean', metric.unit)}
                          </div>
                        </div>
                        <ProgressBar pct={isLower ? Math.max(0, 100 - pct + 100) : pct} color="linear-gradient(90deg, #00aacc, #00d4ff)" />
                        <div className="text-[9px] text-slate-500 mt-1 flex justify-between">
                          <span>{isLower ? '↓ Lower better' : 'Progress'}</span>
                          <span className="text-cyan-400 font-bold">{pct.toFixed(1)}%</span>
                        </div>
                      </Card>
                    )
                  })
                ) : (
                  <>
                    <Card className="p-5 flex flex-col justify-between" accentColor="#00d4ff">
                      <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-2">Target Capaian (RP)</div>
                      <div className="flex flex-col gap-0.5 w-full" style={{ containerType: 'inline-size' }}>
                         <div className="text-[min(2rem,14cqw)] font-black text-white whitespace-nowrap leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{formatRupiah(achievementRp)}</div>
                         <div className="text-[10px] text-slate-500 uppercase mb-2">Budget: {formatRupiah(targetRp)}</div>
                      </div>
                      <ProgressBar pct={targetRp > 0 ? (achievementRp / targetRp) * 100 : 0} color="linear-gradient(90deg, #00aacc, #00d4ff)" />
                      <div className="text-[9px] text-slate-500 mt-1 flex justify-between">
                         <span>Omzet Realisasi</span>
                         <span className="text-cyan-400 font-bold">{targetRp > 0 ? ((achievementRp / targetRp) * 100).toFixed(1) : '0'}%</span>
                      </div>
                    </Card>
                    <Card className="p-5 flex flex-col justify-between" accentColor="#00ff9d">
                      <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">User Acquisition</div>
                      <div className="flex flex-col gap-0.5 w-full" style={{ containerType: 'inline-size' }}>
                         <div className="text-[min(2rem,14cqw)] font-black whitespace-nowrap leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#00ff9d' }}>{achievementUser.toLocaleString()}</div>
                         <div className="text-[10px] text-slate-500 uppercase mb-2">Goal: {targetUserTotal.toLocaleString()} user</div>
                      </div>
                      <ProgressBar pct={targetUserTotal > 0 ? (achievementUser / targetUserTotal) * 100 : 0} color="linear-gradient(90deg, #00cc7e, #00ff9d)" />
                      <div className="text-[9px] text-slate-500 mt-1 flex justify-between">
                         <span>Pencapaian</span>
                         <span className="text-emerald-400 font-bold">{targetUserTotal > 0 ? ((achievementUser / targetUserTotal) * 100).toFixed(1) : '0'}%</span>
                      </div>
                    </Card>
                  </>
                )}
              </div>

              {/* Chart Section */}
              <Card className="p-6 flex flex-col flex-1 min-h-0" accentColor={isAds ? "#f43f5e" : "#ffcc44"}>
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    {isAds ? <BarChart3 className="h-4 w-4 text-rose-500" /> : <TrendingUp className="h-4 w-4 text-amber-400" />}
                    {chartLabel}
                  </h3>
                  <div className="flex gap-4">
                    {isAds ? (
                      <>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><div className="h-2 w-2 rounded-sm bg-rose-500" /> SPEND</div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><div className="h-0.5 w-3 bg-cyan-400" /> ROAS</div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><div className="h-2 w-2 rounded-full bg-cyan-400" /> REALISASI</div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><div className="w-4" style={{ height: 0, borderTop: '2px dashed #475569' }} /> IDEAL</div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-1 w-full min-h-0">
                  {isAds ? (
                    <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                      <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                        <XAxis 
                          dataKey="displayDate" 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                          interval={4}
                        />
                        <YAxis 
                          yAxisId="left"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                          tickFormatter={(val) => val >= 1000000 ? `${(val/1000000).toFixed(1)}jt` : val.toLocaleString()}
                        />
                        <YAxis 
                          yAxisId="right" 
                          orientation="right" 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#22d3ee', fontSize: 10, fontWeight: 700 }}
                          tickFormatter={(val) => `${val.toFixed(1)}x`}
                        />
                        <Tooltip contentStyle={{ backgroundColor: '#0d1a2e', borderColor: 'rgba(255,100,255,0.2)', borderRadius: '12px' }} />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <Bar yAxisId="left" dataKey="spend" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} isAnimationActive={false}>
                          <LabelList dataKey="spend" position="top" content={
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (props: any) => {
                            const { x, y, width, value } = props;
                            if (!value) return null;
                            return (
                              <text x={x + width/2} y={y - 10} fill="#f43f5e" fontSize={10} fontWeight={900} textAnchor="middle">
                                {fmtVal(value)}
                              </text>
                            )
                          }} />
                        </Bar>
                        <Line yAxisId="right" type="monotone" dataKey="roas" stroke="#22d3ee" strokeWidth={3} dot={{ r: 4, fill: '#22d3ee' }} isAnimationActive={false}>
                          <LabelList dataKey="roas" position="top" content={
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (props: any) => {
                            const { x, y, value } = props;
                            if (value === undefined) return null;
                            return (
                              <text x={x} y={y - 15} fill="#22d3ee" fontSize={12} fontWeight={900} textAnchor="middle">
                                {value.toFixed(1)}x
                              </text>
                            )
                          }} />
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                      <AreaChart data={chartData} margin={{ top: 24, right: 24, left: 15, bottom: 20 }}>
                        <defs>
                          <linearGradient id="gradAchTV" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,150,255,0.06)" />
                        <XAxis 
                          dataKey="displayDate" 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                          interval={4}
                        />
                        <YAxis 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                          tickFormatter={(val) => val >= 1000000 ? `${(val/1000000).toFixed(1)}jt` : val.toLocaleString()}
                          domain={[0, (dataMax: number) => Math.max(dataMax, chartMaxTarget) * 1.1]}
                        />
                        <Tooltip contentStyle={{ backgroundColor: '#0d1a2e', borderColor: 'rgba(0,212,255,0.3)', borderRadius: '12px' }} />
                        <Area type="monotone" dataKey="pencapaian" stroke="#00d4ff" strokeWidth={4} fill="url(#gradAchTV)" isAnimationActive={false} dot={
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (props: any) => {
                          const { cx, cy, payload, index } = props;
                          const v = Number(payload.pencapaian);
                          if (!v || index % 3 !== 0) return null;
                          return (
                            <g key={index}>
                              <circle cx={cx} cy={cy} r={4} fill="#00d4ff" stroke="#04090f" strokeWidth={2} />
                              <text x={cx} y={cy - 12} fill="#dff0ff" fontSize={10} fontWeight={900} textAnchor="middle">{fmtVal(v)}</text>
                            </g>
                          )
                        }} />
                        <Area type="monotone" dataKey="targetIdeal" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} strokeDasharray="5 5" fill="transparent" isAnimationActive={false} />
                        <ReferenceLine y={chartMaxTarget} stroke="#ef4444" strokeDasharray="5 5" opacity={0.3} label={{ value: 'TARGET', position: 'insideRight', fill: '#ef4444', fontSize: 9, fontWeight: 900 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </>
          ) : (
            <Card className="flex-1 flex flex-col justify-center items-center text-center p-10">
              <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center"><CheckCircle2 className="h-80 w-80" /></div>
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.4em] mb-10">Performance Summary</h4>
              <div className="grid grid-cols-2 gap-10 w-full max-w-sm">
                <div className="flex flex-col gap-2">
                  <span className="text-9xl font-black text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{program.completedMilestones}</span>
                  <span className="text-xs font-black text-cyan-400 uppercase tracking-widest">Tugas Selesai</span>
                </div>
                <div className="flex flex-col gap-2 border-l pl-8" style={{ borderColor: 'rgba(0,200,255,0.12)' }}>
                  <span className="text-9xl font-black text-slate-700" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{program.totalMilestones}</span>
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Total Misi</span>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT: Stats + Yield */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Revenue Gap */}
          {(targetRp > 0) && (
            <Card className="p-5" accentColor="#ff4d88">
              <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Gap Revenue Target</div>
              <div className="text-4xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#ff4d88' }}>{formatRupiah(gapRp)}</div>
              <div className="text-[10px] text-slate-500 mt-1">Sisa yang perlu dikejar</div>
            </Card>
          )}

          {/* User Gap */}
          {(targetUserTotal > 0) && (
            <Card className="p-5" accentColor="#ffcc44">
              <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Gap User Target</div>
              <div className="text-4xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#ffcc44' }}>{gapUser.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 mt-1">Target total: {targetUserTotal.toLocaleString()}</div>
            </Card>
          )}

          {/* Milestones */}
          <Card className="p-5" accentColor="#00ff9d">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Misi Selesai</div>
            <div className="text-4xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#00ff9d' }}>
              {program.completedMilestones}<span className="text-xl text-slate-600"> / {program.totalMilestones}</span>
            </div>
          </Card>

          {/* Scoring Detail Card (Instead of 0 space ring) */}
          <Card className="flex-1 flex flex-col items-center justify-center p-6 bg-indigo-950/20">
             <div className="mb-4 text-center">
                <p className="text-[10px] font-black text-cyan-500 uppercase tracking-widest mb-1">Status Kinerja</p>
                <p className="text-xl font-black text-white uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{program.health.status}</p>
             </div>
             <RingProgress value={program.health.healthScore} max={100} color={program.health.healthScore >= 80 ? '#10b981' : program.health.healthScore >= 60 ? '#f59e0b' : '#f43f5e'} size={150} />
          </Card>
        </div>
      </main>

      {/* FOOTER CTA */}
      <footer className="relative z-10 flex items-center justify-center px-8 py-5 border-t shrink-0" style={{ borderColor: 'rgba(255,77,136,0.15)', background: 'linear-gradient(90deg, rgba(120,0,60,0.15), rgba(60,0,120,0.2), rgba(120,0,60,0.15))' }}>
        <p className="text-4xl font-black uppercase tracking-[0.15em] text-center" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#ff4d88' }}>{motivationalMessage}</p>
      </footer>
    </div>
  )
}
