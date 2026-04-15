'use client'

import { useState, useMemo } from 'react'
import { Database } from '@/types/database'
import { getDepartmentConfig } from '@/lib/department-config'
import { calculateProgramHealth, aggregateByMetricGroup, ProgramWithRelations } from '@/lib/dashboard-calculator'
import { formatRupiah } from '@/lib/utils'
import { formatMetricValue } from '@/lib/formula-evaluator'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { 
  ArrowLeft,
  BarChart3,
  HeartPulse,
  Target
} from 'lucide-react'
import { DatePickerWithRange } from '@/components/date-range-picker'
import { DateRange } from 'react-day-picker'
import { format as formatDate } from 'date-fns'
import Link from 'next/link'

type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']
type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
type Period = Database['public']['Tables']['periods']['Row']

interface DepartmentClientProps {
  departmentKey: string
  programs: ProgramWithRelations[]
  dailyInputs: DailyInput[]
  activePeriod: Period
  initialFilters: { startDate: string; endDate: string }
  milestoneCompletions: MilestoneCompletion[]
  metricValues: MetricValue[]
}

const formatGroupValue = (key: string, val: number) => {
  if (key === 'revenue' || key === 'ad_spend') return formatRupiah(val)
  if (key === 'conversion') return formatMetricValue(val, 'percentage', '%')
  if (key === 'efficiency') return formatMetricValue(val, 'float', 'x')
  return formatMetricValue(val, 'integer', '')
}

const getGroupLabel = (key: string) => {
  const map: Record<string, string> = {
    revenue: "Total Pendapatan",
    user_acquisition: "Total Akuisisi / Peserta",
    ad_spend: "Total Anggaran Keluar",
    leads: "Volume Leads/Tiket Masuk",
    conversion: "Tingkat Konversi (G-CR)",
    efficiency: "Efisiensi Biaya (G-ROAS)"
  }
  return map[key] || key.toUpperCase()
}

const getProgressColor = (score: number) => {
  if (score >= 100) return 'bg-emerald-500'
  if (score >= 80) return 'bg-indigo-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}
const getTextColor = (score: number) => {
  if (score >= 100) return 'text-emerald-600'
  if (score >= 80) return 'text-indigo-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-red-600'
}

export function DepartmentClient({ 
  departmentKey,
  programs, 
  dailyInputs, 
  activePeriod, 
  initialFilters, 
  milestoneCompletions,
  metricValues
}: DepartmentClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const config = getDepartmentConfig(departmentKey)

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

  // ── Indexing for O(1) Lookups ───────────────────────────────────────────
  const metricValuesByProgram = useMemo(() => {
    const map = new Map<string, MetricValue[]>()
    metricValues.forEach(mv => {
      const list = map.get(mv.program_id) || []
      list.push(mv)
      map.set(mv.program_id, list)
    })
    return map
  }, [metricValues])

  const dailyInputsByProgram = useMemo(() => {
    const map = new Map<string, DailyInput[]>()
    dailyInputs.forEach(di => {
      const list = map.get(di.program_id) || []
      list.push(di)
      map.set(di.program_id, list)
    })
    return map
  }, [dailyInputs])

  const milestoneCompletionsByMilestone = useMemo(() => {
    const map = new Map<string, MilestoneCompletion>()
    milestoneCompletions.forEach(mc => {
      map.set(mc.milestone_id, mc)
    })
    return map
  }, [milestoneCompletions])

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

  // 1. Setup Aggregations
  const aggregations = useMemo(() => {
    return aggregateByMetricGroup(programs, metricValuesByProgram, dailyInputsByProgram, prorationFactor, activePeriod.working_days || 0)
  }, [programs, metricValuesByProgram, dailyInputsByProgram, prorationFactor, activePeriod.working_days])

  // 2. Program Details
  const programHealths = useMemo(() => {
    return programs.map(p => {
      const h = calculateProgramHealth(p, metricValuesByProgram, dailyInputsByProgram, milestoneCompletionsByMilestone, prorationFactor, activePeriod.working_days || 0)
      return { ...h, program: p }
    }).sort((a, b) => b.healthScore - a.healthScore)
  }, [programs, metricValuesByProgram, dailyInputsByProgram, milestoneCompletionsByMilestone, prorationFactor, activePeriod.working_days])

  const programsWithoutGroupsCount = programs.filter(p => {
     const hasMetrics = (p.program_metric_definitions || []).length > 0;
     const hasGroups = (p.program_metric_definitions || []).some(m => m.metric_group !== null);
     return hasMetrics && !hasGroups;
  }).length

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <Link href="/dashboard" className="text-sm font-semibold text-slate-400 hover:text-indigo-600 flex items-center gap-2 mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Kembali ke Global
          </Link>
          <h2 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            {config.label}
            <span className="text-sm font-bold bg-indigo-50 border border-indigo-100 text-indigo-600 px-3 py-1 rounded-full">{programs.length} Program</span>
          </h2>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto bg-slate-50 p-2 rounded-xl border border-slate-200">
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
          <div className="flex gap-2">
             <button onClick={handleApplyFilter} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition flex-1 sm:flex-none">Filter</button>
             {isFilterActive && <button onClick={handleResetFilter} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition flex-1 sm:flex-none">Reset</button>}
          </div>
        </div>
      </div>

      {Object.keys(aggregations).length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 p-8 rounded-xl text-center">
          <p className="text-amber-800 font-medium">Berdasarkan pengaturan Custom Metrics, tidak ada komponen matriks global untuk diagregasi di departemen ini.</p>
          <p className="text-sm text-amber-600 mt-2">Pastikan struktur program departemen ini sudah disetel menggunakan fitur Metric Builder.</p>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-end mb-2">
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-500" /> Agregasi Global Departemen
            </h3>
            {programsWithoutGroupsCount > 0 && (
              <span className="text-xs text-slate-500 italic bg-slate-100 px-2 py-1 rounded">
                Dihitung dari {programs.length - programsWithoutGroupsCount} dari {programs.length} program (mengabaikan program khusus).
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {['revenue', 'user_acquisition', 'leads', 'ad_spend', 'conversion', 'efficiency'].map(key => {
               const g = aggregations[key]
               if (!g) return null
               
               const pct = g.target > 0 ? (g.actual / g.target) * 100 : 0
               const hasTarget = g.target > 0

               return (
                 <div key={key} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">{getGroupLabel(key)}</div>
                    
                    <div className="flex items-baseline gap-2 mb-3">
                      <span className={`text-2xl font-black ${g.isComputed ? 'text-indigo-700' : 'text-slate-800'}`}>
                        {formatGroupValue(key, g.actual)}
                      </span>
                    </div>

                    {!g.isComputed && hasTarget ? (
                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-slate-500">Target</span>
                          <span className={getTextColor(pct)}>{pct.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full ${getProgressColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }}></div>
                        </div>
                        <div className="text-right text-[10px] text-slate-400 font-bold mt-1">
                          dari {formatGroupValue(key, g.target)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 border-t border-slate-100 pt-2 mt-2">
                         {g.isComputed ? 'Kalkulasi Otomatis (Weighted)' : 'Informasional (Tanpa Target Mengikat)'}
                      </div>
                    )}
                 </div>
               )
            })}
          </div>
        </>
      )}

      {/* Program Health Row */}
      <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 mt-8 mb-4">
        <HeartPulse className="w-5 h-5 text-indigo-500" /> Detail Kinerja Masing-masing Program
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {programHealths.map((ph) => {
          const isLegacy = ph.program.target_type === 'quantitative' && (ph.program.program_metric_definitions || []).length === 0
          
          return (
            <div key={ph.programId} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-indigo-200 transition-colors">
               <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-3">
                 <div>
                   <h4 className="font-bold text-slate-800 leading-tight uppercase tracking-tight">{ph.program.name}</h4>
                   <div className="flex items-center gap-2 mt-2">
                     <span className={`text-[9px] font-black tracking-widest px-2 py-0.5 rounded-md border ${config.color} ${config.textColor} ${config.color.replace('bg-', 'border-').replace('100', '200')}`}>
                       {config.label.toUpperCase()}
                     </span>
                     <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full flex items-center justify-center min-w-[24px]">
                          PIC
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 capitalize">{ph.program.pic_name}</span>
                     </div>
                   </div>
                 </div>
                 <div className="text-right">
                   <div className={`text-2xl font-black ${getTextColor(ph.healthScore)}`}>{ph.healthScore.toFixed(0)}%</div>
                   <div className="text-[9px] uppercase font-bold tracking-widest text-slate-400">Health Score</div>
                 </div>
               </div>

               {/* Metrics Snapshot */}
               {isLegacy ? (
                  <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 font-medium">
                    Program standar (Rupiah/User). Target dikesampingkan dari agregat departemen bersyarat penuh.
                  </div>
               ) : ph.isQualitativeOnly ? (
                  <div className="bg-purple-50 rounded-lg p-3 text-xs text-purple-700 font-medium flex items-center gap-2">
                    <Target className="w-4 h-4" /> Kualitatif murni — berpatokan pada penyelesaian Milestone.
                  </div>
               ) : (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {ph.program.program_metric_definitions?.filter(m => m.is_target_metric).slice(0, 4).map(m => {
                      const progVals = metricValuesByProgram.get(ph.programId) || []
                      const mv = progVals.filter(v => v.metric_definition_id === m.id)
                      const sum = mv.reduce((s, a) => s + (a.value || 0), 0)
                      return (
                        <div key={m.id} className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex flex-col justify-between">
                          <span className="text-[10px] uppercase font-bold text-slate-400 truncate">{m.label}</span>
                          <span className="font-bold text-slate-700">{formatMetricValue(sum, m.data_type, m.unit_label)}</span>
                        </div>
                      )
                    })}
                  </div>
               )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
