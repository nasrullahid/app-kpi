'use client'

import { PICPerformance, ProgramPerformance } from '../actions'
import { formatRupiah, cn } from '@/lib/utils'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  LabelList
} from 'recharts'

interface SlidePICDetailProps {
  pic: PICPerformance
  programs: ProgramPerformance[]
}

// ESLint disabled for Recharts custom props which are difficult to type strictly

export function SlidePICDetail({ pic, programs }: SlidePICDetailProps) {
  // Use colors based on status for the bars
  const getStatusColor = (percentage: number) => {
    if (percentage >= 100) return '#10b981' // emerald-500
    if (percentage >= 50) return '#f59e0b' // amber-500
    return '#f43f5e' // rose-500
  }

  const chartData = programs.map(p => ({
    name: p.name,
    percentage: parseFloat(p.percentageRp.toFixed(1)),
    color: getStatusColor(p.percentageRp)
  }))

  return (
    <div className="h-full flex flex-col p-12">
      {/* Header */}
      <div className="flex justify-between items-start mb-12">
        <div>
          <div className="flex items-center gap-4 mb-4">
             <span className="text-2xl font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-6 py-2 rounded-2xl border border-indigo-500/20">
               Personal Performance
             </span>
             <span className="text-xl font-bold text-slate-200 uppercase tracking-widest">
               {pic.programCount} Program Dikelola
             </span>
          </div>
          <h1 className="text-8xl font-black text-slate-100 uppercase tracking-tighter leading-none mb-4">
             {pic.picName}
          </h1>
        </div>

        {/* Status Badge Big */}
        <div className="flex flex-col items-end">
           <div className={cn(
             "px-10 py-4 rounded-3xl border-2 text-4xl font-black uppercase tracking-tighter shadow-2xl transition-all duration-1000",
             pic.status === 'TERCAPAI' ? 'text-emerald-400 border-emerald-500 bg-emerald-500/10' :
             pic.status === 'MENUJU TARGET' ? 'text-amber-400 border-amber-500 bg-amber-500/10' :
             'text-rose-400 border-rose-500 bg-rose-500/10'
           )}>
             {pic.status}
           </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-10 flex-grow">
        {/* Statistics Cards */}
        <div className="col-span-5 space-y-8">
           <div className="bg-slate-900/40 rounded-3xl p-10 border border-slate-800/80 shadow-2xl relative overflow-hidden group h-full flex flex-col justify-center">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                 <div className="text-[120px] font-black leading-none">{pic.percentageRp.toFixed(0)}%</div>
              </div>

              <div className="space-y-10 relative z-10">
                 <div>
                    <h4 className="text-xl font-bold text-slate-200 uppercase tracking-widest mb-2">Total Tanggung Jawab (Rp)</h4>
                    <p className="text-6xl font-black text-slate-100">{formatRupiah(pic.totalTargetRp)}</p>
                 </div>
                 <div>
                    <h4 className="text-xl font-bold text-slate-200 uppercase tracking-widest mb-2">Total Pencapaian (Rp)</h4>
                    <p className="text-7xl font-black text-indigo-400">{formatRupiah(pic.totalAchievementRp)}</p>
                 </div>
                 <div className="space-y-4">
                    <div className="flex justify-between items-end px-2">
                       <span className="text-xl font-bold text-slate-200 uppercase tracking-widest">Akumulasi Kinerja</span>
                       <span className="text-4xl font-black text-slate-100">{pic.percentageRp.toFixed(1)}%</span>
                    </div>
                    <div className="h-6 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-1">
                       <div 
                         className={cn(
                           "h-full rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(0,0,0,0.5)]",
                           pic.status === 'TERCAPAI' ? 'bg-emerald-500' : 
                           pic.status === 'MENUJU TARGET' ? 'bg-amber-500' : 'bg-rose-500'
                         )}
                         style={{ width: `${Math.min(pic.percentageRp, 100)}%` }}
                       />
                    </div>
                 </div>

                 <div className="space-y-4 pt-6 mt-6 border-t border-slate-800/50">
                    <div className="flex justify-between items-end px-2">
                       <span className="text-xl font-bold text-slate-200 uppercase tracking-widest">Capaian User</span>
                       <span className="text-4xl font-black text-cyan-400">
                          {pic.totalTargetUser > 0 ? ((pic.totalAchievementUser / pic.totalTargetUser) * 100).toFixed(0) : 0}%
                       </span>
                    </div>
                    <div className="flex items-baseline gap-2 px-2">
                       <span className="text-xl font-bold text-slate-100">{pic.totalAchievementUser.toLocaleString()}</span>
                       <span className="text-sm font-bold text-slate-400">of {pic.totalTargetUser.toLocaleString()}</span>
                    </div>
                    <div className="h-4 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-1">
                       <div 
                         className="h-full rounded-full bg-cyan-500 transition-all duration-1000"
                         style={{ width: `${Math.min(pic.totalTargetUser > 0 ? (pic.totalAchievementUser / pic.totalTargetUser) * 100 : 0, 100)}%` }}
                       />
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* Program Breakdown Chart */}
        <div className="col-span-7 bg-slate-900/40 rounded-3xl p-10 border border-slate-800/80 shadow-2xl flex flex-col">
           <div className="flex justify-between items-center mb-10">
              <h4 className="text-2xl font-black text-slate-100 uppercase tracking-tighter">Performa per Program Dikelola (%)</h4>
           </div>

           <div className="flex-grow w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, left: 100, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#1e293b" />
                    <XAxis type="number" hide domain={[0, 110]} />
                    <YAxis 
                       dataKey="name" 
                       type="category" 
                       axisLine={false} 
                       tickLine={false} 
                       width={180}
                       tick={{ fill: '#f1f5f9', fontSize: 14, fontWeight: 900, width: 170 }}
                    />
                    <Tooltip 
                       cursor={{ fill: '#1e293b', opacity: 0.4 }}
                       contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                       itemStyle={{ fontWeight: 900 }}
                    />
                    <Bar 
                      dataKey="percentage" 
                      radius={[0, 8, 8, 0]} 
                      barSize={40}
                      animationDuration={1500}
                    >
                       <LabelList 
                          dataKey="percentage" 
                          position="right" 
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          content={(props: any) => {
                             const { x, y, width, value } = props;
                             if (x === undefined || y === undefined || width === undefined || value === undefined) return null;
                             return (
                                <g transform={`translate(${x},${y + 20})`}>
                                   <rect x={10} y={-14} width={50} height={28} fill="#1e293b" opacity={0.8} rx={6} stroke="#334155" strokeWidth={1} />
                                   <text 
                                      x={35} y={0} fill="#f1f5f9" fontSize={16} fontWeight={900} textAnchor="middle" dominantBaseline="middle"
                                      style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,1))' }}
                                   >
                                      {value}%
                                   </text>
                                </g>
                             );
                          }}
                       />
                       {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                       ))}
                    </Bar>
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>
    </div>
  )
}
