'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPeriod, deletePeriod, updatePeriod, togglePeriodLock } from './actions'
import { Database } from '@/types/database'
import { formatMonth } from '@/lib/utils'
import { toast } from 'sonner'
import { PeriodTransitionWizard } from './period-transition-wizard'
import { BarChart2, 
  Lock, 
  Unlock, 
  Settings2, 
  Trash2, 
  CheckCircle2, 
  History, 
  Calendar,
  AlertTriangle,
  ExternalLink
} from 'lucide-react'

type Period = Database['public']['Tables']['periods']['Row']
type Program = Database['public']['Tables']['programs']['Row'] & {
  program_metric_definitions?: Database['public']['Tables']['program_metric_definitions']['Row'][]
}

export function PeriodClient({ periods, programs, isAdmin }: { periods: Period[], programs: Program[], isAdmin: boolean }) {
  const router = useRouter()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPeriod, setEditingPeriod] = useState<Period | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wizardTargetPeriod, setWizardTargetPeriod] = useState<Period | null>(null)

  // Separate active and archived periods
  const activePeriod = periods.find(p => p.is_active)
  const archivedPeriods = periods.filter(p => !p.is_active)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    const month = parseInt(formData.get('month') as string, 10)
    const year = parseInt(formData.get('year') as string, 10)
    const workingDays = parseInt(formData.get('working_days') as string, 10)

    try {
      let res
      if (editingPeriod) {
        res = await updatePeriod(editingPeriod.id, { month, year, working_days: workingDays })
      } else {
        res = await createPeriod({ month, year, working_days: workingDays })
      }
      
      if ('error' in res && res.error) {
        setError(res.error)
        toast.error(res.error)
      } else {
        toast.success(editingPeriod ? 'Periode berhasil diperbarui' : 'Periode baru berhasil ditambahkan')
        setIsModalOpen(false)
        setEditingPeriod(null)
      }
    } catch {
      toast.error('Terjadi kesalahan sistem')
    } finally {
      setIsLoading(false)
    }
  }

  function handleSetActive(period: Period) {
    if (!isAdmin) return
    setWizardTargetPeriod(period)
  }

  async function handleDelete(id: string) {
    if (!isAdmin) return
    const confirmMsg = "PERINGATAN: Menghapus periode akan menghapus PERMANEN seluruh data pencapaian harian di dalamnya. Anda yakin?"
    if (!confirm(confirmMsg)) return

    setIsLoading(true)
    try {
      const res = await deletePeriod(id)
      if ('error' in res && res.error) {
        toast.error(res.error)
      } else {
        toast.success('Periode berhasil dihapus')
      }
    } catch {
      toast.error('Gagal menghapus periode')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleToggleLock(period: Period) {
    if (!isAdmin) return
    const isLocked = (period as unknown as { is_locked: boolean | null }).is_locked
    const msg = isLocked 
      ? "Membuka kunci periode akan mengizinkan kembali pengeditan data harian. Lanjutkan?" 
      : "Mengunci periode akan mencegah siapapun mengedit atau menambah data harian di periode ini. Lanjutkan?"
    
    if (!confirm(msg)) return

    setIsLoading(true)
    try {
      const res = await togglePeriodLock(period.id, isLocked || false)
      if ('error' in res && res.error) {
        toast.error(res.error)
      } else {
        toast.success(isLocked ? 'Akses edit dibuka' : 'Periode berhasil dikunci')
      }
    } catch {
      toast.error('Gagal mengubah status kunci')
    } finally {
      setIsLoading(false)
    }
  }

  const renderPeriodRow = (period: Period, isActive: boolean) => (
    <tr key={period.id} className={`${isActive ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'} transition-colors`}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-900">{formatMonth(period.month)} {period.year}</span>
          {(period as unknown as { is_locked: boolean | null }).is_locked && (
            <span title="Terkunci - Data tidak bisa diubah">
              <Lock className="h-3.5 w-3.5 text-amber-500" />
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-center text-slate-600 font-medium">
        {period.working_days} hari
      </td>
      <td className="px-6 py-4 text-center">
        {isActive ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            AKTIF
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
            ARSIP
          </span>
        )}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex justify-end gap-2">
          {/* Lihat Laporan button (always visible) */}
          <a
            href={`/dashboard?periodId=${period.id}`}
            title="Lihat laporan periode ini"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg border border-slate-200 hover:border-indigo-200 transition-all"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            Laporan
          </a>

          {isAdmin && (
            <>
            {!isActive && (
              <button
                onClick={() => handleSetActive(period)}
                disabled={isLoading}
                title="Jadikan periode aktif global"
                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md border border-indigo-200 transition-all hover:shadow-sm"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
            <button
               onClick={() => handleToggleLock(period)}
               disabled={isLoading}
               title={(period as unknown as { is_locked: boolean | null }).is_locked ? "Buka Kunci" : "Kunci Periode"}
               className={`p-1.5 rounded-md border transition-all ${
                 (period as unknown as { is_locked: boolean | null }).is_locked 
                  ? 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100'
                  : 'text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600'
               }`}
            >
              {(period as unknown as { is_locked: boolean | null }).is_locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </button>
            <button
              onClick={() => {
                setEditingPeriod(period)
                setIsModalOpen(true)
              }}
              disabled={isLoading}
              title="Edit Hari Kerja"
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-md border border-slate-200"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleDelete(period.id)}
              disabled={isLoading}
              title="Hapus Permanen"
              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md border border-rose-200"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            </>
          )}
          </div>
        </td>
    </tr>
  )

  return (
    <div className="space-y-8">
      {/* Header section with Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Kendali Periode</h3>
            <p className="text-sm text-slate-500">Kelola timeline pencapaian dan status kuncian data.</p>
          </div>
        </div>
        
        {isAdmin && (
          <button
            onClick={() => {
              setEditingPeriod(null)
              setIsModalOpen(true)
            }}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-indigo-200 transition-all hover:-translate-y-0.5"
          >
            + Tambah Periode
          </button>
        )}
      </div>

      {/* Sections: Active vs Archives */}
      <div className="space-y-6">
        {/* ACTIVE SECTION */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Periode Aktif Saat Ini</h4>
          </div>
          
          <div className="overflow-hidden rounded-xl border border-indigo-200 shadow-sm bg-white">
            <table className="w-full text-sm text-left">
              <thead className="bg-indigo-50/50 text-indigo-900 font-bold border-b border-indigo-100">
                <tr>
                  <th className="px-6 py-4">Bulan / Tahun</th>
                  <th className="px-6 py-4 text-center">Hari Kerja</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  {isAdmin && <th className="px-6 py-4 text-right">Kelola</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-indigo-50">
                {activePeriod ? (
                  renderPeriodRow(activePeriod, true)
                ) : (
                  <tr>
                    <td colSpan={isAdmin ? 4 : 3} className="px-6 py-8 text-center bg-amber-50/30">
                      <div className="flex flex-col items-center gap-2 text-amber-700">
                        <AlertTriangle className="h-6 w-6" />
                        <span className="font-medium">Peringatan: Tidak ada periode yang sedang aktif secara global.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ARCHIVE SECTION */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <History className="h-4 w-4 text-slate-400" />
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Arsip & Riwayat Periode</h4>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Bulan / Tahun</th>
                  <th className="px-6 py-4 text-center">Hari Kerja</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  {isAdmin && <th className="px-6 py-4 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {archivedPeriods.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 4 : 3} className="px-6 py-8 text-center text-slate-400 italic">
                      Riwayat periode kosong.
                    </td>
                  </tr>
                ) : (
                  archivedPeriods.map((period) => renderPeriodRow(period, false))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Tailwind Modal for Add/Edit Period */}
      {isModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-8">
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900">
                {editingPeriod ? 'Edit Konfigurasi Periode' : 'Tambah Periode Baru'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                disabled={isLoading}
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              {error && (
                <div className="flex gap-3 p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl animate-in shake">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p className="font-medium">{error}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bulan</label>
                  <select 
                    name="month" 
                    required 
                    defaultValue={editingPeriod ? editingPeriod.month : (new Date().getMonth() + 1)}
                    className="w-full text-sm font-medium rounded-xl border border-slate-200 px-4 py-3 bg-white outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                  >
                    {[...Array(12)].map((_, i) => (
                      <option key={i+1} value={i+1}>{formatMonth(i+1)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tahun</label>
                  <input 
                    name="year" 
                    type="number" 
                    required 
                    defaultValue={editingPeriod ? editingPeriod.year : new Date().getFullYear()}
                    className="w-full text-sm font-medium rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Jumlah Hari Kerja</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-3 h-5 w-5 text-slate-400" />
                  <input 
                    name="working_days" 
                    type="number" 
                    required 
                    min="1"
                    max="31"
                    defaultValue={editingPeriod ? editingPeriod.working_days : "20"}
                    className="w-full text-sm font-medium rounded-xl border border-slate-200 pl-12 pr-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                  />
                </div>
                <p className="text-[11px] text-slate-400 px-1">Total hari kerja dalam sebulan (setelah dikurangi libur/weekend).</p>
              </div>

              {editingPeriod && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3 text-amber-800">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p className="text-xs leading-relaxed">
                    Mengubah data periode yang sudah berjalan akan mempengaruhi kalkulasi target harian pada dashboard.
                  </p>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isLoading}
                  className="px-6 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
                >
                  {isLoading ? 'Memproses...' : (editingPeriod ? 'Perbarui Data' : 'Simpan Periode')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Period Transition Wizard */}
      {wizardTargetPeriod && (
        <PeriodTransitionWizard
          fromPeriod={activePeriod || null}
          toPeriod={wizardTargetPeriod}
          programs={programs}
          onClose={() => setWizardTargetPeriod(null)}
          onSuccess={() => {
            setWizardTargetPeriod(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
