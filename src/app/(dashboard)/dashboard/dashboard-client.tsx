'use client'

import { useState, useMemo } from 'react'
import { Database } from '@/types/database'
import { formatRupiah } from '@/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area
} from 'recharts'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Calendar as CalendarIcon, Filter, XCircle, ChartNoAxesColumn, ChartNoAxesCombined } from 'lucide-react'
import { DatePickerWithRange } from '@/components/date-range-picker'
import { DateRange } from 'react-day-picker'
import { format as formatDate } from 'date-fns'

type Program = Database['public']['Tables']['programs']['Row']
type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
type Period = Database['public']['Tables']['periods']['Row']

interface DashboardClientProps {
  programs: Program[]
  dailyInputs: DailyInput[]
  activePeriod: Period
  initialFilters: {
    startDate: string
    endDate: string
  }
}

type AggregatedProgram = Program & {
  cumulative_rp: number
  cumulative_user: number
  effective_target_rp: number
  effective_target_user: number
  latest_qualitative_status: 'not_started' | 'in_progress' | 'completed' | null
  percentage_rp: number
  per_day_target_rp: number
  per_day_target_user: number
  business_status: 'PERLU PERHATIAN' | 'MENUJU TARGET' | 'TERCAPAI' | 'TERLAMPAUI'
}

interface TooltipPayloadEntry {
  payload: {
    Target: number;
    Pencapaian: number;
    percentage: number;
  };
}

// Custom Tooltip component for Program Bar Chart
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-4 rounded-xl shadow-xl border border-slate-200 min-w-[240px] z-[9999]">
        <p className="font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">{label}</p>
        <div className="space-y-2">
          <div className="flex justify-between items-center gap-4">
             <span className="text-xs font-semibold text-slate-500">Target (Pro-rata)</span>
             <span className="text-sm font-bold text-slate-400">{formatRupiah(data.Target)}</span>
          </div>
          <div className="flex justify-between items-center gap-4">
             <span className="text-xs font-semibold text-slate-500">Total Pencapaian</span>
             <span className="text-sm font-bold text-indigo-600">{formatRupiah(data.Pencapaian)}</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">Status Capaian</span>
            <span className={`text-xs font-bold px-2 py-1 rounded inline-block ${
              data.percentage >= 100 ? 'bg-emerald-100 text-emerald-800' :
              data.percentage >= 50 ? 'bg-amber-100 text-amber-800' :
              'bg-red-100 text-red-800'
            }`}>
              {data.percentage.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

interface TrendPayloadEntry {
  value: number;
}

// Tooltip for Daily Trend Chart
const CustomTrendTooltip = ({ active, payload, label }: { active?: boolean; payload?: TrendPayloadEntry[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 rounded-xl shadow-xl border border-slate-200 min-w-[200px] z-[9999]">
        <p className="font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">Tanggal {label}</p>
        <div className="space-y-2">
          <div className="flex justify-between items-center gap-4">
             <span className="text-xs font-semibold text-slate-500">Akumulasi Aktual</span>
             <span className="text-sm font-bold text-indigo-600">{formatRupiah(payload[0].value)}</span>
          </div>
          <div className="flex justify-between items-center gap-4">
             <span className="text-xs font-semibold text-slate-500">Target Ideal (Linear)</span>
             <span className="text-sm font-bold text-slate-400">{formatRupiah(payload[1].value)}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

// ... (logic)

export function DashboardClient({ programs, dailyInputs, activePeriod, initialFilters }: DashboardClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  
  // Date range state
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

  // To support the useMemo trend logic, we need startDate and endDate strings
  const startDate = dateRange?.from ? formatDate(dateRange.from, 'yyyy-MM-dd') : ''
  const endDate = dateRange?.to ? formatDate(dateRange.to, 'yyyy-MM-dd') : ''

  // 1. Calculate Pro-ration Factor
  const daysInSelection = useMemo(() => {
    if (isFilterActive && dateRange?.from && dateRange?.to) {
      // difference in days
      const diffTime = Math.abs(dateRange.to.getTime() - dateRange.from.getTime())
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    }
    return activePeriod.working_days || 30
  }, [isFilterActive, dateRange, activePeriod])

  const prorationFactor = isFilterActive 
    ? (daysInSelection / (activePeriod.working_days || 30)) 
    : 1

  // 2. Data processing - Aggregate per Program
  const aggregatedData: AggregatedProgram[] = useMemo(() => {
    return programs.map(prog => {
      const inputs = dailyInputs.filter(i => i.program_id === prog.id)
      
      const cumulative_rp = inputs.reduce((sum, current) => sum + Number(current.achievement_rp || 0), 0)
      const cumulative_user = inputs.reduce((sum, current) => sum + Number(current.achievement_user || 0), 0)
      
      const latest_qualitative_status = inputs.length > 0 ? (inputs[inputs.length - 1].qualitative_status || 'not_started') : 'not_started'

      // Calculate Pro-rated Targets
      const effective_target_rp = (prog.monthly_target_rp || 0) * prorationFactor
      const effective_target_user = (prog.monthly_target_user || 0) * prorationFactor

      let percentage_rp = 0
      if (effective_target_rp > 0) {
        percentage_rp = (cumulative_rp / effective_target_rp) * 100
      }

      // Daily Target (calculated or overridden)
      const per_day_target_rp = prog.daily_target_rp || ((prog.monthly_target_rp || 0) / (activePeriod.working_days || 30))
      const per_day_target_user = prog.daily_target_user || ((prog.monthly_target_user || 0) / (activePeriod.working_days || 30))

      let business_status: AggregatedProgram['business_status'] = 'PERLU PERHATIAN'
      if (prog.target_type === 'qualitative') {
        if (latest_qualitative_status === 'completed') business_status = 'TERCAPAI'
        else if (latest_qualitative_status === 'in_progress') business_status = 'MENUJU TARGET'
        else business_status = 'PERLU PERHATIAN'
      } else {
        if (percentage_rp > 100) business_status = 'TERLAMPAUI'
        else if (percentage_rp === 100) business_status = 'TERCAPAI'
        else if (percentage_rp >= 50) business_status = 'MENUJU TARGET'
        else business_status = 'PERLU PERHATIAN'
      }

      return {
        ...prog,
        cumulative_rp,
        cumulative_user,
        effective_target_rp,
        effective_target_user,
        latest_qualitative_status,
        percentage_rp,
        per_day_target_rp,
        per_day_target_user,
        business_status
      }
    })
  }, [programs, dailyInputs, prorationFactor])

  // Filtering Logic
  const filteredData = useMemo(() => {
    let result = aggregatedData
    if (filterType !== 'all') result = result.filter(p => p.target_type === filterType)
    if (filterStatus !== 'all') {
      if (filterStatus === 'TERCAPAI') result = result.filter(p => p.business_status === 'TERCAPAI' || p.business_status === 'TERLAMPAUI')
      else result = result.filter(p => p.business_status === filterStatus)
    }
    return result.sort((a, b) => b.percentage_rp - a.percentage_rp)
  }, [aggregatedData, filterType, filterStatus])

  // Chart 1: Daily Trend Data (Cumulative)
  const dailyTrendData = useMemo(() => {
    if (!activePeriod) return []
    
    let datesInRange: string[] = []
    const totalTarget = programs.reduce((sum, p) => sum + (p.monthly_target_rp || 0), 0)

    if (isFilterActive) {
      // Generate dates between startDate and endDate
      const start = new Date(startDate)
      const end = new Date(endDate)
      const current = new Date(start)
      while (current <= end) {
        datesInRange.push(current.toISOString().split('T')[0])
        current.setDate(current.getDate() + 1)
      }
    } else {
      // Default to active period month
      const totalDaysInMonth = new Date(activePeriod.year, activePeriod.month, 0).getDate()
      datesInRange = Array.from({ length: totalDaysInMonth }, (_, i) => {
        const day = i + 1
        return `${activePeriod.year}-${String(activePeriod.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      })
    }
    
    let runningTotal = 0
    return datesInRange.map((dateStr) => {
      const dayTotal = dailyInputs
        .filter(input => input.date === dateStr)
        .reduce((sum, input) => sum + Number(input.achievement_rp || 0), 0)
      
      runningTotal += dayTotal
      
      // For Target Ideal, we need to know the 'day of month' to keep linear target baseline
      const dateObj = new Date(dateStr)
      const dayOfMonth = dateObj.getDate()
      const daysInMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate()

      return {
        tanggal: isFilterActive ? dateStr.substring(8, 10) + '/' + dateStr.substring(5, 7) : dayOfMonth,
        'Pencapaian Akumulatif': runningTotal,
        'Target Ideal': Math.round((totalTarget / (activePeriod.working_days || daysInMonth)) * dayOfMonth)
      }
    })
  }, [dailyInputs, activePeriod, programs, isFilterActive, startDate, endDate])

  // Chart 2: Per-Program Bar Chart Data
  const chartData = useMemo(() => {
    return aggregatedData
      .filter(p => p.target_type === 'quantitative' || p.target_type === 'hybrid')
      .map(p => ({
        name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
        Target: Math.round(p.effective_target_rp || 0),
        Pencapaian: p.cumulative_rp || 0,
        percentage: p.percentage_rp
      }))
  }, [aggregatedData])

  // Helper formatting for Y Axis
  const formatYAxis = (tickItem: number) => {
    if (tickItem === 0) return '0'
    if (tickItem >= 1000000000) return (tickItem / 1000000000).toFixed(1).replace(/\.0$/, '') + ' M'
    if (tickItem >= 1000000) return (tickItem / 1000000).toFixed(0) + ' jt'
    if (tickItem >= 1000) return (tickItem / 1000).toFixed(0) + ' rb'
    return tickItem.toString()
  }

  // Motivational Messages
  const getMotivationalMessage = (status: AggregatedProgram['business_status']) => {
    if (status === 'TERLAMPAUI') return "MASYAA ALLAH WOW TARGET TERLAMPAUI 🚀"
    if (status === 'TERCAPAI') return "ALHAMDULILLAH TARGET TERCAPAI 🌟"
    return "TARGET BELUM TERCAPAI CARI SOLUSINYA SEGERA DAN DAPATKAN BONUSNYA 💪"
  }

  const getStatusColor = (status: AggregatedProgram['business_status']) => {
    if (status === 'TERLAMPAUI' || status === 'TERCAPAI') return 'bg-emerald-500'
    if (status === 'MENUJU TARGET') return 'bg-amber-400'
    return 'bg-red-500'
  }

  const getStatusBadge = (status: AggregatedProgram['business_status']) => {
    if (status === 'TERLAMPAUI') return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold leading-5 bg-emerald-100 text-emerald-800 border border-emerald-200">💎 MELAMPAUI TARGET</span>
    if (status === 'TERCAPAI') return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold leading-5 bg-emerald-100 text-emerald-800 border border-emerald-200">✅ TERCAPAI</span>
    if (status === 'MENUJU TARGET') return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold leading-5 bg-amber-100 text-amber-800 border border-amber-200">⚠ MENUJU TARGET</span>
    return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold leading-5 bg-rose-100 text-rose-800 border border-rose-200">❌ PERLU PERHATIAN</span>
  }

  const totalTargetRp = aggregatedData.reduce((sum, p) => sum + (p.effective_target_rp || 0), 0)
  const totalAchievementRp = aggregatedData.reduce((sum, p) => sum + p.cumulative_rp, 0)
  const globalPercentage = totalTargetRp > 0 ? (totalAchievementRp / totalTargetRp) * 100 : 0

  return (
    <div className="space-y-8 pb-10">
      
      {/* 1. Global Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 opacity-50 z-0"></div>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-1 relative z-10">Total Target (Rp)</p>
          <h3 className="text-2xl font-bold text-slate-800 relative z-10 mb-2">{formatRupiah(totalTargetRp)}</h3>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 relative overflow-hidden">
           <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 opacity-50 z-0"></div>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-1 relative z-10">Total Pencapaian (Rp)</p>
          <h3 className="text-2xl font-bold text-slate-800 relative z-10 mb-2">{formatRupiah(totalAchievementRp)}</h3>
        </div>
       <div className={`rounded-xl shadow-sm p-6 flex flex-col justify-center relative overflow-hidden bg-white ${
  globalPercentage >= 100 ? 'border-2 border-emerald-500 text-emerald-600' :
  globalPercentage >= 50 ? 'border-2 border-amber-500 text-amber-600' :
  'border-2 border-rose-500 text-rose-600'
}`}>
  <p className="text-xs font-bold uppercase tracking-widest mb-1 opacity-70">Agregat Kinerja Kuantitatif</p>
  <h3 className="text-4xl font-extrabold">{globalPercentage.toFixed(1)}%</h3>
</div>
      </div>

      {/* 2. Global Motivational Message */}
      <div className={`p-4 rounded-xl border-2 font-bold text-center text-sm md:text-base transition-all ${
          globalPercentage >= 100 ? 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-[0_0_15px_rgba(16,185,129,0.3)]' :
          'bg-red-50 border-red-500 text-red-800 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
      }`}>
        {globalPercentage >= 100 ? getMotivationalMessage('TERCAPAI') : getMotivationalMessage('PERLU PERHATIAN')}
      </div>

      {/* 3. Global Charts (Trend & Bar) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm overflow-visible">
          <span className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><ChartNoAxesCombined color="#000000" />Tren Akumulasi Pencapaian Harian</span>
          <div className="w-full h-[350px] overflow-visible">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorAch" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="tanggal" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tickFormatter={formatYAxis} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  content={<CustomTrendTooltip />}
                  wrapperStyle={{ zIndex: 9999 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="Pencapaian Akumulatif" 
                  stroke="#4f46e5" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorAch)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="Target Ideal" 
                  stroke="#94a3b8" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fill="transparent" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-100">
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
               <span className="text-[11px] font-semibold text-slate-600 uppercase">Aktual Kumulatif</span>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 border-t-2 border-dashed border-slate-400"></div>
               <span className="text-[11px] font-semibold text-slate-600 uppercase">Target Ideal (Linear)</span>
             </div>
          </div>
        </div>

        {/* Bar Chart */}
        {chartData.length > 0 && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm overflow-visible">
            <span className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><ChartNoAxesColumn color="#000000" /> Capaian Program vs Target</span>
            <div className="w-full h-[350px] overflow-visible">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                   <YAxis tickFormatter={formatYAxis} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                   <Tooltip 
                      content={<CustomTooltip />}
                      cursor={{ fill: '#f8fafc' }}
                      wrapperStyle={{ zIndex: 9999}}
                   />
                   <Bar dataKey="Target" fill="#cbd5e1" radius={[4, 4, 0, 0]} barSize={40} />
                   <Bar dataKey="Pencapaian" radius={[4, 4, 0, 0]} barSize={40}>
                     {chartData.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={
                         entry.percentage >= 100 ? '#10b981' : 
                         entry.percentage >= 50 ? '#f59e0b' : '#ef4444'
                       } />
                     ))}
                   </Bar>
                 </BarChart>
               </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-100">
               <div className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-sm bg-[#cbd5e1]"></div>
                 <span className="text-[11px] font-semibold text-slate-600 uppercase">Target</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div>
                 <span className="text-[11px] text-slate-500">Perhatian</span>
               </div>
               <div className="flex items-center gap-1.5">
                 <div className="w-3 h-3 rounded-full bg-[#f59e0b]"></div>
                 <span className="text-[11px] text-slate-500">Menuju</span>
               </div>
               <div className="flex items-center gap-1.5">
                 <div className="w-3 h-3 rounded-full bg-[#10b981]"></div>
                 <span className="text-[11px] text-slate-500">Tercapai</span>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Date Range Filter */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <CalendarIcon className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">Filter Jangka Waktu</h4>
              <p className="text-xs text-slate-500">Pilih rentang tanggal kustom untuk melihat performa spesifik.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
            <DatePickerWithRange 
              date={dateRange} 
              setDate={setDateRange} 
            />
            
            <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
               <button 
                onClick={handleApplyFilter}
                disabled={!dateRange?.from || !dateRange?.to}
                className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-bold px-6 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
               >
                 <Filter className="w-4 h-4" /> Terapkan
               </button>
               {isFilterActive && (
                 <button 
                  onClick={handleResetFilter}
                  className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                  title="Reset Filter"
                 >
                   <XCircle className="w-6 h-6" />
                 </button>
               )}
            </div>
          </div>
        </div>
        
        {isFilterActive && dateRange?.from && dateRange?.to && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 italic">
              Menampilkan data dari <span className="text-indigo-600 font-bold">{formatDate(dateRange.from, 'dd MMM yyyy')}</span> sampai <span className="text-indigo-600 font-bold">{formatDate(dateRange.to, 'dd MMM yyyy')}</span>
            </span>
          </div>
        )}
      </div>

      {/* 5. Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-sm font-semibold text-slate-600 whitespace-nowrap">Filter Tipe:</span>
          <select 
            value={filterType} 
            onChange={e => setFilterType(e.target.value)}
            className="w-full sm:w-auto text-sm border-slate-300 rounded-lg bg-slate-50 focus:ring-indigo-500 focus:border-indigo-500 px-2 py-1"
          >
            <option value="all">Semua Tipe</option>
            <option value="quantitative">Kuantitatif (Angka)</option>
            <option value="qualitative">Kualitatif (Milestone)</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-sm font-semibold text-slate-600 whitespace-nowrap">Filter Status:</span>
          <select 
            value={filterStatus} 
            onChange={e => setFilterStatus(e.target.value)}
            className="w-full sm:w-auto text-sm border-slate-300 rounded-lg bg-slate-50 focus:ring-indigo-500 focus:border-indigo-500 px-2 py-1"
          >
            <option value="all">Semua Status</option>
            <option value="TERCAPAI">Tercapai / Lampaui</option>
            <option value="MENUJU TARGET">Menuju Target</option>
            <option value="PERLU PERHATIAN">Perlu Perhatian</option>
          </select>
        </div>
        <div className="ml-auto text-sm font-medium text-slate-500">
          Menampilkan <span className="text-indigo-600 font-bold">{filteredData.length}</span> program
        </div>
      </div>

      {/* 5. Program Indicator Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredData.length === 0 ? (
           <div className="col-span-full py-12 text-center text-slate-500 bg-slate-50 border border-slate-200 border-dashed rounded-xl">
             Tidak ada program yang sesuai dengan filter.
           </div>
        ) : (
          filteredData.map(program => {
            const isQuant = program.target_type === 'quantitative' || program.target_type === 'hybrid'
            const isQual = program.target_type === 'qualitative' || program.target_type === 'hybrid'
            const visualProgress = Math.min(Math.max(program.percentage_rp, 0), 100)

            return (
              <div key={program.id} className="bg-white border text-left border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between">
                <div className="p-5 flex-grow">
                  <div className="flex justify-between items-start mb-4 gap-2">
                    <h3 className="font-bold text-slate-800 text-lg leading-tight">{program.name}</h3>
                    {getStatusBadge(program.business_status)}
                  </div>
                  
                  <div className="text-sm text-slate-600 mb-4 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 flex items-center justify-between">
                     <span className="font-medium text-slate-800 shrink-0">👤 PIC:</span>
                     <span className="truncate ml-2">{program.pic_name}</span>
                  </div>

                  <div className="space-y-4">
                    {/* QUANTITATIVE / HYBRID BLOCK */}
                    {isQuant && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Pencapaian Rp</span>
                            <span className="font-extrabold text-slate-800">{formatRupiah(program.cumulative_rp)}</span>
                          </div>
                          <div className="flex flex-col text-right">
                             <div className="flex flex-col mb-1">
                                <span className="text-[10px] uppercase font-bold text-slate-400">Target Bulanan</span>
                                <span className="font-bold text-slate-600 text-sm">{formatRupiah(program.monthly_target_rp || 0)}</span>
                             </div>
                             <div className="flex flex-col border-t border-slate-50 pt-1">
                                <span className="text-[10px] uppercase font-bold text-indigo-400/70">Target Harian</span>
                                <span className="font-black text-indigo-600 text-xs">{formatRupiah(program.per_day_target_rp)}</span>
                             </div>
                          </div>
                        </div>

                        <div className="pt-2">
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-slate-600">Progres Kinerja</span>
                            <span className={program.percentage_rp >= 100 ? 'text-emerald-600' : 'text-slate-800'}>{program.percentage_rp.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                            <div 
                              className={`h-2.5 rounded-full transition-all duration-1000 ease-out ${getStatusColor(program.business_status)}`}
                              style={{ width: `${visualProgress}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="flex justify-between items-center bg-blue-50/50 px-3 py-2 rounded-lg border border-blue-100 mt-2">
                           <span className="text-xs font-semibold text-slate-600">Total User</span>
                           <span className="text-sm font-bold text-blue-900">{program.cumulative_user} <span className="text-xs text-blue-600 font-medium">/ {program.monthly_target_user}</span></span>
                        </div>
                      </div>
                    )}

                    {/* QUALITATIVE / HYBRID BLOCK */}
                    {isQual && (
                       <div className="pt-2 mt-2 border-t border-slate-100/80">
                         <h4 className="text-[10px] uppercase font-bold text-purple-600 tracking-wider mb-2">Milestone Kualitatif</h4>
                         <p className="text-xs text-slate-600 mb-3 bg-purple-50 p-2 rounded italic border border-purple-100">
                           &quot;{program.qualitative_description}&quot;
                         </p>
                         <div className="flex gap-2">
                           {['not_started', 'in_progress', 'completed'].map((state, idx) => (
                             <div key={idx} className={`flex-1 h-1.5 rounded-full ${
                               state === 'not_started' && program.latest_qualitative_status === 'not_started' ? 'bg-slate-300' :
                               state === 'not_started' && program.latest_qualitative_status !== 'not_started' ? 'bg-emerald-500' :
                               state === 'in_progress' && program.latest_qualitative_status === 'not_started' ? 'bg-slate-100' :
                               state === 'in_progress' && program.latest_qualitative_status === 'in_progress' ? 'bg-amber-400' :
                               state === 'in_progress' && program.latest_qualitative_status === 'completed' ? 'bg-emerald-500' :
                               state === 'completed' && program.latest_qualitative_status === 'completed' ? 'bg-emerald-500' : 'bg-slate-100'
                             }`}></div>
                           ))}
                         </div>
                         <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1 uppercase">
                           <span className={program.latest_qualitative_status === 'not_started' ? 'text-slate-700' : ''}>Start</span>
                           <span className={program.latest_qualitative_status === 'in_progress' ? 'text-amber-600' : ''}>Proses</span>
                           <span className={program.latest_qualitative_status === 'completed' ? 'text-emerald-600' : ''}>Finish</span>
                         </div>
                       </div>
                    )}
                  </div>
                </div>
                
                <div className={`p-3 text-center text-[11px] font-bold tracking-wide uppercase transition-colors ${
                  program.business_status === 'TERLAMPAUI' || program.business_status === 'TERCAPAI' 
                    ? 'bg-emerald-50 text-emerald-700 border-t border-emerald-100' 
                    : 'bg-slate-50 text-slate-600 border-t border-slate-100'
                }`}>
                  {getMotivationalMessage(program.business_status)}
                </div>
              </div>
            )
          })
        )}
      </div>

    </div>
  )
}
