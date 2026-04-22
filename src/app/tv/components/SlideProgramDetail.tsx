'use client'

import { useState, useEffect, useMemo } from 'react'
import { ProgramPerformance, DailyInput, Milestone, Period, MetricDefinition, MetricValue } from '../actions'
import { formatRupiah, cn } from '@/lib/utils'
import { formatMetricValue } from '@/lib/formula-evaluator'
import { getBannerInfo } from '@/lib/dashboard-calculator'
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Bar, 
  ComposedChart, 
  Line,
  ReferenceLine
} from 'recharts'
import { CheckCircle2, ClipboardList, Target, TrendingUp, Users, Building2 } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface SlideProgramDetailProps {
  program: ProgramPerformance
  period: Period | null
  inputs: DailyInput[]
  metricDefinitions: MetricDefinition[]
  metricValues: MetricValue[]
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
  const radius = size * 0.4
  const stroke = size * 0.08
  const normalizedRadius = radius - stroke * 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDashoffset = circumference - (Math.min(value, max) / max) * circumference

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg height={size} width={size} className="transform -rotate-90">
        <circle
          stroke="rgba(255,255,255,0.05)"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.3s ease-out' }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-black text-white leading-none">{value.toFixed(0)}%</span>
      </div>
    </div>
  )
}

// ── Simple Progress Bar ───────────────────────────────────────────────────────
function ProgressBar({ pct, color = '#00d4ff' }: { pct: number, color?: string }) {
  return (
    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mt-auto">
      <div 
        className="h-full rounded-full transition-all duration-300 ease-out"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
      />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function SlideProgramDetail({ 
  program, 
  period, 
  inputs, 
  metricDefinitions,
  metricValues
}: SlideProgramDetailProps) {
  const [time, setTime]       = useState('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('id-ID', { hour12: false }))
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // Identify metrics
  const hasCustomMetrics = program.unifiedPrimaryMetrics.length > 0
  const isQualitative = program.health.isQualitativeOnly
  const isMoU = (program.target_type as string) === 'mou'

  // Build defId → metricKey map for this program
  const defIdToKeyMap = useMemo(() => {
    const map = new Map<string, string>()
    metricDefinitions.forEach(d => map.set(d.id, d.metric_key))
    return map
  }, [metricDefinitions])

  // Daily processing for chart
  const dailyPoints = useMemo(() => {
    // ── MoU: use custom metric values (mou_signed / agreement_leads) ──
    if (isMoU) {
      const signedDef = metricDefinitions.find(d =>
        d.metric_key === 'mou_signed' || d.metric_key === 'user_count' || d.metric_key === 'user_acquisition'
      )
      const leadsDef = metricDefinitions.find(d =>
        d.metric_key === 'agreement_leads' || d.metric_key === 'leads'
      )

      // Group by date
      const dateMap = new Map<string, { signed: number; leads: number }>()
      metricValues.forEach(mv => {
        const key = defIdToKeyMap.get(mv.metric_definition_id)
        if (!key) return
        const val = Number(mv.value || 0)
        const existing = dateMap.get(mv.date) || { signed: 0, leads: 0 }
        if (signedDef && mv.metric_definition_id === signedDef.id) existing.signed += val
        if (leadsDef && mv.metric_definition_id === leadsDef.id) existing.leads += val
        dateMap.set(mv.date, existing)
      })

      const sorted = Array.from(dateMap.entries()).sort(([a], [b]) => a.localeCompare(b))
      let cumSigned = 0
      let cumLeads = 0
      return sorted.map(([date, vals]) => {
        cumSigned += vals.signed
        cumLeads += vals.leads
        return {
          date,
          displayDate: new Date(date).getDate().toString(),
          rp: vals.leads,        // reuse 'rp' slot for leads (bar)
          user: vals.signed,     // reuse 'user' slot for signed (line)
          cumRp: cumLeads,
          cumUser: cumSigned,
        }
      })
    }

    // ── Legacy: use daily_inputs ──────────────────────────────────────
    const sortedInputs = [...inputs].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    let cumRp = 0
    let cumUser = 0
    return sortedInputs.map(input => {
      cumRp += Number(input.achievement_rp || 0)
      cumUser += Number(input.achievement_user || 0)
      return {
        date: input.date,
        displayDate: new Date(input.date || '').getDate().toString(),
        rp: Number(input.achievement_rp || 0),
        user: Number(input.achievement_user || 0),
        cumRp,
        cumUser,
      }
    })
  }, [isMoU, inputs, metricValues, metricDefinitions, defIdToKeyMap])

  // Target calculations
  const targetRp = Number(program.monthly_target_rp || 0)
  const targetUser = Number(program.monthly_target_user || 0)
  const dailyTargetRp = targetRp / (period?.working_days || 30)
  
  const achievementRp = dailyPoints.length > 0 ? dailyPoints[dailyPoints.length - 1].cumRp : 0
  const achievementUser = dailyPoints.length > 0 ? dailyPoints[dailyPoints.length - 1].cumUser : 0

  return (
    <div className="h-full w-full bg-[#020617] text-slate-100 flex flex-col relative overflow-hidden">
      {/* ── HEADER ── */}
      <header className="h-[120px] shrink-0 border-b border-indigo-500/20 bg-slate-900/40 backdrop-blur-md px-10 flex items-center justify-between relative z-20">
        <div className="flex items-center gap-6">
          <div className="h-16 w-16 bg-indigo-500/10 rounded-2xl border border-indigo-500/30 flex items-center justify-center">
            {isMoU ? <Building2 className="text-indigo-400 h-8 w-8" /> : <Target className="text-indigo-400 h-8 w-8" />}
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
               <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                 {isMoU ? 'MoU / Partnership' : isQualitative ? 'Kualitatif' : 'Performance'}
               </span>
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Live Data Monitoring</span>
            </div>
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {program.name}
            </h2>
          </div>
        </div>

        <div className="flex flex-col items-center px-8 border-x shrink-0" style={{ borderColor: 'rgba(0,200,255,0.12)' }}>
          <div className="text-3xl font-black tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#ffcc44' }}>{time || '--:--:--'}</div>
          <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mt-1">
             Bulan {period ? new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2024, period.month - 1, 1)) : '-'} Tahun {period?.year || ''}
          </p>
        </div>

        <div className="flex flex-col items-end shrink-0">
          <div className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em] mb-1">
            {isMoU ? 'Partnership Health' : 'Yield Performance'}
          </div>
          <div className="text-7xl font-black leading-none tracking-tighter" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: isQualitative || isMoU ? '#a78bfa' : '#ffffff' }}>
            {program.health.healthScore.toFixed(1)}<span className="text-3xl" style={{ color: '#64748b' }}>%</span>
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="relative z-10 flex-1 grid gap-4 px-8 py-4 overflow-hidden" style={{ gridTemplateColumns: '1fr 2.2fr 0.8fr' }}>
        {/* LEFT: Checklist */}
        <Card className="p-6 flex flex-col bg-slate-900/40 border-slate-800">
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
              program.program_milestones.map((ms: Milestone, i: number) => {
                const isCompleted = program.completedMilestones > i // Temporary visual proxy for list
                return (
                  <div key={i} className="rounded-xl p-4 flex items-center gap-4 border" style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(0,200,255,0.08)' }}>
                    <div className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-sm font-black" style={{ background: isCompleted ? 'rgba(16,185,129,0.1)' : 'rgba(0,150,255,0.1)', color: isCompleted ? '#10b981' : '#00d4ff', border: '1px solid currentColor' }}>
                      {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <p className={cn("text-base font-bold leading-snug", isCompleted ? "text-slate-400 line-through" : "text-slate-100")}>{ms.title}</p>
                  </div>
                )
              })
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
          {/* Motivational Banner */}
          {(() => {
            const banner = getBannerInfo(program.health.healthScore)
            return (
              <div className={cn(
                "px-6 py-3 rounded-xl border flex items-center gap-4 shrink-0 transition-all duration-1000 animate-in fade-in slide-in-from-top-4",
                banner.bg,
                banner.border
              )}>
                <div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: banner.accent }} />
                <p className={cn("text-lg font-black uppercase tracking-tight italic", banner.textCol)}>
                  {banner.text}
                </p>
              </div>
            )
          })()}

          {(!isQualitative && !isMoU) || (isMoU && hasCustomMetrics) ? (
            <>
              {/* Metric Row */}
              <div className={cn(
                "grid gap-4 shrink-0",
                program.unifiedPrimaryMetrics.length <= 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"
              )}>
                {hasCustomMetrics ? (
                  program.unifiedPrimaryMetrics.map(metric => {
                    const achieved = metric.achieved
                    const target = metric.target
                    const pct = target > 0 ? (achieved / target) * 100 : 0
                    const originalDef = metricDefinitions.find(d => d.metric_key === metric.key)
                    const isLower = originalDef?.target_direction === 'lower_is_better'

                    // Dynamic colors based on metric type
                    const k = metric.key.toLowerCase()
                    const isRev = k.includes('revenue') || k.includes('omzet') || k.includes('pemasukan')
                    const isLeads = k.includes('lead') || k.includes('prospek')
                    const isUser = k.includes('user') || k.includes('signed') || k.includes('acquisition') || k.includes('closing')
                    const isConv = k.includes('rate') || k.includes('conversion')

                    const accentClass = isRev ? "text-cyan-400" : 
                                       isLeads ? "text-amber-400" : 
                                       isUser ? "text-purple-400" : 
                                       isConv ? "text-emerald-400" : "text-indigo-400"

                    const borderClass = isRev ? "border-cyan-500/20" : 
                                        isLeads ? "border-amber-500/20" : 
                                        isUser ? "border-purple-500/20" : 
                                        isConv ? "border-emerald-500/20" : "border-indigo-500/20"

                    const progressColor = isRev ? "#22d3ee" : 
                                          isLeads ? "#fbbf24" : 
                                          isUser ? "#a78bfa" : 
                                          isConv ? "#10b981" : "#818cf8"

                    return (
                      <Card key={metric.key} className={cn("p-5 flex flex-col justify-between bg-slate-900", borderClass)}>
                        <div className={cn("text-[10px] font-black uppercase tracking-widest mb-2", accentClass)}>{metric.label}</div>
                        <div className="flex flex-col gap-0.5 w-full" style={{ containerType: 'inline-size' }}>
                          <div className="text-[min(2rem,14cqw)] font-black text-white whitespace-nowrap leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {formatMetricValue(achieved, metric.dataType as any, metric.unit)}
                          </div>
                          {target > 0 && (
                            <div className="text-[10px] text-slate-500 uppercase mb-2">
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              Target: {formatMetricValue(target, metric.dataType as any, metric.unit)}
                            </div>
                          )}
                        </div>
                        {target > 0 && <ProgressBar pct={isLower ? Math.max(0, 100 - pct + 100) : pct} color={progressColor} />}
                        {target > 0 && (
                          <div className="text-[9px] text-slate-500 mt-1 flex justify-between">
                            <span>{isLower ? '↓ Lower better' : 'Progress'}</span>
                            <span className={cn("font-bold", accentClass)}>{pct.toFixed(1)}%</span>
                          </div>
                        )}
                      </Card>
                    )
                  })
                ) : (
                  <>
                    <Card className="p-5 flex flex-col justify-between border-indigo-500/20 bg-slate-900/50">
                      <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-2">
                        {isMoU ? 'Total Prospek' : 'Target Capaian (RP)'}
                      </div>
                      <div className="flex flex-col gap-0.5 w-full" style={{ containerType: 'inline-size' }}>
                         <div className="text-[min(2rem,14cqw)] font-black text-white whitespace-nowrap leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                           {isMoU ? achievementRp : formatRupiah(achievementRp)}
                         </div>
                         {targetRp > 0 && (
                           <div className="text-[10px] text-slate-500 uppercase mb-2">
                             {isMoU ? 'Goal' : 'Budget'}: {isMoU ? targetRp : formatRupiah(targetRp)}
                           </div>
                         )}
                      </div>
                      {targetRp > 0 && <ProgressBar pct={(achievementRp / targetRp) * 100} />}
                    </Card>
                    <Card className="p-5 flex flex-col justify-between border-purple-500/20 bg-slate-900/50">
                      <div className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2">
                        {isMoU ? 'Tanda Tangan MoU' : 'Target User'}
                      </div>
                      <div className="flex flex-col gap-0.5 w-full" style={{ containerType: 'inline-size' }}>
                         <div className="text-[min(2rem,14cqw)] font-black text-white whitespace-nowrap leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                           {achievementUser} <small className="text-xs">{isMoU ? 'MOU' : 'User'}</small>
                         </div>
                         {targetUser > 0 && <div className="text-[10px] text-slate-500 uppercase mb-2">Goal: {targetUser} {isMoU ? 'MOU' : 'User'}</div>}
                      </div>
                      {targetUser > 0 && <ProgressBar pct={(achievementUser / targetUser) * 100} color="#a78bfa" />}
                    </Card>
                  </>
                )}
              </div>

              {/* Central Chart */}
              <Card className="flex-1 p-6 flex flex-col bg-slate-900 overflow-hidden">
                    <div className="flex items-center gap-4">
                       <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <TrendingUp className="text-emerald-400 h-5 w-5" />
                       </div>
                       <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest">Tren Performa Harian</h3>
                    </div>
                    <div className="flex items-center gap-6">
                       <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#639922' }} />
                          <span className="text-[10px] font-bold text-slate-400 uppercase">{isMoU ? 'Prospek' : 'Omzet'}</span>
                       </div>
                       <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#378ADD' }} />
                          <span className="text-[10px] font-bold text-slate-400 uppercase">{isMoU ? 'Tanda Tangan' : 'User'}</span>
                       </div>
                       {!isMoU && dailyTargetRp > 0 && (
                         <div className="flex items-center gap-2">
                            <div className="w-3 h-1 rounded-full border-t border-dashed" style={{ borderColor: 'rgba(16, 185, 129, 0.6)' }} />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Target</span>
                         </div>
                       )}
                    </div>

                 <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                       <ComposedChart data={dailyPoints}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis 
                             dataKey="displayDate" 
                             axisLine={false} 
                             tickLine={false} 
                             tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                             dy={10}
                          />
                          <YAxis 
                             yAxisId="left"
                             axisLine={false} 
                             tickLine={false} 
                             tick={{ fill: '#64748b', fontSize: 10 }}
                             tickFormatter={(val) => isMoU ? Math.round(val).toString() : val >= 1000000 ? `Rp${(val/1000000).toFixed(1)}jt` : `Rp${(val/1000).toFixed(0)}rb`}
                             domain={[0, 'auto']}
                          />
                          <YAxis 
                             yAxisId="right"
                             orientation="right"
                             axisLine={false} 
                             tickLine={false} 
                             tick={{ fill: '#378ADD', fontSize: 10, fontWeight: 700 }}
                             domain={[0, 'auto']}
                          />
                          <Tooltip 
                             isAnimationActive={false}
                             contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                             itemStyle={{ fontSize: '12px', fontWeight: 900 }}
                             formatter={(v: string | number | readonly (string | number)[] | undefined, name: string | number | undefined): [string | number, string | number] => {
                               const val = Array.isArray(v) ? v[0] : v
                               const n = String(name || '')
                               if (isMoU) return [String(Math.round(Number(val || 0))), n]
                                if (n === 'Omzet') return [formatRupiah(Number(val || 0)), 'Omzet']
                               return [String(val ?? ''), n]
                             }}
                          />
                          <Bar 
                             yAxisId="left" 
                             dataKey="rp" 
                             name={isMoU ? 'Prospek' : 'Omzet'}
                             fill="#639922" 
                             radius={[4, 4, 0, 0]} 
                             isAnimationActive={false}
                          />
                          <Line 
                             yAxisId="right" 
                             type="monotone" 
                             dataKey="user" 
                             name={isMoU ? 'Tanda Tangan' : 'User'}
                             stroke="#378ADD" 
                             strokeWidth={4} 
                             dot={{ r: 4, fill: '#378ADD', strokeWidth: 2, stroke: '#020617' }}
                             isAnimationActive={false}
                             className="drop-shadow-[0_0_8px_rgba(55,138,221,0.4)]"
                          />
                          {!isMoU && dailyTargetRp > 0 && (
                             <ReferenceLine 
                                yAxisId="left"
                                y={dailyTargetRp} 
                                stroke="rgba(16, 185, 129, 0.4)" 
                                strokeDasharray="5 5"
                                label={{ value: 'Target Harian', position: 'insideBottomRight', fill: 'rgba(16, 185, 129, 0.6)', fontSize: 9, fontWeight: 900, dy: -5 }}
                             />
                          )}
                       </ComposedChart>
                    </ResponsiveContainer>
                 </div>
              </Card>
            </>
          ) : (
            /* Qualitative / MoU empty stats view */
            <div className="flex-1 flex flex-col gap-4">
               <Card className="flex-1 flex flex-col items-center justify-center bg-slate-900 border-indigo-500/20 opacity-50">
                  <TrendingUp className="h-16 w-16 text-indigo-500 mb-4" />
                  <p className="text-lg font-black uppercase tracking-widest text-center">
                    {isMoU ? 'Partnership in Progress' : 'Kualitatif Program'}
                  </p>
                  <p className="text-sm text-slate-500">Memonitor progres berdasarkan milestone</p>
               </Card>
            </div>
          )}
        </div>

        {/* RIGHT: Status & Team */}
        <div className="flex flex-col gap-4 overflow-hidden">
          <Card className="p-6 bg-slate-900 border-indigo-500/10 flex flex-col items-center shrink-0">
             <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Milestone Progress</div>
             <RingProgress value={program.health.isQualitativeOnly ? program.health.healthScore : program.qualitativePercentage} size={160} color={program.health.status === 'KRITIS' ? '#f43f5e' : '#a78bfa'} />
             <div className="mt-4 text-center">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {program.completedMilestones} of {program.totalMilestones}
                </div>
                <div className="text-[10px] text-slate-600 uppercase mt-1">Milestones Done</div>
             </div>
          </Card>

          <Card className="flex-1 p-6 bg-slate-900 border-indigo-500/10 flex flex-col">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Users className="h-3 w-3" /> Tim Pelaksana
            </h3>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
               {program.team && program.team.length > 0 ? (
                 program.team.map((pic, i) => (
                   <div key={i} className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-slate-950 flex items-center justify-center text-indigo-400 font-bold border border-slate-800">
                        {pic.name.charAt(0)}
                      </div>
                      <div>
                         <div className="text-sm font-black text-slate-100">{pic.name}</div>
                         <div className="text-[10px] text-indigo-400 uppercase font-bold tracking-widest">PIC Program</div>
                      </div>
                   </div>
                 ))
               ) : (
                 <p className="text-xs text-slate-600 italic">Tidak ada PIC terdaftar</p>
               )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
