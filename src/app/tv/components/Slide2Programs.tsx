'use client'

import { ProgramPerformance } from '../actions'
import { formatRupiah, cn } from '@/lib/utils'

interface Slide2Props {
  programs: ProgramPerformance[]
  pagination?: {
    current: number
    total: number
  }
}

export function Slide2Programs({ programs, pagination }: Slide2Props) {
  return (
    <div className="h-full flex flex-col p-12 text-left">
      <div className="flex justify-between items-end mb-12">
         <div>
            <h1 className="text-5xl font-black text-slate-100 uppercase tracking-tighter">
               Performa Per Program
            </h1>
            {pagination && pagination.total > 1 && (
               <p className="text-indigo-400 font-bold uppercase tracking-[0.3em] mt-2">
                  Halaman {pagination.current} dari {pagination.total}
               </p>
            )}
         </div>
         <div className="px-6 py-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400 font-bold text-xl uppercase tracking-widest">
            {pagination ? `Menampilkan ${programs.length} Program` : `Total ${programs.length} Program Aktif`}
         </div>
      </div>

      <div className="grid grid-cols-2 gap-x-12 gap-y-10 flex-grow mb-12">
        {programs.map((program) => (
          <ProgramCard key={program.id} program={program} />
        ))}
      </div>
    </div>
  )
}

function ProgramCard({ program }: { program: ProgramPerformance }) {
  const isQualitative = program.target_type === 'qualitative'

  const statusColors: Record<string, string> = {
    'EXCELLENT': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]',
    'BAIK': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    'CUKUP': 'text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]',
    'PERLU PERHATIAN': 'text-rose-400 bg-rose-500/10 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.2)]',
    'KRITIS': 'text-rose-400 bg-rose-600/20 border-rose-600/50 shadow-[0_0_20px_rgba(244,63,94,0.4)]'
  }

  const barColors: Record<string, string> = {
    'EXCELLENT': 'bg-emerald-500',
    'BAIK': 'bg-emerald-500',
    'CUKUP': 'bg-amber-500',
    'PERLU PERHATIAN': 'bg-rose-500',
    'KRITIS': 'bg-rose-600'
  }

  return (
    <div className="bg-slate-900/40 rounded-3xl p-8 border border-slate-800/80 flex flex-col justify-between shadow-xl backdrop-blur-sm relative overflow-hidden group">
      <div className="absolute -right-4 -top-4 opacity-[0.03] text-8xl font-black uppercase pointer-events-none rotate-12">
        {program.target_type}
      </div>

      <div className="flex justify-between items-start mb-6 gap-4 relative z-10">
        <div className="flex-1 min-w-0">
          <h3 className="text-3xl font-extrabold text-slate-100 truncate mb-2 leading-tight">
             {program.name}
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {program.team.map((m, i) => (
                <div key={i} title={m.name} className="h-8 w-8 rounded-full border-2 border-slate-900 bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white">
                  {m.name.substring(0,2).toUpperCase()}
                </div>
              ))}
            </div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest ml-2">
               TEAM PIC ({program.team.length})
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-baseline gap-1">
             <span className="text-4xl font-black text-slate-50">{program.health.healthScore.toFixed(0)}</span>
             <span className="text-lg font-bold text-slate-500">%</span>
          </div>
          <div className={cn(
            "px-4 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest whitespace-nowrap",
            statusColors[program.health.status] || statusColors['PERLU PERHATIAN']
          )}>
            {program.health.status}
          </div>
        </div>
      </div>

      <div className="space-y-4 relative z-10">
        {/* Unified Primary Metrics */}
        {program.unifiedPrimaryMetrics.length > 0 ? (
          program.unifiedPrimaryMetrics.slice(0, 2).map((metric) => {
            const pct = metric.target > 0 ? (metric.achieved / metric.target) * 100 : 0
            return (
              <div key={metric.key} className="space-y-1.5">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{metric.label}</span>
                  <span className="text-lg font-black text-slate-200">
                    {metric.dataType === 'currency' ? formatRupiah(metric.achieved) : metric.achieved.toLocaleString()}
                    <span className="text-[10px] text-slate-500 ml-1">
                      / {metric.dataType === 'currency' ? formatRupiah(metric.target) : metric.target.toLocaleString()} {metric.unit}
                    </span>
                  </span>
                </div>
                <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
                  <div 
                    className={cn("h-full rounded-full", barColors[program.health.status])}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            )
          })
        ) : (
          /* Fallback for Qualitative Only */
          isQualitative ? (
            <div className="space-y-3">
               <div className="flex justify-between items-end">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Misi Kualitatif</span>
                  <span className="text-xl font-black text-purple-400">{program.qualitativePercentage.toFixed(0)}%</span>
               </div>
               <div className="h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
                 <div 
                   className="h-full bg-purple-500 transition-all duration-1000 rounded-full"
                   style={{ width: `${Math.min(program.qualitativePercentage, 100)}%` }}
                 />
               </div>
               <p className="text-xs text-slate-500 font-medium line-clamp-1 italic">
                 &quot;{program.qualitative_description}&quot;
               </p>
            </div>
          ) : (
            <div className="py-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest italic opacity-50">
              Menunggu data parameter...
            </div>
          )
        )}
      </div>
    </div>
  )
}
