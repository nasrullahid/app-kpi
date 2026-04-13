'use client'

import { ProgramPerformance, DailyInput, Milestone } from '../actions'
import { formatRupiah, cn } from '@/lib/utils'
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
import { CheckCircle2, Users, ClipboardList, Target, TrendingUp } from 'lucide-react'

interface SlideProgramDetailProps {
  program: ProgramPerformance
  inputs: DailyInput[]
}

export function SlideProgramDetail({ program, inputs }: SlideProgramDetailProps) {
  // 1. Process Trend Data
  const sortedInputs = [...inputs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  
  let cumulativeRp = 0
  const chartData = sortedInputs.map(input => {
    cumulativeRp += Number(input.achievement_rp || 0)
    const dateObj = new Date(input.date)
    return {
      date: input.date,
      displayDate: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(dateObj),
      pencapaian: cumulativeRp,
    }
  })

  const targetPerDay = (program.monthly_target_rp || 0) / 30 
  const chartDataWithTarget = chartData.map((d, index) => ({
    ...d,
    targetIdeal: targetPerDay * (index + 1)
  }))

  const statusThemes = {
    'TERCAPAI': 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.1)]',
    'MENUJU TARGET': 'text-amber-400 border-amber-500/30 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.1)]',
    'PERLU PERHATIAN': 'text-rose-400 border-rose-500/30 bg-rose-500/10 shadow-[0_0_20px_rgba(244,63,94,0.1)]'
  }

  const isQualitative = program.target_type === 'qualitative'
  const isHybrid = program.target_type === 'hybrid'

  const motivationalMessage = program.percentageRp >= 100 
    ? "MASYAA ALLAH WOW TARGET TERLAMPAUI 🚀" 
    : program.percentageRp >= 50
      ? "ALHAMDULILLAH TERUS BERJUANG MENUJU TARGET 🌟" 
      : "CAPAI TARGET SEKARANG DAN DAPATKAN REWARDNYA 💪";

  const motivationalTheme = program.percentageRp >= 100 
    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.2)]" 
    : "bg-rose-500/10 border-rose-500/40 text-rose-400 shadow-[0_0_50px_rgba(244,63,94,0.1)]";

  return (
    <div className="h-full flex flex-col p-10 text-slate-100 text-left">
      {/* Header with Title and Team */}
      <div className="flex justify-between items-start mb-10">
        <div className="max-w-[75%]">
          <div className="flex items-center gap-4 mb-6">
             <span className={cn(
               "px-6 py-2.5 rounded-2xl border text-xl font-black uppercase tracking-tighter",
               statusThemes[program.status]
             )}>
               {program.status}
             </span>
             <span className="text-xl font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/5 px-6 py-2.5 rounded-2xl border border-indigo-500/20">
               {isHybrid ? 'Misi & Angka' : isQualitative ? 'Fokus Misi' : 'Target Kuantitas'}
             </span>
          </div>
          <h1 className="text-7xl font-black text-slate-100 uppercase tracking-tighter leading-[0.9] mb-8">
             {program.name}
          </h1>
          
          <div className="flex items-center gap-10">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Kolaborasi Tim (PIC)</span>
              <div className="flex items-center gap-3">
                 <div className="flex -space-x-3 overflow-hidden">
                    {program.team.map((m, i) => (
                      <div key={i} title={m.name} className="h-12 w-12 rounded-full ring-4 ring-slate-950 bg-indigo-600 flex items-center justify-center text-xs font-black text-white border-2 border-indigo-400">
                        {m.name.substring(0,2).toUpperCase()}
                      </div>
                    ))}
                 </div>
                 <div className="flex flex-col">
                    <span className="text-xl font-black text-slate-100 uppercase truncate max-w-[400px]">
                       {program.team.map(m => m.name).join(' • ')}
                    </span>
                 </div>
              </div>
            </div>
          </div>
        </div>

        {/* Big Performance Indicator */}
        <div className="flex flex-col items-end gap-2">
           {!isQualitative ? (
              <div className="text-right">
                 <div className="text-8xl font-black leading-none text-slate-100 tracking-tighter">
                   {program.percentageRp.toFixed(1)}<span className="text-4xl text-slate-500">%</span>
                 </div>
                 <p className="text-xs font-black text-indigo-400 uppercase tracking-[0.4em] mt-2">Yield Performance</p>
              </div>
           ) : (
              <div className="text-right flex flex-col items-end">
                 <div className="text-8xl font-black leading-none text-purple-400 tracking-tighter">
                   {program.qualitativePercentage.toFixed(0)}<span className="text-4xl text-purple-600/50">%</span>
                 </div>
                 <p className="text-xs font-black text-purple-400 uppercase tracking-[0.4em] mt-2">Misi Selesai</p>
              </div>
           )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-10 flex-grow overflow-hidden">
        {/* LEFT PANEL: QUALITATIVES / MILLESTONES */}
        <div className={cn(
          "bg-slate-900/40 rounded-[2.5rem] p-10 border border-slate-800/80 shadow-2xl flex flex-col relative",
          isQualitative ? "col-span-8" : "col-span-4"
        )}>
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
              <ClipboardList className="h-6 w-6 text-indigo-500" /> Checklist Misi
            </h3>
            <span className="text-xs font-bold text-slate-500 italic">Unique & Persistent</span>
          </div>

          <div className="space-y-4 flex-grow overflow-y-auto pr-4 custom-scrollbar">
            {program.program_milestones.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center opacity-20">
                  <Target className="h-20 w-20 mb-4" />
                  <p className="text-xl font-bold uppercase">No Milestones Registered</p>
               </div>
            ) : (
              program.program_milestones.map((ms: Milestone, i: number) => {
                const comp = program.completedMilestones > 0; // Simplified for display or check against completion list if available
                // Note: In real logic we'd check if specific MS is done. 
                // Since I don't have the full list of completions passed individually here (just summary),
                // I'll assume we can at least show the breakdown if we had the data.
                // For now, I'll show names.
                return (
                  <div key={i} className="bg-slate-950/40 border border-slate-800/50 p-6 rounded-2xl flex items-center gap-6">
                     <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <span className="text-lg font-black text-slate-500">{i+1}</span>
                     </div>
                     <p className="text-2xl font-bold text-slate-100">{ms.title}</p>
                  </div>
                )
              })
            )}
          </div>
          
          <div className="mt-8 pt-8 border-t border-slate-800/50">
             <p className="text-lg text-indigo-300 font-bold italic leading-relaxed">
               &quot;{program.qualitative_description || 'Fokus pada pencapaian target program harian.'}&quot;
             </p>
          </div>
        </div>

        {/* RIGHT PANEL: CHARTS / METRICS */}
        <div className={cn(
          "space-y-10",
          isQualitative ? "col-span-4" : "col-span-8"
        )}>
           {!isQualitative ? (
             <div className="h-full flex flex-col gap-10">
                {/* SMALL CARDS FOR QUANTS */}
                <div className="grid grid-cols-2 gap-8 shrink-0">
                   <div className="bg-slate-900/40 rounded-[2rem] p-8 border border-slate-800/80 shadow-xl">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 block">Target Capital (RP)</span>
                      <div className="text-4xl font-black text-slate-100 mb-1">{formatRupiah(program.achievementRp)}</div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Budget: {formatRupiah(program.monthly_target_rp || 0)}</div>
                   </div>
                   <div className="bg-slate-900/40 rounded-[2rem] p-8 border border-slate-800/80 shadow-xl">
                      <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-4 block">User Density</span>
                      <div className="text-4xl font-black text-slate-100 mb-1">{program.achievementUser.toLocaleString()}</div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Goal: {(program.monthly_target_user || 0).toLocaleString()}</div>
                   </div>
                </div>

                {/* TREND CHART */}
                <div className="bg-slate-900/40 rounded-[2.5rem] p-8 border border-slate-800/80 shadow-xl flex-grow flex flex-col">
                   <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-indigo-500" /> Cumulative Analytics
                      </h3>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                          <div className="h-2 w-2 rounded-full bg-indigo-500" /> REALISASI
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                          <div className="h-1 w-3 bg-slate-600 rounded-full" /> IDEAL
                        </div>
                      </div>
                   </div>
                   <div className="flex-grow w-full">
                      <ResponsiveContainer width="100%" height="100%">
                         <AreaChart data={chartDataWithTarget} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                            <defs>
                               <linearGradient id="colorAchDetail" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                               </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                            <XAxis dataKey="displayDate" hide />
                            <YAxis hide domain={[0, (dataMax: number) => Math.max(dataMax, program.monthly_target_rp || 0)]} />
                            <Tooltip 
                               contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                               itemStyle={{ color: '#f8fafc', fontWeight: 700 }}
                               labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                            />
                            <Area 
                               type="monotone" 
                               dataKey="pencapaian" 
                               stroke="#6366f1" 
                               strokeWidth={5} 
                               fill="url(#colorAchDetail)" 
                               isAnimationActive={false}
                               // eslint-disable-next-line @typescript-eslint/no-explicit-any
                               dot={(props: any) => {
                                 const { cx, cy, payload, index } = props;
                                 const numValue = Number(payload.pencapaian);
                                 
                                 if (!numValue || numValue === 0) {
                                   return <circle key={index} cx={cx} cy={cy} r={3} fill="#6366f1" stroke="#1e293b" strokeWidth={1} />;
                                 }

                                 const formatted = numValue >= 1_000_000_000
                                   ? (numValue / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
                                   : numValue >= 1_000_000
                                     ? (numValue / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'jt'
                                     : numValue >= 1_000
                                       ? (numValue / 1_000).toFixed(0) + 'rb'
                                       : String(numValue);

                                 return (
                                   <g key={index}>
                                     <circle cx={cx} cy={cy} r={4} fill="#6366f1" stroke="#1e293b" strokeWidth={2} />
                                     <text x={cx} y={cy - 26} fill="#f8fafc" fontSize={11} fontWeight={900} textAnchor="middle">
                                       {formatted}
                                     </text>
                                   </g>
                                 );
                               }}
                               activeDot={{ r: 6, fill: '#818cf8' }}
                            />
                            <Area 
                               type="monotone" 
                               dataKey="targetIdeal" 
                               stroke="#475569" 
                               strokeWidth={2} 
                               strokeDasharray="5 5" 
                               fill="transparent" 
                               isAnimationActive={false}
                               // eslint-disable-next-line @typescript-eslint/no-explicit-any
                               dot={(props: any) => {
                                 const { cx, cy, payload, index } = props;
                                 const numValue = Number(payload.targetIdeal);
                                 
                                 if (!numValue || numValue === 0) {
                                   return <circle key={index} cx={cx} cy={cy} r={2} fill="#475569" opacity={0.5} />;
                                 }

                                 const formatted = numValue >= 1_000_000_000
                                   ? (numValue / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
                                   : numValue >= 1_000_000
                                     ? (numValue / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'jt'
                                     : numValue >= 1_000
                                       ? (numValue / 1_000).toFixed(0) + 'rb'
                                       : String(numValue);

                                 return (
                                   <g key={`target-dot-${index}`}>
                                     <text x={cx} y={cy + 20} fill="#64748b" fontSize={10} fontWeight={700} textAnchor="middle">
                                       {formatted}
                                     </text>
                                   </g>
                                 );
                               }}
                            />
                            <ReferenceLine y={program.monthly_target_rp || 0} stroke="#ef4444" strokeDasharray="5 5" opacity={0.5} />
                         </AreaChart>
                      </ResponsiveContainer>
                   </div>
                </div>
             </div>
           ) : (
             <div className="h-full flex flex-col justify-center items-center text-center bg-slate-900/40 rounded-[2.5rem] p-12 border border-slate-800/80 shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
                   <CheckCircle2 className="h-[400px] w-[400px]" />
                </div>
                <h4 className="text-xl font-black text-slate-500 uppercase tracking-[0.4em] mb-12">Performance Summary</h4>
                <div className="grid grid-cols-2 gap-12 w-full max-w-lg">
                   <div className="flex flex-col gap-2">
                      <span className="text-8xl font-black text-slate-100">{program.completedMilestones}</span>
                      <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Tugas Selesai</span>
                   </div>
                   <div className="flex flex-col gap-2 border-l border-slate-800">
                      <span className="text-8xl font-black text-slate-700">{program.totalMilestones}</span>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Misi</span>
                   </div>
                </div>
             </div>
           )}
        </div>
      </div>

      {/* FOOTER MOTIVATIONAL */}
      <div className={cn(
        "mt-8 p-10 rounded-[3rem] border-2 text-center transition-all duration-1000 flex items-center justify-center relative z-10",
        motivationalTheme
      )}>
        <p className="text-4xl font-black uppercase tracking-tight leading-tight">
          {motivationalMessage}
        </p>
      </div>
    </div>
  )
}
