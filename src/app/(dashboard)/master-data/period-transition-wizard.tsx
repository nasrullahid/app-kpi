'use client'

import { useState } from 'react'
import { activatePeriodWithDecisions } from './actions'
import { Database } from '@/types/database'
import { formatMonth, formatRupiah } from '@/lib/utils'
import { toast } from 'sonner'
import { CheckCircle2, X, ChevronRight, Megaphone, Handshake, Target, BarChart2 } from 'lucide-react'
import { isAdsProgram, isMouProgram } from '@/lib/dashboard-calculator'

type Period = Database['public']['Tables']['periods']['Row']
type MetricDef = Database['public']['Tables']['program_metric_definitions']['Row']
type Program = Database['public']['Tables']['programs']['Row'] & {
  program_metric_definitions?: MetricDef[]
  program_milestones?: { id: string }[]
}

// ── Program type classification ───────────────────────────────────────────────
type ProgramKind = 'ads' | 'mou' | 'kualitatif' | 'legacy'

function classifyProgram(p: Program): ProgramKind {
  const metrics = p.program_metric_definitions || []
  const milestones = p.program_milestones || []
  if (isAdsProgram(metrics)) return 'ads'
  if (isMouProgram(metrics) || p.target_type === 'mou') return 'mou'
  if (milestones.length > 0 && (p.monthly_target_rp || 0) === 0 && (p.monthly_target_user || 0) === 0) return 'kualitatif'
  return 'legacy'
}

const KIND_META: Record<ProgramKind, { label: string; color: string; bg: string; icon: React.ReactNode; carryNote: string }> = {
  ads: {
    label: 'ADS',
    color: '#C2410C',
    bg: '#FFF7ED',
    icon: <Megaphone className="h-3 w-3" />,
    carryNote: 'Data iklan (Ad Spend, Leads, ROAS) tidak carry over — metrik ads selalu fresh per periode.',
  },
  mou: {
    label: 'MOU',
    color: '#7C3AED',
    bg: '#F5F3FF',
    icon: <Handshake className="h-3 w-3" />,
    carryNote: 'Progres MoU yang sudah ditandatangani tidak carry over ke periode baru secara otomatis.',
  },
  kualitatif: {
    label: 'KUALITATIF',
    color: '#0891B2',
    bg: '#E0F2FE',
    icon: <Target className="h-3 w-3" />,
    carryNote: 'Status milestone akan reset. Centang ulang yang sudah selesai jika masih relevan.',
  },
  legacy: {
    label: 'LEGACY',
    color: '#059669',
    bg: '#ECFDF5',
    icon: <BarChart2 className="h-3 w-3" />,
    carryNote: 'Capaian Rp/User dari periode lama tidak carry over. Dashboard mulai dari 0.',
  },
}

// ── Summarize custom metrics for display ──────────────────────────────────────
function getCustomMetricSummary(metrics: MetricDef[]): string[] {
  const ADS_KEYS = ['ads_spent', 'leads', 'roas', 'cpp', 'cpm', 'cpc', 'conversion_rate']
  const primaryKeys = metrics
    .filter(m => m.is_primary || ADS_KEYS.includes(m.metric_key?.toLowerCase() || ''))
    .map(m => m.label || m.metric_key)
    .filter(Boolean)
    .slice(0, 4)
  return primaryKeys as string[]
}

export type ProgramDecision = 'skip' | 'fresh' | 'carry'

interface PeriodTransitionWizardProps {
  fromPeriod: Period | null
  toPeriod: Period
  programs: Program[]
  onClose: () => void
  onSuccess: () => void
}


// ── StepIndicator ─────────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: number }) {
  const steps = [
    { n: 1, label: 'Overview Program' },
    { n: 2, label: 'Keputusan per Program' },
    { n: 3, label: 'Konfirmasi' },
  ]
  return (
    <div className="flex items-center gap-0 mt-4">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1">
          <div className={`flex items-center gap-2 ${step >= s.n ? 'opacity-100' : 'opacity-40'}`}>
            <div
              className="flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold flex-shrink-0"
              style={{ background: step > s.n ? '#1D9E75' : step === s.n ? '#4F46E5' : '#D1D5DB' }}
            >
              {step > s.n ? '✓' : s.n}
            </div>
            <span
              className={`text-xs whitespace-nowrap hidden sm:block ${step === s.n ? 'font-semibold text-indigo-700' : 'text-slate-400'}`}
            >
              {s.label}
            </span>
          </div>
          {i < 2 && (
            <div
              className="flex-1 h-px mx-2"
              style={{ background: step > s.n ? '#1D9E75' : '#E5E7EB' }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── ProgramCard ───────────────────────────────────────────────────────────────
function ProgramCard({
  program,
  decision,
  toPeriodLabel,
  onDecision,
}: {
  program: Program
  decision: ProgramDecision | undefined
  toPeriodLabel: string
  onDecision: (id: string, d: ProgramDecision) => void
}) {
  const kind = classifyProgram(program)
  const meta = KIND_META[kind]
  const metrics = program.program_metric_definitions || []
  const customMetricLabels = getCustomMetricSummary(metrics)
  const hasRevTarget = (program.monthly_target_rp || 0) > 0
  const hasUserTarget = (program.monthly_target_user || 0) > 0
  const milestoneCount = program.program_milestones?.length || 0

  const opts = [
    { key: 'skip' as ProgramDecision, short: '✕ Tidak', desc: 'Program tidak muncul di periode baru', selectedBg: '#FCEBEB', selectedText: '#7F1D1D', borderColor: '#E24B4A' },
    { key: 'fresh' as ProgramDecision, short: '↺ Fresh', desc: 'Lanjutkan, capaian mulai dari 0', selectedBg: '#E1F5EE', selectedText: '#064E3B', borderColor: '#1D9E75' },
    { key: 'carry' as ProgramDecision, short: '→ Carry over', desc: 'Capaian lama ikut terbawa', selectedBg: '#EEF2FF', selectedText: '#312E81', borderColor: '#4F46E5' },
  ]

  const selectedOpt = opts.find(o => o.key === decision)

  // For ads programs, disable carry-over as it doesn't make sense
  const disabledKeys: ProgramDecision[] = kind === 'ads' ? ['carry'] : []

  return (
    <div
      className="bg-white rounded-xl border-l-4 border border-slate-100 mb-3 overflow-hidden transition-all"
      style={{ borderLeftColor: selectedOpt?.borderColor || meta.color }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded"
                style={{ background: meta.bg, color: meta.color }}
              >
                {meta.icon} {meta.label}
              </span>
              {customMetricLabels.length > 0 && customMetricLabels.map(l => (
                <span key={l} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                  {l}
                </span>
              ))}
            </div>
            <div className="text-sm font-semibold text-slate-900">{program.name}</div>
            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-400">
              {hasRevTarget && (
                <span>Target Rp: <span className="font-semibold text-slate-600">{formatRupiah(program.monthly_target_rp || 0)}</span></span>
              )}
              {hasUserTarget && (
                <span>Target User: <span className="font-semibold text-slate-600">{program.monthly_target_user}</span></span>
              )}
              {milestoneCount > 0 && (
                <span>{milestoneCount} milestone</span>
              )}
              {!hasRevTarget && !hasUserTarget && milestoneCount === 0 && (
                <span className="italic">Tidak ada target terdefinisi</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Decision buttons */}
      <div className="px-4 pb-4 border-t border-slate-50 pt-3">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          Lanjutkan di {toPeriodLabel}?
        </div>
        <div className="flex gap-2">
          {opts.map(opt => {
            const isSelected = decision === opt.key
            const isDisabled = disabledKeys.includes(opt.key)
            return (
              <button
                key={opt.key}
                onClick={() => !isDisabled && onDecision(program.id, opt.key)}
                title={isDisabled ? 'Tidak tersedia untuk program tipe ini' : opt.desc}
                disabled={isDisabled}
                className="flex-1 py-2 px-1 text-xs font-semibold rounded-lg border transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  border: `1px solid ${isSelected ? opt.borderColor : '#E5E7EB'}`,
                  background: isSelected ? opt.selectedBg : '#FAFAF9',
                  color: isSelected ? opt.selectedText : '#6B7280',
                }}
              >
                {opt.short}
              </button>
            )
          })}
        </div>
        {decision && (
          <div
            className="mt-2 text-xs px-3 py-2 rounded-lg leading-relaxed"
            style={{ background: selectedOpt?.selectedBg, color: selectedOpt?.selectedText }}
          >
            {decision === 'skip' && `Program ini tidak akan muncul di ${toPeriodLabel}.`}
            {decision === 'fresh' && `Program aktif di ${toPeriodLabel}. ${meta.carryNote}`}
            {decision === 'carry' && `Capaian dari periode lama akan terbawa ke ${toPeriodLabel}.`}
          </div>
        )}
      </div>
    </div>
  )
}

// ── SummaryStep ───────────────────────────────────────────────────────────────
function SummaryStep({
  programs,
  decisions,
  fromLabel,
  toLabel,
}: {
  programs: Program[]
  decisions: Record<string, ProgramDecision>
  fromLabel: string
  toLabel: string
}) {
  const groups = [
    { key: 'skip' as ProgramDecision, label: 'Tidak dilanjutkan', color: '#E24B4A', bg: '#FCEBEB', icon: '✕' },
    { key: 'fresh' as ProgramDecision, label: 'Lanjut — Fresh', color: '#1D9E75', bg: '#E1F5EE', icon: '↺' },
    { key: 'carry' as ProgramDecision, label: 'Lanjut — Carry over', color: '#4F46E5', bg: '#EEF2FF', icon: '→' },
  ]

  const undecided = programs.filter(p => !decisions[p.id])

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
        <div className="text-sm font-bold text-indigo-800 mb-1">
          Ringkasan Transisi: {fromLabel} → {toLabel}
        </div>
        <div className="text-xs text-indigo-600">
          Periksa kembali sebelum mengkonfirmasi. Perubahan ini akan berlaku untuk semua pengguna.
        </div>
      </div>

      {groups.map(g => {
        const items = programs.filter(p => decisions[p.id] === g.key)
        if (items.length === 0) return null
        return (
          <div key={g.key}>
            <div className="text-xs font-bold mb-2" style={{ color: g.color }}>
              {g.icon} {g.label} ({items.length} program)
            </div>
            <div className="space-y-2">
              {items.map(p => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: g.bg }}
                >
                  <div className="text-xs font-semibold text-slate-800">{p.name}</div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ color: g.color, borderColor: g.color, background: '#fff' }}
                  >
                    {g.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {undecided.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
          ⚠️ {undecided.length} program belum ditentukan. Kembali ke langkah sebelumnya.
        </div>
      )}
    </div>
  )
}

// ── Main Wizard ───────────────────────────────────────────────────────────────
export function PeriodTransitionWizard({
  fromPeriod,
  toPeriod,
  programs,
  onClose,
  onSuccess,
}: PeriodTransitionWizardProps) {
  const [step, setStep] = useState(1)
  const [decisions, setDecisions] = useState<Record<string, ProgramDecision>>({})
  const [isLoading, setIsLoading] = useState(false)

  const activePrograms = programs.filter(p => p.is_active)
  const allDecided = activePrograms.every(p => decisions[p.id])
  const decidedCount = Object.keys(decisions).length

  const fromLabel = fromPeriod
    ? `${formatMonth(fromPeriod.month)} ${fromPeriod.year}`
    : 'Tidak ada'
  const toLabel = `${formatMonth(toPeriod.month)} ${toPeriod.year}`

  function handleDecision(id: string, d: ProgramDecision) {
    setDecisions(prev => ({ ...prev, [id]: d }))
  }

  async function handleConfirm() {
    setIsLoading(true)
    try {
      const res = await activatePeriodWithDecisions(toPeriod.id, fromPeriod?.id ?? null, decisions)

      if ('error' in res && res.error) {
        toast.error(res.error)
        setIsLoading(false)
        return
      }

      const skipped = (res as { success: boolean; data?: { skipped: number } }).data?.skipped || 0
      if (skipped > 0) {
        toast.info(`${skipped} program dinonaktifkan sesuai keputusan wizard.`)
      }

      toast.success(`Berhasil beralih ke periode ${toLabel}!`)
      setStep(4)
    } catch {
      toast.error('Terjadi kesalahan sistem')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 4: Done ────────────────────────────────────────────────────────────
  if (step === 4) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-10 text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 text-3xl mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="text-xl font-bold text-slate-900 mb-2">
            Transisi ke {toLabel} berhasil!
          </div>
          <div className="text-sm text-slate-500 mb-6 leading-relaxed">
            Dashboard sekarang menampilkan data <strong>{toLabel}</strong>.<br />
            Data {fromLabel} tetap tersimpan dan bisa diakses kapan saja.
          </div>
          <button
            onClick={onSuccess}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 transition-all"
          >
            Tutup & Lihat Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <div className="text-base font-bold text-slate-900">Ganti Periode Aktif</div>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="text-xs text-slate-500">
            <span className="text-slate-700 font-semibold">{fromLabel}</span>
            {' '}→{' '}
            <span className="font-bold text-indigo-700">{toLabel} ({toPeriod.working_days} hari kerja)</span>
          </div>
          <StepIndicator step={step} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* STEP 1 — Overview */}
          {step === 1 && (
            <div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 mb-4 leading-relaxed">
                <strong>Sebelum melanjutkan:</strong> berikut daftar program aktif di {fromLabel}. Pastikan data sudah lengkap sebelum mengganti periode.
              </div>
              {activePrograms.length === 0 && (
                <div className="text-center text-slate-400 py-10 text-sm">Tidak ada program aktif saat ini.</div>
              )}
              {activePrograms.map(p => (
                <div
                  key={p.id}
                  className="bg-white border border-slate-100 rounded-xl p-4 mb-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5 capitalize">{p.target_type || 'quantitative'}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-slate-500">
                    {(p.monthly_target_rp || 0) > 0 && (
                      <span>Target Rp: <span className="font-semibold text-slate-700">{formatRupiah(p.monthly_target_rp || 0)}</span></span>
                    )}
                    {(p.monthly_target_user || 0) > 0 && (
                      <span>Target User: <span className="font-semibold text-slate-700">{p.monthly_target_user}</span></span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* STEP 2 — Decisions */}
          {step === 2 && (
            <div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-800 mb-4 leading-relaxed">
                Tentukan keputusan untuk setiap program di <strong>{toLabel}</strong>.{' '}
                ({decidedCount}/{activePrograms.length} sudah ditentukan)
              </div>
              {activePrograms.map(p => (
                <ProgramCard
                  key={p.id}
                  program={p}
                  decision={decisions[p.id]}
                  toPeriodLabel={toLabel}
                  onDecision={handleDecision}
                />
              ))}
            </div>
          )}

          {/* STEP 3 — Summary */}
          {step === 3 && (
            <SummaryStep
              programs={activePrograms}
              decisions={decisions}
              fromLabel={fromLabel}
              toLabel={toLabel}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex items-center justify-between">
          <button
            onClick={() => step > 1 && setStep(s => s - 1)}
            className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
            style={{ visibility: step > 1 ? 'visible' : 'hidden' }}
          >
            ← Kembali
          </button>

          <div className="text-xs text-slate-400">Langkah {step} dari 3</div>

          {step < 3 && (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 2 && !allDecided}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-indigo-100"
            >
              Lanjut <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {step === 3 && (
            <button
              onClick={handleConfirm}
              disabled={!allDecided || isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-emerald-100"
            >
              {isLoading ? 'Memproses...' : `✓ Aktifkan ${toLabel}`}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
