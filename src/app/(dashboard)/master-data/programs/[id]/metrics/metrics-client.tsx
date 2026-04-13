'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database } from '@/types/database'
import { toast } from 'sonner'
import { METRIC_TEMPLATES } from '@/lib/metric-templates'
import { DEPARTMENTS } from '@/lib/department-config'
import {
  createMetricDefinition,
  updateMetricDefinition,
  deleteMetricDefinition,
  applyMetricTemplate,
} from '../../../metric-actions'
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  ArrowLeft,
  Save,
  Calculator,
  Eye,
  EyeOff,
} from 'lucide-react'

type MetricDefinition = Database['public']['Tables']['program_metric_definitions']['Row']
type DataType = MetricDefinition['data_type']
type InputType = MetricDefinition['input_type']
type TargetDirection = MetricDefinition['target_direction']

interface Program {
  id: string
  name: string
  department: string
  target_type: string | null
}

interface MetricsClientProps {
  program: Program
  initialMetrics: MetricDefinition[]
}

const DATA_TYPE_OPTIONS: { value: DataType; label: string }[] = [
  { value: 'currency', label: 'Mata Uang (Rp)' },
  { value: 'integer', label: 'Bilangan Bulat' },
  { value: 'float', label: 'Desimal (ROAS, dll)' },
  { value: 'percentage', label: 'Persentase (%)' },
  { value: 'boolean', label: 'Ya / Tidak' },
]

const DATA_TYPE_LABELS: Record<DataType, string> = {
  currency: 'Rp',
  integer: 'Bilangan',
  float: 'Desimal',
  percentage: '%',
  boolean: 'Ya/Tidak',
}

interface MetricRow {
  id?: string
  metric_key: string
  label: string
  data_type: DataType
  input_type: InputType
  formula: string
  is_target_metric: boolean
  monthly_target: string
  target_direction: TargetDirection
  unit_label: string
  show_on_dashboard: boolean
  show_on_tv: boolean
  display_order: number
  isNew: boolean
  isDirty: boolean
}

function toMetricRow(m: MetricDefinition, order: number): MetricRow {
  return {
    id: m.id,
    metric_key: m.metric_key,
    label: m.label,
    data_type: m.data_type,
    input_type: m.input_type,
    formula: m.formula || '',
    is_target_metric: m.is_target_metric,
    monthly_target: m.monthly_target?.toString() || '',
    target_direction: m.target_direction,
    unit_label: m.unit_label || '',
    show_on_dashboard: m.show_on_dashboard,
    show_on_tv: m.show_on_tv,
    display_order: order,
    isNew: false,
    isDirty: false,
  }
}

function labelToKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

export function MetricsClient({ program, initialMetrics }: MetricsClientProps) {
  const router = useRouter()
  const [rows, setRows] = useState<MetricRow[]>(
    initialMetrics.map((m, i) => toMetricRow(m, i))
  )
  const [isLoading, setIsLoading] = useState(false)
  const [showTemplates, setShowTemplates] = useState(initialMetrics.length === 0)

  const dept = DEPARTMENTS.find(d => d.key === program.department)

  // ── Helpers ──────────────────────────────────────────────────────────────

  const updateRow = (index: number, patch: Partial<MetricRow>) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch, isDirty: true } : r))
  }

  const addRow = () => {
    const newRow: MetricRow = {
      metric_key: '',
      label: '',
      data_type: 'integer',
      input_type: 'manual',
      formula: '',
      is_target_metric: false,
      monthly_target: '',
      target_direction: 'higher_is_better',
      unit_label: '',
      show_on_dashboard: true,
      show_on_tv: true,
      display_order: rows.length,
      isNew: true,
      isDirty: true,
    }
    setRows(prev => [...prev, newRow])
  }

  const removeRow = async (index: number) => {
    const row = rows[index]
    if (!row.isNew && row.id) {
      if (!confirm(`Hapus metrik "${row.label}"? Data input harian yang terkait juga akan terhapus.`)) return
      setIsLoading(true)
      const res = await deleteMetricDefinition(row.id)
      setIsLoading(false)
      if ('error' in res) return toast.error(res.error)
      toast.success('Metrik dihapus')
    }
    setRows(prev => prev.filter((_, i) => i !== index).map((r, i) => ({ ...r, display_order: i })))
  }

  const moveRow = (index: number, direction: 'up' | 'down') => {
    const newRows = [...rows]
    const swapIdx = direction === 'up' ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= newRows.length) return
    ;[newRows[index], newRows[swapIdx]] = [newRows[swapIdx], newRows[index]]
    setRows(newRows.map((r, i) => ({ ...r, display_order: i, isDirty: true })))
  }

  // ── Apply Template ────────────────────────────────────────────────────────

  const handleApplyTemplate = async (templateKey: string) => {
    const template = METRIC_TEMPLATES.find(t => t.key === templateKey)
    if (!template) return

    if (rows.length > 0 && !confirm(`Ini akan mengganti ${rows.length} metrik yang ada. Lanjutkan?`)) return

    setIsLoading(true)
    const res = await applyMetricTemplate(program.id, template.metrics)
    setIsLoading(false)

    if ('error' in res) return toast.error(res.error)
    toast.success(`Template "${template.label}" diterapkan!`)
    setShowTemplates(false)
    router.refresh()
  }

  // ── Save all dirty / new rows ─────────────────────────────────────────────

  const handleSaveAll = async () => {
    const dirty = rows.filter(r => r.isDirty)
    if (dirty.length === 0) return toast.info('Tidak ada perubahan.')

    // Validate
    for (const row of dirty) {
      if (!row.label.trim()) return toast.error('Label metrik tidak boleh kosong.')
      if (!row.metric_key.trim()) return toast.error('Metric key tidak boleh kosong.')
      if (row.input_type === 'calculated' && !row.formula.trim()) {
        return toast.error(`Metrik "${row.label}" adalah kalkulasi tapi belum ada formula.`)
      }
    }

    setIsLoading(true)
    let hasError = false

    for (const row of dirty) {
      const payload = {
        program_id: program.id,
        metric_key: row.metric_key,
        label: row.label,
        data_type: row.data_type,
        input_type: row.input_type,
        formula: row.input_type === 'calculated' ? row.formula : null,
        is_target_metric: row.is_target_metric,
        monthly_target: row.is_target_metric && row.monthly_target ? Number(row.monthly_target) : null,
        target_direction: row.target_direction,
        unit_label: row.unit_label || null,
        show_on_dashboard: row.show_on_dashboard,
        show_on_tv: row.show_on_tv,
        display_order: row.display_order,
      }

      let res
      if (row.isNew) {
        res = await createMetricDefinition(payload)
      } else if (row.id) {
        res = await updateMetricDefinition(row.id, payload)
      }

      if (res && 'error' in res) {
        toast.error(res.error)
        hasError = true
        break
      }
    }

    setIsLoading(false)
    if (!hasError) {
      toast.success('Semua metrik berhasil disimpan!')
      router.refresh()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const allMetricKeys = rows.map(r => r.metric_key).filter(Boolean)

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.push('/master-data')}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-3 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Kembali ke Master Data
          </button>
          <h2 className="text-2xl font-bold text-slate-900">Definisi KPI</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-slate-600 font-medium">{program.name}</span>
            {dept && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${dept.color} ${dept.textColor}`}>
                {dept.label}
              </span>
            )}
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Tentukan metrik KPI yang akan dilacak untuk program ini.
            Metrik yang memiliki target akan muncul sebagai progress bar di dashboard.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowTemplates(p => !p)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <Sparkles className="h-4 w-4 text-amber-500" />
            Template
          </button>
          <button
            onClick={handleSaveAll}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isLoading ? 'Menyimpan...' : 'Simpan Semua'}
          </button>
        </div>
      </div>

      {/* Template Picker */}
      {showTemplates && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="font-bold text-amber-900 mb-1 flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Pilih Template
          </h3>
          <p className="text-sm text-amber-700 mb-4">
            Pilih template untuk mengisi metrik secara otomatis. Ini akan mengganti metrik yang ada.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {METRIC_TEMPLATES.map(t => (
              <button
                key={t.key}
                onClick={() => handleApplyTemplate(t.key)}
                disabled={isLoading}
                className="text-left p-4 bg-white border border-amber-200 rounded-lg hover:border-amber-400 hover:shadow-sm transition-all disabled:opacity-50"
              >
                <div className="font-bold text-slate-800 text-sm mb-0.5">{t.label}</div>
                <div className="text-xs text-slate-500">{t.description}</div>
                <div className="text-xs text-amber-600 font-medium mt-2">{t.metrics.length} metrik</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Metric Rows */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Calculator className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Belum ada metrik KPI terdefinisi</p>
            <p className="text-sm mt-1">Pilih template di atas atau tambah metrik manual</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <div
                key={index}
                className={`p-5 ${row.isDirty ? 'bg-amber-50/30' : ''} ${row.isNew ? 'bg-indigo-50/20' : ''}`}
              >
                <div className="grid grid-cols-12 gap-3 items-start">
                  {/* Order controls */}
                  <div className="col-span-1 flex flex-col items-center gap-1 pt-6">
                    <button
                      onClick={() => moveRow(index, 'up')}
                      disabled={index === 0}
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-20 transition-colors"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <span className="text-xs font-bold text-slate-400">{index + 1}</span>
                    <button
                      onClick={() => moveRow(index, 'down')}
                      disabled={index === rows.length - 1}
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-20 transition-colors"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Label */}
                  <div className="col-span-3">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                      Label <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={row.label}
                      onChange={e => {
                        const label = e.target.value
                        updateRow(index, {
                          label,
                          metric_key: row.isNew ? labelToKey(label) : row.metric_key,
                        })
                      }}
                      placeholder="Contoh: Lead Masuk"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="mt-1 text-[10px] text-slate-400 font-mono">
                      key: {row.metric_key || '(auto dari label)'}
                    </div>
                  </div>

                  {/* Data Type */}
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Tipe Data</label>
                    <select
                      value={row.data_type}
                      onChange={e => updateRow(index, { data_type: e.target.value as DataType })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {DATA_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Input Type */}
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Input</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateRow(index, { input_type: 'manual', formula: '' })}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${
                          row.input_type === 'manual'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Manual
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRow(index, { input_type: 'calculated' })}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${
                          row.input_type === 'calculated'
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Calculator className="h-3 w-3 inline mr-1" />
                        Kalkulasi
                      </button>
                    </div>
                  </div>

                  {/* Formula or Unit Label */}
                  <div className="col-span-2">
                    {row.input_type === 'calculated' ? (
                      <>
                        <label className="block text-[10px] font-bold text-purple-500 uppercase tracking-wide mb-1">
                          Formula
                        </label>
                        <input
                          type="text"
                          value={row.formula}
                          onChange={e => updateRow(index, { formula: e.target.value })}
                          placeholder="omzet / budget_iklan"
                          className="w-full border border-purple-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <div className="text-[10px] text-purple-400 mt-1">
                          Keys tersedia: {allMetricKeys.filter(k => k !== row.metric_key).join(', ') || 'belum ada'}
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Satuan</label>
                        <input
                          type="text"
                          value={row.unit_label}
                          onChange={e => updateRow(index, { unit_label: e.target.value })}
                          placeholder="Rp / leads / x"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </>
                    )}
                  </div>

                  {/* Is Target + Monthly Target */}
                  <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Target</label>
                    <button
                      type="button"
                      onClick={() => updateRow(index, { is_target_metric: !row.is_target_metric })}
                      className={`w-full py-2 text-xs font-bold rounded-lg border transition-colors ${
                        row.is_target_metric
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                          : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}
                    >
                      {row.is_target_metric ? '✓ Ada' : '—'}
                    </button>
                  </div>

                  {/* Delete */}
                  <div className="col-span-1 flex items-end pb-1 justify-center">
                    <button
                      onClick={() => removeRow(index)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded options for target metrics */}
                {row.is_target_metric && (
                  <div className="mt-3 ml-8 p-3 bg-emerald-50 border border-emerald-100 rounded-lg grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1">
                        Target Bulanan
                      </label>
                      <input
                        type="number"
                        value={row.monthly_target}
                        onChange={e => updateRow(index, { monthly_target: e.target.value })}
                        placeholder="Masukkan angka target"
                        className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1">
                        Arah Target
                      </label>
                      <select
                        value={row.target_direction}
                        onChange={e => updateRow(index, { target_direction: e.target.value as TargetDirection })}
                        className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="higher_is_better">↑ Makin tinggi makin baik</option>
                        <option value="lower_is_better">↓ Makin rendah makin baik</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1">
                        Tampilkan Di
                      </label>
                      <div className="flex gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => updateRow(index, { show_on_dashboard: !row.show_on_dashboard })}
                          className={`flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold rounded border transition-colors ${
                            row.show_on_dashboard
                              ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          {row.show_on_dashboard ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          Dashboard
                        </button>
                        <button
                          type="button"
                          onClick={() => updateRow(index, { show_on_tv: !row.show_on_tv })}
                          className={`flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold rounded border transition-colors ${
                            row.show_on_tv
                              ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          {row.show_on_tv ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          TV
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Data type badge */}
                <div className="mt-2 ml-8 flex gap-2">
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                    {DATA_TYPE_LABELS[row.data_type]}
                  </span>
                  {row.isDirty && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                      Belum disimpan
                    </span>
                  )}
                  {row.isNew && (
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      Baru
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Row */}
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={addRow}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors w-full justify-center border border-dashed border-indigo-200 hover:border-indigo-400"
          >
            <Plus className="h-4 w-4" />
            Tambah Metrik
          </button>
        </div>
      </div>

      {/* Summary */}
      {rows.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-4 text-center text-sm">
          <div>
            <div className="text-2xl font-black text-slate-800">{rows.length}</div>
            <div className="text-slate-500 text-xs">Total Metrik</div>
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-700">{rows.filter(r => r.is_target_metric).length}</div>
            <div className="text-slate-500 text-xs">Punya Target</div>
          </div>
          <div>
            <div className="text-2xl font-black text-purple-700">{rows.filter(r => r.input_type === 'calculated').length}</div>
            <div className="text-slate-500 text-xs">Kalkulasi Otomatis</div>
          </div>
        </div>
      )}
    </div>
  )
}
