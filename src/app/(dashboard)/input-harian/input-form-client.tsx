'use client'

import { useState, useEffect } from 'react'
import { submitDailyInput, updateDailyInput, deleteDailyInput, submitMilestoneCompletion, submitDailyMetricValues } from './actions'
import { Database } from '@/types/database'
import { formatRupiah, cn } from '@/lib/utils'
import { evaluateFormula, formatMetricValue } from '@/lib/formula-evaluator'
import { toast } from 'sonner'
import { 
  Lock, 
  CheckCircle2, 
  Circle, 
  Edit3,
  CheckCircle,
  ClipboardList,
  Target,
  Trash2,
  Calculator,
  ArrowUpDown,
  ChevronUp,
  ChevronDown
} from 'lucide-react'

type ProgramMilestone = Database['public']['Tables']['program_milestones']['Row']
type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
type MetricDefinition = Database['public']['Tables']['program_metric_definitions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']

type Program = Database['public']['Tables']['programs']['Row'] & {
  program_milestones: ProgramMilestone[]
  program_metric_definitions: MetricDefinition[]
}

type DailyInput = Database['public']['Tables']['daily_inputs']['Row'] & {
  programs: { name: string; target_type: 'quantitative' | 'qualitative' | 'hybrid' } | null
  profiles?: { name: string } | null
}
type Period = Database['public']['Tables']['periods']['Row']

export function InputFormClient({ 
  programs, 
  pastInputs, 
  isAdmin,
  activePeriod,
  milestoneCompletions,
  existingMetricValues = [],
  allPeriodMetricValues = []
}: { 
  programs: Program[], 
  pastInputs: DailyInput[], 
  isAdmin?: boolean,
  activePeriod?: Period,
  milestoneCompletions: MilestoneCompletion[]
  existingMetricValues?: MetricValue[]
  allPeriodMetricValues?: MetricValue[]
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  // Table state
  type SortColumn = 'date' | 'pic' | 'program';
  const [sortConfig, setSortConfig] = useState<{ key: SortColumn, direction: 'asc'|'desc' } | null>(null)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedProgramId, setSelectedProgramId] = useState<string>(programs[0]?.id || '')
  
  // Dynamic metric state: { metric_definition_id: value_string }
  const [metricValues, setMetricValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    existingMetricValues.forEach(mv => { init[mv.metric_definition_id] = mv.value?.toString() || '' })
    return init
  })

  const isLocked = (activePeriod as unknown as { is_locked: boolean | null })?.is_locked

  // Get active program details for dynamic rendering
  const activeProgram = programs.find(p => p.id === selectedProgramId)
  const activeMetrics = (activeProgram?.program_metric_definitions || []).sort((a, b) => a.display_order - b.display_order)
  const hasCustomMetrics = activeMetrics.length > 0

  // Recalculate on program change
  useEffect(() => {
    const init: Record<string, string> = {}
    existingMetricValues
      .filter(mv => mv.program_id === selectedProgramId)
      .forEach(mv => { init[mv.metric_definition_id] = mv.value?.toString() || '' })
    setMetricValues(init)
  }, [selectedProgramId, existingMetricValues])

  // Build values map for formula evaluation
  const metricKeyValues: Record<string, number | null> = {}
  activeMetrics.forEach(m => {
    if (m.input_type === 'manual') {
      const v = metricValues[m.id]
      metricKeyValues[m.metric_key] = v !== undefined && v !== '' ? Number(v) : null
    }
  })

  // Handlers
  const handleSort = (key: SortColumn) => {
    setSortConfig(prev => {
      if (prev?.key === key && prev.direction === 'asc') return { key, direction: 'desc' };
      if (prev?.key === key && prev.direction === 'desc') return null;
      return { key, direction: 'asc' };
    });
  }

  const sortedInputs = [...pastInputs].sort((a, b) => {
    if (!sortConfig) return 0;
    let aVal: string | number = '';
    let bVal: string | number = '';

    if (sortConfig.key === 'date') {
      aVal = new Date(a.date).getTime();
      bVal = new Date(b.date).getTime();
    } else if (sortConfig.key === 'pic') {
      aVal = a.profiles?.name || '';
      bVal = b.profiles?.name || '';
    } else if (sortConfig.key === 'program') {
      aVal = a.programs?.name || '';
      bVal = b.programs?.name || '';
    }

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleOpenCreate = () => {
    if (isLocked) {
      toast.error('Gagal: Periode ini telah dikunci oleh Admin.')
      return
    }
    setEditingId(null)
    setSelectedProgramId(programs[0]?.id || '')
    setIsModalOpen(true)
  }

  const handleOpenEdit = (input: DailyInput) => {
    if (isLocked) {
      toast.error('Gagal: Data pada periode terkunci tidak dapat diubah.')
      return
    }
    setEditingId(input.id)
    setSelectedProgramId(input.program_id)
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (isLocked) {
      toast.error('Gagal: Data pada periode terkunci tidak dapat dihapus.')
      return
    }
    if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return
    setIsLoading(true)
    try {
      const res = await deleteDailyInput(id)
      if ('error' in res && res.error) {
        toast.error(res.error)
      } else {
        toast.success('Data berhasil dihapus!')
      }
    } catch {
      toast.error('Gagal menghapus data')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isLocked) {
      toast.error('Periode terkunci. Aksi dibatalkan.')
      return
    }
    
    setIsLoading(true)
    
    const formData = new FormData(e.currentTarget)
    
    try {
      // ALWAYS save to daily_inputs (anchor record for the table display)
      const payload: Partial<DailyInput> = {
        date: formData.get('date') as string,
        notes: formData.get('notes') as string,
      }

      if (!editingId) {
        payload.program_id = selectedProgramId
      }

      // For legacy programs (no custom metrics), also save rp/user values
      if (!hasCustomMetrics && (activeProgram?.target_type === 'quantitative' || activeProgram?.target_type === 'hybrid')) {
        const rp = formData.get('achievement_rp')
        const user = formData.get('achievement_user')
        if (rp) payload.achievement_rp = Number(rp)
        if (user) payload.achievement_user = Number(user)
      }

      let res;
      if (editingId) {
        res = await updateDailyInput(editingId, payload as { date: string; achievement_rp?: number | null; achievement_user?: number | null; qualitative_status?: 'not_started' | 'in_progress' | 'completed' | null; notes?: string | null })
      } else {
        res = await submitDailyInput(payload as { program_id: string; date: string; achievement_rp?: number | null; achievement_user?: number | null; qualitative_status?: 'not_started' | 'in_progress' | 'completed' | null; notes?: string | null })
      }

      if ('error' in res && res.error) {
        toast.error(res.error)
        setIsLoading(false)
        return
      }

      // Save custom metric values if program has them (new entry only)
      if (hasCustomMetrics && !editingId) {
        const date = formData.get('date') as string
        const valuesToSave = activeMetrics
          .filter(m => m.input_type === 'manual')
          .map(m => ({
            metric_definition_id: m.id,
            value: metricValues[m.id] !== undefined && metricValues[m.id] !== ''
              ? Number(metricValues[m.id])
              : null
          }))

        const mvRes = await submitDailyMetricValues(selectedProgramId, date, valuesToSave)
        if ('error' in mvRes && mvRes.error) {
          toast.error(mvRes.error)
          setIsLoading(false)
          return
        }
      }

      toast.success(editingId ? 'Data berhasil diperbarui!' : 'Pencapaian harian berhasil dicatat!')
      setIsModalOpen(false)
      setMetricValues({})
    } catch {
      toast.error('Terjadi kesalahan saat menyimpan data.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleToggleMilestone(milestoneId: string, currentState: boolean) {
    if (isLocked) return
    setIsLoading(true)
    const res = await submitMilestoneCompletion({
      milestone_id: milestoneId,
      is_completed: !currentState
    })
    
    if ('success' in res) {
      toast.success(!currentState ? 'Tugas diselesaikan!' : 'Status tugas dibatalkan')
    } else {
      toast.error(res.error)
    }
    setIsLoading(false)
  }

  const formatDateLabel = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    })
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h3 className="text-lg font-semibold text-slate-800">Capaian & Kendala Harian</h3>
        
        {isLocked ? (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm font-medium">
            <Lock className="h-4 w-4" />
            Periode Terkunci (Read-Only)
          </div>
        ) : (
          <button
            onClick={handleOpenCreate}
            disabled={programs.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
          >
            <CheckCircle className="h-4 w-4" /> Catat Pencapaian
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('date')}>
                <div className="flex items-center gap-1.5">
                  Tanggal
                  {sortConfig?.key === 'date' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3 text-indigo-600" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />
                  ) : <ArrowUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-400" />}
                </div>
              </th>
              {isAdmin && (
                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('pic')}>
                  <div className="flex items-center gap-1.5">
                    Pengisi (PIC)
                    {sortConfig?.key === 'pic' ? (
                      sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3 text-indigo-600" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />
                    ) : <ArrowUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-400" />}
                  </div>
                </th>
              )}
              <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('program')}>
                <div className="flex items-center gap-1.5">
                  Program
                  {sortConfig?.key === 'program' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3 text-indigo-600" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />
                  ) : <ArrowUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-400" />}
                </div>
              </th>
              <th className="px-6 py-4 text-center">Capaian Harian</th>
              {!isLocked && <th className="px-6 py-4 text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedInputs.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? (isLocked ? 4 : 5) : (isLocked ? 3 : 4)} className="px-6 py-12 text-center text-slate-400 font-medium italic">
                  Belum ada catatan aktivitas hari ini.
                </td>
              </tr>
            ) : (
              sortedInputs.map((input) => {
                const prog = programs.find(p => p.id === input.program_id)
                const percentageHarian = (prog?.daily_target_rp && input.achievement_rp) 
                  ? ((input.achievement_rp / prog.daily_target_rp) * 100).toFixed(1) 
                  : null

                return (
                <tr key={input.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900 whitespace-nowrap">
                    {formatDateLabel(input.date)}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-slate-700 font-medium">
                      {input.profiles?.name || '??'}
                    </td>
                  )}
                  <td className="px-6 py-4 max-w-[250px] align-top">
                    <div className="font-bold text-slate-800">{input.programs?.name || 'Unknown'}</div>
                    {input.notes && (
                      <div className="mt-2 text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 leading-relaxed font-medium">
                        {input.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center align-top">
                    {(() => {
                      const programMetrics = prog?.program_metric_definitions || [];
                      const isCustomMetricProgram = programMetrics.length > 0;

                      if (isCustomMetricProgram) {
                        // Adaptive display for custom metrics
                        const dateMetrics = allPeriodMetricValues?.filter(mv => 
                          mv.program_id === input.program_id && mv.date === input.date
                        ) || [];
                        
                        // Pick metrics to show: ideally targets first, then manuals
                        const allApplicableMetrics = programMetrics.filter(m => m.is_target_metric || m.input_type === 'manual');
                        const isExpanded = expandedRows[input.id];
                        const metricsToShow = isExpanded ? allApplicableMetrics : allApplicableMetrics.slice(0, 3);

                        if (metricsToShow.length === 0) return <span className="text-slate-300">-</span>

                        return (
                          <div className="flex flex-col gap-1.5 items-center">
                            <div className="flex flex-wrap justify-center gap-1.5 max-w-[220px]">
                              {metricsToShow.map(mDef => {
                                const v = dateMetrics.find(dm => dm.metric_definition_id === mDef.id)?.value;
                                if (v === undefined || v === null) return null;
                                
                                return (
                                  <div key={mDef.id} className="inline-flex flex-col items-center p-1.5 rounded-lg bg-indigo-50/50 border border-indigo-100/50 min-w-[100px] max-w-[105px]">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-tight mb-1 line-clamp-1 w-full text-center" title={mDef.label}>{mDef.label}</span>
                                    <span className="font-bold text-indigo-700 text-xs">{formatMetricValue(v, mDef.data_type, mDef.unit_label)}</span>
                                  </div>
                                )
                              })}
                            </div>
                            {allApplicableMetrics.length > 3 && (
                               <button 
                                 onClick={() => setExpandedRows(prev => ({ ...prev, [input.id]: !prev[input.id] }))}
                                 className="text-[9px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors mt-0.5"
                               >
                                 {isExpanded ? 'Tutup Detail' : `+${allApplicableMetrics.length - 3} Lainnya (Lihat)`}
                               </button>
                            )}
                          </div>
                        )
                      }
                      
                      // Legacy display
                      if (input.programs?.target_type === 'quantitative' || input.programs?.target_type === 'hybrid') {
                        return (
                          <div className="inline-flex flex-col items-center p-2 rounded-lg bg-indigo-50/30 border border-indigo-50">
                            <span className="font-extrabold text-indigo-700 text-xs">{formatRupiah(Number(input.achievement_rp || 0))}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-slate-500 font-bold">{input.achievement_user || 0} user</span>
                              {percentageHarian && (
                                <span className={cn(
                                  "text-[9px] px-1.5 rounded-full font-black uppercase",
                                  Number(percentageHarian) >= 100 ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"
                                )}>
                                  {percentageHarian}%
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      }
                      
                      return <span className="text-slate-300">-</span>
                    })()}
                  </td>
                  {!isLocked && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(input)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(input.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })
            )}
          </tbody>
        </table>
      </div>

      {/* Input Modal */}
      {isModalOpen && !isLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                  <ClipboardList className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg leading-tight">
                    {editingId ? 'Edit Catatan Aktivitas' : 'Catat Aktivitas Baru'}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Periode Bulan Ini</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-white rounded-full transition-all">✕</button>
            </div>
            
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Common Form Section */}
              <div className="space-y-6">
                <form id="daily-form" onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tanggal Kerja</label>
                    <input 
                      name="date" type="date" required 
                      defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.date : new Date().toISOString().split('T')[0]}
                      className="w-full text-sm font-bold rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all bg-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pilih Program</label>
                    {!editingId ? (
                      <select 
                        value={selectedProgramId}
                        onChange={(e) => setSelectedProgramId(e.target.value)}
                        className="w-full text-sm font-bold rounded-xl border border-slate-200 px-4 py-3 bg-white outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                      >
                        {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : (
                      <div className="px-4 py-3 bg-slate-50 rounded-xl text-sm border border-slate-200 text-slate-800 font-bold">
                        {pastInputs.find(i => i.id === editingId)?.programs?.name}
                      </div>
                    )}
                  </div>

                  {/* Show legacy fields only for programs without custom metrics */}
                  {!hasCustomMetrics && (activeProgram?.target_type === 'quantitative' || activeProgram?.target_type === 'hybrid') && (
                    <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100 space-y-5">
                      <div className="flex justify-between items-center text-[10px] font-black text-indigo-400 uppercase tracking-widest px-1">
                        <Target className="h-3 w-3" /> Input Angka Target
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-1.5 flex flex-col">
                          <label className="text-[10px] font-bold text-slate-600 uppercase">RP CAPAIAN</label>
                          <input 
                            name="achievement_rp" type="number" min="0" placeholder="Rp 0"
                            defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.achievement_rp?.toString() : ""}
                            className="w-full text-sm font-bold rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-500 outline-none"
                          />
                        </div>
                        <div className="space-y-1.5 flex flex-col">
                          <label className="text-[10px] font-bold text-slate-600 uppercase">USER BARU</label>
                          <input 
                            name="achievement_user" type="number" min="0" placeholder="0"
                            defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.achievement_user?.toString() : ""}
                            className="w-full text-sm font-bold rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dynamic Metric Fields for programs with custom metrics */}
                  {hasCustomMetrics && !editingId && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                        <Target className="h-3 w-3" /> Input KPI
                      </div>
                      {activeMetrics.map(metric => {
                        const isCalc = metric.input_type === 'calculated'
                        const calcVal = isCalc && metric.formula
                          ? evaluateFormula(metric.formula, metricKeyValues)
                          : null

                        return (
                          <div key={metric.id} className={`space-y-1 ${isCalc ? 'opacity-70' : ''}`}>
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-600 uppercase">
                                {metric.label}
                                {metric.unit_label && <span className="ml-1 text-slate-400 normal-case">({metric.unit_label})</span>}
                              </label>
                              {isCalc && <Calculator className="h-3 w-3 text-purple-400" />}
                            </div>
                            {isCalc ? (
                              <div className="w-full text-sm font-bold rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 text-purple-700">
                                {calcVal !== null 
                                  ? formatMetricValue(calcVal, metric.data_type, metric.unit_label)
                                  : <span className="text-slate-400">— (butuh data lain)</span>
                                }
                              </div>
                            ) : (
                              <input
                                type={metric.data_type === 'boolean' ? 'checkbox' : 'number'}
                                step={metric.data_type === 'float' ? '0.01' : '1'}
                                min="0"
                                placeholder={metric.data_type === 'currency' ? 'Rp 0' : '0'}
                                value={metricValues[metric.id] || ''}
                                onChange={e => setMetricValues(prev => ({ ...prev, [metric.id]: e.target.value }))}
                                className="w-full text-sm font-bold rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-500 outline-none"
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Catatan Pendukung / Kendala</label>
                    <textarea 
                      name="notes" rows={3}
                      defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.notes || '' : ''}
                      placeholder="Apa kendala atau yang berhasil dicapai hari ini?"
                      className="w-full text-sm font-medium rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-500 outline-none resize-none"
                    ></textarea>
                  </div>
                </form>
              </div>

              {/* Milestones / Tasks Section */}
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col h-full">
                <div className="flex items-center justify-between mb-4 px-1">
                  <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Daftar Misi Program
                  </h4>
                  <span className="text-[10px] font-bold text-slate-400 italic">Persisten (Global)</span>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto max-h-[350px] pr-2 custom-scrollbar">
                  {activeProgram?.program_milestones.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                      <Target className="h-8 w-8 text-slate-300 mb-2" />
                      <p className="text-xs font-bold text-slate-400">Belum ada misi terdaftar untuk program ini.</p>
                    </div>
                  ) : (
                    activeProgram?.program_milestones.map((ms) => {
                      const comp = milestoneCompletions.find(c => c.milestone_id === ms.id)
                      const isDone = comp?.is_completed || false
                      
                      return (
                        <div key={ms.id} className={cn(
                          "relative group rounded-xl border transition-all p-4",
                          isDone ? "bg-emerald-50 border-emerald-100" : "bg-white border-slate-100 hover:border-indigo-200"
                        )}>
                          <div className="flex items-start gap-3">
                            <button 
                              type="button"
                              onClick={() => handleToggleMilestone(ms.id, isDone)}
                              disabled={isLoading}
                              className={cn(
                                "h-6 w-6 rounded-lg flex items-center justify-center transition-all shrink-0 mt-0.5",
                                isDone ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-300 group-hover:bg-indigo-100 group-hover:text-indigo-400"
                              )}
                            >
                              {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className={cn(
                                  "text-sm font-bold leading-tight",
                                  isDone ? "text-emerald-900" : "text-slate-800"
                                )}>{ms.title}</p>
                                {ms.description && <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{ms.description}</p>}
                                
                                {isDone && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className="text-[9px] font-black uppercase text-emerald-600 px-1.5 py-0.5 bg-emerald-100 rounded">TARGET TERPENUHI</span>
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-200 space-y-2">
                  <p className="text-[10px] text-slate-400 font-bold leading-relaxed px-1">
                    * Misi kualitatif yang Anda centang bersifat persisten dan akan terus berstatus &quot;Selesai&quot; di bulan-bulan berikutnya sampai program berakhir.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-between items-center sticky bottom-0 z-10">
              <div className="flex items-center gap-3">
                 <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors">Batal</button>
              </div>
              <button
                form="daily-form"
                type="submit" disabled={isLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-3 rounded-xl text-sm font-bold shadow-xl shadow-indigo-100 transition-all disabled:opacity-50"
              >
                {isLoading ? 'Processing...' : (editingId ? 'Simpan Perubahan' : 'Posting Aktivitas')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
