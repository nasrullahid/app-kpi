'use client'

import { useState, useEffect } from 'react'
import { submitDailyInput, updateDailyInput, deleteDailyInput, submitMilestoneCompletion, submitDailyMetricValues, ProspekNote } from './actions'
import { Database } from '@/types/database'
import { formatRupiah, cn } from '@/lib/utils'
import { isAdsProgram } from '@/lib/dashboard-calculator'
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
  ChevronDown,
  TrendingUp,
  Users
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
  programs: { name: string; target_type: Database['public']['Enums']['target_type'] } | null
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
  allPeriodMetricValues = [],
  layoutMode = 'table',
  historicalMoUStats
}: { 
  programs: Program[], 
  pastInputs: DailyInput[], 
  isAdmin?: boolean,
  activePeriod?: Period,
  milestoneCompletions: MilestoneCompletion[]
  existingMetricValues?: MetricValue[]
  allPeriodMetricValues?: MetricValue[]
  layoutMode?: 'table' | 'card'
  historicalMoUStats?: Record<string, { leads: number; ttd: number; drop: number }>
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
  
  const [metricValues, setMetricValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    existingMetricValues.forEach(mv => { init[mv.metric_definition_id] = mv.value?.toString() || '' })
    return init
  })

  // Phase 2.1: Prospek Notes for MoU
  const [prospekNotes, setProspekNotes] = useState<ProspekNote[]>([])

  const addProspekNote = () => setProspekNotes([...prospekNotes, { institusi: '', catatan: '' }])
  const removeProspekNote = (index: number) => setProspekNotes(prospekNotes.filter((_, i) => i !== index))
  const updateProspekNote = (index: number, field: 'institusi' | 'catatan', value: string) => {
    const newNotes = [...prospekNotes]
    newNotes[index] = { ...newNotes[index], [field]: value }
    setProspekNotes(newNotes)
  }

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
      metricKeyValues[m.metric_key] = Number(metricValues[m.id]) || 0
    }
  })

  const hasCustomLeads = activeMetrics.some(m => 
    m.input_type === 'manual' && ['leads', 'agreement_leads', 'prospek', 'prospek_kerja_sama'].includes(m.metric_key)
  )
  const hasCustomSigned = activeMetrics.some(m => 
    m.input_type === 'manual' && ['mou_signed', 'user_count', 'user_acquisition', 'tanda_tangan_mou'].includes(m.metric_key)
  )
  // Logic to determine if we should hide standard RP/User fields (only for MoU with custom metrics replacements)

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
    setProspekNotes([])
    setIsModalOpen(true)
  }

  const handleOpenEdit = (input: DailyInput) => {
    if (isLocked) {
      toast.error('Gagal: Data pada periode terkunci tidak dapat diubah.')
      return
    }
    setEditingId(input.id)
    setSelectedProgramId(input.program_id)
    
    // Load prospek_notes if they exist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setProspekNotes((input.prospek_notes as any[]) || [])
    
    // Load existing metric values for this specific input (date + program)
    const init: Record<string, string> = {}
    allPeriodMetricValues
      .filter(mv => mv.program_id === input.program_id && mv.date === input.date)
      .forEach(mv => {
        init[mv.metric_definition_id] = mv.value?.toString() || ''
      })
    setMetricValues(init)
    
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
        prospek_drop: formData.get('prospek_drop') ? Number(formData.get('prospek_drop')) : 0,
        prospek_notes: activeProgram?.target_type === 'mou' ? prospekNotes : null,
      }

      if (!editingId) {
        payload.program_id = selectedProgramId
      }

      // ALWAYS try to save legacy rp/user if they are present in the form, 
      // regardless of custom metrics existence, to maintain backward compatibility
      const targetType = activeProgram?.target_type
      if (targetType === 'quantitative' || targetType === 'hybrid') {
        const rp = formData.get('achievement_rp')
        const user = formData.get('achievement_user')
        if (rp !== null && rp !== '') payload.achievement_rp = Number(rp)
        if (user !== null && user !== '') payload.achievement_user = Number(user)
      }

      // ── EDGE CASE VALIDATION: MoU Prospek Aktif ───────────────────────────
      if (targetType === 'mou' && historicalMoUStats) {
        const pid = editingId ? pastInputs.find(i => i.id === editingId)?.program_id || selectedProgramId : selectedProgramId
        const historical = historicalMoUStats[pid] || { leads: 0, ttd: 0, drop: 0 }
        
        // 1. Get old values if editing
        const oldRow = editingId ? pastInputs.find(i => i.id === editingId) : null
        const oldSigned = oldRow?.achievement_user || 0
        const oldDrop = oldRow?.prospek_drop || 0
        
        // Leads for this row (can come from standard field OR custom metrics)
        const newStandardLeads = payload.achievement_rp || 0
        const newCustomLeads = activeMetrics
          .filter(m => ['leads', 'agreement_leads', 'prospek', 'prospek_kerja_sama'].includes(m.metric_key))
          .reduce((s, m) => s + (Number(metricValues[m.id]) || 0), 0)
        const totalNewLeads = newStandardLeads + newCustomLeads

        const oldLeadsInput = allPeriodMetricValues
          .filter(mv => mv.program_id === pid && mv.date === (oldRow?.date || payload.date))
          .filter(mv => {
            const def = activeMetrics.find(am => am.id === mv.metric_definition_id)
            return def && ['leads', 'agreement_leads', 'prospek', 'prospek_kerja_sama'].includes(def.metric_key)
          })
          .reduce((s, mv) => s + (Number(mv.value) || 0), 0)
        
        const oldTotalLeadsRow = (oldRow?.achievement_rp || 0) + oldLeadsInput

        // 2. Base stats excluding THIS row
        const baseLeads = historical.leads - oldTotalLeadsRow
        const baseTTD = historical.ttd - oldSigned
        const baseDrop = historical.drop - oldDrop
        
        // 3. Projected available with NEW values in this row
        const newCustomSigned = activeMetrics
          .filter(m => ['mou_signed', 'user_count', 'user_acquisition', 'tanda_tangan_mou'].includes(m.metric_key))
          .reduce((s, m) => s + (Number(metricValues[m.id]) || 0), 0)
        const newSigned = (payload.achievement_user || 0) + newCustomSigned
        const newDrop = payload.prospek_drop || 0
        
        const availableToDrop = (baseLeads + totalNewLeads) - (baseTTD + newSigned) - baseDrop
        
        if (newDrop > availableToDrop) {
          toast.error(`Gagal: Prospek aktif tidak mencukupi. Maksimal drop yang diizinkan: ${Math.max(0, availableToDrop)}`)
          setIsLoading(false)
          return
        }
      }

      let res;
      if (editingId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res = await updateDailyInput(editingId, payload as any)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res = await submitDailyInput(payload as any)
      }

      if ('error' in res && res.error) {
        toast.error(res.error)
        setIsLoading(false)
        return
      }

      // Save custom metric values if program has them
      if (hasCustomMetrics) {
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

      {layoutMode === 'card' ? (
        <div className="flex flex-col gap-4 animate-in fade-in">
          {sortedInputs.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 font-medium italic shadow-sm">
               Belum ada catatan aktivitas hari ini.
            </div>
          ) : (
            sortedInputs.map((input) => {
              const prog = programs.find(p => p.id === input.program_id)
              const percentageHarian = (prog?.daily_target_rp && input.achievement_rp) 
                ? ((input.achievement_rp / prog.daily_target_rp) * 100).toFixed(1) 
                : null
                
              return (
                <div key={input.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-indigo-200 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                        {formatDateLabel(input.date)}
                      </div>
                      <h4 className="font-bold text-slate-900 text-lg">{input.programs?.name || 'Unknown'}</h4>
                      {isAdmin && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-medium">
                          <Users className="h-3 w-3" />
                          {input.profiles?.name || '??'}
                        </div>
                      )}
                    </div>
                    {!isLocked && (
                       <div className="flex gap-1.5 shrink-0 ml-4">
                         <button
                           onClick={() => handleOpenEdit(input)}
                           className="p-2.5 text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-100 rounded-xl transition-all shadow-sm"
                           title="Edit Data"
                         >
                           <Edit3 className="h-4 w-4" />
                         </button>
                         <button
                           onClick={() => handleDelete(input.id)}
                           className="p-2.5 text-slate-400 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 border border-slate-100 rounded-xl transition-all shadow-sm"
                           title="Hapus Data"
                         >
                           <Trash2 className="h-4 w-4" />
                         </button>
                       </div>
                    )}
                  </div>

                  <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100">
                    {(() => {
                      const programMetrics = prog?.program_metric_definitions || [];
                      const isAds = isAdsProgram(programMetrics);
                      const isQuantitative = prog?.target_type === 'quantitative' || prog?.target_type === 'hybrid';
                      
                      if (isQuantitative && !isAds) {
                        return (
                          <div className="flex flex-wrap gap-4 items-center justify-between">
                            <div className="flex flex-wrap gap-4">
                              <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Capaian (Rp)</span>
                                <span className="font-extrabold text-indigo-700 text-base">{formatRupiah(Number(input.achievement_rp || 0))}</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">User/Closing</span>
                                <span className="font-bold text-slate-700 text-base">{input.achievement_user || 0} user</span>
                              </div>
                            </div>
                            {percentageHarian && (
                               <div className="flex flex-col items-end">
                                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Progres Target</span>
                                 <span className={cn(
                                   "text-[10px] px-2.5 py-1 rounded-full font-black uppercase shadow-sm border",
                                   Number(percentageHarian) >= 100 
                                     ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                                     : "bg-indigo-50 text-indigo-700 border-indigo-100"
                                 )}>
                                   {percentageHarian}% tercapai
                                 </span>
                               </div>
                            )}
                          </div>
                        )
                      }

                      if (programMetrics.length > 0) {
                        const dateMetrics = allPeriodMetricValues?.filter(mv => 
                          mv.program_id === input.program_id && mv.date === input.date
                        ) || [];
                        const allApplicableMetrics = programMetrics.filter(m => m.is_target_metric || m.input_type === 'manual');
                        
                        if (allApplicableMetrics.length === 0) return <span className="text-slate-300">-</span>

                        return (
                          <div className="grid grid-cols-2 xs:grid-cols-3 gap-3">
                            {allApplicableMetrics.map(mDef => {
                              const v = dateMetrics.find(dm => dm.metric_definition_id === mDef.id)?.value;
                              if (v === undefined || v === null) return null;
                              
                              return (
                                <div key={mDef.id} className="flex flex-col p-2.5 rounded-xl bg-white border border-slate-100">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 line-clamp-1" title={mDef.label}>{mDef.label}</span>
                                  <span className="font-bold text-indigo-700 text-sm">{formatMetricValue(v, mDef.data_type, mDef.unit_label)}</span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      }
                      
                      return <span className="text-slate-300 italic text-xs">Tidak ada data capaian numerik</span>
                    })()}
                  </div>

                  {input.notes && (
                    <div className="mt-4 p-3 bg-indigo-50/50 border border-indigo-100/50 rounded-xl">
                      <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Catatan Kendala/Pencapaian</div>
                      <p className="text-xs text-slate-700 font-medium leading-relaxed italic">&quot;{input.notes}&quot;</p>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      ) : (
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
                        const isAds = isAdsProgram(programMetrics);
                        const isQuantitative = prog?.target_type === 'quantitative' || prog?.target_type === 'hybrid';
                        
                        // Legacy-first display for quantitative programs that aren't Ads-heavy
                        if (isQuantitative && !isAds) {
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

                        if (programMetrics.length > 0) {
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
      )}

      {/* Input Modal */}
      {isModalOpen && !isLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 animate-in zoom-in-95 duration-200">
            {/* Sticky Header */}
            <div className="sticky top-0 z-30 px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white/95 backdrop-blur-sm rounded-t-2xl">
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
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-white rounded-full transition-all text-lg">✕</button>
            </div>
            
            {/* Scrollable Body Container */}
            <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="p-8 grid grid-cols-1 md:grid-cols-12 gap-10">
                {/* Form column */}
                <div className="md:col-span-7 space-y-8">
                  <form id="daily-form" onSubmit={handleSubmit} className="space-y-8">
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

                   {/* Legacy fields - Primary for quantitative/mou programs */}
                  {(activeProgram?.target_type === 'quantitative' || activeProgram?.target_type === 'hybrid' || activeProgram?.target_type === 'mou') && (
                    <div className="space-y-4 p-4 rounded-xl bg-slate-50/50 border border-slate-100">
                      <div className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                        <Target className="h-3 w-3" /> {activeProgram?.target_type === 'mou' ? 'Capaian MoU' : 'Capaian Utama (Legacy)'}
                      </div>
                      <div className="grid grid-cols-1 gap-6">
                        {(!hasCustomLeads || !hasCustomSigned) && (
                          <div className="grid grid-cols-2 gap-6">
                            {!hasCustomLeads && (
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                                  {activeProgram?.target_type === 'mou' ? 'PROSPEK BARU' : 'RP CAPAIAN'}
                                  {activeProgram?.target_type === 'mou' && (
                                    <div className="group relative">
                                      <Circle className="h-3 w-3 text-slate-400 cursor-help" />
                                      <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none font-normal normal-case">
                                        Prospek = institusi yang sudah dikontak dan menunjukkan ketertarikan awal (membalas, bersedia rapat, atau meminta info lebih lanjut)
                                      </div>
                                    </div>
                                  )}
                                </label>
                                <input 
                                  name="achievement_rp" type="number" min="0" placeholder={activeProgram?.target_type === 'mou' ? "0" : "Rp 0"}
                                  defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.achievement_rp?.toString() : ""}
                                  className="w-full text-sm font-bold rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-500 outline-none transition-all bg-white"
                                />
                                {activeProgram?.target_type === 'mou' && (
                                  <p className="text-[9px] text-slate-400 font-medium">Institusi baru yang menunjukkan ketertarikan</p>
                                )}
                              </div>
                            )}

                            {!hasCustomSigned && (
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">
                                  {activeProgram?.target_type === 'mou' ? 'TANDA TANGAN BARU' : 'USER/CLOSING'}
                                </label>
                                <input 
                                  name="achievement_user" type="number" min="0" placeholder="0"
                                  defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.achievement_user?.toString() : ""}
                                  className="w-full text-sm font-bold rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-500 outline-none transition-all bg-white"
                                />
                                {activeProgram?.target_type === 'mou' && (
                                  <p className="text-[9px] text-slate-400 font-medium">MoU yang resmi ditandatangani hari ini</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {activeProgram?.target_type === 'mou' && (
                          <div className={cn(
                            "space-y-1.5 pt-4",
                            (!hasCustomLeads || !hasCustomSigned) && "border-t border-slate-200"
                          )}>
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                                PROSPEK TIDAK JADI (DROP)
                              </label>
                              {historicalMoUStats && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100">
                                  Inventory: {(() => {
                                    const pid = editingId ? pastInputs.find(i => i.id === editingId)?.program_id || selectedProgramId : selectedProgramId
                                    const h = historicalMoUStats[pid] || { leads: 0, ttd: 0, drop: 0 }
                                    
                                    // Live calculation for the UI
                                    const oldRow = editingId ? pastInputs.find(i => i.id === editingId) : null
                                    const oldLeads = allPeriodMetricValues
                                      .filter(mv => mv.program_id === pid && mv.date === (oldRow?.date || ''))
                                      .filter(mv => {
                                        const def = activeMetrics.find(am => am.id === mv.metric_definition_id)
                                        return def && ['leads', 'agreement_leads', 'prospek'].includes(def.metric_key)
                                      })
                                      .reduce((s, mv) => s + (Number(mv.value) || 0), 0)

                                    const curLeads = activeMetrics
                                      .filter(m => ['leads', 'agreement_leads', 'prospek'].includes(m.metric_key))
                                      .reduce((s, m) => s + (Number(metricValues[m.id]) || 0), 0)

                                    const baseAktif = (h.leads - oldLeads + curLeads) - (h.ttd - (oldRow?.achievement_user || 0)) - (h.drop - (oldRow?.prospek_drop || 0))
                                    return Math.max(0, baseAktif)
                                  })()}
                                </span>
                              )}
                            </div>
                            <input 
                              name="prospek_drop" type="number" min="0" placeholder="0"
                              defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.prospek_drop?.toString() : "0"}
                              className="w-full text-sm font-bold rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-500 outline-none transition-all bg-white"
                            />
                            <p className="text-[10px] text-slate-400 font-medium">Institusi yang dipastikan tidak akan melanjutkan kerjasama</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Dynamic Metric Fields - Specialized KPIs */}
                  {hasCustomMetrics && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-[10px] font-black text-purple-600 uppercase tracking-widest pl-1">
                        <TrendingUp className="h-3 w-3" /> Metrik Spesifik (Custom)
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        {activeMetrics.map(metric => {
                          const isCalc = metric.input_type === 'calculated'
                          // Don't duplicate legacy fields in custom section if already shown above
                          if (!isAdsProgram(activeProgram?.program_metric_definitions || []) && 
                             (metric.metric_key === 'revenue' || metric.metric_key === 'user_count')) return null;

                          const calcVal = isCalc && metric.formula
                            ? evaluateFormula(metric.formula, metricKeyValues)
                            : null

                          return (
                            <div key={metric.id} className={`space-y-1.5 ${isCalc ? 'opacity-80' : ''}`}>
                              <div className="flex items-center justify-between gap-2 overflow-hidden">
                                <label className="text-[10px] font-bold text-slate-500 uppercase truncate" title={metric.label}>
                                  {metric.label}
                                </label>
                                {isCalc && <Calculator className="h-3 w-3 text-purple-400 shrink-0" />}
                              </div>
                              {isCalc ? (
                                <div className="w-full text-xs font-bold rounded-xl border border-purple-100 bg-purple-50/50 px-3 py-2 text-purple-700 truncate min-h-[38px] flex items-center">
                                  {calcVal !== null 
                                    ? formatMetricValue(calcVal, metric.data_type, metric.unit_label)
                                    : '—'
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
                                  className="w-full text-sm font-bold rounded-xl border border-slate-200 px-3 py-2 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Phase 2.1: Prospek Notes for MoU */}
                  {activeProgram?.target_type === 'mou' && (
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between pl-1">
                        <div className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest">
                          <ClipboardList className="h-3 w-3" /> Update Prospek Hari Ini (Opsional)
                        </div>
                        <button 
                          type="button"
                          onClick={addProspekNote}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded transition-colors"
                        >
                          + Tambah Institusi
                        </button>
                      </div>
                      
                      <div className="space-y-3">
                        {prospekNotes.length === 0 ? (
                          <div className="text-[10px] text-slate-400 italic bg-slate-50/30 p-4 rounded-xl border border-dashed border-slate-200 text-center">
                            Belum ada catatan prospek. Klik tambah untuk mencatat institusi yang diproses hari ini.
                          </div>
                        ) : (
                          prospekNotes.map((note, idx) => (
                            <div key={idx} className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 relative group shadow-sm transition-all hover:border-blue-200">
                              <button 
                                type="button"
                                onClick={() => removeProspekNote(idx)}
                                className="absolute -top-2 -right-2 bg-white border border-slate-200 text-slate-400 hover:text-rose-600 p-1 rounded-full shadow-sm z-10 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                              <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nama Institusi / Prospek</label>
                                <input 
                                  type="text"
                                  value={note.institusi}
                                  onChange={(e) => updateProspekNote(idx, 'institusi', e.target.value)}
                                  placeholder="Contoh: PT Angin Ribut"
                                  className="w-full text-xs font-bold rounded-lg border border-slate-100 px-3 py-2.5 focus:border-blue-400 outline-none bg-slate-50/50 transition-all"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Update / Catatan Progres</label>
                                <textarea 
                                  value={note.catatan}
                                  onChange={(e) => updateProspekNote(idx, 'catatan', e.target.value)}
                                  placeholder="Contoh: Sudah presentasi, menunggu keputusan direksi minggu depan."
                                  className="w-full text-xs font-medium rounded-lg border border-slate-100 px-3 py-2.5 focus:border-blue-400 outline-none bg-slate-50/50 min-h-[60px] transition-all"
                                />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Catatan Pendukung / Kendala</label>
                    <textarea 
                      name="notes" rows={3}
                      defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.notes || '' : ''}
                      placeholder="Apa kendala atau yang berhasil dicapai hari ini?"
                      className="w-full text-sm font-medium rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-500 outline-none resize-none transition-all"
                    ></textarea>
                  </div>
                </form>
              </div>

              {/* Milestones / Tasks Section */}
              <div className="md:col-span-5 flex flex-col h-full min-h-[400px]">
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

                <div className="mt-auto pt-6 border-t border-slate-200">
                  <p className="text-[9px] text-slate-400 font-bold leading-relaxed">
                    * Misi kualitatif yang dicentang akan terus berstatus &quot;Selesai&quot; di periode berikutnya.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 py-5 bg-white border-t border-slate-100 rounded-b-2xl flex justify-between items-center sticky bottom-0 z-30">
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
