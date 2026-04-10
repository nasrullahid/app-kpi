'use client'

import { ProgramPerformance, DailyInput } from '../actions'
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

interface SlideProgramDetailProps {
  program: ProgramPerformance
  inputs: DailyInput[]
}

// ESLint disabled for Recharts custom props which are difficult to type strictly

export function SlideProgramDetail({ program, inputs }: SlideProgramDetailProps) {
  // 1. Process Trend Data
  // Group by date and calculate cumulative
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

  // Calculate Ideal Target Line (Linear growth towards monthly target)
  const targetPerDay = (program.monthly_target_rp || 0) / 30 // Rough approximation for 30 days
  const chartDataWithTarget = chartData.map((d, index) => ({
    ...d,
    targetIdeal: targetPerDay * (index + 1)
  }))

  const statusThemes = {
    'TERCAPAI': 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
    'MENUJU TARGET': 'text-amber-400 border-amber-500/30 bg-amber-500/5',
    'PERLU PERHATIAN': 'text-rose-400 border-rose-500/30 bg-rose-500/5'
  }

  const isQualitative = program.target_type === 'qualitative'
  const isHybrid = program.target_type === 'hybrid'

  const milestoneStatusMap = {
    'not_started': { label: 'BELUM DIMULAI', color: 'bg-slate-700 text-slate-400 border-slate-600', dot: 'bg-slate-500' },
    'in_progress': { label: 'DALAM PROSES', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30', dot: 'bg-amber-500' },
    'completed': { label: 'SELESAI', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30', dot: 'bg-emerald-500' }
  }

  const currentMilestone = program.latestQualitativeStatus || 'not_started'
  const milestone = milestoneStatusMap[currentMilestone]

  // Motivational Message Logic
  const motivationalMessage = program.percentageRp > 100 
    ? "MASYAA ALLAH WOW TARGET TERLAMPAUI 🚀" 
    : program.percentageRp === 100 
      ? "ALHAMDULILLAH TARGET TERCAPAI 🌟" 
      : "TARGET BELUM TERCAPAI CARI SOLUSINYA SEGERA DAN DAPATKAN BONUSNYA 💪";

  const motivationalTheme = program.percentageRp >= 100 
    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.15)]" 
    : "bg-rose-500/10 border-rose-500/40 text-rose-400 shadow-[0_0_40px_rgba(244,63,94,0.1)]";

  return (
    <div className="h-full flex flex-col p-8 text-slate-100">
      {/* Header with Title and PIC */}
      <div className="flex justify-between items-start mb-10">
        <div className="max-w-[70%]">
          <div className="flex items-center gap-4 mb-4">
             <span className={cn(
               "px-6 py-2 rounded-2xl border text-xl font-black uppercase tracking-tighter",
               statusThemes[program.status]
             )}>
               {program.status}
             </span>
             <span className="text-2xl font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-6 py-2 rounded-2xl border border-indigo-500/20">
               Detail Program {isHybrid ? '(Hybrid)' : isQualitative ? '(Kualitatif)' : '(Kuantitatif)'}
             </span>
          </div>
          <h1 className="text-6xl font-black text-slate-100 uppercase tracking-tighter leading-none mb-4">
             {program.name}
          </h1>
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-1">Penanggung Jawab (PIC)</span>
              <span className="text-3xl font-black text-slate-50 underline decoration-indigo-500 decoration-4 shadow-sm">{program.pic_name}</span>
            </div>
            <div className="w-px h-12 bg-slate-700" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-1">Tipe Target</span>
              <span className="text-3xl font-black text-slate-50 uppercase">{program.target_type}</span>
            </div>
          </div>
        </div>

        {/* Big Percentages / Milestone Status */}
        <div className="flex flex-col items-end gap-2 text-slate-50">
           {!isQualitative ? (
              <div className="text-right">
                 <div className="text-7xl font-black leading-none">
                   {program.percentageRp.toFixed(1)}<span className="text-3xl text-slate-400">%</span>
                 </div>
                 <p className="text-xs font-bold text-slate-200 uppercase tracking-[0.3em] mt-1">Capaian Rupiah</p>
              </div>
           ) : (
              <div className="text-right flex flex-col items-end">
                 <div className={cn(
                   "px-6 py-3 rounded-2xl border-2 text-3xl font-black uppercase tracking-tighter shadow-2xl transition-all duration-700",
                   milestone.color
                 )}>
                   {milestone.label}
                 </div>
                 <p className="text-xs font-bold text-slate-200 uppercase tracking-[0.3em] mt-2">Status Milestone</p>
              </div>
           )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-10 flex-grow overflow-hidden">
        {/* CASE 1: QUALITATIVE ONLY */}
        {isQualitative && (
          <div className="col-span-12 flex gap-10 h-full">
             <div className="flex-1 bg-slate-900/40 rounded-3xl p-12 border border-slate-800/80 shadow-xl flex flex-col justify-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                   <div className="text-[200px] font-black uppercase leading-none rotate-12">KPI</div>
                </div>
                <h3 className="text-2xl font-bold text-indigo-400 uppercase tracking-[0.2em] mb-8">Deskripsi & Target Milestone</h3>
                <div className="text-5xl font-bold text-slate-100 leading-tight bg-slate-950/40 p-10 rounded-3xl border border-slate-800/50">
                   {program.qualitative_description || 'Tidak ada deskripsi kualitatif.'}
                </div>
             </div>
             <div className="w-1/3 space-y-8 flex flex-col">
                <div className="bg-slate-900/40 rounded-3xl p-10 border border-slate-800/80 shadow-xl flex-grow flex flex-col justify-center items-center text-center">
                   <h4 className="text-xl font-bold text-slate-400 uppercase tracking-widest mb-8">Current Progress</h4>
                   <div className="space-y-12 w-full">
                      {['not_started', 'in_progress', 'completed'].map((s) => (
                        <div key={s} className="flex items-center gap-6 group">
                           <div className={cn(
                             "w-12 h-12 rounded-full border-4 flex items-center justify-center transition-all duration-500",
                             currentMilestone === s ? "border-indigo-500 bg-indigo-500/20 scale-125" : "border-slate-800 bg-slate-900"
                           )}>
                              {currentMilestone === s && <div className="w-4 h-4 rounded-full bg-indigo-400 shadow-[0_0_15px_rgba(129,140,248,0.5)]" />}
                           </div>
                           <span className={cn(
                             "text-2xl font-black uppercase tracking-widest transition-all duration-500",
                             currentMilestone === s ? "text-slate-50" : "text-slate-600"
                           )}>
                             {milestoneStatusMap[s as keyof typeof milestoneStatusMap].label}
                           </span>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* CASE 2: QUANTITATIVE ONLY */}
        {!isQualitative && !isHybrid && (
          <>
            {/* Left Side: Stats Cards (Reuse existing logic) */}
            <div className="col-span-4 space-y-6">
               <div className="bg-slate-900/40 rounded-3xl p-8 border border-slate-800/80 shadow-xl overflow-hidden relative group">
                  <div className="text-sm font-bold text-slate-200 uppercase tracking-widest mb-4">Metrik Keuangan</div>
                  <div className="space-y-6">
                     <div>
                        <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">Target</div>
                        <div className="text-4xl font-black text-slate-200">{formatRupiah(program.monthly_target_rp || 0)}</div>
                     </div>
                     <div>
                        <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">Capaian</div>
                        <div className="text-5xl font-black text-emerald-400">{formatRupiah(program.achievementRp)}</div>
                     </div>
                  </div>
                  <div className="mt-8">
                     <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                          style={{ width: `${Math.min(program.percentageRp, 100)}%` }}
                        />
                     </div>
                  </div>
               </div>

               <div className="bg-slate-900/40 rounded-3xl p-8 border border-slate-800/80 shadow-xl">
                  <div className="text-sm font-bold text-slate-200 uppercase tracking-widest mb-4">Metrik Partisipan</div>
                  <div className="grid grid-cols-2 gap-6">
                     <div>
                        <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">Target</div>
                        <div className="text-4xl font-black text-slate-200">{program.monthly_target_user?.toLocaleString()}</div>
                     </div>
                     <div>
                        <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-1">Capaian</div>
                        <div className="text-4xl font-black text-cyan-400">{program.achievementUser.toLocaleString()}</div>
                     </div>
                  </div>
                  <div className="mt-8 flex items-baseline gap-2">
                     <span className="text-4xl font-black text-slate-200">{program.percentageUser.toFixed(0)}%</span>
                     <span className="text-sm font-bold text-slate-300 uppercase">Growth</span>
                  </div>
               </div>
            </div>

            <div className="col-span-8 bg-slate-900/40 rounded-3xl p-8 border border-slate-800/80 shadow-xl flex flex-col">
               <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black text-slate-100 uppercase tracking-tighter">Tren Akumulasi Pencapaian Harian</h3>
                  <div className="flex items-center gap-6">
                     <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-indigo-500" />
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Realisasi</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <div className="w-3 h-1 bg-slate-600 rounded-full" />
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ideal Path</span>
                     </div>
                  </div>
               </div>

               <div className="flex-grow w-full">
                  <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={chartDataWithTarget} margin={{ top: 45, right: 60, left: 10, bottom: 0 }}>
                        <defs>
                           <linearGradient id="colorAch" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                           </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                        <XAxis 
                          dataKey="displayDate" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }}
                        />
                        <YAxis 
                          hide 
                          domain={[0, (dataMax: number) => Math.max(dataMax, program.monthly_target_rp || 0)]}
                        />
                        <Tooltip 
                           contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                           itemStyle={{ color: '#f1f5f9', fontWeight: 700 }}
                           labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                        />
                        <Area 
                           type="monotone" 
                           dataKey="pencapaian" 
                           stroke="#6366f1" 
                           strokeWidth={4} 
                           fill="url(#colorAch)" 
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
                        >
                        </Area>
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
                        <ReferenceLine 
                          y={program.monthly_target_rp || 0} 
                          stroke="#ef4444" 
                          strokeDasharray="3 3"
                          label={{ position: 'right', value: 'TARGET', fill: '#ef4444', fontSize: 10, fontWeight: 900 }}
                        />

                     </AreaChart>
                  </ResponsiveContainer>
               </div>
            </div>
          </>
        )}

        {/* CASE 3: HYBRID */}
        {isHybrid && (
          <>
            <div className="col-span-4 space-y-6">
               <div className="bg-slate-900/40 rounded-3xl p-8 border border-slate-800/80 shadow-xl overflow-hidden min-h-[300px] flex flex-col justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-200 uppercase tracking-widest mb-4">Milestone Hybrid</div>
                    <div className={cn(
                      "p-6 rounded-2xl border mb-6 text-center shadow-lg",
                      milestone.color
                    )}>
                      <div className="text-sm font-bold uppercase tracking-widest mb-1">Status Saat Ini</div>
                      <div className="text-3xl font-black">{milestone.label}</div>
                    </div>
                  </div>
                  <div className="text-xl text-slate-100 italic leading-relaxed bg-indigo-500/10 p-6 rounded-2xl border border-indigo-500/20">
                    &quot;{program.qualitative_description || 'No description'}&quot;
                  </div>
               </div>
               
               <div className="bg-slate-900/40 rounded-3xl p-8 border border-slate-800/80 shadow-xl overflow-hidden space-y-8">
                  <div className="text-sm font-bold text-slate-200 uppercase tracking-widest">Metrik Finansial (Hybrid)</div>
                  {/* Rp Metric */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Capaian Rp</span>
                      <span className="text-2xl font-black text-emerald-400">{formatRupiah(program.achievementRp)}</span>
                    </div>
                    <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className="h-full bg-emerald-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                        style={{ width: `${Math.min(program.percentageRp, 100)}%` }}
                      />
                    </div>
                  </div>
                  {/* User Metric */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Capaian User</span>
                      <span className="text-2xl font-black text-cyan-400">{program.achievementUser.toLocaleString()}</span>
                    </div>
                    <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className="h-full bg-cyan-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                        style={{ width: `${Math.min(program.percentageUser, 100)}%` }}
                      />
                    </div>
                  </div>
               </div>
            </div>

                <div className="col-span-8 bg-slate-900/40 rounded-3xl p-8 border border-slate-800/80 shadow-xl flex flex-col">
                   <div className="flex justify-between items-center mb-8">
                      <h3 className="text-2xl font-black text-slate-100 uppercase tracking-tighter">Performa Program Hybrid</h3>
                   </div>
                   <div className="flex-grow w-full">
                      <ResponsiveContainer width="100%" height="100%">
                         <AreaChart data={chartDataWithTarget} margin={{ top: 45, right: 60, left: 40, bottom: 0 }}>
                            <defs>
                               <linearGradient id="colorAchHybrid" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                               </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                            <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }} />
                            <YAxis hide domain={[0, (dataMax: number) => Math.max(dataMax, program.monthly_target_rp || 0)]} />
                            <Area 
                               type="monotone" 
                               dataKey="pencapaian" 
                               stroke="#6366f1" 
                               strokeWidth={4} 
                               fill="url(#colorAchHybrid)"
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
                            >
                            </Area>
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
                                <g key={`target-dot-hybrid-${index}`}>
                                  <text x={cx} y={cy + 20} fill="#64748b" fontSize={10} fontWeight={700} textAnchor="middle">
                                    {formatted}
                                  </text>
                                </g>
                              );
                            }}
                         />
                         <ReferenceLine 
                           y={program.monthly_target_rp || 0} 
                           stroke="#ef4444" 
                           strokeDasharray="3 3"
                           label={{ position: 'right', value: 'TARGET', fill: '#ef4444', fontSize: 10, fontWeight: 900 }}
                         />
                      </AreaChart>
                   </ResponsiveContainer>
                </div>
            </div>
          </>
        )}
      </div>

      {/* Motivational Message Footer */}
      {!isQualitative && (
        <div className={cn(
          "mt-6 p-6 rounded-[2rem] border-2 text-center transition-all duration-1000 flex items-center justify-center relative z-10",
          motivationalTheme
        )}>
          <p className="text-3xl font-black uppercase tracking-tight leading-tight drop-shadow-sm">
            {motivationalMessage}
          </p>
        </div>
      )}
    </div>
  )
}
