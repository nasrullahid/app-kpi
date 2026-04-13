'use client'

import { useState, useMemo, useRef, useEffect, KeyboardEvent } from 'react'
import { Database } from '@/types/database'
import { formatMetricValue, evaluateFormula } from '@/lib/formula-evaluator'
import { upsertSingleMetricValue } from './actions'
import { toast } from 'sonner'
import { Loader2, Calculator, LayoutGrid } from 'lucide-react'

type MetricDefinition = Database['public']['Tables']['program_metric_definitions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']
type ProgramMilestone = Database['public']['Tables']['program_milestones']['Row']
type Program = Database['public']['Tables']['programs']['Row'] & {
  program_milestones: ProgramMilestone[]
  program_metric_definitions: MetricDefinition[]
}
type Period = Database['public']['Tables']['periods']['Row']

interface PivotTableClientProps {
  programs: Program[]
  activePeriod?: Period
  allPeriodMetricValues: MetricValue[]
  isAdmin?: boolean
}

export function PivotTableClient({
  programs,
  activePeriod,
  allPeriodMetricValues,
  isAdmin
}: PivotTableClientProps) {
  const [selectedProgramId, setSelectedProgramId] = useState<string>(programs[0]?.id || '')

  // Get active program and sort metrics
  const activeProgram = useMemo(() => programs.find(p => p.id === selectedProgramId), [programs, selectedProgramId])
  const metrics = useMemo(() => {
    return (activeProgram?.program_metric_definitions || []).sort((a, b) => a.display_order - b.display_order)
  }, [activeProgram])

  // Get total days in period month
  const totalDays = useMemo(() => {
    if (!activePeriod) return 30
    return new Date(activePeriod.year, activePeriod.month, 0).getDate()
  }, [activePeriod])

  const daysArray = useMemo(() => Array.from({ length: totalDays }, (_, i) => i + 1), [totalDays])

  // Construct initial local values map from server data
  // Key format: `${dateString}_${metricDefinitionId}`
  // dateString: 'YYYY-MM-DD'
  const buildDateString = (day: number) => {
    if (!activePeriod) return ''
    const y = activePeriod.year
    const m = String(activePeriod.month).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // localValues state to support Optimistic UI and real-time recalculation
  const [localValues, setLocalValues] = useState<Record<string, number | null>>({})

  // Re-initialize local values when program changes
  useEffect(() => {
    const initVals: Record<string, number | null> = {}
    if (activeProgram) {
      allPeriodMetricValues
        .filter(mv => mv.program_id === activeProgram.id)
        .forEach(mv => {
          initVals[`${mv.date}_${mv.metric_definition_id}`] = mv.value
        })
    }
    setLocalValues(initVals)
  }, [activeProgram, allPeriodMetricValues])

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

  // Editing state
  const [editingCell, setEditingCell] = useState<{ date: string; metricId: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [isSaving, setIsSaving] = useState<string | null>(null) // the cell key currently saving
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      // Put cursor at the end
      inputRef.current.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length)
    }
  }, [editingCell])

  const handleCellClick = (dateStr: string, metric: MetricDefinition, currentVal: number | null) => {
    if (activePeriod?.is_locked) {
      toast.error('Periode terkunci (Read-only)')
      return
    }
    if (metric.input_type === 'calculated') return // Cannot edit calculated

    // Check if it's a future date
    const todayStr = new Date().toISOString().split('T')[0]
    if (dateStr > todayStr) return // Cannot edit future dates efficiently

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
      const res = await upsertSingleMetricValue({
        programId: activeProgram.id,
        metricDefinitionId: metricId,
        date: date,
        value: newVal
      })
      if ('error' in res && res.error) throw new Error(res.error)
    } catch (e: any) {
      toast.error(`Gagal menyimpan: ${e.message}`)
      // Rollback
      setLocalValues(prev => ({ ...prev, [cellKey]: originalVal }))
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
         computedAverages[m.id] = null // Averages don't map clean to totals for formula, but wait! We can leave it empty or show "-"
      }
    })

    return { total: computedTotals, average: computedAverages, daysCount: maxDaysWithData }
  }, [daysArray, metrics, localValues, activePeriod])

  if (!activeProgram) {
    return <div className="text-center py-8 text-slate-500">Pilih program untuk melihat detail.</div>
  }

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* Detail Header Control */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div>
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">Pilih Program Detail</h3>
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
        <div className="text-right flex flex-col items-end">
          <span className="text-[10px] uppercase font-bold text-slate-400 bg-white px-2 py-1 rounded shadow-sm border border-slate-200">Mode Pivot Table</span>
          {activePeriod?.is_locked && (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200 mt-1">
              Periode Terkunci (Read-Only)
            </span>
          )}
        </div>
      </div>

      {metrics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center">
          <div className="bg-indigo-100 p-3 rounded-full mb-3">
            <LayoutGrid className="w-6 h-6 text-indigo-600" />
          </div>
          <h4 className="text-lg font-bold text-slate-800 mb-2">Tampilan Detail Belum Diaktifkan</h4>
          <p className="text-slate-500 max-w-md text-sm mb-6 leading-relaxed">
            Program ini menggunakan format target standar (Rupiah & User). Pivot Table saat ini didesain khusus untuk program yang menggunakan <strong>Custom Metrics</strong>.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="text-xs bg-slate-100 border border-slate-200 text-slate-600 px-3 py-2 rounded-lg font-medium">
              Gunakan opsi <strong>"Semua Program"</strong> untuk mencatat pencapaian harian program ini.
            </div>
          </div>
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-800 text-slate-100 font-bold">
              <tr>
                <th className="px-4 py-3 sticky left-0 z-10 bg-slate-800 border-r border-slate-700 w-24">Tanggal</th>
                {metrics.map(m => (
                  <th key={m.id} className="px-4 py-3 text-right whitespace-nowrap border-l border-slate-700 min-w-[110px]">
                    <div className="flex flex-col items-end">
                      <span className="flex items-center gap-1">
                        {m.input_type === 'calculated' && <Calculator className="w-3 h-3 text-slate-400" />}
                        {m.label}
                      </span>
                      {m.is_target_metric && (
                        <span className="text-[9px] text-emerald-400 font-medium">Target Metric</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 table-fixed">
              {daysArray.map(day => {
                const dateStr = buildDateString(day)
                const isFuture = dateStr > todayStr
                const rowEvaluated = getEvaluatedRowValues(dateStr)
                
                // Determine if row has ANY manual data
                const hasData = metrics.some(m => m.input_type === 'manual' && localValues[`${dateStr}_${m.id}`] !== null && localValues[`${dateStr}_${m.id}`] !== undefined)

                return (
                  <tr key={day} className={`hover:bg-indigo-50/30 transition-colors ${isFuture ? 'opacity-40' : ''} ${!hasData ? 'bg-slate-50/50' : ''}`}>
                    <td className="px-4 py-3 font-bold text-slate-700 sticky left-0 z-10 bg-white border-r border-slate-100 shadow-[1px_0_0_rgba(0,0,0,0.05)]">
                      {day} {new Date(activePeriod!.year, activePeriod!.month - 1, day).toLocaleString('id-ID', { month: 'short' })}
                    </td>
                    
                    {metrics.map(m => {
                      const cellKey = `${dateStr}_${m.id}`
                      const val = rowEvaluated[m.id]
                      const isEditing = editingCell?.date === dateStr && editingCell?.metricId === m.id
                      const saving = isSaving === cellKey
                      const isCalc = m.input_type === 'calculated'

                      let colorClass = "text-slate-700"
                      if (m.is_target_metric && val !== null) {
                         let monthlyTarget = 0;
                         if (m.data_type === 'currency') monthlyTarget = activeProgram.monthly_target_rp || 0;
                         else monthlyTarget = activeProgram.monthly_target_user || 0;
                         
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
                          className={`px-4 py-2 text-right border-l border-slate-100 transition-colors ${isCalc ? 'bg-slate-50/50 text-slate-600' : 'cursor-text hover:bg-slate-100/80'} ${saving ? 'opacity-50' : ''}`}
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
                              <span className={isCalc ? 'font-medium' : colorClass}>
                                {val === null || val === undefined ? <span className="text-slate-300">&mdash;</span> : formatMetricValue(val, m.data_type, m.unit_label)}
                              </span>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
            
            {/* Summary Footer */}
            <tfoot className="bg-slate-100/80 font-bold border-t-2 border-slate-300">
              <tr>
                <td className="px-4 py-3 text-slate-800 sticky left-0 z-10 bg-slate-100/80 border-r border-slate-200">TOTAL</td>
                {metrics.map(m => {
                  const val = summaries.total[m.id]
                  return (
                    <td key={m.id} className="px-4 py-3 text-right text-indigo-900 border-l border-slate-200">
                      {val === null || val === undefined ? '-' : formatMetricValue(val, m.data_type, m.unit_label)}
                    </td>
                  )
                })}
              </tr>
              <tr className="border-t border-slate-200">
                <td className="px-4 py-3 text-slate-600 text-xs sticky left-0 z-10 bg-slate-100/80 border-r border-slate-200">RATA-RATA<br/><span className="font-normal text-[10px]">({summaries.daysCount} hari)</span></td>
                {metrics.map(m => {
                  const val = summaries.average[m.id]
                  return (
                    <td key={m.id} className="px-4 py-3 text-right text-slate-600 text-xs border-l border-slate-200">
                      {val === null || val === undefined ? '-' : formatMetricValue(val, m.data_type, m.unit_label)}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
