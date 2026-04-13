'use client'

import { useState } from 'react'
import { createProgram, 
  updateProgram, 
  toggleProgramStatus, 
  deleteProgram,
  addMilestone,
  deleteMilestone
} from './actions'
import { Database } from '@/types/database'
import { formatRupiah, cn } from '@/lib/utils'
import { toast } from 'sonner'
import { 
  Users, 
  Target, 
  CheckSquare, 
  Plus, 
  Trash2, 
  Settings2,
  ChevronRight,
  UserCheck
} from 'lucide-react'

type ProgramMilestone = Database['public']['Tables']['program_milestones']['Row']
type Program = Database['public']['Tables']['programs']['Row'] & {
  program_pics: { profile_id: string }[]
  program_milestones: ProgramMilestone[]
}
type TargetType = Database['public']['Enums']['target_type']
type Period = Database['public']['Tables']['periods']['Row']

export function ProgramClient({ 
  programs, 
  isAdmin, 
  activePeriod,
  picProfiles
}: { 
  programs: Program[], 
  isAdmin: boolean, 
  activePeriod: Period | null,
  picProfiles?: { id: string, name: string, whatsapp_number: string | null }[]
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTargetType, setSelectedTargetType] = useState<TargetType>('quantitative')
  
  // Teams Support
  const [selectedPicIds, setSelectedPicIds] = useState<string[]>([])

  // Milestone Support
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false)
  const [activeMProgram, setActiveMProgram] = useState<Program | null>(null)

  // Auto-calc states
  const [monthlyRp, setMonthlyRp] = useState<string>('')
  const [monthlyUser, setMonthlyUser] = useState<string>('')

  const workDays = activePeriod?.working_days || 20

  const handleOpenCreate = () => {
    setEditingProgramId(null)
    setSelectedTargetType('quantitative')
    setMonthlyRp('')
    setMonthlyUser('')
    setSelectedPicIds([])
    setIsModalOpen(true)
  }

  const handleOpenEdit = (program: Program) => {
    setEditingProgramId(program.id)
    setSelectedTargetType(program.target_type || 'quantitative')
    setMonthlyRp(program.monthly_target_rp ? program.monthly_target_rp.toString() : '')
    setMonthlyUser(program.monthly_target_user ? program.monthly_target_user.toString() : '')
    
    // Set team members
    setSelectedPicIds(program.program_pics.map(p => p.profile_id))

    setIsModalOpen(true)
  }

  const handleOpenMilestones = (program: Program) => {
    setActiveMProgram(program)
    setIsMilestoneModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus program ini secara permanen?')) return
    setIsLoading(true)
    try {
      const res = await deleteProgram(id)
      if ('error' in res && res.error) {
        toast.error(res.error)
      } else {
        toast.success('Program berhasil dihapus!')
      }
    } catch {
      toast.error('Terjadi kesalahan saat menghapus program')
    } finally {
      setIsLoading(false)
    }
  }

  const togglePicSelection = (picId: string) => {
    setSelectedPicIds(prev => 
      prev.includes(picId) 
        ? prev.filter(id => id !== picId)
        : [...prev, picId]
    )
  }

  async function handleSubmitProgram(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    
    if (selectedPicIds.length === 0) {
      setError('Pilih minimal satu PIC untuk tim program ini.')
      setIsLoading(false)
      return
    }

    const formData = new FormData(e.currentTarget)

    const payload: any = {
      name: formData.get('name') as string,
      pic_ids: selectedPicIds,
      target_type: selectedTargetType,
      monthly_target_rp: (selectedTargetType === 'quantitative' || selectedTargetType === 'hybrid') ? Number(formData.get('monthly_target_rp')) : null,
      monthly_target_user: (selectedTargetType === 'quantitative' || selectedTargetType === 'hybrid') ? Number(formData.get('monthly_target_user')) : null,
      daily_target_rp: (selectedTargetType === 'quantitative' || selectedTargetType === 'hybrid') ? Number(formData.get('daily_target_rp')) : null,
      daily_target_user: (selectedTargetType === 'quantitative' || selectedTargetType === 'hybrid') ? Number(formData.get('daily_target_user')) : null,
      qualitative_description: (selectedTargetType === 'qualitative' || selectedTargetType === 'hybrid') ? formData.get('qualitative_description') as string : null,
    }

    let res
    if (editingProgramId) {
      res = await updateProgram(editingProgramId, payload)
    } else {
      res = await createProgram(payload)
    }
    
    if ('error' in res && res.error) {
      setError(res.error)
      toast.error(res.error)
      setIsLoading(false)
    } else {
      toast.success(editingProgramId ? 'Program berhasil diperbarui!' : 'Program baru berhasil ditambahkan!')
      setIsModalOpen(false)
      setIsLoading(false)
      setEditingProgramId(null)
    }
  }

  async function handleToggleStatus(id: string, currentStatus: boolean) {
    if (!isAdmin) return
    setIsLoading(true)
    const res = await toggleProgramStatus(id, currentStatus)
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success(currentStatus ? 'Program dinonaktifkan' : 'Program diaktifkan')
    }
    setIsLoading(false)
  }

  // Milestone Actions
  async function handleAddMilestone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!activeMProgram) return
    
    const formData = new FormData(e.currentTarget)
    const title = formData.get('title') as string
    
    setIsLoading(true)
    const res = await addMilestone({
      program_id: activeMProgram.id,
      title,
      order: activeMProgram.program_milestones.length
    })
    
    if ('success' in res) {
      toast.success('Tugas berhasil ditambahkan')
      e.currentTarget.reset()
    } else {
      toast.error(res.error)
    }
    setIsLoading(false)
  }

  async function handleDeleteMilestone(id: string) {
    if (!confirm('Hapus tugas ini?')) return
    setIsLoading(true)
    const res = await deleteMilestone(id)
    if ('success' in res) toast.success('Tugas dihapus')
    else toast.error(res.error)
    setIsLoading(false)
  }

  const renderTargetInfo = (program: Program) => {
    const isQuant = program.target_type === 'quantitative' || program.target_type === 'hybrid'
    const isQual = program.target_type === 'qualitative' || program.target_type === 'hybrid'

    return (
      <div className="space-y-1 text-xs">
        {isQuant && (
          <div className="bg-blue-50/50 p-2 rounded border border-blue-100 flex flex-col gap-1">
            <div className="font-semibold text-blue-800 flex items-center gap-1">
              <Target className="h-3 w-3" /> Target Kuantitatif
            </div>
            <div className="flex justify-between"><span>Rp:</span> <span className="font-medium text-slate-800">{formatRupiah(Number(program.monthly_target_rp || 0))}</span></div>
            <div className="flex justify-between"><span>User:</span> <span className="font-medium text-slate-800">{program.monthly_target_user || 0}</span></div>
          </div>
        )}
        {isQual && (
          <div className="bg-purple-50/50 p-2 rounded border border-purple-100 mt-1">
             <div className="font-semibold text-purple-800 flex items-center gap-1 mb-0.5">
               <CheckSquare className="h-3 w-3" /> Misi Kualitatif
             </div>
             <div className="text-[10px] text-slate-500 mb-1 italic">
               {program.program_milestones.length} Tugas terdaftar
             </div>
             <div className="truncate max-w-[200px]" title={program.qualitative_description || '-'}>
              {program.qualitative_description || '-'}
             </div>
          </div>
        )}
      </div>
    )
  }

  const getTypeLabel = (type: string | null) => {
    if (type === 'quantitative') return 'Kuantitatif'
    if (type === 'qualitative') return 'Kualitatif'
    if (type === 'hybrid') return 'Hybrid'
    return 'Unknown'
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-slate-800">Daftar Program & Tim</h3>
        {isAdmin && (
          <button
            onClick={handleOpenCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Tambah Program
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Program</th>
              <th className="px-6 py-4">Tim PIC</th>
              <th className="px-6 py-4">Tipe</th>
              <th className="px-6 py-4">Detail Target</th>
              <th className="px-6 py-4 text-center">Status</th>
              {isAdmin && <th className="px-6 py-4 text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {programs.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-6 py-12 text-center text-slate-400 font-medium">
                  Belum ada data program yang terdaftar.
                </td>
              </tr>
            ) : (
              programs.map((prog) => (
                <tr key={prog.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{prog.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-tighter">ID: {prog.id.split('-')[0]}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex -space-x-2 overflow-hidden hover:space-x-1 transition-all">
                      {prog.program_pics.map((p, i) => {
                        const profile = picProfiles?.find(prof => prof.id === p.profile_id)
                        return (
                          <div 
                            key={p.profile_id}
                            title={profile?.name || 'Unknown'}
                            className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700 border border-indigo-200 shadow-sm"
                          >
                            {profile?.name?.substring(0, 2).toUpperCase() || '??'}
                          </div>
                        )
                      })}
                      {prog.program_pics.length === 0 && <span className="text-rose-500 text-xs italic">Tanpa PIC</span>}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 font-medium">
                      {prog.program_pics.length} Anggota Tim
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      prog.target_type === 'hybrid' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                      prog.target_type === 'quantitative' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-amber-100 text-amber-700 border border-amber-200'
                    }`}>
                      {getTypeLabel(prog.target_type)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {renderTargetInfo(prog)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {prog.is_active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        AKTIFF
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        OFF
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenMilestones(prog)}
                          className="p-2 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg border border-transparent hover:border-slate-200 shadow-none hover:shadow-sm transition-all"
                          title="Kelola Tugas/Milestones"
                        >
                          <Settings2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(prog)}
                          className="p-2 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg border border-transparent hover:border-slate-200 shadow-none hover:shadow-sm transition-all"
                          title="Edit Program"
                        >
                          <Plus className="h-4 w-4 rotate-45" />
                        </button>
                        <button
                          onClick={() => handleDelete(prog.id)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Hapus"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for Add/Edit Program */}
      {isModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 animate-in zoom-in duration-200">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                  <Plus className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg leading-tight">{editingProgramId ? 'Edit Konfigurasi Program' : 'Buat Program Baru'}</h3>
                  <p className="text-xs text-slate-500 font-medium">Tentukan target dan tim penanggung jawab.</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-white rounded-full transition-all">✕</button>
            </div>
            
            <form onSubmit={handleSubmitProgram} className="p-8 space-y-6">
              {error && (
                <div className="p-4 text-sm font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-rose-600 animate-pulse" /> {error}
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nama Program</label>
                    <input 
                      name="name" type="text" required 
                      defaultValue={editingProgramId ? programs.find(p=>p.id===editingProgramId)?.name : ''}
                      placeholder="Contoh: Certification Voyager 2026"
                      className="w-full text-sm font-medium rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tipe Target</label>
                    </div>
                    <div className="flex gap-2">
                      {(['quantitative', 'qualitative', 'hybrid'] as const).map(type => (
                        <label key={type} className={`flex-1 group relative cursor-pointer border-2 rounded-xl p-3 text-center transition-all ${
                          selectedTargetType === type 
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' 
                            : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-200 hover:bg-slate-50'
                        }`}>
                          <input type="radio" name="type_selector" className="hidden" checked={selectedTargetType === type} onChange={() => setSelectedTargetType(type)} />
                          <span className="block text-xs font-bold uppercase tracking-tight">{getTypeLabel(type)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <Users className="h-4 w-4 text-indigo-600" /> Tim PIC ({selectedPicIds.length})
                    </label>
                    <div className="max-h-48 overflow-y-auto pr-2 grid grid-cols-1 gap-2 p-1">
                      {picProfiles?.map(profile => (
                        <label 
                          key={profile.id} 
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group",
                            selectedPicIds.includes(profile.id) 
                              ? "bg-indigo-50 border-indigo-200 shadow-sm" 
                              : "bg-white border-slate-100 hover:border-slate-300"
                          )}
                        >
                          <div 
                            className={cn(
                              "h-5 w-5 rounded border-2 flex items-center justify-center transition-all",
                              selectedPicIds.includes(profile.id) ? "bg-indigo-600 border-indigo-600" : "bg-white border-slate-200 group-hover:border-indigo-400"
                            )}
                            onClick={() => togglePicSelection(profile.id)}
                          >
                            {selectedPicIds.includes(profile.id) && <Plus className="h-3 w-3 text-white" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-900 leading-none">{profile.name}</p>
                            <p className="text-[10px] text-slate-500 mt-1 font-medium">{profile.whatsapp_number || 'Tanpa WA'}</p>
                          </div>
                          {selectedPicIds.includes(profile.id) && <UserCheck className="h-4 w-4 text-indigo-600" />}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50/80 rounded-2xl p-6 border border-slate-100 space-y-6 self-start">
                  {(selectedTargetType === 'quantitative' || selectedTargetType === 'hybrid') && (
                    <div className="space-y-5">
                      <h4 className="text-xs font-extrabold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                         <Target className="h-4 w-4" /> Kuantitatif Detail
                      </h4>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Target Bulanan (RP)</label>
                          <input 
                            name="monthly_target_rp" type="number" min="0" value={monthlyRp} onChange={(e) => setMonthlyRp(e.target.value)}
                            className="w-full text-sm font-bold rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Target Bulanan (USER)</label>
                          <input 
                            name="monthly_target_user" type="number" min="0" value={monthlyUser} onChange={(e) => setMonthlyUser(e.target.value)}
                            className="w-full text-sm font-bold rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {(selectedTargetType === 'qualitative' || selectedTargetType === 'hybrid') && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-extrabold text-purple-600 uppercase tracking-widest flex items-center gap-2 pt-2">
                         <CheckSquare className="h-4 w-4" /> Kualitatif Detail
                      </h4>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Deskripsi Perjalanan</label>
                        <textarea 
                          name="qualitative_description" rows={4}
                          defaultValue={editingProgramId ? programs.find(p=>p.id===editingProgramId)?.qualitative_description || '' : ''}
                          placeholder="Jelaskan goal besar bulan ini..."
                          className="w-full text-sm font-medium rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 bg-white resize-none"
                        ></textarea>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed bg-white/50 p-3 rounded-lg border border-slate-100">
                        Sistem tugas akan dibuat secara terpisah melalui tombol <strong>Kelola Tugas</strong> di baris program setelah Anda menyimpan konfigurasi ini.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 flex justify-end gap-3 mt-6 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Batal</button>
                <button
                  type="submit" disabled={isLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl text-sm font-bold shadow-xl shadow-indigo-100 transition-all disabled:opacity-50"
                >
                  {isLoading ? 'Processing...' : (editingProgramId ? 'Perbarui Program' : 'Buat Program')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for Milestone Management */}
      {isMilestoneModalOpen && activeMProgram && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-slate-900 leading-tight">Misi & Tugas Unik</h3>
                <p className="text-xs text-indigo-600 font-bold mt-0.5">{activeMProgram.name}</p>
              </div>
              <button onClick={() => setIsMilestoneModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-white rounded-full transition-all">✕</button>
            </div>

            <div className="p-8 space-y-8">
              {/* Form Tambah Milestone */}
              {isAdmin && (
                <form onSubmit={handleAddMilestone} className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Tambah Misi Baru</label>
                  <div className="flex gap-2">
                    <input 
                      name="title" required placeholder="Contoh: MoU dengan Yayasan Sejahtera"
                      className="flex-1 text-sm font-medium rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-500 outline-none"
                    />
                    <button 
                      type="submit" disabled={isLoading}
                      className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </form>
              )}

              {/* List Milestones */}
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 border-b border-slate-100 pb-2 block w-full">Daftar Misi Terdaftar ({activeMProgram.program_milestones.length})</label>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                  {activeMProgram.program_milestones.length === 0 ? (
                    <div className="text-center py-10 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                      <CheckSquare className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-sm text-slate-400 font-medium">Belum ada tugas spesifik.</p>
                    </div>
                  ) : (
                    activeMProgram.program_milestones.sort((a,b)=>a.order - b.order).map((ms, idx) => (
                      <div key={ms.id} className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 hover:shadow-sm transition-all group">
                        <div className="h-6 w-6 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                          {idx + 1}
                        </div>
                        <span className="flex-1 text-sm font-bold text-slate-800">{ms.title}</span>
                        {isAdmin && (
                          <button 
                            onClick={() => handleDeleteMilestone(ms.id)}
                            className="p-2 text-slate-300 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        <ChevronRight className="h-4 w-4 text-slate-200" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-between items-center">
              <span className="text-[10px] text-slate-400 font-bold italic">Tentukan target spesifik untuk tahun 2026</span>
              <button 
                onClick={() => setIsMilestoneModalOpen(false)}
                className="px-5 py-2.5 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-all border border-indigo-100"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
