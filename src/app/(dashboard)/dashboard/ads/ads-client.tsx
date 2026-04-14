'use client'

import { useState, useMemo } from 'react'
import { ProgramWithRelations } from '../actions'
import { Database } from '@/types/database'
import { isAdsProgram, aggregateAdsMetrics, buildAdsDailySeries } from '@/lib/dashboard-calculator'
import { formatRupiah, cn } from '@/lib/utils'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { TrendingUp } from 'lucide-react'

type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']
type Period = Database['public']['Tables']['periods']['Row']

const ADS_METRIC_LABELS: Record<string, string> = {
  budget_iklan: 'Ads Spent', ads_spent: 'Ads Spent',
  closing: 'Goals', user_count: 'Goals',
  lead_masuk: 'Leads', leads: 'Leads',
  cpm: 'CPM', cpc: 'CPC',
  adds_to_cart: 'Adds to Cart',
}

const X_METRIC_OPTIONS = [
  { key: 'budget_iklan', label: 'Ads Spent' },
  { key: 'closing', label: 'Goals' },
  { key: 'lead_masuk', label: 'Leads' },
]
const Y_METRIC_OPTIONS = [
  { key: 'roas', label: 'ROAS' },
  { key: 'cpp_real', label: 'CPP' },
  { key: 'conversion_rate', label: 'Conversion Rate' },
]

interface AdsClientProps {
  programs: ProgramWithRelations[]
  activePeriod: Period
  metricValues: MetricValue[]
  previousMetricValues?: MetricValue[]
  profiles: { id: string; name: string }[]
  isCustomDateRange?: boolean
}

function KpiCard({ label, value, sub, subOk, comparison }: { label: string; value: string; sub?: string; subOk?: boolean; comparison?: { value: number; label: string } }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
      <div>
        <p className="text-xs font-black tracking-[0.15em] text-slate-400 uppercase mb-2">{label}</p>
        <p className="text-3xl font-black text-slate-800 mb-1">{value}</p>
        {sub && <p className={cn("text-xs font-bold mb-2", subOk === true ? 'text-emerald-600' : subOk === false ? 'text-red-500' : 'text-slate-400')}>{sub}</p>}
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

export function AdsClient({ programs, metricValues, previousMetricValues = [], profiles, isCustomDateRange }: AdsClientProps) {
  const [selectedProgramId, setSelectedProgramId] = useState<string>('all')
  const [metricX, setMetricX] = useState('budget_iklan')
  const [metricY, setMetricY] = useState('roas')

  // ── Filter to ads programs only ──────────────────────────────────────────
  const adsPrograms = useMemo(() =>
    programs.filter(p => isAdsProgram(p.program_metric_definitions || [])),
    [programs]
  )

  // ── Selected program(s) ──────────────────────────────────────────────────
  const targetPrograms = selectedProgramId === 'all'
    ? adsPrograms
    : adsPrograms.filter(p => p.id === selectedProgramId)

  // ── Aggregate KPIs ───────────────────────────────────────────────────────
  const aggregate = useMemo(() =>
    aggregateAdsMetrics(targetPrograms, metricValues),
    [targetPrograms, metricValues]
  )

  const prevAggregate = useMemo(() =>
    isCustomDateRange ? aggregateAdsMetrics(targetPrograms, previousMetricValues) : null,
    [targetPrograms, previousMetricValues, isCustomDateRange]
  )

  const getGrowth = (current: number, prev: number | undefined) => {
    if (!prev || prev === 0) return 0
    return ((current - prev) / prev) * 100
  }

  // ── Daily chart data ─────────────────────────────────────────────────────
  const chartData = useMemo(() =>
    buildAdsDailySeries(targetPrograms, metricValues, metricX, metricY),
    [targetPrograms, metricValues, metricX, metricY]
  )

  // ── Per-program rows for table ───────────────────────────────────────────
  const programRows = useMemo(() =>
    adsPrograms.map(prog => {
      const agg = aggregateAdsMetrics([prog], metricValues)
      const teamNames = (prog.program_pics || []).map(pic => {
        const p = profiles.find(pr => pr.id === pic.profile_id)
        return p?.name?.split(' ')[0] || '?'
      })
      return { prog, agg, teamNames }
    }),
    [adsPrograms, metricValues, profiles]
  )

  if (adsPrograms.length === 0) {
    return (
      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-16 text-center text-slate-500">
        <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="font-bold text-base">Tidak ada program Ads terdeteksi</p>
        <p className="text-sm mt-2">Tambahkan program dengan template Advertising untuk melihat Ads Performance.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={selectedProgramId}
          onChange={e => setSelectedProgramId(e.target.value)}
          className="px-3 py-2.5 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700"
        >
          <option value="all">Program: Semua Ads Program ({adsPrograms.length})</option>
          {adsPrograms.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Ads Spent"
          value={formatRupiah(aggregate.totalAdsSpent)}
          sub="periode ini"
          comparison={prevAggregate ? { value: getGrowth(aggregate.totalAdsSpent, prevAggregate.totalAdsSpent), label: 'vs periode sblmnya' } : undefined}
        />
        <KpiCard
          label="Total Goals"
          value={aggregate.totalGoals.toLocaleString()}
          sub="closing/user"
          comparison={prevAggregate ? { value: getGrowth(aggregate.totalGoals, prevAggregate.totalGoals), label: 'vs periode sblmnya' } : undefined}
        />
        <KpiCard
          label="Avg ROAS"
          value={`${aggregate.avgRoas.toFixed(2)}x`}
          sub={aggregate.avgRoas >= 1 ? 'Di atas 1x (profitable)' : 'Di bawah 1x (rugi)'}
          subOk={aggregate.avgRoas >= 1}
          comparison={prevAggregate ? { value: getGrowth(aggregate.avgRoas, prevAggregate.avgRoas), label: 'vs periode sblmnya' } : undefined}
        />
        <KpiCard
          label="Avg CPP"
          value={aggregate.avgCpp > 0 ? formatRupiah(aggregate.avgCpp) : '-'}
          sub="per goal/closing"
          comparison={prevAggregate ? { value: getGrowth(aggregate.avgCpp, prevAggregate.avgCpp), label: 'vs periode sblmnya' } : undefined}
        />
      </div>

      {/* ── Dual-axis Chart ─────────────────────────────────────── */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 className="font-bold text-slate-800">Performance Harian</h3>
          <div className="flex gap-3 items-center text-sm">
            <span className="text-slate-400 font-medium text-xs">Compared:</span>
            <select
              value={metricX}
              onChange={e => setMetricX(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold bg-slate-100 border border-slate-200 rounded-lg text-slate-700"
            >
              {X_METRIC_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <span className="text-slate-400 font-medium text-xs">With:</span>
            <select
              value={metricY}
              onChange={e => setMetricY(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold bg-slate-100 border border-slate-200 rounded-lg text-slate-700"
            >
              {Y_METRIC_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
            Belum ada data harian untuk ditampilkan.
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(0)}jt` : v >= 1e3 ? `${(v/1e3).toFixed(0)}rb` : String(v)}
                  tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                  tickFormatter={v => metricY === 'roas' ? `${v.toFixed(1)}x` : metricY === 'conversion_rate' ? `${v.toFixed(0)}%` : String(v)}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v, name) => {
                    const val = Number(v)
                    if (name === 'x') {
                      return [metricX.includes('budget') || metricX.includes('spent') ? formatRupiah(val) : val.toLocaleString(), ADS_METRIC_LABELS[metricX] || metricX]
                    }
                    if (name === 'y') {
                      if (metricY === 'roas') return [`${val.toFixed(2)}x`, 'ROAS']
                      if (metricY === 'conversion_rate') return [`${val.toFixed(1)}%`, 'Conv. Rate']
                      return [formatRupiah(val), 'CPP']
                    }
                    return [val, String(name)]
                  }}
                />
                <Legend formatter={name => name === 'x' ? (ADS_METRIC_LABELS[metricX] || metricX) : (Y_METRIC_OPTIONS.find(o => o.key === metricY)?.label || metricY)} />
                <Bar yAxisId="left" dataKey="x" fill="#6366f1" opacity={0.8} radius={[4, 4, 0, 0]} maxBarSize={20} />
                <Line yAxisId="right" type="monotone" dataKey="y" stroke="#f59e0b" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Per Program Table ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Performa per Program Ads</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-black text-slate-400 uppercase tracking-widest">
                <th className="px-4 py-3 text-left">Program</th>
                <th className="px-4 py-3 text-right">Ads Spent</th>
                <th className="px-4 py-3 text-right">Goals</th>
                <th className="px-4 py-3 text-right">ROAS</th>
                <th className="px-4 py-3 text-right">CPP</th>
                <th className="px-4 py-3 text-right">CR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {programRows.map(({ prog, agg, teamNames }) => (
                <tr
                  key={prog.id}
                  className={cn(
                    "hover:bg-slate-50 transition-colors cursor-pointer",
                    selectedProgramId === prog.id ? 'bg-indigo-50' : ''
                  )}
                  onClick={() => setSelectedProgramId(selectedProgramId === prog.id ? 'all' : prog.id)}
                >
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-800">{prog.name}</div>
                    <div className="text-xs text-slate-400">{teamNames.join(' · ')}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-600">{formatRupiah(agg.totalAdsSpent)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-600">{agg.totalGoals}</td>
                  <td className={cn("px-4 py-3 text-right font-bold", agg.avgRoas >= 1 ? 'text-emerald-600' : 'text-red-500')}>
                    {agg.avgRoas.toFixed(2)}x
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-600">{agg.avgCpp > 0 ? formatRupiah(agg.avgCpp) : '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-600">{agg.avgCr.toFixed(1)}%</td>
                </tr>
              ))}

              {/* Total row */}
              {programRows.length > 1 && (() => {
                const totalAgg = aggregateAdsMetrics(adsPrograms, metricValues)
                return (
                  <tr className="bg-slate-100 font-black text-slate-800">
                    <td className="px-4 py-3 text-xs uppercase tracking-widest text-slate-500">TOTAL / AVG</td>
                    <td className="px-4 py-3 text-right">{formatRupiah(totalAgg.totalAdsSpent)}</td>
                    <td className="px-4 py-3 text-right">{totalAgg.totalGoals}</td>
                    <td className={cn("px-4 py-3 text-right", totalAgg.avgRoas >= 1 ? 'text-emerald-700' : 'text-red-600')}>
                      {totalAgg.avgRoas.toFixed(2)}x
                    </td>
                    <td className="px-4 py-3 text-right">{totalAgg.avgCpp > 0 ? formatRupiah(totalAgg.avgCpp) : '-'}</td>
                    <td className="px-4 py-3 text-right">{totalAgg.avgCr.toFixed(1)}%</td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
