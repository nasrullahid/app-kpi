'use client'

import { TVDashboardData } from '../actions'
import { formatRupiah } from '@/lib/utils'
import { DigitalClock } from './DigitalClock'
import { TrendingUp, Users, Target, Activity, HeartPulse, type LucideIcon } from 'lucide-react'

interface Slide1Props {
  data: TVDashboardData
}

export function Slide1Total({ data }: Slide1Props) {
  const { aggregate, activePeriod } = data

  const getMonthName = (month: number) => {
    return new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2024, month - 1, 1))
  }

  // Define display config for metric groups
  const groupConfig: Record<string, { label: string, icon: LucideIcon, color: string, isCurrency: boolean }> = {
    revenue: { label: 'Total Pendapatan', icon: Target, color: 'text-indigo-400', isCurrency: true },
    user_acquisition: { label: 'Total User / Agreement', icon: Users, color: 'text-cyan-400', isCurrency: false },
    leads: { label: 'Total Leads', icon: TrendingUp, color: 'text-emerald-400', isCurrency: false },
    ad_spend: { label: 'Total Ad Spend', icon: Activity, color: 'text-rose-400', isCurrency: true },
    efficiency: { label: 'Rata-rata ROAS', icon: Activity, color: 'text-amber-400', isCurrency: false },
  }

  const activeGroups = Object.keys(aggregate.metricGroups)
    .filter(key => groupConfig[key])
    .slice(0, 4); // Show top 4 groups

  return (
    <div className="h-full flex flex-col p-12">
      {/* Header */}
      <div className="flex justify-between items-start mb-12">
        <div>
          <h1 className="text-6xl font-black text-slate-100 uppercase tracking-tighter mb-2">
            Ringkasan Performa
          </h1>
          <p className="text-2xl font-bold text-indigo-400 uppercase tracking-widest">
            Bulan {activePeriod ? getMonthName(activePeriod.month) : '-'} Tahun {activePeriod?.year || ''}
          </p>
        </div>
        <DigitalClock />
      </div>

      <div className="grid grid-cols-12 gap-10 flex-grow mb-12 min-h-0">
        {/* Left Side: Large Health Score */}
        <div className="col-span-5 flex flex-col items-center justify-center bg-slate-900/50 rounded-3xl p-10 border border-slate-800 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
             <HeartPulse className="w-96 h-96" />
          </div>
          <h3 className="text-2xl font-bold text-slate-400 uppercase tracking-[0.3em] mb-8 relative z-10">Overall Health Score</h3>
          <div className="relative flex items-center justify-center z-10">
            <svg className="w-80 h-80 transform -rotate-90">
              <circle
                cx="160" cy="160" r="140"
                stroke="currentColor" strokeWidth="24" fill="transparent"
                className="text-slate-800"
              />
              <circle
                cx="160" cy="160" r="140"
                stroke="currentColor" strokeWidth="24" fill="transparent"
                strokeDasharray={2 * Math.PI * 140}
                strokeDashoffset={2 * Math.PI * 140 * (1 - Math.min(aggregate.healthScore, 100) / 100)}
                strokeLinecap="round"
                className="text-indigo-500"
                style={{ filter: 'drop-shadow(0 0 12px rgba(99,102,241,0.5))' }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-9xl font-black text-slate-50">{aggregate.healthScore.toFixed(0)}%</span>
              <span className="text-xl font-bold text-indigo-400 uppercase tracking-widest mt-[-10px]">Performa</span>
            </div>
          </div>
        </div>

        {/* Right Side: Primary Metrics Grid */}
        <div className="col-span-7 grid grid-cols-2 gap-8 min-h-0">
          {activeGroups.map(key => {
            const group = aggregate.metricGroups[key];
            const config = groupConfig[key];
            const pct = group.totalTarget > 0 ? (group.actual / group.totalTarget) * 100 : 0;
            const Icon = config.icon;

            return (
              <div key={key} className="bg-slate-900/50 rounded-3xl p-8 border border-slate-800 shadow-xl flex flex-col justify-between group">
                <div className="flex items-center gap-4 mb-4">
                  <div className={`p-4 rounded-2xl bg-slate-950 border border-slate-800 ${config.color}`}>
                    <Icon size={32} />
                  </div>
                  <span className="text-lg font-bold text-slate-200 uppercase tracking-widest">{config.label}</span>
                </div>
                
                <div className="mb-4 w-full" style={{ containerType: 'inline-size' }}>
                  <div className="text-[min(3rem,14cqw)] font-black text-slate-50 leading-none whitespace-nowrap drop-shadow-sm">
                    {config.isCurrency ? formatRupiah(group.actual) : group.actual.toLocaleString()}
                    {!config.isCurrency && key === 'efficiency' && 'x'}
                  </div>
                  {group.target > 0 && (
                    <div className="text-sm font-bold text-slate-500 uppercase mt-2">
                      Target Bulanan: {config.isCurrency ? formatRupiah(group.totalTarget) : group.totalTarget.toLocaleString()}
                    </div>
                  )}
                </div>

                {group.target > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-black">
                      <span className="text-slate-400 uppercase">Progres Bulanan</span>
                      <span className={config.color}>{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2.5 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
                      <div 
                        className={`h-full rounded-full bg-indigo-500`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Fallback Metrics if less than 4 groups */}
          {activeGroups.length < 4 && Array.from({ length: 4 - activeGroups.length }).map((_, i) => (
             <div key={`empty-${i}`} className="bg-slate-900/20 rounded-3xl border border-dashed border-slate-800 flex items-center justify-center">
                <span className="text-slate-700 font-bold uppercase tracking-widest text-xs">Waiting for data...</span>
             </div>
          ))}
        </div>
      </div>

      {/* Footer Status Breakdown */}
      <div className="bg-slate-900/80 rounded-3xl p-8 border border-slate-800 shadow-2xl flex items-center justify-around gap-12">
        <div className="flex flex-col items-center gap-2">
           <span className="text-sm font-bold text-slate-500 uppercase tracking-[0.2em]">Program Health</span>
           <div className="flex gap-16">
              <div className="flex items-center gap-6">
                 <div className="w-5 h-5 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                 <div className="flex flex-col">
                    <span className="text-4xl font-black text-emerald-400">{aggregate.tercapai}</span>
                    <span className="text-xs font-bold text-slate-400 uppercase">Tercapai (≥100%)</span>
                 </div>
              </div>
              <div className="flex items-center gap-6">
                 <div className="w-5 h-5 rounded-full bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]" />
                 <div className="flex flex-col">
                    <span className="text-4xl font-black text-amber-400">{aggregate.menujuTarget}</span>
                    <span className="text-xs font-bold text-slate-400 uppercase">Berjalan (60-99%)</span>
                 </div>
              </div>
              <div className="flex items-center gap-6">
                 <div className="w-5 h-5 rounded-full bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]" />
                 <div className="flex flex-col">
                    <span className="text-4xl font-black text-rose-400">{aggregate.perluPerhatian}</span>
                    <span className="text-xs font-bold text-slate-400 uppercase">Tertinggal (&lt;60%)</span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  )
}
