'use client'

import { useMemo } from 'react'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, AreaChart, Area, Bar
} from 'recharts'
import { 
  Target, 
  TrendingUp, 
  BarChart3, 
  CheckCircle,
  ClipboardList
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMetricValue } from '@/lib/formula-evaluator'
import { ProgramWithRelations, ProgramHealthResult } from '@/lib/dashboard-calculator'
import { MetricValue, DailyInput } from '@/app/(dashboard)/dashboard/actions'

interface ProgramDetailViewProps {
  program: ProgramWithRelations
  health: ProgramHealthResult
  metricValues: MetricValue[]
  dailyInputs: DailyInput[]
}

export function ProgramDetailView({ program, health, metricValues, dailyInputs }: ProgramDetailViewProps) {
  const metricDefs = useMemo(() => program.program_metric_definitions || [], [program.program_metric_definitions])

  const isAds = useMemo(() => {
    return metricDefs.some(m => 
      ['ad_spend', 'ads_spent', 'roas', 'cpp'].includes(m.metric_group || '') ||
      ['ads_spent', 'ad_spend', 'roas', 'cpp', 'budget_iklan'].includes(m.metric_key)
    )
  }, [metricDefs])

  const milestones = program.program_milestones || []
  const evaluatedMetrics = health.calculatedMetrics || {}

  // ── Charts Data ──
  const chartData = useMemo(() => {
    if (isAds) {
      const spendDef = metricDefs.find(m => m.metric_group === 'ad_spend' || m.metric_key === 'ad_spend' || m.metric_key === 'ads_spent')
      const revDef = metricDefs.find(m => m.metric_group === 'revenue' || m.metric_key === 'revenue')
      
      if (!spendDef) return []
      
      const dataMap = new Map<string, {
        date: string;
        displayDate: string;
        spend: number;
        revenue: number;
        roas: number;
      }>()
      const progMetricValues = metricValues.filter(mv => mv.program_id === program.id)
      
      const spendValues = progMetricValues.filter(mv => mv.metric_definition_id === spendDef.id)
      spendValues.forEach(sv => {
        dataMap.set(sv.date, { 
          date: sv.date, 
          displayDate: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(sv.date)),
          spend: Number(sv.value || 0),
          revenue: 0,
          roas: 0 
        })
      })

      if (revDef) {
        progMetricValues.filter(mv => mv.metric_definition_id === revDef.id).forEach(rv => {
          if (dataMap.has(rv.date)) {
            dataMap.get(rv.date)!.revenue += Number(rv.value || 0)
          }
        })
      }

      dataMap.forEach(v => {
        if (v.spend > 0) v.roas = v.revenue / v.spend
      })

      return Array.from(dataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    } else {
      const primaryMetric = metricDefs.find(m => m.is_primary && m.is_target_metric) || metricDefs[0]
      if (!primaryMetric) return []

      // FALLBACK: If no metricValues, check dailyInputs for revenue/user_count
      const progMetricValues = metricValues.filter(mv => mv.program_id === program.id && mv.metric_definition_id === primaryMetric.id)
      
      const mergedData = new Map<string, number>()
      
      // Add metric values
      progMetricValues.forEach(mv => {
        mergedData.set(mv.date, (mergedData.get(mv.date) || 0) + Number(mv.value || 0))
      })

      // Add legacy inputs if relevant to the primary metric
      if (primaryMetric.metric_key === 'revenue' || primaryMetric.metric_key === 'user_count') {
        const progInputs = dailyInputs.filter(di => di.program_id === program.id)
        progInputs.forEach(di => {
          const val = primaryMetric.metric_key === 'revenue' ? (di.achievement_rp || 0) : (di.achievement_user || 0)
          if (val > 0) {
            mergedData.set(di.date, (mergedData.get(di.date) || 0) + Number(val))
          }
        })
      }

      const sortedDates = Array.from(mergedData.keys()).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())

      let cumulative = 0
      const chartMaxTarget = health.absoluteTargets?.[primaryMetric.metric_key] || primaryMetric.monthly_target || 0
      const targetPerDay = chartMaxTarget / 30

      return sortedDates.map((date, i) => {
        cumulative += mergedData.get(date) || 0
        return {
          date: date,
          displayDate: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(date)),
          pencapaian: cumulative,
          targetIdeal: targetPerDay * (i + 1)
        }
      })
    }
  }, [program.id, isAds, metricDefs, metricValues, dailyInputs, health.absoluteTargets])

  const statusInfo = useMemo(() => {
    const score = health.healthScore
    if (score >= 100) return { label: 'Excellent', color: 'text-blue-600 bg-blue-50 border-blue-200' }
    if (score >= 80)  return { label: 'Baik', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' }
    if (score >= 60)  return { label: 'Cukup', color: 'text-amber-600 bg-amber-50 border-amber-200' }
    if (score >= 40)  return { label: 'Perlu Perhatian', color: 'text-orange-600 bg-orange-50 border-orange-200' }
    return { label: 'Kritis', color: 'text-red-600 bg-red-50 border-red-200' }
  }, [health.healthScore])

  return (
    <div className="space-y-8 py-4 px-6 overflow-y-auto max-h-[calc(100vh-100px)] scrollbar-hide">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className={cn("px-3 py-1 rounded-full text-xs font-bold border", statusInfo.color)}>
            {statusInfo.label}
          </span>
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            {program.department || 'General'}
          </span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 leading-tight">{program.name}</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {metricDefs.filter(m => m.is_primary).map(m => (
          <div key={m.id} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{m.label}</div>
            <div className="text-xl font-bold text-slate-900">
              {formatMetricValue(evaluatedMetrics[m.metric_key] || 0, m.data_type, m.unit_label)}
            </div>
            <div className="text-[10px] text-slate-500">
              Target: {formatMetricValue(health.absoluteTargets?.[m.metric_key] || 0, m.data_type, m.unit_label)}
            </div>
          </div>
        ))}
      </div>

      <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            {isAds ? <BarChart3 className="h-4 w-4 text-rose-500" /> : <TrendingUp className="h-4 w-4 text-indigo-500" />}
            {isAds ? 'Performa Iklan Harian' : 'Tren Capaian Kumulatif'}
          </h3>
          <div className="flex gap-4">
            {isAds ? (
              <>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><div className="h-2 w-2 rounded-sm bg-rose-500" /> SPEND</div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><div className="h-0.5 w-3 bg-indigo-500" /> ROAS</div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><div className="h-2 w-2 rounded-full bg-indigo-500" /> REAL</div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><div className="w-3 border-t-2 border-dashed border-slate-300" /> IDEAL</div>
              </>
            )}
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {isAds ? (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <ComposedChart data={chartData as any[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v: number) => v >= 1000000 ? `${(v/1000000).toFixed(1)}jt` : v.toLocaleString()} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#534AB7', fontWeight: 700 }} tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', padding: '12px' }} />
                <Bar yAxisId="left" dataKey="spend" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} />
                <Line yAxisId="right" type="monotone" dataKey="roas" stroke="#534AB7" strokeWidth={3} dot={{ r: 3, fill: '#534AB7' }} />
              </ComposedChart>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <AreaChart data={chartData as any[]}>
                <defs>
                  <linearGradient id="colorAch" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#534AB7" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#534AB7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v: number) => v >= 1000000 ? `${(v/1000000).toFixed(1)}jt` : v.toLocaleString()} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', padding: '12px' }} />
                <Area type="monotone" dataKey="pencapaian" stroke="#534AB7" strokeWidth={3} fillOpacity={1} fill="url(#colorAch)" />
                <Area type="monotone" dataKey="targetIdeal" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="5 5" fill="transparent" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-3">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Target className="h-3 w-3" /> Metrik Tambahan
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {metricDefs.filter(m => !m.is_primary).map(m => (
              <div key={m.id} className="flex justify-between items-center py-1.5 border-b border-slate-200/60 last:border-0">
                <span className="text-xs text-slate-600">{m.label}</span>
                <span className="text-xs font-bold text-slate-900">
                  {formatMetricValue(evaluatedMetrics[m.metric_key] || 0, m.data_type, m.unit_label)}
                </span>
              </div>
            ))}
            {metricDefs.filter(m => !m.is_primary).length === 0 && (
              <span className="text-[11px] text-slate-400 italic">Tidak ada metrik sekunder.</span>
            )}
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-3">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <CheckCircle className="h-3 w-3" /> Milestone
          </h3>
          <div className="space-y-2">
            {milestones.length > 0 ? milestones.map((ms, i) => (
              <div key={i} className="flex items-start gap-3 p-2 bg-white rounded-lg border border-slate-200">
                <div className="h-4 w-4 rounded-full border border-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                  <div className="h-2 w-2 rounded-full bg-slate-200" />
                </div>
                <span className="text-xs font-medium text-slate-700 leading-tight">{ms.title}</span>
              </div>
            )) : (
              <span className="text-[11px] text-slate-400 italic">Tidak ada milestone terdaftar.</span>
            )}
          </div>
        </div>
      </div>

      {/* Phase 2.1: Activity Log for MoU */}
      {program.target_type === 'mou' && (
        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-500" />
            Log Aktivitas Prospek
          </h3>
          
          <div className="space-y-6">
            {dailyInputs
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter(di => di.program_id === program.id && di.prospek_notes && (di.prospek_notes as any[]).length > 0)
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((input, idx) => (
                <div key={idx} className="relative pl-6 border-l-2 border-slate-100 space-y-3">
                  <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-white border-2 border-blue-500" />
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {new Date(input.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(input.prospek_notes as any[]).map((note, nIdx) => (
                      <div key={nIdx} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-[11px] font-bold text-slate-900 mb-1">{note.institusi}</div>
                        <p className="text-[11px] text-slate-600 leading-relaxed italic">&ldquo;{note.catatan}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {dailyInputs.filter(di => di.program_id === program.id && di.prospek_notes && (di.prospek_notes as any[]).length > 0).length === 0 && (
              <div className="text-center py-8 opacity-40">
                <p className="text-xs font-bold text-slate-400">Belum ada log aktivitas prospek untuk periode ini.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
