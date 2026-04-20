'use client'

import { useState, useMemo, useRef, useEffect, KeyboardEvent, useCallback } from 'react'
import { Database } from '@/types/database'
import { formatMetricValue, evaluateFormula } from '@/lib/formula-evaluator'
import { formatRupiah, cn } from '@/lib/utils'
import { upsertSingleMetricValue, upsertDailyMetricTarget, autoDistributeTargets } from './actions'
import { toast } from 'sonner'
import { Loader2, Calculator, Target, Info, Sparkles, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'

type MetricDefinition = Database['public']['Tables']['program_metric_definitions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']
type ProgramMilestone = Database['public']['Tables']['program_milestones']['Row']
type DailyInput = Database['public']['Tables']['daily_inputs']['Row']
type Program = Database['public']['Tables']['programs']['Row'] & {
  program_milestones: ProgramMilestone[]
  program_metric_definitions: MetricDefinition[]
}
type Period = Database['public']['Tables']['periods']['Row']

interface PivotTableClientProps {
  programs: Program[]
  activePeriod?: Period
  allPeriodMetricValues: MetricValue[]
  pastInputs?: DailyInput[]
  isAdmin?: boolean
}

export function PivotTableClient({
  programs,
  activePeriod,
  allPeriodMetricValues,
  pastInputs,
  isAdmin,
}: PivotTableClientProps) {
  const [selectedProgramId, setSelectedProgramId] = useState<string>(programs[0]?.id || '')
  const [viewMode, setViewMode] = useState<'actual' | 'target'>('actual')

  // Get active program and sort metrics
  const activeProgram = useMemo(() => programs.find(p => p.id === selectedProgramId), [programs, selectedProgramId])
  const metrics = useMemo(() => {
    return (activeProgram?.program_metric_definitions || []).sort((a, b) => a.display_order - b.display_order)
  }, [activeProgram])

  // Metric Grouping Logic
  const metricGroups = useMemo(() => {
    const groups: Record<string, { label: string; metrics: MetricDefinition[] }> = {
      'revenue': { label: '💰 Pendapatan', metrics: [] },
      'user_acquisition': { label: '👥 User/Closing', metrics: [] },
      'ad_spend': { label: '📢 Iklan/Spent', metrics: [] },
      'leads': { label: '🎯 Funnel/Leads', metrics: [] },
      'conversion': { label: '🔄 Konversi', metrics: [] },
      'efficiency': { label: '📈 Efisiensi', metrics: [] },
      'others': { label: '⚙️ Metrik Lainnya', metrics: [] }
    }

    metrics.forEach(m => {
      const g = (m.metric_group && groups[m.metric_group]) ? m.metric_group : 'others'
      groups[g].metrics.push(m)
    })

    return Object.entries(groups).filter(([, data]) => data.metrics.length > 0)
  }, [metrics])

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    // Expand revenue and user_acquisition by default
    return { revenue: true, user_acquisition: true, ad_spend: true }
  })

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const [onlyShowEssential, setOnlyShowEssential] = useState(false)

  // Get total days in period month
  const totalDays = useMemo(() => {
    if (!activePeriod) return 30
    return new Date(activePeriod.year, activePeriod.month, 0).getDate()
  }, [activePeriod])

  const daysArray = useMemo(() => Array.from({ length: totalDays }, (_, i) => i + 1), [totalDays])

  // Construct initial local values map from server data
  // Key format: `${dateString}_${metricDefinitionId}`
  // dateString: 'YYYY-MM-DD'
  const buildDateString = useCallback((day: number) => {
    if (!activePeriod) return ''
    const y = activePeriod.year
    const m = String(activePeriod.month).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [activePeriod])

  // localValues state to support Optimistic UI and real-time recalculation
  const [localValues, setLocalValues] = useState<Record<string, number | null>>({})

  // Editing state
  const [editingCell, setEditingCell] = useState<{ date: string; metricId: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [isSaving, setIsSaving] = useState<string | null>(null) // the cell key currently saving
  const inputRef = useRef<HTMLInputElement>(null)

  // Initialization / Sync from Props
  useEffect(() => {
    // We only want to sync when the active program or view mode changes, 
    // or when we get new data from props and ARE NOT currently editing/saving anything.
    if (isSaving || editingCell) return

    const initVals: Record<string, number | null> = {}
    if (activeProgram) {
      // 1. Primary data from daily_metric_values (modern)
      const modernVals = allPeriodMetricValues.filter(mv => mv.program_id === activeProgram.id)
      modernVals.forEach(mv => {
        initVals[`${mv.date}_${mv.metric_definition_id}`] = viewMode === 'actual' ? mv.value : mv.target_value
      })

      // 2. Legacy Fallback (daily_inputs)
      // This ensures legacy data (achievement_rp/user) shows up in the new pivot table
      if (viewMode === 'actual' && pastInputs) {
        const revMetricId = activeProgram.program_metric_definitions.find(m => m.metric_group === 'revenue')?.id
        const acqMetricId = activeProgram.program_metric_definitions.find(m => m.metric_group === 'user_acquisition')?.id
        
        pastInputs
          .filter(pi => pi.program_id === activeProgram.id)
          .forEach(pi => {
            // Check if initVals is empty OR 0 to fallback. 
            // This fix allows data (15-17 Apr) to show if modern values are empty/0.
            if (revMetricId) {
              const currentVal = initVals[`${pi.date}_${revMetricId}`]
              if (currentVal === undefined || currentVal === null || currentVal === 0) {
                initVals[`${pi.date}_${revMetricId}`] = Number(pi.achievement_rp || 0)
              }
            }
            if (acqMetricId) {
              const currentVal = initVals[`${pi.date}_${acqMetricId}`]
              if (currentVal === undefined || currentVal === null || currentVal === 0) {
                initVals[`${pi.date}_${acqMetricId}`] = Number(pi.achievement_user || 0)
              }
            }
          })
      }

      // 3. Fallback Targets for Legacy Programs
      if (viewMode === 'target' && activePeriod) {
        const revMetricId = activeProgram.program_metric_definitions.find(m => m.metric_group === 'revenue')?.id
        const acqMetricId = activeProgram.program_metric_definitions.find(m => m.metric_group === 'user_acquisition')?.id
        
        const workingDays = activePeriod.working_days || 30
        const revTarget = (activeProgram.monthly_target_rp || 0) / workingDays
        const acqTarget = (activeProgram.monthly_target_user || 0) / workingDays

        for (let d = 1; d <= 31; d++) {
          const dateStr = buildDateString(d)
          const dateObj = new Date(activePeriod.year, activePeriod.month - 1, d)
          if (dateObj.getMonth() !== activePeriod.month - 1) continue
          const isWorkingDay = dateObj.getDay() >= 1 && dateObj.getDay() <= 5

          if (isWorkingDay) {
            if (revMetricId && !initVals[`${dateStr}_${revMetricId}`]) {
              initVals[`${dateStr}_${revMetricId}`] = revTarget
            }
            if (acqMetricId && !initVals[`${dateStr}_${acqMetricId}`]) {
              initVals[`${dateStr}_${acqMetricId}`] = acqTarget
            }
          }
        }
      }
      
      setLocalValues(initVals)
    }
  }, [activeProgram, viewMode, allPeriodMetricValues, pastInputs, activePeriod, isSaving, editingCell, buildDateString])

  // Computed row values helper
  // For a specific date, we evaluate all formulas
  const getEvaluatedRowValues = (dateStr: string) => {
    const rowRawValues: Record<string, number | null> = {}
    const evaluatedValues: Record<string, number | null> = {}

    // First assign all manual inputs
    metrics.filter(m => m.input_type === 'manual').forEach(m => {
      const key = `${dateStr}_${m.id}`
      const val = localValues[key] !== undefined ? localValues[key] : null
      rowRawValues[m.metric_key] = val
      evaluatedValues[m.id] = val
    })

    // Then calculate formulas
    metrics.filter(m => m.input_type === 'calculated').forEach(m => {
      const result = evaluateFormula(m.formula || '', rowRawValues)
      evaluatedValues[m.id] = result
      rowRawValues[m.metric_key] = result // allows chaining if needed
    })

    return evaluatedValues
  }

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      // Only call setSelectionRange on input types that support it (text, search, tel, url, or password)
      // type="number" does NOT support it and throws InvalidStateError
      if (['text', 'search', 'tel', 'url', 'password'].includes(inputRef.current.type)) {
        inputRef.current.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length)
      }
    }
  }, [editingCell])

  const handleCellClick = (dateStr: string, metric: MetricDefinition, currentVal: number | null) => {
    if (activePeriod?.is_locked && viewMode === 'actual') {
      toast.error('Periode terkunci (Read-only)')
      return
    }

    if (viewMode === 'target' && !isAdmin) {
      toast.error('Hanya Admin yang dapat mengubah target')
      return
    }

    if (metric.input_type === 'calculated') return // Cannot edit calculated

    // Check if it's a future date
    const todayStr = new Date().toISOString().split('T')[0]
    if (dateStr > todayStr && viewMode === 'actual') return // Cannot edit future achievements

    const cellKey = `${dateStr}_${metric.id}`
    if (isSaving === cellKey) return

    setEditingCell({ date: dateStr, metricId: metric.id })
    setEditValue(currentVal !== null ? String(currentVal) : '')
  }

  const handleSaveCell = async () => {
    if (!editingCell || !activeProgram) return

    const { date, metricId } = editingCell
    const cellKey = `${date}_${metricId}`
    const originalVal = localValues[cellKey] ?? null
    
    // Parse the new value
    let newVal: number | null = editValue.trim() === '' ? null : Number(editValue)
    if (isNaN(newVal as number)) newVal = null // fallback

    // Close edit mode immediately
    setEditingCell(null)
    
    if (newVal === originalVal) return // No change

    // Optimistic Update
    setLocalValues(prev => ({ ...prev, [cellKey]: newVal }))
    setIsSaving(cellKey)

    // Save to Database
    try {
      if (viewMode === 'actual') {
        const res = await upsertSingleMetricValue({
          programId: activeProgram.id,
          metricDefinitionId: metricId,
          date: date,
          value: newVal
        })
        if ('error' in res && res.error) throw new Error(res.error)
      } else {
        const res = await upsertDailyMetricTarget({
          programId: activeProgram.id,
          metricDefinitionId: metricId,
          date: date,
          targetValue: newVal
        })
        if ('error' in res && res.error) throw new Error(res.error)
        toast.success(`Target diperbarui untuk tanggal ${date}`)
      }
    } catch (e: unknown) {
      toast.error(`Gagal menyimpan: ${e instanceof Error ? e.message : 'Unknown Error'}`)
      // Rollback
      setLocalValues(prev => ({ ...prev, [cellKey]: originalVal }))
    } finally {
      setIsSaving(null)
    }
  }

  const handleAutoDistribute = async (metricId: string, metricLabel: string) => {
    if (!isAdmin) return
    if (!confirm(`Konfirmasi distribusi otomatis target bulanan ke seluruh hari kerja (Senin-Jumat) untuk metrik "${metricLabel}"? Override manual sebelumnya akan tertimpa.`)) return

    setIsSaving('bulk')
    try {
      const res = await autoDistributeTargets({
        programId: activeProgram!.id,
        metricDefinitionId: metricId
      })
      if ('error' in res && res.error) throw new Error(res.error)
      toast.success('Distribusi target berhasil dilakukan')
    } catch (e) {
      toast.error(`Gagal melakukan distribusi: ${e instanceof Error ? e.message : 'Unknown'}`)
    } finally {
      setIsSaving(null)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSaveCell()
    if (e.key === 'Escape') setEditingCell(null)
  }

  // Calculates the summary (totals and averages)
  const summaries = useMemo(() => {
    const rawTotals: Record<string, number> = {} // maps metric_key to total sum
    const daysWithDataFn: Record<string, Set<string>> = {} // Days where a metric had non-null input

    metrics.forEach(m => daysWithDataFn[m.id] = new Set())

    // 1. Calculate manual totals
    daysArray.forEach(day => {
      const dStr = buildDateString(day)
      metrics.forEach(m => {
        if (m.input_type === 'manual') {
          const val = localValues[`${dStr}_${m.id}`]
          if (val !== null && val !== undefined) {
             rawTotals[m.metric_key] = (rawTotals[m.metric_key] || 0) + val
             daysWithDataFn[m.id].add(dStr)
          }
        }
      })
    })

    // 2. Evaluate calculated totals using the sum of manual inputs
    const computedTotals: Record<string, number | null> = {}
    
    metrics.forEach(m => {
      if (m.input_type === 'manual') {
        computedTotals[m.id] = rawTotals[m.metric_key] || 0
      } else {
        const result = evaluateFormula(m.formula || '', rawTotals)
        computedTotals[m.id] = result
      }
    })

    // 3. Compute Averages
    const computedAverages: Record<string, number | null> = {}
    let maxDaysWithData = 0
    Object.values(daysWithDataFn).forEach(s => {
      if (s.size > maxDaysWithData) maxDaysWithData = s.size
    })

    metrics.forEach(m => {
      if (m.input_type === 'manual') {
        const total = computedTotals[m.id] as number
        const days = daysWithDataFn[m.id].size
        computedAverages[m.id] = days > 0 ? total / days : 0
      } else {
         computedAverages[m.id] = null
      }
    })

    return { total: computedTotals, average: computedAverages, daysCount: maxDaysWithData }
  }, [daysArray, metrics, localValues, buildDateString])

  // Daily Targets for Legacy Programs
  const dailyTargetRp = useMemo(() => {
    if (!activeProgram || !activePeriod || !activePeriod.working_days) return 0
    return (activeProgram.monthly_target_rp || 0) / activePeriod.working_days
  }, [activeProgram, activePeriod])

  const dailyTargetUser = useMemo(() => {
    if (!activeProgram || !activePeriod || !activePeriod.working_days) return 0
    return (activeProgram.monthly_target_user || 0) / activePeriod.working_days
  }, [activeProgram, activePeriod])

  if (!activeProgram) {
    return <div className="text-center py-8 text-slate-500">Pilih program untuk melihat detail.</div>
  }

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* Detail Header Control */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex flex-col sm:flex-row gap-4 items-end w-full lg:w-auto">
          <div className="w-full sm:w-64">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Pilih Program Detail</h3>
            <select 
              value={selectedProgramId} 
              onChange={(e) => setSelectedProgramId(e.target.value)}
              className="bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 font-bold shadow-sm"
            >
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 mb-1">
             <button
               onClick={() => setOnlyShowEssential(!onlyShowEssential)}
               className={cn(
                 "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all shadow-sm",
                 onlyShowEssential ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
               )}
             >
               {onlyShowEssential ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
               {onlyShowEssential ? 'Lihat Semua Metrik' : 'Hanya Metrik Esensial'}
             </button>
          </div>

          <div className="flex bg-slate-200/50 p-1 rounded-xl w-full sm:w-auto mr-auto ml-2">
            <button
              onClick={() => setViewMode('actual')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                viewMode === 'actual' 
                  ? 'bg-white text-indigo-700 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/40'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Realisasi
            </button>
            <button
              onClick={() => setViewMode('target')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                viewMode === 'target' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/40'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              Target Harian
            </button>
          </div>
        </div>

        <div className="text-right flex flex-col items-end w-full lg:w-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
               {viewMode === 'actual' ? 'Mode Realisasi' : 'Mode Target'}
            </span>
          </div>
          {activePeriod?.is_locked && (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
              Periode Terkunci (Read-Only)
            </span>
          )}
        </div>
      </div>

      {viewMode === 'target' && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3 text-indigo-700 animate-in fade-in slide-in-from-top-2">
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold mb-0.5">Pengaturan Target Harian (Eksperimental)</p>
            <p className="opacity-80">Gunakan tombol <strong>Distribusi Otomatis</strong> pada header kolom untuk membagi target bulanan secara rata ke hari kerja (Mon-Fri). Anda juga dapat mengubah nilai per hari secara manual.</p>
          </div>
        </div>
      )}

      {(() => {
        // Fallback to legacy block if no metrics are defined at all
        if (metrics.length === 0) {
          return (
            <div className="relative overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-800 text-slate-100 font-bold">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 z-10 bg-slate-800 border-r border-slate-700 w-24">Tanggal</th>
                    {activeProgram.target_type !== 'qualitative' ? (
                      <>
                        <th className="px-4 py-3 text-right whitespace-nowrap border-l border-slate-700">
                          <div className="flex flex-col items-end">
                            <span>Pencapaian (Rp)</span>
                            <span className="text-[10px] text-emerald-400 font-medium">Target: {formatRupiah(dailyTargetRp)}/hari</span>
                          </div>
                        </th>
                        <th className="px-4 py-3 text-right whitespace-nowrap border-l border-slate-700">
                          <div className="flex flex-col items-end">
                            <span>Pencapaian (User)</span>
                            <span className="text-[10px] text-emerald-400 font-medium">Target: {dailyTargetUser.toLocaleString()} user/hari</span>
                          </div>
                        </th>
                      </>
                    ) : (
                      <th className="px-4 py-3 whitespace-nowrap border-l border-slate-700 w-48">Status Kualitatif</th>
                    )}
                    <th className="px-4 py-3 whitespace-nowrap border-l border-slate-700">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {daysArray.map(day => {
                    const dateStr = buildDateString(day)
                    const input = pastInputs?.find(i => i.program_id === activeProgram.id && i.date === dateStr)
                    const isToday = dateStr === todayStr
                    const isFuture = dateStr > todayStr
                    
                    return (
                      <tr key={day} className={cn(
                        "hover:bg-indigo-50/50 transition-colors", 
                        isFuture && viewMode === 'actual' && "opacity-40",
                        isToday && "bg-indigo-50/100 border-y-2 border-indigo-500/30 font-bold"
                      )}>
                        <td className={cn(
                          "px-4 py-2 sticky left-0 z-10 border-r border-slate-100 font-semibold text-slate-700 whitespace-nowrap w-24",
                          isToday ? "bg-indigo-50 text-indigo-700" : "bg-white"
                        )}>
                          {day} {new Date(activePeriod?.year || 2024, (activePeriod?.month || 1) - 1, 1).toLocaleString('id-ID', { month: 'short' })}
                        </td>
                        {activeProgram.target_type !== 'qualitative' ? (
                          <>
                            <td className="px-4 py-2 text-right border-l border-slate-100">
                              <span className={cn(
                                "font-medium", 
                                (input?.achievement_rp || 0) >= dailyTargetRp && dailyTargetRp > 0 ? "text-emerald-600 font-bold" : 
                                (input?.achievement_rp || 0) > 0 ? "text-indigo-600" : 
                                viewMode === 'target' ? "text-indigo-600 font-bold" : "text-slate-400"
                              )}>
                                {formatRupiah(input?.achievement_rp || 0)}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right border-l border-slate-100">
                              <span className={cn(
                                "font-medium", 
                                (input?.achievement_user || 0) >= dailyTargetUser && dailyTargetUser > 0 ? "text-emerald-600 font-bold" :
                                (input?.achievement_user || 0) > 0 ? "text-indigo-600" : 
                                viewMode === 'target' ? "text-indigo-600 font-bold" : "text-slate-400"
                              )}>
                                {(input?.achievement_user || 0).toLocaleString()} user
                              </span>
                            </td>
                          </>
                        ) : (
                          <td className="px-4 py-2 border-l border-slate-100">
                            {input?.qualitative_status === 'completed' && <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded">Selesai</span>}
                            {input?.qualitative_status === 'in_progress' && <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded">Dalam Proses</span>}
                            {(!input || input?.qualitative_status === 'not_started') && <span className="text-slate-400 text-xs italic">-</span>}
                          </td>
                        )}
                        <td className="px-4 py-2 border-l border-slate-100 text-slate-600 max-w-sm truncate" title={input?.notes || ''}>
                          {input?.notes || <span className="italic text-slate-400 opacity-50">-</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {activeProgram.target_type !== 'qualitative' && (
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-800">
                    <tr>
                      <td className="px-4 py-3 sticky left-0 z-10 bg-slate-50 border-r border-slate-200">TOTAL</td>
                      <td className="px-4 py-3 text-right text-indigo-700 border-l border-slate-200">
                        {formatRupiah(pastInputs?.filter(i => i.program_id === activeProgram.id).reduce((sum, i) => sum + Number(i.achievement_rp || 0), 0) || 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-indigo-700 border-l border-slate-200">
                        {(pastInputs?.filter(i => i.program_id === activeProgram.id).reduce((sum, i) => sum + Number(i.achievement_user || 0), 0) || 0).toLocaleString()} user
                      </td>
                      <td className="px-4 py-3 border-l border-slate-200"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
              <div className="p-3 bg-slate-50 text-xs text-slate-500 border-t border-slate-200 text-center">
                Untuk mengubah nilai pada program standar ini, gunakan mode <strong>Semua Program</strong>.
              </div>
            </div>
          )
        }

        return (
          <div className="relative overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
            <table className="w-full text-sm text-left">
            <thead className="bg-slate-800 text-slate-100 font-bold">
               {/* Group Level Header */}
               <tr>
                 <th className="px-4 py-2 sticky left-0 z-10 bg-slate-900 border-r border-slate-700 w-24">Unit</th>
                 {metricGroups.map(([id, data]) => {
                   const isExpanded = expandedGroups[id]
                   const visibleMetrics = data.metrics.filter(m => !onlyShowEssential || m.is_primary)
                   if (visibleMetrics.length === 0) return null
                   
                   return (
                     <th 
                        key={id} 
                        colSpan={isExpanded ? visibleMetrics.length : 1}
                        className={cn(
                          "px-4 py-2 text-center border-l border-slate-700 transition-all",
                          isExpanded ? "bg-slate-800 text-slate-100" : "bg-slate-900 text-slate-500 cursor-pointer hover:bg-slate-800"
                        )}
                        onClick={() => !isExpanded && toggleGroup(id)}
                     >
                       <div className="flex items-center justify-center gap-2">
                         <span className="text-[10px] tracking-widest uppercase">{data.label}</span>
                         <button 
                            onClick={(e) => { e.stopPropagation(); toggleGroup(id) }}
                            className="p-0.5 hover:bg-white/10 rounded transition-colors"
                         >
                           {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                         </button>
                       </div>
                     </th>
                   )
                 })}
               </tr>
               {/* Metric Level Header */}
               <tr>
                <th className="px-4 py-3 sticky left-0 z-10 bg-slate-800 border-r border-slate-700 w-24">Tanggal</th>
                {metricGroups.map(([id, data]) => {
                  const isExpanded = expandedGroups[id]
                  const visibleMetrics = data.metrics.filter(m => !onlyShowEssential || m.is_primary)
                  
                  if (!isExpanded) {
                    if (visibleMetrics.length === 0) return null
                    return (
                      <th key={id} className="px-4 py-3 text-center border-l border-slate-700 bg-slate-800/50 text-slate-400 italic font-medium text-[9px]">
                        Folded
                      </th>
                    )
                  }

                  return visibleMetrics.map(m => (
                    <th key={m.id} className="px-4 py-3 text-right whitespace-nowrap border-l border-slate-700 min-w-[130px]">
                      <div className="flex flex-col items-end">
                        <span className="flex items-center gap-1">
                          {m.input_type === 'calculated' && <Calculator className="w-3 h-3 text-slate-400" />}
                          {m.label}
                        </span>
                        {m.is_target_metric && viewMode === 'actual' && (
                          <span className="text-[9px] text-emerald-400 font-medium">Target Metric</span>
                        )}
                        {viewMode === 'target' && isAdmin && m.input_type === 'manual' && m.is_target_metric && (
                          <button 
                            onClick={() => handleAutoDistribute(m.id, m.label)}
                            className={cn(
                              "mt-1 text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded transition-all",
                              isSaving === 'bulk' ? "bg-slate-700 text-slate-500 pointer-events-none" : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40"
                            )}
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            Auto Distribusi
                          </button>
                        )}
                      </div>
                    </th>
                  ))
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 table-fixed">
              {daysArray.map(day => {
                const dateStr = buildDateString(day)
                const isToday = dateStr === todayStr
                const isFuture = dateStr > todayStr
                const rowEvaluated = getEvaluatedRowValues(dateStr)
                
                // Determine if row has ANY manual data
                const hasData = metrics.some(m => m.input_type === 'manual' && localValues[`${dateStr}_${m.id}`] !== null && localValues[`${dateStr}_${m.id}`] !== undefined)

                return (
                  <tr key={day} className={cn(
                    "hover:bg-indigo-50/30 transition-colors",
                    isFuture && viewMode === 'actual' && "opacity-40",
                    isToday && "bg-indigo-50/100 border-y-2 border-indigo-500/30 font-bold",
                    !hasData && !isToday && !isFuture && "bg-slate-50/50"
                  )}>
                    <td className={cn(
                      "px-4 py-3 font-bold sticky left-0 z-10 border-r border-slate-100 shadow-[1px_0_0_rgba(0,0,0,0.05)]",
                      isToday ? "bg-indigo-50 text-indigo-700" : "bg-white text-slate-700"
                    )}>
                      {day} {new Date(activePeriod!.year, activePeriod!.month - 1, day).toLocaleString('id-ID', { month: 'short' })}
                    </td>
                    
                    {metricGroups.map(([gid, gdata]) => {
                      const isExpanded = expandedGroups[gid]
                      const visibleMetrics = gdata.metrics.filter(m => !onlyShowEssential || m.is_primary)

                      if (!isExpanded) {
                        if (visibleMetrics.length === 0) return null
                        return (
                          <td key={gid} className="px-2 py-3 border-l border-slate-100 bg-slate-50/50 text-center text-slate-300">
                             ...
                          </td>
                        )
                      }

                      return visibleMetrics.map(m => {
                        const cellKey = `${dateStr}_${m.id}`
                        const val = rowEvaluated[m.id]
                        const isEditing = editingCell?.date === dateStr && editingCell?.metricId === m.id
                        const saving = isSaving === cellKey
                        const isCalc = m.input_type === 'calculated'

                        let colorClass = "text-slate-700"
                        if (m.is_target_metric && val !== null) {
                           let monthlyTarget = 0;
                           if (m.metric_key === 'revenue') monthlyTarget = activeProgram.monthly_target_rp || 0;
                           else if (m.metric_key === 'user_count') monthlyTarget = activeProgram.monthly_target_user || 0;
                           else monthlyTarget = m.monthly_target || 0;
                           
                           const dailyTarget = monthlyTarget / (activePeriod?.working_days || 30)
                           if (dailyTarget > 0) {
                              const pct = val / dailyTarget
                              if (pct >= 1) colorClass = "text-emerald-600 font-bold"
                              else if (pct >= 0.5) colorClass = "text-amber-600 font-bold"
                              else colorClass = "text-red-600 font-bold"
                           }
                        }

                        return (
                          <td 
                            key={m.id} 
                            className={cn(
                              "px-4 py-2 text-right border-l border-slate-100 transition-colors",
                              isCalc ? 'bg-slate-50/50 text-slate-600' : 'cursor-text hover:bg-slate-100/80',
                              viewMode === 'target' && !isCalc && 'bg-indigo-50/20',
                              saving ? 'opacity-50' : ''
                            )}
                            onClick={() => !isEditing && handleCellClick(dateStr, m, val)}
                          >
                            {isEditing ? (
                              <input 
                                ref={inputRef}
                                type="number" 
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={handleSaveCell}
                                onKeyDown={handleKeyDown}
                                className="w-full text-right bg-white border border-indigo-400 rounded p-1 text-sm font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                              />
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                {saving && <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
                                <span className={cn(isCalc ? 'font-medium' : colorClass, viewMode === 'target' && !isCalc && 'text-indigo-600 font-bold')}>
                                  {val === null || val === undefined ? (
                                    <span className={cn(viewMode === 'target' ? "text-indigo-400 font-black" : "text-slate-300")}>&mdash;</span>
                                  ) : formatMetricValue(val, m.data_type, m.unit_label)}
                                </span>
                              </div>
                            )}
                          </td>
                        )
                      })
                    })}
                  </tr>
                )
              })}
            </tbody>
            
            {/* Summary Footer */}
            <tfoot className="bg-slate-100/80 font-bold border-t-2 border-slate-300">
              <tr>
                <td className="px-4 py-3 text-slate-800 sticky left-0 z-10 bg-slate-100/80 border-r border-slate-200">TOTAL</td>
                {metricGroups.map(([gid, gdata]) => {
                  const isExpanded = expandedGroups[gid]
                  const visibleMetrics = gdata.metrics.filter(m => !onlyShowEssential || m.is_primary)
                  
                  if (!isExpanded) {
                    if (visibleMetrics.length === 0) return null
                    return <td key={gid} className="px-2 py-3 border-l border-slate-200"></td>
                  }

                  return visibleMetrics.map(m => {
                    const val = summaries.total[m.id]
                    return (
                      <td key={m.id} className="px-4 py-3 text-right text-indigo-900 border-l border-slate-200">
                        {val === null || val === undefined ? '-' : formatMetricValue(val, m.data_type, m.unit_label)}
                      </td>
                    )
                  })
                })}
              </tr>
              <tr className="border-t border-slate-200">
                <td className="px-4 py-3 text-slate-600 text-xs sticky left-0 z-10 bg-slate-100/80 border-r border-slate-200">RATA-RATA<br/><span className="font-normal text-[10px]">({summaries.daysCount} hari)</span></td>
                {metricGroups.map(([gid, gdata]) => {
                  const isExpanded = expandedGroups[gid]
                  const visibleMetrics = gdata.metrics.filter(m => !onlyShowEssential || m.is_primary)

                  if (!isExpanded) {
                    if (visibleMetrics.length === 0) return null
                    return <td key={gid} className="px-2 py-3 border-l border-slate-200"></td>
                  }

                  return visibleMetrics.map(m => {
                    const val = summaries.average[m.id]
                    return (
                      <td key={m.id} className="px-4 py-3 text-right text-slate-600 text-xs border-l border-slate-200">
                        {val === null || val === undefined ? '-' : formatMetricValue(val, m.data_type, m.unit_label)}
                      </td>
                    )
                  })
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )
    })()}
    </div>
  )
}
