'use client'

import { useState, useEffect } from 'react'
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
  ReferenceLine
} from 'recharts'
import { CheckCircle2, ClipboardList, Target, TrendingUp } from 'lucide-react'

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
        style={{ transition: 'stroke-dasharray 1.5s ease' }}
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
        className="h-full rounded-full transition-all duration-1000"
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

  // ── Chart data ──────────────────────────────────────────────────────────────
  const sortedInputs = [...inputs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  let cumulativeRp = 0
  const chartData = sortedInputs.map(input => {
    cumulativeRp += Number(input.achievement_rp || 0)
    return {
      date:        input.date,
      displayDate: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(input.date)),
      pencapaian:  cumulativeRp,
    }
  })

  const targetPerDay     = (program.monthly_target_rp || 0) / 30
  const chartDataWithTarget = chartData.map((d, i) => ({
    ...d,
    targetIdeal: targetPerDay * (i + 1),
  }))

  // ── Derived values ──────────────────────────────────────────────────────────
  const isQualitative = program.target_type === 'qualitative'
  const isHybrid      = program.target_type === 'hybrid'

  // Custom metrics for TV display
  const tvMetrics = metricDefinitions
    .filter(m => m.is_target_metric && m.show_on_tv)
    .sort((a, b) => a.display_order - b.display_order)
  const hasCustomMetrics = tvMetrics.length > 0

  const capPct  = Math.min(((program.achievementRp || 0)   / (program.monthly_target_rp   || 1)) * 100, 100)
  const userPct = Math.min(((program.achievementUser || 0) / (program.monthly_target_user || 1)) * 100, 100)
  const gapRp   = Math.max(0, (program.monthly_target_rp   || 0) - program.achievementRp)
  const gapUser = Math.max(0, (program.monthly_target_user || 0) - program.achievementUser)

  const motivationalMessage =
    program.percentageRp >= 100
      ? 'MASYAA ALLAH WOW TARGET TERLAMPAUI 🚀'
      : program.percentageRp >= 50
        ? 'ALHAMDULILLAH TERUS BERJUANG MENUJU TARGET 🌟'
        : 'CAPAI TARGET SEKARANG DAN DAPATKAN REWARDNYA 💪'

  const statusTheme: Record<string, string> = {
    'TERCAPAI':       'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    'MENUJU TARGET':  'text-amber-400   border-amber-500/30  bg-amber-500/10',
    'PERLU PERHATIAN':'text-rose-400    border-rose-500/30   bg-rose-500/10',
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
      {/* ── Scanline texture ── */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
        }}
      />
      {/* ── Grid bg ── */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,150,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,150,255,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* ════════════════════════════════════════════════════════════════
          HEADER
      ════════════════════════════════════════════════════════════════ */}
      <header
        className="relative z-10 flex items-center gap-6 px-10 py-4 border-b shrink-0"
        style={{ borderColor: 'rgba(0,200,255,0.12)', background: 'rgba(8,15,28,0.9)' }}
      >
        {/* Left: badges + title + PIC */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'px-4 py-1.5 rounded-lg border text-xs font-black uppercase tracking-widest shrink-0',
                statusTheme[program.status] ?? 'text-slate-400 border-slate-700 bg-slate-800/40'
              )}
            >
              {program.status}
            </span>
            <span className="text-xs font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/5 px-4 py-1.5 rounded-lg border border-indigo-500/20 shrink-0">
              {isHybrid ? 'Misi & Angka' : isQualitative ? 'Fokus Misi' : 'Target Kuantitas'}
            </span>
          </div>

          <h1
            className="text-5xl font-black uppercase tracking-tight leading-none text-white truncate"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            {program.name}
          </h1>

          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] shrink-0">
              Kolaborasi Tim (PIC)
            </span>
            <div className="flex -space-x-2">
              {program.team.map((m, i) => (
                <div
                  key={i}
                  title={m.name}
                  className="h-8 w-8 rounded-full bg-indigo-700 flex items-center justify-center text-[10px] font-black text-white border-2"
                  style={{
                    borderColor: '#04090f',
                    boxShadow: '0 0 10px rgba(0,212,255,0.2)',
                    outline: '1px solid rgba(0,212,255,0.4)',
                  }}
                >
                  {m.name.substring(0, 2).toUpperCase()}
                </div>
              ))}
            </div>
            <span className="text-sm font-bold text-slate-200 uppercase truncate max-w-xs">
              {program.team.map(m => m.name).join(' • ')}
            </span>
          </div>
        </div>

        {/* Center: live clock */}
        <div
          className="flex flex-col items-center px-8 border-x shrink-0"
          style={{ borderColor: 'rgba(0,200,255,0.12)' }}
        >
          <div
            className="text-3xl font-black tracking-wider"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#ffcc44' }}
          >
            {time || '--:--:--'}
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 text-center max-w-[200px]">
            {dateStr}
          </div>
        </div>

        {/* Right: yield % */}
        <div className="flex flex-col items-end shrink-0">
          <div className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em] mb-1">
            Yield Performance
          </div>
          <div
            className="text-7xl font-black leading-none tracking-tighter"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              color: isQualitative ? '#a78bfa' : '#ffffff',
            }}
          >
            {isQualitative
              ? program.qualitativePercentage.toFixed(0)
              : program.percentageRp.toFixed(1)}
            <span className="text-3xl" style={{ color: isQualitative ? '#7c3aed' : '#64748b' }}>%</span>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════
          MAIN
      ════════════════════════════════════════════════════════════════ */}
      <main
        className="relative z-10 flex-1 grid gap-4 px-8 py-4 overflow-hidden"
        style={{ gridTemplateColumns: '1fr 1.8fr 1fr' }}
      >
        {/* ── LEFT: Checklist Misi ─────────────────────────────────── */}
        <Card className="p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h3 className="text-xs font-black text-cyan-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Checklist Misi
            </h3>
            <span className="text-[10px] text-slate-500 italic">Unique & Persistent</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
            {program.program_milestones.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-25 gap-4">
                <Target className="h-16 w-16 text-cyan-500" />
                <p className="text-sm font-bold uppercase tracking-widest text-center">
                  Belum ada<br />Milestone terdaftar
                </p>
              </div>
            ) : (
              program.program_milestones.map((ms: Milestone, i: number) => (
                <div
                  key={i}
                  className="rounded-xl p-4 flex items-center gap-4 border"
                  style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(0,200,255,0.08)' }}
                >
                  <div
                    className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-sm font-black"
                    style={{
                      background: 'rgba(0,150,255,0.1)',
                      color: '#00d4ff',
                      border: '1px solid rgba(0,200,255,0.2)',
                    }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-base font-bold text-slate-100 leading-snug">{ms.title}</p>
                </div>
              ))
            )}
          </div>

          <div
            className="mt-5 pt-5 border-t shrink-0"
            style={{ borderColor: 'rgba(0,200,255,0.1)' }}
          >
            <p
              className="text-sm text-cyan-300/60 font-medium italic leading-relaxed border-l-2 pl-3"
              style={{ borderColor: 'rgba(0,180,255,0.3)' }}
            >
              &quot;{program.qualitative_description || 'Fokus pada pencapaian target program harian.'}&quot;
            </p>
          </div>
        </Card>

        {/* ── CENTER ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 overflow-hidden min-h-0">
          {!isQualitative ? (
            <>
              {/* Metric cards — custom or legacy */}
              <div className={`grid gap-4 shrink-0 ${tvMetrics.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {hasCustomMetrics ? (
                  tvMetrics.map(metric => {
                    const vals = metricValues.filter(mv => mv.metric_definition_id === metric.id)
                    const achieved = vals.reduce((sum, mv) => sum + Number(mv.value || 0), 0)
                    const target = Number(metric.monthly_target || 0)
                    const pct = target > 0 ? Math.min((achieved / target) * 100, 100) : 0
                    const isLower = metric.target_direction === 'lower_is_better'

                    return (
                      <Card key={metric.id} className="p-5" accentColor="#00d4ff">
                        <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-3">
                          {metric.label}
                        </div>
                        <div
                          className="text-3xl font-black text-white mb-1"
                          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                        >
                          {metric.data_type === 'currency'
                            ? formatRupiah(achieved)
                            : formatMetricValue(achieved, metric.data_type, metric.unit_label)}
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase mb-3">
                          Target: {metric.data_type === 'currency'
                            ? formatRupiah(target)
                            : formatMetricValue(target, metric.data_type, metric.unit_label)}
                        </div>
                        <ProgressBar
                          pct={isLower ? Math.max(0, 100 - pct + 100) : pct}
                          color="linear-gradient(90deg, #00aacc, #00d4ff)"
                        />
                        <div className="text-[10px] text-slate-500 mt-1.5">
                          {isLower ? '↓ Lower better' : 'Pencapaian'}:{' '}
                          <span className="text-cyan-400 font-bold">{pct.toFixed(1)}%</span>
                        </div>
                      </Card>
                    )
                  })
                ) : (
                  <>
                    {/* Legacy Capital */}
                    <Card className="p-5" accentColor="#00d4ff">
                      <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-3">
                        Target Capital (RP)
                      </div>
                      <div
                        className="text-3xl font-black text-white mb-1"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        {formatRupiah(program.achievementRp)}
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase mb-3">
                        Budget: {formatRupiah(program.monthly_target_rp || 0)}
                      </div>
                      <ProgressBar pct={capPct} color="linear-gradient(90deg, #00aacc, #00d4ff)" />
                      <div className="text-[10px] text-slate-500 mt-1.5">
                        Pencapaian:{' '}
                        <span className="text-cyan-400 font-bold">{capPct.toFixed(1)}%</span>
                      </div>
                    </Card>

                    {/* Legacy Users */}
                    <Card className="p-5" accentColor="#00ff9d">
                      <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3">
                        User Density
                      </div>
                      <div
                        className="text-3xl font-black mb-1"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#00ff9d' }}
                      >
                        {program.achievementUser.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase mb-3">
                        Goal: {(program.monthly_target_user || 0).toLocaleString()} peserta
                      </div>
                      <ProgressBar pct={userPct} color="linear-gradient(90deg, #00cc7e, #00ff9d)" />
                      <div className="text-[10px] text-slate-500 mt-1.5">
                        Pencapaian:{' '}
                        <span className="text-emerald-400 font-bold">{userPct.toFixed(1)}%</span>
                      </div>
                    </Card>
                  </>
                )}
              </div>

              {/* Trend chart */}
              <Card className="p-6 flex flex-col flex-1 min-h-0" accentColor="#ffcc44">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-amber-400" />
                    Cumulative Analytics
                  </h3>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                      <div className="h-2 w-2 rounded-full bg-cyan-400" />
                      REALISASI
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                      <div
                        className="w-4"
                        style={{ height: 0, borderTop: '2px dashed #475569' }}
                      />
                      IDEAL
                    </div>
                  </div>
                </div>

                <div className="flex-1 w-full min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartDataWithTarget}
                      margin={{ top: 24, right: 20, left: 10, bottom: 10 }}
                    >
                      <defs>
                        <linearGradient id="gradAchTV" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#00d4ff" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="rgba(0,150,255,0.06)"
                      />
                      <XAxis dataKey="displayDate" hide />
                      <YAxis
                        hide
                        domain={[0, (dataMax: number) =>
                          Math.max(dataMax, program.monthly_target_rp || 0)
                        ]}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0d1a2e',
                          borderColor: 'rgba(0,212,255,0.3)',
                          borderRadius: '12px',
                        }}
                        itemStyle={{ color: '#dff0ff', fontWeight: 700 }}
                        labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
                      />

                      {/* Realisasi */}
                      <Area
                        type="monotone"
                        dataKey="pencapaian"
                        stroke="#00d4ff"
                        strokeWidth={4}
                        fill="url(#gradAchTV)"
                        isAnimationActive={false}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        dot={(props: any) => {
                          const { cx, cy, payload, index } = props
                          const v = Number(payload.pencapaian)
                          if (!v) return (
                            <circle key={index} cx={cx} cy={cy} r={3}
                              fill="#00d4ff" stroke="#04090f" strokeWidth={1} />
                          )
                          return (
                            <g key={index}>
                              <circle cx={cx} cy={cy} r={5}
                                fill="#00d4ff" stroke="#04090f" strokeWidth={2} />
                              <text x={cx} y={cy - 12} fill="#dff0ff"
                                fontSize={11} fontWeight={900} textAnchor="middle">
                                {fmtVal(v)}
                              </text>
                            </g>
                          )
                        }}
                        activeDot={{ r: 7, fill: '#00d4ff' }}
                      />

                      {/* Target ideal */}
                      <Area
                        type="monotone"
                        dataKey="targetIdeal"
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        fill="transparent"
                        isAnimationActive={false}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        dot={(props: any) => {
                          const { cx, cy, payload, index } = props
                          const v = Number(payload.targetIdeal)
                          if (!v) return (
                            <circle key={index} cx={cx} cy={cy} r={2}
                              fill="#475569" opacity={0.5} />
                          )
                          return (
                            <g key={`t-${index}`}>
                              <text x={cx} y={cy + 18} fill="#64748b"
                                fontSize={10} fontWeight={700} textAnchor="middle">
                                {fmtVal(v)}
                              </text>
                            </g>
                          )
                        }}
                      />

                      <ReferenceLine
                        y={program.monthly_target_rp || 0}
                        stroke="#ef4444"
                        strokeDasharray="5 5"
                        opacity={0.35}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          ) : (
            /* Qualitative: performance summary */
            <Card className="flex-1 flex flex-col justify-center items-center text-center p-10">
              <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
                <CheckCircle2 className="h-80 w-80" />
              </div>
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.4em] mb-10">
                Performance Summary
              </h4>
              <div className="grid grid-cols-2 gap-10 w-full max-w-xs">
                <div className="flex flex-col gap-2">
                  <span
                    className="text-8xl font-black text-white"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    {program.completedMilestones}
                  </span>
                  <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                    Tugas Selesai
                  </span>
                </div>
                <div
                  className="flex flex-col gap-2 border-l pl-4"
                  style={{ borderColor: 'rgba(0,200,255,0.12)' }}
                >
                  <span
                    className="text-8xl font-black text-slate-700"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    {program.totalMilestones}
                  </span>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Total Misi
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* ── RIGHT: Stats + Ring ──────────────────────────────────── */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Gap Capital */}
          <Card className="p-5 shrink-0" accentColor="#ff4d88">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
              Gap Target Capital
            </div>
            <div
              className="text-3xl font-black"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#ff4d88' }}
            >
              {formatRupiah(gapRp)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Sisa yang perlu dicapai</div>
          </Card>

          {/* Gap Peserta */}
          <Card className="p-5 shrink-0" accentColor="#ffcc44">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
              Gap Peserta
            </div>
            <div
              className="text-3xl font-black"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#ffcc44' }}
            >
              {gapUser.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Lagi menuju goal {(program.monthly_target_user || 0).toLocaleString()}
            </div>
          </Card>

          {/* Milestone counter */}
          <Card className="p-5 shrink-0" accentColor="#00ff9d">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
              Misi Selesai
            </div>
            <div
              className="text-3xl font-black"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#00ff9d' }}
            >
              {program.completedMilestones}
              <span className="text-xl text-slate-600"> / {program.totalMilestones}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Milestone tercapai</div>
          </Card>

          {/* Ring progress */}
          <Card className="flex-1 flex flex-col items-center justify-center gap-3 min-h-0">
            <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">
              Progress Keseluruhan
            </div>
            <RingProgress
              value={isQualitative ? program.qualitativePercentage : program.percentageRp}
              max={100}
              color={isQualitative ? '#a78bfa' : '#00d4ff'}
              size={140}
            />
          </Card>
        </div>
      </main>

      {/* ════════════════════════════════════════════════════════════════
          FOOTER CTA
      ════════════════════════════════════════════════════════════════ */}
      <footer
        className="relative z-10 flex items-center justify-center px-8 py-4 border-t shrink-0"
        style={{
          borderColor: 'rgba(255,77,136,0.2)',
          background:
            'linear-gradient(90deg, rgba(120,0,60,0.25), rgba(60,0,120,0.3), rgba(120,0,60,0.25))',
        }}
      >
        <p
          className="text-3xl font-black uppercase tracking-widest text-center"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#ff4d88' }}
        >
          {motivationalMessage}
        </p>
      </footer>
    </div>
  )
}
