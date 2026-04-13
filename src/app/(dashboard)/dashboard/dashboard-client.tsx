'use client'

import { useState, useMemo } from 'react'
import { Database } from '@/types/database'
import { getDepartmentConfig } from '@/lib/department-config'
import { calculateProgramHealth, calculateDepartmentHealth, ProgramWithRelations } from '@/lib/dashboard-calculator'
import { formatRupiah } from '@/lib/utils'
import { formatMetricValue } from '@/lib/formula-evaluator'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import { ChartContainer } from "@/components/ui/chart"
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { 
  HeartPulse, 
  Layers, 
  Target, 
  CheckSquare, 
  ArrowRight,
  AlertTriangle
} from 'lucide-react'
import { DatePickerWithRange } from '@/components/date-range-picker'
import { DateRange } from 'react-day-picker'
import { format as formatDate } from 'date-fns'
import Link from 'next/link'

type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']
type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
type Period = Database['public']['Tables']['periods']['Row']

interface DashboardClientProps {
  programs: ProgramWithRelations[]
  dailyInputs: DailyInput[]
  activePeriod: Period
  initialFilters: { startDate: string; endDate: string }
  milestoneCompletions: MilestoneCompletion[]
  metricValues?: MetricValue[]
}

const getStatusColor = (score: number) => {
  if (score >= 100) return 'text-emerald-600 bg-emerald-50 border-emerald-200'
  if (score >= 80) return 'text-indigo-600 bg-indigo-50 border-indigo-200'
  if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-200'
  return 'text-red-600 bg-red-50 border-red-200'
}
const getProgressColor = (score: number) => {
  if (score >= 100) return 'bg-emerald-500'
  if (score >= 80) return 'bg-indigo-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

export function DashboardClient({ 
  programs, 
  dailyInputs, 
  activePeriod, 
  initialFilters, 
  milestoneCompletions,
  metricValues = []
}: DashboardClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterDepartment, setFilterDepartment] = useState<string>('all')

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (initialFilters.startDate && initialFilters.endDate) {
      return {
        from: new Date(initialFilters.startDate),
        to: new Date(initialFilters.endDate)
      }
    }
    return undefined
  })

  const isFilterActive = !!(dateRange?.from && dateRange?.to)

  const handleApplyFilter = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (dateRange?.from && dateRange?.to) {
      params.set('startDate', formatDate(dateRange.from, 'yyyy-MM-dd'))
      params.set('endDate', formatDate(dateRange.to, 'yyyy-MM-dd'))
    } else {
      params.delete('startDate')
      params.delete('endDate')
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleResetFilter = () => {
    setDateRange(undefined)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('startDate')
    params.delete('endDate')
    router.push(`${pathname}?${params.toString()}`)
  }

  // 1. Pro-ration Factor
  const daysInSelection = useMemo(() => {
    if (isFilterActive && dateRange?.from && dateRange?.to) {
      const diffTime = Math.abs(dateRange.to.getTime() - dateRange.from.getTime())
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    }
    return activePeriod.working_days || 30
  }, [isFilterActive, dateRange, activePeriod])

  const prorationFactor = isFilterActive 
    ? (daysInSelection / (activePeriod.working_days || 30)) 
    : 1

  // 2. Compute Global Health Status
  const programHealths = useMemo(() => {
    return programs.map(p => calculateProgramHealth(p, metricValues, dailyInputs, milestoneCompletions, prorationFactor))
  }, [programs, metricValues, dailyInputs, milestoneCompletions, prorationFactor])

  const overallHealthScore = useMemo(() => {
    if (programHealths.length === 0) return 0
    return programHealths.reduce((sum, h) => sum + h.healthScore, 0) / programHealths.length
  }, [programHealths])

  const globalStatusLabel = useMemo(() => {
    if (overallHealthScore < 40) return "Kritis"
    if (overallHealthScore < 60) return "Perlu Perhatian"
    if (overallHealthScore < 80) return "Cukup"
    if (overallHealthScore < 100) return "Baik"
    return "Luar Biasa"
  }, [overallHealthScore])

  // 3. Compute Dept Stats
  const activeDepartments = useMemo(() => {
    const depts = new Set(programs.map(p => p.department))
    return Array.from(depts).map(d => {
      const deptProgs = programs.filter(p => p.department === d)
      const health = calculateDepartmentHealth(deptProgs, metricValues, dailyInputs, milestoneCompletions, prorationFactor)
      return {
        key: d,
        config: getDepartmentConfig(d),
        programCount: deptProgs.length,
        healthScore: health.score
      }
    }).sort((a, b) => b.healthScore - a.healthScore) // highest score first
  }, [programs, metricValues, dailyInputs, milestoneCompletions, prorationFactor])

  // 4. Milestone Stats
  const totalMilestones = useMemo(() => {
    return programs.reduce((sum, p) => sum + (p.program_milestones?.length || 0), 0)
  }, [programs])
  const completedMilestones = useMemo(() => {
    return programs.reduce((sum, p) => {
       const msIds = p.program_milestones?.map(m => m.id) || []
       const count = milestoneCompletions.filter(c => msIds.includes(c.milestone_id) && c.is_completed).length
       return sum + count
    }, 0)
  }, [programs, milestoneCompletions])

  const targetTercapaiCount = programHealths.filter(h => h.healthScore >= 100).length

  // 5. Motivational Banner text
  const bannerInfo = useMemo(() => {
    const s = overallHealthScore
    if (s < 40) return { title: "TARGET JAUH TERTINGGAL — FOKUS DAN KEJAR SEKARANG! 💪", bg: 'bg-red-600', text: 'text-red-50' }
    if (s < 60) return { title: "MASIH ADA WAKTU — TINGKATKAN INTENSITAS! 🔥", bg: 'bg-amber-600', text: 'text-amber-50' }
    if (s < 80) return { title: "PROGRES BAGUS — JANGAN KENDUR! 🎯", bg: 'bg-indigo-500', text: 'text-indigo-50' }
    if (s < 100) return { title: "HAMPIR SAMPAI — SATU LANGKAH LAGI! 🚀", bg: 'bg-indigo-600', text: 'text-indigo-50' }
    return { title: "TARGET TERCAPAI — LUAR BIASA! 🏆", bg: 'bg-emerald-600', text: 'text-emerald-50' }
  }, [overallHealthScore])

  // 6. Trend Daily Chart
  // We need to trace the health score of the department per day in the period
  const trendData = useMemo(() => {
    const days = Array.from({ length: Math.min(daysInSelection, 31) }, (_, i) => i + 1)
    return days.map(day => {
      const dateStr = `${activePeriod.year}-${String(activePeriod.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      // Filter data up to this date
      const subsetInputs = dailyInputs.filter(i => i.date <= dateStr)
      const subsetMetrics = metricValues.filter(m => m.date <= dateStr)
      
      const dayFactor = day / (activePeriod.working_days || 30) // pro-rated target factor for that specific day
      const dayRecord: Record<string, string | number> = { day: String(day) }
      
      activeDepartments.forEach(dept => {
        const deptProgs = programs.filter(p => p.department === dept.key)
        const dHealth = calculateDepartmentHealth(deptProgs, subsetMetrics, subsetInputs, milestoneCompletions, dayFactor)
        dayRecord[dept.key] = Math.min(Math.round(dHealth.score), 150) // clamp at 150% visually
      })
      
      return dayRecord
    })
  }, [activePeriod, daysInSelection, dailyInputs, metricValues, milestoneCompletions, activeDepartments, programs])

  const chartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {}
    const defaultColors = [
      '#4f46e5', // indigo-600
      '#059669', // emerald-600
      '#ea580c', // orange-600
      '#e11d48', // rose-600
      '#0891b2', // cyan-600
      '#9333ea', // purple-600
      '#ca8a04', // yellow-600
    ]
    activeDepartments.forEach((d, idx) => {
      cfg[d.key] = { label: d.config.label, color: defaultColors[idx % defaultColors.length] }
    })
    return cfg
  }, [activeDepartments])

  // 7. Attention List
  const needAttentionPrograms = programHealths
    .filter(h => h.healthScore < 50)
    .sort((a, b) => a.healthScore - b.healthScore)
    .map(h => ({
      ...h,
      program: programs.find(p => p.id === h.programId)!
    }))

  return (
    <div className="space-y-6">
      
      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-500" /> Executive Overview
        </h3>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
          <div className="flex gap-2">
             <button onClick={handleApplyFilter} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition flex-1 sm:flex-none">
               Terapkan
             </button>
             {isFilterActive && (
               <button onClick={handleResetFilter} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition flex-1 sm:flex-none">
                 Reset
               </button>
             )}
          </div>
        </div>
      </div>

      {/* Motivational Banner */}
      <div className={`${bannerInfo.bg} ${bannerInfo.text} p-4 rounded-xl shadow border border-white/20 text-center font-black tracking-widest text-sm sm:text-base animate-in fade-in zoom-in duration-500`}>
        {bannerInfo.title}
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Health Score */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><HeartPulse className="w-16 h-16" /></div>
          <div className="text-sm font-bold tracking-widest text-slate-400 mb-2">HEALTH SCORE</div>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-black text-slate-800">{overallHealthScore.toFixed(1)}%</span>
            <span className={`text-xs font-bold px-2 py-1 rounded-md mb-1 border ${getStatusColor(overallHealthScore)}`}>
              {globalStatusLabel}
            </span>
          </div>
        </div>

        {/* Program Aktif */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Layers className="w-16 h-16" /></div>
          <div className="text-sm font-bold tracking-widest text-slate-400 mb-2">PROGRAM AKTIF</div>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-black text-slate-800">{programs.length}</span>
            <span className="text-sm font-bold text-slate-500 mb-1 border px-2 py-1 bg-slate-50 rounded-md">
              {activeDepartments.length} Dept
            </span>
          </div>
        </div>

        {/* Target Tercapai */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Target className="w-16 h-16" /></div>
          <div className="text-sm font-bold tracking-widest text-slate-400 mb-2">TARGET TERCAPAI</div>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-black text-emerald-600">{targetTercapaiCount}</span>
            <span className="text-sm font-bold text-slate-500 mb-1 border px-2 py-1 bg-slate-50 rounded-md">
              / {programs.length} Prog
            </span>
          </div>
        </div>

        {/* Milestone Done */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><CheckSquare className="w-16 h-16" /></div>
          <div className="text-sm font-bold tracking-widest text-slate-400 mb-2">MILESTONE DONE</div>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-black text-indigo-600">{completedMilestones}</span>
            <span className="text-sm font-bold text-slate-500 mb-1 border px-2 py-1 bg-slate-50 rounded-md">
              / {totalMilestones} Tugas
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Department Progress Bars */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <h3 className="font-bold text-slate-800 mb-2">Progres Kinerja per Departemen</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeDepartments.map(dept => (
            <div key={dept.key} className="space-y-2 group">
              <div className="flex justify-between items-end">
                <div>
                  <h4 className="font-bold text-slate-700 flex items-center gap-2">
                     <span className={`w-3 h-3 rounded-full ${getProgressColor(dept.healthScore)}`}></span>
                     {dept.config.label}
                  </h4>
                  <p className="text-xs text-slate-400 font-medium">{dept.programCount} Program</p>
                </div>
                <div className="text-right">
                  <span className="font-black text-lg text-slate-800">{dept.healthScore.toFixed(0)}%</span>
                </div>
              </div>
              
              {/* Progress Bar Container */}
              <Link href={`/dashboard/${dept.key}`} className="block relative h-3 bg-slate-100 rounded-full overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-300 transition-all">
                <div 
                  className={`absolute top-0 left-0 h-full rounded-full ${getProgressColor(dept.healthScore)} transition-all duration-1000`}
                  style={{ width: `${Math.min(dept.healthScore, 100)}%` }}
                ></div>
              </Link>
              <div className="text-right">
                 <Link href={`/dashboard/${dept.key}`} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Lihat Detail <ArrowRight className="w-3 h-3" />
                 </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Charts & Attention */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Trend Line Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
           <h3 className="font-bold text-slate-800 mb-6">Tren Health Score Harian (%)</h3>
           <div className="h-[300px] w-full">
             <ChartContainer config={chartConfig} className="w-full h-full">
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={trendData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                   <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                   <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} domain={[0, 150]} />
                   <Tooltip 
                     contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                     labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}
                     itemStyle={{ fontWeight: 'bold', fontSize: '14px' }}
                     // eslint-disable-next-line @typescript-eslint/no-explicit-any
                     formatter={(value: any, name: any) => [`${value}%`, name]}
                   />
                   <ReferenceLine y={100} stroke="#10b981" strokeDasharray="3 3" label={{ position: 'top', value: 'Target 100%', fill: '#10b981', fontSize: 10, fontWeight: 'bold' }} />
                   
                   {activeDepartments.map(d => (
                     <Line 
                       key={d.key}
                       type="monotone"
                       dataKey={d.key}
                       name={d.config.label}
                       stroke={chartConfig[d.key as keyof typeof chartConfig].color}
                       strokeWidth={3}
                       dot={false}
                       activeDot={{ r: 6 }}
                     />
                   ))}
                 </LineChart>
               </ResponsiveContainer>
             </ChartContainer>
           </div>
        </div>

        {/* Right: Attention List */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
           <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
             <AlertTriangle className="w-5 h-5 text-amber-500" /> Perlu Perhatian
           </h3>
           
           <div className="flex-1 overflow-y-auto pr-2 space-y-4">
             {needAttentionPrograms.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 py-12">
                 <div className="bg-emerald-100 p-3 rounded-full"><HeartPulse className="w-8 h-8 text-emerald-600" /></div>
                 <p className="font-bold text-center">Hebat! Semua program sehat (≥ 50%).</p>
               </div>
             ) : (
               needAttentionPrograms.map((item) => {
                 const deptName = getDepartmentConfig(item.program.department).label
                 
                 return (
                   <div key={item.programId} className="group p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors relative overflow-hidden">
                     <div className={`absolute left-0 top-0 bottom-0 w-1 ${getProgressColor(item.healthScore)}`}></div>
                     <div className="flex justify-between items-start gap-2 mb-2">
                       <div>
                         <h4 className="font-bold text-slate-700 leading-tight mb-1">{item.program.name}</h4>
                         <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                           {deptName}
                         </span>
                       </div>
                       <div className="text-right">
                         <span className={`text-lg font-black ${getProgressColor(item.healthScore).replace('bg-', 'text-')}`}>
                           {item.healthScore.toFixed(0)}%
                         </span>
                       </div>
                     </div>
                     <Link href={`/dashboard/${item.program.department}`} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mt-3">
                       Lihat Detail Program <ArrowRight className="w-3 h-3" />
                     </Link>
                   </div>
                 )
               })
             )}
           </div>
        </div>
      </div>

      {/* Row 4: Detail Program Preview (Globally Filtered) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mt-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="flex flex-wrap gap-4 items-center w-full md:w-auto text-sm font-bold text-slate-500">
            <div className="flex items-center gap-2">
              <label>TIPE:</label>
              <select 
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-white border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">SEMUA</option>
                <option value="quantitative">KUANTITATIF (TARGET ANGKA)</option>
                <option value="qualitative">KUALITATIF (MILESTONE)</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <label>DEPT:</label>
              <select 
                value={filterDepartment} 
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="bg-white border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">SEMUA DEPT</option>
                {activeDepartments.map(d => (
                  <option key={d.key} value={d.key}>{d.config.label.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label>STATUS:</label>
              <select 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-white border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">SEMUA</option>
                <option value="tercapai">TERCAPAI (≥100%)</option>
                <option value="perhatian">PERLU PERHATIAN (&lt;100%)</option>
              </select>
            </div>
          </div>
          
          <div className="text-right text-sm font-bold tracking-tight text-slate-500 min-w-max">
            TOTAL: <span className="text-indigo-600">{
              programHealths.filter(h => {
                const p = programs.find(prog => prog.id === h.programId)
                if (!p) return false
                if (filterType !== 'all' && p.target_type !== filterType) return false
                if (filterDepartment !== 'all' && p.department !== filterDepartment) return false
                if (filterStatus === 'tercapai' && h.healthScore < 100) return false
                if (filterStatus === 'perhatian' && h.healthScore >= 100) return false
                return true
              }).length
            } PROGRAM</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {programHealths.filter(h => {
             const p = programs.find(prog => prog.id === h.programId)
             if (!p) return false
             if (filterType !== 'all' && p.target_type !== filterType) return false
             if (filterDepartment !== 'all' && p.department !== filterDepartment) return false
             if (filterStatus === 'tercapai' && h.healthScore < 100) return false
             if (filterStatus === 'perhatian' && h.healthScore >= 100) return false
             return true
          }).map(h => {
            const p = programs.find(prog => prog.id === h.programId)!
            const deptConfig = getDepartmentConfig(p.department)
            const isLegacy = p.target_type === 'quantitative' && (p.program_metric_definitions || []).length === 0
            
            return (
               <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between hover:border-indigo-300 transition-colors">
                  <div className="mb-4">
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <h4 className="font-bold text-slate-800 leading-tight flex-1 uppercase tracking-tight">{p.name}</h4>
                      {h.healthScore < 100 ? (
                        <span className="text-[10px] font-black uppercase bg-red-100 text-red-600 px-2 py-1 rounded-md shrink-0 flex items-center gap-1 border border-red-200">
                          <span className="text-red-500">✕</span> PERHATIAN
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md shrink-0 flex items-center gap-1 border border-emerald-200">
                          <span className="text-emerald-500">✓</span> TERCAPAI
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className={`text-[9px] font-black tracking-widest px-2 py-0.5 rounded-md border ${deptConfig.color} ${deptConfig.textColor} ${deptConfig.color.replace('bg-', 'border-').replace('100', '200')}`}>
                        {deptConfig.label.toUpperCase()}
                      </span>
                      <div className="flex items-center gap-1.5 ml-1">
                        <span className="text-[10px] font-black tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full flex items-center justify-center min-w-[24px]">
                          PIC
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{p.program_pics?.length || 1} PIC</span>
                      </div>
                    </div>

                    {isLegacy ? (
                      // Legacy Layout
                      <div className="space-y-4">
                        <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                           <div className="flex flex-col">
                             <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Actual Capaian</span>
                             <span className="font-black text-xl text-slate-800">
                               {formatRupiah(dailyInputs.filter(i => i.program_id === p.id).reduce((s, i) => s + Number(i.achievement_rp || 0), 0))}
                             </span>
                           </div>
                           <div className="flex flex-col text-right">
                             <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Global Target</span>
                             <span className="font-bold text-sm text-slate-600">
                               {formatRupiah((p.monthly_target_rp || 0) * prorationFactor)}
                             </span>
                           </div>
                        </div>

                        <div>
                           <div className="flex justify-between items-center mb-1">
                             <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Yield Progress</span>
                             <span className="text-[10px] font-black text-slate-800">{h.healthScore.toFixed(1)}%</span>
                           </div>
                           <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                             <div className={`h-full ${getProgressColor(h.healthScore)}`} style={{width: `${Math.min(h.healthScore, 100)}%`}}></div>
                           </div>
                        </div>

                        <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg mt-2">
                           <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1"><Layers className="w-3 h-3" /> User Flow</span>
                           <span className="text-xs font-black text-slate-800">
                             {dailyInputs.filter(i => i.program_id === p.id).reduce((s, i) => s + Number(i.achievement_user || 0), 0)}
                             <span className="text-slate-400 font-bold"> / {(p.monthly_target_user || 0) * prorationFactor}</span>
                           </span>
                        </div>
                      </div>
                    ) : p.target_type === 'qualitative' ? (
                      // Qualitative Layout
                      <div className="space-y-4">
                        <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                           <div className="flex flex-col">
                             <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Milestone Selesai</span>
                             <span className="font-black text-xl text-slate-800">
                               {p.program_milestones?.filter(ms => milestoneCompletions.find(c => c.milestone_id === ms.id && c.is_completed)).length || 0}
                             </span>
                           </div>
                           <div className="flex flex-col text-right">
                             <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Total Milestone</span>
                             <span className="font-bold text-sm text-slate-600">
                               {p.program_milestones?.length || 0}
                             </span>
                           </div>
                        </div>

                        <div>
                           <div className="flex justify-between items-center mb-1">
                             <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Yield Progress</span>
                             <span className="text-[10px] font-black text-slate-800">{h.healthScore.toFixed(1)}%</span>
                           </div>
                           <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                             <div className={`h-full ${getProgressColor(h.healthScore)}`} style={{width: `${Math.min(h.healthScore, 100)}%`}}></div>
                           </div>
                        </div>
                      </div>
                    ) : (
                      // Custom Metrics Layout
                      <div className="space-y-4">
                        {p.program_metric_definitions?.filter(m => m.is_target_metric).slice(0, 2).map((m, idx) => {
                           const vals = metricValues?.filter(mv => mv.program_id === p.id && mv.metric_definition_id === m.id) || []
                           const actual = vals.reduce((s, v) => s + (v.value || 0), 0)
                           let mt = m.monthly_target || 0
                           if (mt === 0) {
                              if (m.data_type === 'currency') mt = p.monthly_target_rp || 0
                              else if (m.data_type === 'integer') mt = p.monthly_target_user || 0
                           }
                           const target = mt * prorationFactor
                           const pct = target > 0 ? (actual / target) * 100 : 0
                           
                           return (
                             <div key={m.id} className={idx > 0 ? "border-t border-slate-100 pt-3" : ""}>
                               <div className="flex justify-between items-end mb-1">
                                 <div className="flex flex-col">
                                   <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">{m.label}</span>
                                   <span className="font-black text-sm text-slate-800">
                                     {formatMetricValue(actual, m.data_type, m.unit_label)}
                                   </span>
                                 </div>
                                 <div className="flex flex-col text-right">
                                   <span className="text-[9px] uppercase font-black text-slate-300 tracking-wider">Target</span>
                                   <span className="font-bold text-xs text-slate-500">
                                     {formatMetricValue(target, m.data_type, m.unit_label)}
                                   </span>
                                 </div>
                               </div>

                               <div>
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-[8px] uppercase font-bold tracking-widest text-slate-400">Yield Progress</span>
                                    <span className="text-[9px] font-black text-slate-700">{pct.toFixed(1)}%</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${getProgressColor(pct)}`} style={{width: `${Math.min(pct, 100)}%`}}></div>
                                  </div>
                               </div>
                             </div>
                           )
                        })}
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center mt-auto">
                    {isLegacy ? (
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Daily Pro-Rata: {formatRupiah(p.daily_target_rp || ((p.monthly_target_rp || 0)/(activePeriod.working_days || 30)))}</span>
                    ) : (
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{h.totalTargetMetrics} KPI Aktif - Custom Metrics</span>
                    )}
                    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Team Active</span>
                  </div>
               </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
