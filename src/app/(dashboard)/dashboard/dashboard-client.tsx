'use client'

import { useState, useMemo } from 'react'
import { Database } from '@/types/database'
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
  AreaChart,
  Area,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  Label
} from 'recharts'
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { 
  Calendar as CalendarIcon, 
  XCircle, 
  ChartNoAxesColumn, 
  ChartNoAxesCombined, 
  Target, 
  Coins, 
  TrendingUp,
  Users,
  CheckCircle2,
  Clock
} from 'lucide-react'
import { DatePickerWithRange } from '@/components/date-range-picker'
import { DateRange } from 'react-day-picker'
import { format as formatDate } from 'date-fns'

type Milestone = Database['public']['Tables']['program_milestones']['Row']
type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
type MetricDefinition = Database['public']['Tables']['program_metric_definitions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']

type Program = Database['public']['Tables']['programs']['Row'] & {
  program_pics: { profile_id: string }[]
  program_milestones: Milestone[]
  program_metric_definitions: MetricDefinition[]
}

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
  milestoneCompletions: MilestoneCompletion[]
  picProfiles: { id: string; name: string }[]
  metricValues?: MetricValue[]
}

type AggregatedProgram = Program & {
  cumulative_rp: number
  cumulative_user: number
  effective_target_rp: number
  effective_target_user: number
  latest_qualitative_status: 'not_started' | 'in_progress' | 'completed' | null
  qualitative_percentage: number
  total_milestones: number
  completed_milestones: number
  percentage_rp: number
  per_day_target_rp: number
  per_day_target_user: number
  business_status: 'PERLU PERHATIAN' | 'MENUJU TARGET' | 'TERCAPAI' | 'TERLAMPAUI'
  team: { id: string, name: string }[]
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

// User Radial Chart Component
const chartConfig = {
  value: {
    label: "Pencapaian",
  },
  users: {
    label: "Total User",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig

const UserRadialChart = ({ percentage, total, target }: { percentage: number, total: number, target: number }) => {
  const chartData = [
    { name: "users", value: percentage, fill: "var(--color-users)" },
  ]

  return (
    <Card className="flex flex-col bg-white border-slate-200 shadow-sm overflow-hidden relative">
      <div className="absolute right-0 top-0 w-24 h-24 bg-indigo-50 rounded-bl-full -mr-4 -mt-4 opacity-50 z-0 text-right p-4 font-black text-indigo-200/50 italic">USER</div>
      <CardHeader className="items-center pb-0 pt-6 relative z-10">
        <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Agregat User</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pb-0 relative z-10">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[180px]"
        >
          <RadialBarChart
            data={chartData}
            startAngle={90}
            endAngle={90 + (3.6 * Math.min(percentage, 100))}
            innerRadius={60}
            outerRadius={90}
          >
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              className="first:fill-slate-100 last:fill-white"
              polarRadius={[82, 68]}
            />
            <RadialBar dataKey="value" background cornerRadius={10} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-slate-800 text-3xl font-black"
                        >
                          {percentage.toFixed(1)}%
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 20}
                          className="fill-slate-400 text-[10px] font-bold uppercase tracking-wider"
                        >
                          Pencapaian
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-1 pb-6 relative z-10">
        <div className="flex items-center gap-2 leading-none font-black text-indigo-600 text-sm">
          {total.toLocaleString('id-ID')} <span className="text-slate-400 font-bold text-xs uppercase tracking-tighter"> / {Math.round(target).toLocaleString('id-ID')} User</span>
        </div>
      </CardFooter>
    </Card>
  )
}


export function DashboardClient({ 
  programs, 
  dailyInputs, 
  activePeriod, 
  initialFilters, 
  milestoneCompletions,
  picProfiles 
}: DashboardClientProps) {
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
  const startDateStr = dateRange?.from ? formatDate(dateRange.from, 'yyyy-MM-dd') : ''
  const endDateStr = dateRange?.to ? formatDate(dateRange.to, 'yyyy-MM-dd') : ''

  // 1. Calculate Pro-ration Factor
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

  // 2. Data processing - Aggregate per Program
  const aggregatedData: AggregatedProgram[] = useMemo(() => {
    return programs.map(prog => {
      const inputs = dailyInputs.filter(i => i.program_id === prog.id)
      
      const cumulative_rp = inputs.reduce((sum, current) => sum + Number(current.achievement_rp || 0), 0)
      const cumulative_user = inputs.reduce((sum, current) => sum + Number(current.achievement_user || 0), 0)
      
      const latest_qualitative_status = inputs.length > 0 ? (inputs[inputs.length - 1].qualitative_status || 'not_started') : 'not_started'

      // Milestone Progress
      const total_milestones = prog.program_milestones.length
      const completed_milestones = prog.program_milestones.filter(ms => 
        milestoneCompletions.find(c => c.milestone_id === ms.id && c.is_completed)
      ).length
      const qualitative_percentage = total_milestones > 0 ? (completed_milestones / total_milestones) * 100 : 0

      // Calculate Pro-rated Targets
      const effective_target_rp = (prog.monthly_target_rp || 0) * prorationFactor
      const effective_target_user = (prog.monthly_target_user || 0) * prorationFactor

      let percentage_rp = 0
      if (effective_target_rp > 0) {
        percentage_rp = (cumulative_rp / effective_target_rp) * 100
      }

      // Team resolution
      const team = prog.program_pics.map(p => {
        const profile = picProfiles.find(prof => prof.id === p.profile_id)
        return { id: p.profile_id, name: profile?.name || '??' }
      })

      // Daily Target
      const per_day_target_rp = prog.daily_target_rp || ((prog.monthly_target_rp || 0) / (activePeriod.working_days || 30))
      const per_day_target_user = prog.daily_target_user || ((prog.monthly_target_user || 0) / (activePeriod.working_days || 30))

      let business_status: AggregatedProgram['business_status'] = 'PERLU PERHATIAN'
      if (prog.target_type === 'qualitative') {
        if (qualitative_percentage >= 100) business_status = 'TERCAPAI'
        else if (qualitative_percentage >= 50) business_status = 'MENUJU TARGET'
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
        qualitative_percentage,
        total_milestones,
        completed_milestones,
        percentage_rp,
        per_day_target_rp,
        per_day_target_user,
        business_status,
        team
      }
    })
  }, [programs, dailyInputs, prorationFactor, activePeriod, milestoneCompletions, picProfiles])

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

    if (isFilterActive && startDateStr && endDateStr) {
      const start = new Date(startDateStr)
      const end = new Date(endDateStr)
      const current = new Date(start)
      while (current <= end) {
        datesInRange.push(current.toISOString().split('T')[0])
        current.setDate(current.getDate() + 1)
      }
    } else {
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
      
      const dateObj = new Date(dateStr)
      const dayOfMonth = dateObj.getDate()
      const daysInMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate()

      return {
        tanggal: isFilterActive ? dateStr.substring(8, 10) + '/' + dateStr.substring(5, 7) : dayOfMonth,
        'Pencapaian Akumulatif': runningTotal,
        'Target Ideal': Math.round((totalTarget / (activePeriod.working_days || daysInMonth)) * dayOfMonth)
      }
    })
  }, [dailyInputs, activePeriod, programs, isFilterActive, startDateStr, endDateStr])

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
    if (status === 'TERLAMPAUI') return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold leading-5 bg-emerald-100 text-emerald-800 border border-emerald-200">💎 TERLAMPAUI</span>
    if (status === 'TERCAPAI') return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold leading-5 bg-emerald-100 text-emerald-800 border border-emerald-200">✅ TERCAPAI</span>
    if (status === 'MENUJU TARGET') return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold leading-5 bg-amber-100 text-amber-800 border border-amber-200">⚠ MENUJU</span>
    return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold leading-5 bg-rose-100 text-rose-800 border border-rose-200">❌ PERHATIAN</span>
  }

  const totalTargetRp = aggregatedData.reduce((sum, p) => sum + (p.effective_target_rp || 0), 0)
  const totalAchievementRp = aggregatedData.reduce((sum, p) => sum + p.cumulative_rp, 0)
  const globalPercentage = totalTargetRp > 0 ? (totalAchievementRp / totalTargetRp) * 100 : 0

  const totalTargetUser = aggregatedData.reduce((sum, p) => sum + (p.effective_target_user || 0), 0)
  const totalAchievementUser = aggregatedData.reduce((sum, p) => sum + p.cumulative_user, 0)
  const globalUserPercentage = totalTargetUser > 0 ? (totalAchievementUser / totalTargetUser) * 100 : 0

  return (
    <div className="space-y-8 pb-10 text-left">
      
      {/* 1. Global Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Total Target */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 relative overflow-hidden flex flex-col justify-between min-h-[220px]">
          <div className="absolute right-0 top-0 w-32 h-32 bg-blue-50/50 rounded-bl-full -mr-8 -mt-8 opacity-40 z-0 flex items-end justify-center pb-8 pr-8">
            <Target className="w-12 h-12 text-blue-200" />
          </div>
          <div className="relative z-10">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Total Target (RP)</p>
            <h3 className="text-2xl font-black text-slate-800 mb-1">{formatRupiah(totalTargetRp)}</h3>
            <p className="text-[10px] font-bold text-slate-400 italic">Target akumulatif periode aktif</p>
          </div>
          <div className="relative z-10 mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Day Pro-rata</span>
            <span className="text-sm font-black text-blue-600">{formatRupiah(totalTargetRp / (daysInSelection || 30))}</span>
          </div>
        </div>

        {/* Card 2: Total Pencapaian */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 relative overflow-hidden flex flex-col justify-between min-h-[220px]">
          <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-50/50 rounded-bl-full -mr-8 -mt-8 opacity-40 z-0 flex items-end justify-center pb-8 pr-8">
            <Coins className="w-12 h-12 text-emerald-200" />
          </div>
          <div className="relative z-10">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Total Pencapaian (RP)</p>
            <h3 className="text-2xl font-black text-slate-800 mb-1">{formatRupiah(totalAchievementRp)}</h3>
            
            <div className="mt-4 space-y-1">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase">
                <span>Progres Budget</span>
                <span className="text-emerald-600">{globalPercentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-1000" 
                  style={{ width: `${Math.min(globalPercentage, 100)}%` }}
                />
              </div>
            </div>
          </div>
          <div className="relative z-10 mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Realization / Day</span>
            <span className="text-sm font-black text-emerald-600">{formatRupiah(totalAchievementRp / (daysInSelection || 30))}</span>
          </div>
        </div>
        
        {/* Card 3: Agregat Kinerja */}
        <div className={cn(
          "rounded-2xl shadow-sm p-6 relative overflow-hidden bg-white flex flex-col justify-between min-h-[220px] transition-all border",
          globalPercentage >= 100 ? 'border-emerald-500 shadow-emerald-100/50' :
          globalPercentage >= 50 ? 'border-amber-500 shadow-amber-100/50' :
          'border-rose-500 shadow-rose-100/50'
        )}>
          <div className="absolute right-0 top-0 w-32 h-32 bg-slate-50/30 rounded-bl-full -mr-8 -mt-8 opacity-40 z-0 flex items-end justify-center pb-8 pr-8 text-slate-200">
            <TrendingUp className="w-12 h-12" />
          </div>
          <div className="relative z-10">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-3">Health Score</p>
            <div className="flex items-baseline gap-1">
              <h3 className={cn(
                "text-5xl font-black",
                globalPercentage >= 100 ? 'text-emerald-600' :
                globalPercentage >= 50 ? 'text-amber-600' :
                'text-rose-600'
              )}>{globalPercentage.toFixed(1)}%</h3>
            </div>
          </div>
          
          <div className="relative z-10 mt-auto pt-4 border-t border-slate-50">
             <div className="flex items-center gap-2">
                <div className={cn(
                   "w-2 h-2 rounded-full animate-pulse",
                   globalPercentage >= 100 ? 'bg-emerald-500' :
                   globalPercentage >= 50 ? 'bg-amber-500' :
                   'bg-rose-500'
                )} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                   STATUS: {globalPercentage >= 100 ? 'LUAR BIASA' : globalPercentage >= 50 ? 'PADA TREK' : 'KRITIS'}
                </span>
             </div>
          </div>
        </div>

        <UserRadialChart 
          percentage={globalUserPercentage} 
          total={totalAchievementUser} 
          target={totalTargetUser} 
        />
      </div>

      {/* 2. Motivational Message */}
      <div className={cn(
        "p-4 rounded-xl border-2 font-bold text-center text-sm transition-all",
        globalPercentage >= 100 
          ? 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
          : 'bg-red-50 border-red-500 text-red-800 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
      )}>
        {globalPercentage >= 100 ? getMotivationalMessage('TERCAPAI') : getMotivationalMessage('PERLU PERHATIAN')}
      </div>

      {/* 3. Global Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><ChartNoAxesCombined className="w-5 h-5" />Tren Akumulasi Pencapaian</span>
          <div className="w-full h-[350px]">
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
                <Tooltip content={<CustomTrendTooltip />} />
                <Area type="monotone" dataKey="Pencapaian Akumulatif" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorAch)" />
                <Area type="monotone" dataKey="Target Ideal" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {chartData.length > 0 && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><ChartNoAxesColumn className="w-5 h-5" />Capaian Program Kuantitatif</span>
            <div className="w-full h-[350px]">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                   <YAxis tickFormatter={formatYAxis} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                   <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
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
          </div>
        )}
      </div>

      {/* 4. Controls */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <CalendarIcon className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">Filter Jangka Waktu</h4>
              <p className="text-xs text-slate-500 font-medium tracking-tight">Eksplorasi data periode spesifik secara custom.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
            <DatePickerWithRange date={dateRange} setDate={setDateRange} />
            <div className="flex gap-2 w-full sm:w-auto">
               <button 
                onClick={handleApplyFilter} disabled={!dateRange?.from || !dateRange?.to}
                className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-100"
               >
                 Terapkan Filter
               </button>
               {isFilterActive && (
                 <button onClick={handleResetFilter} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                   <XCircle className="w-6 h-6" />
                 </button>
               )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TIPE:</span>
          <select 
            value={filterType} onChange={e => setFilterType(e.target.value)}
            className="w-full sm:w-auto text-xs font-bold border-slate-200 rounded-lg bg-slate-50 px-2 py-1.5 outline-none focus:border-indigo-400"
          >
            <option value="all">SEMUA</option>
            <option value="quantitative">KUANTITATIF</option>
            <option value="qualitative">KUALITATIF</option>
            <option value="hybrid">HYBRID</option>
          </select>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">STATUS:</span>
          <select 
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="w-full sm:w-auto text-xs font-bold border-slate-200 rounded-lg bg-slate-50 px-2 py-1.5 outline-none focus:border-indigo-400"
          >
            <option value="all">SEMUA</option>
            <option value="TERCAPAI">TERCAPAI/LAMP</option>
            <option value="MENUJU TARGET">PROSES</option>
            <option value="PERLU PERHATIAN">KRITIS</option>
          </select>
        </div>
        <div className="ml-auto text-[10px] font-black text-slate-400 uppercase">
          Total: <span className="text-indigo-600 text-xs">{filteredData.length}</span> Program
        </div>
      </div>

      {/* 5. Program Indicator Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredData.map(program => {
          const isQuant = program.target_type === 'quantitative' || program.target_type === 'hybrid'
          const isQual = program.target_type === 'qualitative' || program.target_type === 'hybrid'
          const visualProgress = Math.min(Math.max(program.percentage_rp, 0), 100)
          const qualProgress = Math.min(Math.max(program.qualitative_percentage, 0), 100)

          return (
            <div key={program.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all overflow-hidden flex flex-col group relative">
              <div className="p-6">
                <div className="flex justify-between items-start mb-6 gap-2">
                  <div className="flex flex-col">
                    <h3 className="font-bold text-slate-900 text-lg leading-tight group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{program.name}</h3>
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {program.team.map((m, i) => (
                          <div key={i} title={m.name} className="h-5 w-5 rounded-full ring-2 ring-white bg-indigo-100 flex items-center justify-center text-[8px] font-black text-indigo-700 border border-indigo-200">
                            {m.name.substring(0,2).toUpperCase()}
                          </div>
                        ))}
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">{program.team.length} PIC</span>
                    </div>
                  </div>
                  {getStatusBadge(program.business_status)}
                </div>

                <div className="space-y-6">
                  {/* QUANT PERFORMANCE */}
                  {isQuant && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-end pb-1">
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase font-black text-slate-300 tracking-widest">Actual Capaian</span>
                          <span className="text-lg font-black text-slate-800">{formatRupiah(program.cumulative_rp)}</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[9px] uppercase font-black text-slate-300 tracking-widest">Global Target</span>
                          <span className="text-xs font-bold text-slate-500">{formatRupiah(program.monthly_target_rp || 0)}</span>
                        </div>
                      </div>

                      <div className="relative pt-1">
                        <div className="flex justify-between text-[10px] font-black mb-1.5 uppercase">
                          <span className="text-slate-400">Yield Progress</span>
                          <span className={program.percentage_rp >= 100 ? 'text-emerald-600' : 'text-slate-600'}>{program.percentage_rp.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                          <div 
                            className={cn("h-full rounded-full transition-all duration-1000", getStatusColor(program.business_status))}
                            style={{ width: `${visualProgress}%` }}
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center bg-indigo-50/30 px-3 py-2 rounded-xl border border-indigo-50/50">
                         <div className="flex items-center gap-1.5">
                            <Users className="h-3 w-3 text-indigo-400" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase">User Flow</span>
                         </div>
                         <span className="text-xs font-black text-indigo-700">{program.cumulative_user} <span className="text-slate-400 text-[10px] font-bold">/ {program.monthly_target_user}</span></span>
                      </div>
                    </div>
                  )}

                  {/* QUAL PERFORMANCE */}
                  {isQual && (
                    <div className={cn("pt-4 space-y-3", isQuant && "border-t border-slate-100")}>
                      <div className="flex items-center justify-between">
                         <h4 className="text-[9px] uppercase font-black text-purple-600 tracking-widest flex items-center gap-1.5">
                           <CheckCircle2 className="h-3 w-3" /> Misi Kualitatif
                         </h4>
                         <span className="text-[10px] font-black text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">{qualProgress.toFixed(0)}%</span>
                      </div>
                      
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full transition-all duration-1000" style={{ width: `${qualProgress}%` }} />
                      </div>

                      <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100/50">
                         <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center shadow-sm shrink-0">
                            <Clock className="h-4 w-4 text-slate-400" />
                         </div>
                         <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-slate-700 truncate">&quot;{program.qualitative_description || 'No focus set'}&quot;</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase">{program.completed_milestones} / {program.total_milestones} Tugas Selesai</p>
                         </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-auto px-6 py-4 bg-slate-50/50 border-t border-slate-50 flex justify-between items-center text-[10px] font-black uppercase text-slate-400">
                <span>Daily Pro-rata: {formatRupiah(program.per_day_target_rp)}</span>
                <span className="text-indigo-400">Team Active</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
