'use client'

import { useState } from 'react'
import { submitDailyInput, updateDailyInput, deleteDailyInput } from './actions'
import { Database } from '@/types/database'
import { formatRupiah } from '@/lib/utils'
import { toast } from 'sonner'
import { Lock, AlertCircle } from 'lucide-react'

type Program = Database['public']['Tables']['programs']['Row']
type DailyInput = Database['public']['Tables']['daily_inputs']['Row'] & {
  programs: { name: string; target_type: 'quantitative' | 'qualitative' | 'hybrid' } | null
  profiles?: { name: string } | null
}
type Period = Database['public']['Tables']['periods']['Row']

export function InputFormClient({ 
  programs, 
  pastInputs, 
  isAdmin,
  activePeriod 
}: { 
  programs: Program[], 
  pastInputs: DailyInput[], 
  isAdmin?: boolean,
  activePeriod?: Period
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedProgramId, setSelectedProgramId] = useState<string>(programs[0]?.id || '')

  const isLocked = (activePeriod as unknown as { is_locked: boolean | null })?.is_locked

  // Get active program details for dynamic rendering
  const activeProgram = programs.find(p => p.id === selectedProgramId)

  // Handlers
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
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    
    const payload: Partial<DailyInput> = {
      date: formData.get('date') as string,
      notes: formData.get('notes') as string,
    }

    if (!editingId) {
      payload.program_id = selectedProgramId
    }

    if (activeProgram?.target_type === 'quantitative' || activeProgram?.target_type === 'hybrid') {
      const rp = formData.get('achievement_rp')
      const user = formData.get('achievement_user')
      if (rp) payload.achievement_rp = Number(rp)
      if (user) payload.achievement_user = Number(user)
    }

    if (activeProgram?.target_type === 'qualitative' || activeProgram?.target_type === 'hybrid') {
      const status = formData.get('qualitative_status')
      if (status) payload.qualitative_status = status as 'not_started' | 'in_progress' | 'completed'
    }

    try {
      let res;
      if (editingId) {
        res = await updateDailyInput(editingId, payload as { date: string; achievement_rp?: number | null; achievement_user?: number | null; qualitative_status?: 'not_started' | 'in_progress' | 'completed' | null; notes?: string | null })
      } else {
        res = await submitDailyInput(payload as { program_id: string; date: string; achievement_rp?: number | null; achievement_user?: number | null; qualitative_status?: 'not_started' | 'in_progress' | 'completed' | null; notes?: string | null })
      }
      
      if ('error' in res && res.error) {
        setError(res.error)
        toast.error(res.error)
      } else {
        toast.success(editingId ? 'Data berhasil diperbarui!' : 'Pencapaian harian berhasil dicatat!')
        setIsModalOpen(false)
      }
    } catch {
      toast.error('Terjadi kesalahan saat menyimpan data.')
    } finally {
      setIsLoading(false)
    }
  }

  const formatDateLabel = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    })
  }

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'completed': return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-medium text-xs">Selesai</span>
      case 'in_progress': return <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-medium text-xs">Proses</span>
      case 'not_started': return <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-medium text-xs">Belum Mulai</span>
      default: return '-'
    }
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h3 className="text-lg font-semibold text-slate-800">Riwayat Input Anda (Bulan Ini)</h3>
        
        {isLocked ? (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm font-medium">
            <Lock className="h-4 w-4" />
            Periode Terkunci (Read-Only)
          </div>
        ) : (
          <button
            onClick={handleOpenCreate}
            disabled={programs.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
          >
            + Catat Pencapaian Hari Ini
          </button>
        )}
      </div>

      {isLocked && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 shadow-sm">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
          <p className="text-xs leading-relaxed font-medium">
            Admin telah **mengunci periode ini**. Anda tetap dapat melihat arsip data, namun tidak dapat menambah, mengedit, atau menghapus catatan pencapaian hingga kunci dibuka kembali oleh Admin.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Tanggal</th>
              {isAdmin && <th className="px-6 py-4">Pengisi (PIC)</th>}
              <th className="px-6 py-4">Program</th>
              <th className="px-6 py-4 text-center">Rupiah & User (% Harian)</th>
              <th className="px-6 py-4 text-center">Milestone (Kualitatif)</th>
              {!isLocked && <th className="px-6 py-4 text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pastInputs.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? (isLocked ? 5 : 6) : (isLocked ? 4 : 5)} className="px-6 py-8 text-center text-slate-400">
                  Belum ada catatan pencapaian di periode ini.
                </td>
              </tr>
            ) : (
              pastInputs.map((input) => {
                const prog = programs.find(p => p.id === input.program_id)
                const percentageHarian = (prog?.daily_target_rp && input.achievement_rp) 
                  ? ((input.achievement_rp / prog.daily_target_rp) * 100).toFixed(1) 
                  : null

                return (
                <tr key={input.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                    {formatDateLabel(input.date)}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-slate-700 font-medium">
                      {input.profiles?.name || 'Tidak Diketahui'}
                    </td>
                  )}
                  <td className="px-6 py-4 font-medium max-w-[200px] align-top" title={input.programs?.name}>
                    <div className="text-slate-700 truncate">{input.programs?.name || 'Program Terhapus'}</div>
                    {input.notes && (
                      <div className="mt-1.5 text-[10px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100 whitespace-normal leading-tight">
                        <span className="font-semibold not-italic">Catatan:</span> {input.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center text-slate-700 font-medium">
                    {(input.programs?.target_type === 'quantitative' || input.programs?.target_type === 'hybrid') ? (
                      <div className="flex flex-col text-xs items-center gap-1">
                        <span className="font-bold">{formatRupiah(Number(input.achievement_rp || 0))}</span>
                        <div className="flex gap-2 text-[10px]">
                          <span className="text-slate-500 font-normal">{input.achievement_user || 0} user</span>
                          {percentageHarian && (
                            <span className={`px-1.5 rounded-sm font-bold ${Number(percentageHarian) >= 100 ? 'bg-emerald-100 text-emerald-700' : Number(percentageHarian) >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                              {percentageHarian}%
                            </span>
                          )}
                        </div>
                      </div>
                    ) : ( <span className="text-slate-400">-</span> )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {(input.programs?.target_type === 'qualitative' || input.programs?.target_type === 'hybrid') ? (
                       getStatusBadge(input.qualitative_status)
                    ) : ( <span className="text-slate-400">-</span> )}
                  </td>
                  {!isLocked && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(input)}
                          disabled={isLoading}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-bold px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(input.id)}
                          disabled={isLoading}
                          className="text-red-600 hover:text-red-800 text-xs font-bold px-2.5 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
                        >
                          Hapus
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-10 mb-10 shrink-0 transform transition-all overflow-hidden border border-slate-100">
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 sticky top-0 z-10">
              <h3 className="text-lg font-bold text-slate-900">
                {editingId ? 'Edit Catatan Harian' : 'Catat Pencapaian Harian'}
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
                <div className="p-4 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl animate-in shake">
                  {error}
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tanggal Pencapaian</label>
                <input 
                  name="date" 
                  type="date" 
                  required 
                  defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.date : new Date().toISOString().split('T')[0]}
                  className="w-full text-sm font-medium rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Program Pekerjaan</label>
                {!editingId ? (
                  <select 
                    value={selectedProgramId}
                    onChange={(e) => setSelectedProgramId(e.target.value)}
                    className="w-full text-sm font-medium rounded-xl border border-slate-200 px-4 py-3 bg-white outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                  >
                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                ) : (
                  <div className="px-4 py-3 bg-slate-100 rounded-xl text-sm border border-slate-200 text-slate-700 font-bold">
                    {pastInputs.find(i => i.id === editingId)?.programs?.name}
                  </div>
                )}
              </div>

              {(activeProgram?.target_type === 'quantitative' || activeProgram?.target_type === 'hybrid') && (
                <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100 space-y-5 shadow-inner">
                  <div className="flex justify-between items-center bg-white px-4 py-3 rounded-xl border border-indigo-100 shadow-sm">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">🎯 Target:</span>
                    <span className="text-xs font-bold text-indigo-700">
                      Rp {Number(activeProgram.daily_target_rp || 0).toLocaleString('id-ID')} | {activeProgram.daily_target_user || 0} User
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2 flex flex-col">
                      <label className="text-xs font-bold text-slate-600">Rp Terkumpul</label>
                      <input 
                        name="achievement_rp" 
                        type="number" 
                        min="0"
                        placeholder="0"
                        defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.achievement_rp?.toString() : ""}
                        className="w-full text-sm font-bold rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                      />
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <label className="text-xs font-bold text-slate-600">User Baru</label>
                      <input 
                        name="achievement_user" 
                        type="number" 
                        min="0"
                        placeholder="0"
                        defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.achievement_user?.toString() : ""}
                        className="w-full text-sm font-bold rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                      />
                    </div>
                  </div>
                </div>
              )}

              {(activeProgram?.target_type === 'qualitative' || activeProgram?.target_type === 'hybrid') && (
                <div className="bg-purple-50/50 p-5 rounded-2xl border border-purple-100 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-purple-800 uppercase tracking-widest">Status Milestone</label>
                    <select 
                      name="qualitative_status" 
                      defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.qualitative_status || 'not_started' : 'not_started'}
                      className="w-full text-sm font-bold rounded-xl border border-purple-200 px-4 py-3 bg-white outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-50"
                    >
                      <option value="not_started">Belum Mulai (Not Started)</option>
                      <option value="in_progress">Terus Berjalan (In Progress)</option>
                      <option value="completed">Selesai (Completed)</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Catatan Tambahan</label>
                <textarea 
                  name="notes" 
                  rows={2}
                  defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.notes || '' : ''}
                  placeholder="Ketik keterangan jika ada..."
                  className="w-full text-sm font-medium rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 resize-none"
                ></textarea>
              </div>

              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
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
                  {isLoading ? 'Memproses...' : (editingId ? 'Simpan Perubahan' : 'Catat Sekarang')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
