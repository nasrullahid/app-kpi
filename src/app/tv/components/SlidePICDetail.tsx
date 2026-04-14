'use client'

import { PICPerformance, ProgramPerformance } from '../actions'
import { cn } from '@/lib/utils'
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
  // Use colors based on health status for the bars
  const getStatusColor = (health: number) => {
    if (health >= 100) return '#10b981' // emerald-500
    if (health >= 80) return '#10b981' // BAIK
    if (health >= 60) return '#f59e0b' // CUKUP
    if (health >= 40) return '#f43f5e' // PERLU PERHATIAN
    return '#e11d48' // rose-600 KRITIS
  }

  const chartData = programs.map(p => ({
    name: p.name,
    health: parseFloat(p.health.healthScore.toFixed(1)),
    status: p.health.status,
    color: getStatusColor(p.health.healthScore)
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
             "px-10 py-4 rounded-3xl border-2 text-4xl font-black text-slate-50 uppercase tracking-tighter shadow-2xl transition-all duration-1000",
             pic.status === 'EXCELLENT' || pic.status === 'BAIK' ? 'text-emerald-400 border-emerald-500 bg-emerald-500/10' :
             pic.status === 'CUKUP' ? 'text-amber-400 border-amber-500 bg-amber-500/10' :
             'text-rose-400 border-rose-500 bg-rose-500/10'
           )}>
             {pic.status}
           </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-10 flex-grow">
        {/* Statistics Cards */}
        <div className="col-span-4 space-y-8">
           <div className="bg-slate-900/40 rounded-3xl p-10 border border-slate-800/80 shadow-2xl relative overflow-hidden group h-full flex flex-col justify-center">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                 <div className="text-[120px] font-black text-slate-50 leading-none">{pic.avgHealthScore.toFixed(0)}%</div>
              </div>

              <div className="space-y-10 relative z-10">
                 <div className="text-center pb-10 border-b border-slate-800/50">
                    <h4 className="text-xl font-bold text-slate-400 uppercase tracking-[0.5em] mb-4">Overall Grade</h4>
                    <div className={cn(
                      "text-9xl font-black leading-none",
                      pic.grade.color
                    )}>
                      {pic.grade.label}
                    </div>
                 </div>

                 <div className="space-y-4">
                    <div className="flex justify-between items-end px-2">
                       <span className="text-xl font-bold text-slate-200 uppercase tracking-widest">Avg Health Score</span>
                       <span className="text-4xl font-black text-slate-50">{pic.avgHealthScore.toFixed(1)}%</span>
                    </div>
                    <div className="h-6 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-1">
                       <div 
                         className={cn(
                           "h-full rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(0,0,0,0.5)]",
                           pic.avgHealthScore >= 80 ? 'bg-emerald-500' : 
                           pic.avgHealthScore >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                         )}
                         style={{ width: `${Math.min(pic.avgHealthScore, 100)}%` }}
                       />
                    </div>
                 </div>

                 <div className="flex flex-wrap gap-4 pt-4">
                    <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 flex-1 text-center">
                       <span className="block text-xs font-bold text-slate-500 uppercase mb-2">Programs</span>
                       <span className="text-4xl font-black text-slate-100">{pic.programCount}</span>
                    </div>
                    <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 flex-1 text-center">
                       <span className="block text-xs font-bold text-slate-500 uppercase mb-2">Avg Perform</span>
                       <span className={cn(
                         "text-4xl font-black",
                         pic.avgHealthScore >= 80 ? 'text-emerald-400' : 
                         pic.avgHealthScore >= 60 ? 'text-amber-400' : 'text-rose-400'
                       )}>
                         {pic.avgHealthScore.toFixed(0)}%
                       </span>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* Program Breakdown Chart */}
        <div className="col-span-8 bg-slate-900/40 rounded-3xl p-10 border border-slate-800/80 shadow-2xl flex flex-col">
           <div className="flex justify-between items-center mb-10">
              <h4 className="text-2xl font-black text-slate-50 uppercase tracking-tighter">Health Score per Program (%)</h4>
           </div>

           <div className="flex-grow w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 80, left: 100, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#1e293b" />
                    <XAxis type="number" hide domain={[0, 120]} />
                    <YAxis 
                       dataKey="name" 
                       type="category" 
                       axisLine={false} 
                       tickLine={false} 
                       width={180}
                       tick={{ fill: '#f1f5f9', fontSize: 14, fontWeight: 900 }}
                       tickFormatter={(v: string) => v.length > 20 ? v.substring(0, 20) + '...' : v}
                    />
                    <Tooltip 
                       cursor={{ fill: '#1e293b', opacity: 0.4 }}
                       contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                       itemStyle={{ color: '#f8fafc', fontWeight: 900 }}
                       labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                    />
                       <Bar 
                         dataKey="health" 
                         radius={[0, 8, 8, 0]} 
                         barSize={40}
                       >
                          <LabelList 
                             dataKey="health" 
                             position="right" 
                             // eslint-disable-next-line @typescript-eslint/no-explicit-any
                             content={(props: any) => {
                                 const { x, y, width, value } = props;
                                 if (x === undefined || y === undefined || width === undefined || value === undefined) return null;
                                 
                                 return (
                                    <g transform={`translate(${x + width + 10},${y + 20})`}>
                                       <text 
                                          x={0} y={0} fill="#f1f5f9" fontSize={16} fontWeight={900} textAnchor="start" dominantBaseline="middle"
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
