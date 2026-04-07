'use client'

import { useState } from 'react'
import { submitDailyInput, updateDailyInput, deleteDailyInput } from './actions'
import { Database } from '@/types/database'
import { formatRupiah } from '@/lib/utils'

type Program = Database['public']['Tables']['programs']['Row']
type DailyInput = Database['public']['Tables']['daily_inputs']['Row'] & {
  programs: { name: string; target_type: 'quantitative' | 'qualitative' | 'hybrid' } | null
}

export function InputFormClient({ programs, pastInputs }: { programs: Program[], pastInputs: DailyInput[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedProgramId, setSelectedProgramId] = useState<string>(programs[0]?.id || '')

  // Get active program details for dynamic rendering
  const activeProgram = programs.find(p => p.id === selectedProgramId)

  // Handlers
  const handleOpenCreate = () => {
    setEditingId(null)
    setSelectedProgramId(programs[0]?.id || '')
    setIsModalOpen(true)
  }

  const handleOpenEdit = (input: DailyInput) => {
    setEditingId(input.id)
    setSelectedProgramId(input.program_id)
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return
    setIsLoading(true)
    const res = await deleteDailyInput(id)
    if ('error' in res && res.error) alert(res.error)
    setIsLoading(false)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    
    const payload: any = {
      date: formData.get('date'),
      notes: formData.get('notes'),
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
      if (status) payload.qualitative_status = status
    }

    let res;
    if (editingId) {
      res = await updateDailyInput(editingId, payload)
    } else {
      res = await submitDailyInput(payload)
    }
    
    if ('error' in res && res.error) {
      setError(res.error)
      setIsLoading(false)
    } else {
      setIsModalOpen(false)
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
        <button
          onClick={handleOpenCreate}
          disabled={programs.length === 0}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
        >
          + Catat Pencapaian Hari Ini
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Tanggal</th>
              <th className="px-6 py-4">Program</th>
              <th className="px-6 py-4 text-center">Rp / User (Kuantitatif)</th>
              <th className="px-6 py-4 text-center">Milestone (Kualitatif)</th>
              <th className="px-6 py-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {pastInputs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  Belum ada catatan pencapaian di periode ini.
                </td>
              </tr>
            ) : (
              pastInputs.map((input) => (
                <tr key={input.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                    {formatDateLabel(input.date)}
                  </td>
                  <td className="px-6 py-4 text-slate-700 font-medium max-w-[200px] truncate" title={input.programs?.name}>
                    {input.programs?.name || 'Program Terhapus'}
                  </td>
                  <td className="px-6 py-4 text-center text-slate-700">
                    {(input.programs?.target_type === 'quantitative' || input.programs?.target_type === 'hybrid') ? (
                      <div className="flex flex-col text-xs">
                        <span>{formatRupiah(Number(input.achievement_rp || 0))}</span>
                        <span className="text-slate-500">{input.achievement_user || 0} user</span>
                      </div>
                    ) : ( <span className="text-slate-400">-</span> )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {(input.programs?.target_type === 'qualitative' || input.programs?.target_type === 'hybrid') ? (
                       getStatusBadge(input.qualitative_status)
                    ) : ( <span className="text-slate-400">-</span> )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                       <button
                         onClick={() => handleOpenEdit(input)}
                         disabled={isLoading}
                         className="text-indigo-600 hover:text-indigo-800 text-xs font-medium px-2 py-1 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors"
                       >
                         Edit
                       </button>
                       <button
                         onClick={() => handleDelete(input.id)}
                         disabled={isLoading}
                         className="text-red-600 hover:text-red-800 text-xs font-medium px-2 py-1 bg-red-50 hover:bg-red-100 rounded transition-colors"
                       >
                         Hapus
                       </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Input Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mt-10 mb-10 shrink-0 transform transition-all">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 rounded-t-xl z-10">
              <h3 className="font-semibold text-slate-900">
                {editingId ? 'Edit Catatan Harian' : 'Catat Pencapaian Harian'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                  {error}
                </div>
              )}
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Tanggal Pencapaian</label>
                <input 
                  name="date" 
                  type="date" 
                  required 
                  defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.date : new Date().toISOString().split('T')[0]}
                  className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Program Pekerjaan</label>
                {!editingId ? (
                  <select 
                    value={selectedProgramId}
                    onChange={(e) => setSelectedProgramId(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                ) : (
                  <div className="px-3 py-2 bg-slate-100 rounded-lg text-sm border border-slate-200 text-slate-700 font-medium">
                    {pastInputs.find(i => i.id === editingId)?.programs?.name}
                  </div>
                )}
              </div>

              {(activeProgram?.target_type === 'quantitative' || activeProgram?.target_type === 'hybrid') && (
                <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 space-y-4">
                  <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide">Pencapaian Kuantitatif</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 flex flex-col">
                      <label className="text-xs font-semibold text-slate-700">Pencapaian (Rupiah)</label>
                      <input 
                        name="achievement_rp" 
                        type="number" 
                        min="0"
                        placeholder="Contoh: 1500000"
                        defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.achievement_rp?.toString() : ""}
                        className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5 flex flex-col">
                      <label className="text-xs font-semibold text-slate-700">Pencapaian (User)</label>
                      <input 
                        name="achievement_user" 
                        type="number" 
                        min="0"
                        placeholder="Jumlah user"
                        defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.achievement_user?.toString() : ""}
                        className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {(activeProgram?.target_type === 'qualitative' || activeProgram?.target_type === 'hybrid') && (
                <div className="bg-purple-50/50 p-4 rounded-lg border border-purple-100 space-y-4">
                  <h4 className="text-xs font-bold text-purple-800 uppercase tracking-wide">Pencapaian Kualitatif</h4>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Status Task/Milestone</label>
                    <select 
                      name="qualitative_status" 
                      defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.qualitative_status || 'not_started' : 'not_started'}
                      className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="not_started">Belum Mulai (Not Started)</option>
                      <option value="in_progress">Terus Berjalan (In Progress)</option>
                      <option value="completed">Selesai (Completed)</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Catatan Khusus (Opsional)</label>
                <textarea 
                  name="notes" 
                  rows={2}
                  defaultValue={editingId ? pastInputs.find(i=>i.id===editingId)?.notes || '' : ''}
                  placeholder="Ketik keterangan tambahan jika ada..."
                  className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                ></textarea>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Menyimpan...' : 'Simpan Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
