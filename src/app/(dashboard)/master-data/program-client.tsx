'use client'

import { useState } from 'react'
import { createProgram, toggleProgramStatus } from './actions'
import { Database } from '@/types/database'
import { formatRupiah } from '@/lib/utils'

type Program = Database['public']['Tables']['programs']['Row']
type TargetType = Database['public']['Enums']['target_type']

export function ProgramClient({ 
  programs, 
  isAdmin, 
  activePeriod,
  picProfiles
}: { 
  programs: Program[], 
  isAdmin: boolean, 
  activePeriod?: any,
  picProfiles?: { id: string, name: string, whatsapp_number: string | null }[]
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTargetType, setSelectedTargetType] = useState<TargetType>('quantitative')

  // Auto-calc states
  const [monthlyRp, setMonthlyRp] = useState<string>('')
  const [monthlyUser, setMonthlyUser] = useState<string>('')
  const [isManualDaily, setIsManualDaily] = useState(false)

  // Auto-calculated Daily Targets
  const workDays = activePeriod?.working_days || 20 // Default 20 to avoid Inf if activePeriod missing
  const calcDailyRp = monthlyRp ? Math.floor(Number(monthlyRp) / workDays) : 0
  const calcDailyUser = monthlyUser ? Math.ceil(Number(monthlyUser) / workDays) : 0

  const handleOpenCreate = () => {
    setEditingProgramId(null)
    setSelectedTargetType('quantitative')
    setMonthlyRp('')
    setMonthlyUser('')
    setIsManualDaily(false)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (program: Program) => {
    setEditingProgramId(program.id)
    setSelectedTargetType(program.target_type)
    setMonthlyRp(program.monthly_target_rp ? program.monthly_target_rp.toString() : '')
    setMonthlyUser(program.monthly_target_user ? program.monthly_target_user.toString() : '')
    
    // Check if daily target was manually overridden (if it's not equal to automatic calc approx)
    if (program.daily_target_rp && program.monthly_target_rp) {
      const autoCalc = Math.floor(program.monthly_target_rp / workDays)
      setIsManualDaily(program.daily_target_rp !== autoCalc)
    } else {
      setIsManualDaily(false)
    }

    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    import('./actions').then(async ({ deleteProgram }) => {
      if (!confirm('Apakah Anda yakin ingin menghapus program ini secara permanen?')) return
      setIsLoading(true)
      const res = await deleteProgram(id)
      if ('error' in res && res.error) alert(res.error)
      setIsLoading(false)
    })
  }

  async function handleSubmitProgram(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    
    const submittedPicId = formData.get('pic_id') as string
    const selectedProfile = picProfiles?.find(p => p.id === submittedPicId)

    // Base data
    const payload: Parameters<typeof createProgram>[0] = {
      name: formData.get('name') as string,
      pic_id: selectedProfile ? selectedProfile.id : null,
      pic_name: selectedProfile ? selectedProfile.name : '',
      pic_whatsapp: selectedProfile ? selectedProfile.whatsapp_number : null,
      target_type: selectedTargetType,
    }

    // Quantitative payload (add if quantitative or hybrid)
    if (selectedTargetType === 'quantitative' || selectedTargetType === 'hybrid') {
      const rp = formData.get('monthly_target_rp')
      const user = formData.get('monthly_target_user')
      if (rp) payload.monthly_target_rp = Number(rp)
      if (user) payload.monthly_target_user = Number(user)

      const dRp = formData.get('daily_target_rp')
      const dUser = formData.get('daily_target_user')
      if (dRp) payload.daily_target_rp = Number(dRp)
      if (dUser) payload.daily_target_user = Number(dUser)
    }

    // Qualitative payload (add if qualitative or hybrid)
    if (selectedTargetType === 'qualitative' || selectedTargetType === 'hybrid') {
      const desc = formData.get('qualitative_description')
      if (desc) payload.qualitative_description = desc as string
    }

    let res
    if (editingProgramId) {
      const { updateProgram } = await import('./actions')
      res = await updateProgram(editingProgramId, payload)
    } else {
      res = await createProgram(payload)
    }
    
    if ('error' in res && res.error) {
      setError(res.error)
      setIsLoading(false)
    } else {
      setIsModalOpen(false)
      setIsLoading(false)
      // Reset form default
      setSelectedTargetType('quantitative')
      setMonthlyRp('')
      setMonthlyUser('')
      setIsManualDaily(false)
      setEditingProgramId(null)
    }
  }

  async function handleToggleStatus(id: string, currentStatus: boolean) {
    if (!isAdmin) return
    setIsLoading(true)
    const res = await toggleProgramStatus(id, currentStatus)
    if ('error' in res && res.error) alert(res.error)
    setIsLoading(false)
  }

  const renderTargetInfo = (program: Program) => {
    const isQuant = program.target_type === 'quantitative' || program.target_type === 'hybrid'
    const isQual = program.target_type === 'qualitative' || program.target_type === 'hybrid'

    return (
      <div className="space-y-1 text-xs">
        {isQuant && (
          <div className="bg-blue-50/50 p-2 rounded border border-blue-100 flex flex-col gap-1">
            <div className="font-semibold text-blue-800">Bulanan</div>
            <div className="flex justify-between"><span>Rp:</span> <span className="font-medium text-slate-800">{formatRupiah(Number(program.monthly_target_rp || 0))}</span></div>
            <div className="flex justify-between"><span>User:</span> <span className="font-medium text-slate-800">{program.monthly_target_user || 0}</span></div>
            
            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-blue-100">
              <span className="font-semibold text-indigo-800">Harian: </span>
              <span className="text-slate-600">Rp {Number(program.daily_target_rp || 0).toLocaleString('id-ID')} | {program.daily_target_user || 0} u</span>
            </div>
          </div>
        )}
        {isQual && (
          <div className="bg-purple-50/50 p-2 rounded border border-purple-100 mt-1">
             <div className="font-semibold text-purple-800 mb-0.5">Misi Kualitatif</div>
             <div className="truncate max-w-[200px]" title={program.qualitative_description || '-'}>
              {program.qualitative_description || '-'}
             </div>
          </div>
        )}
      </div>
    )
  }

  const getTypeLabel = (type: string) => {
    if (type === 'quantitative') return 'Kuantitatif'
    if (type === 'qualitative') return 'Kualitatif'
    return 'Hybrid'
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-slate-800">Daftar Program</h3>
        {isAdmin && (
          <button
            onClick={handleOpenCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
          >
            + Tambah Program
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Nama Program</th>
              <th className="px-6 py-4">PIC / WhatsApp</th>
              <th className="px-6 py-4">Tipe</th>
              <th className="px-6 py-4">Detail Target</th>
              <th className="px-6 py-4 text-center">Status</th>
              {isAdmin && <th className="px-6 py-4 text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {programs.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-6 py-8 text-center text-slate-500">
                  Belum ada data program {isAdmin ? '' : 'yang aktif'}.
                </td>
              </tr>
            ) : (
              programs.map((prog) => (
                <tr key={prog.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900 max-w-[250px] truncate" title={prog.name}>
                    {prog.name}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    <div className="font-medium text-slate-900">{prog.pic_name}</div>
                    <div className="text-xs">{prog.pic_whatsapp || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${
                      prog.target_type === 'hybrid' ? 'bg-purple-100 text-purple-700' :
                      prog.target_type === 'quantitative' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {getTypeLabel(prog.target_type)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {renderTargetInfo(prog)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {prog.is_active ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                        Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                        Nonaktif
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleToggleStatus(prog.id, prog.is_active)}
                          disabled={isLoading}
                          className={`text-xs font-medium border px-2 py-1 rounded transition-colors ${
                            prog.is_active 
                              ? 'text-red-600 hover:text-red-800 border-red-200 hover:bg-red-50' 
                              : 'text-emerald-600 hover:text-emerald-800 border-emerald-200 hover:bg-emerald-50'
                          }`}
                        >
                          {prog.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button
                          onClick={() => handleOpenEdit(prog)}
                          disabled={isLoading}
                          className="text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-100 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(prog.id)}
                          disabled={isLoading}
                          className="text-xs font-medium bg-rose-50 border border-rose-200 text-rose-700 px-2 py-1 rounded hover:bg-rose-100 transition-colors"
                        >
                          Hapus
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

      {/* Tailwind Modal for Add Program */}
      {isModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mt-10 mb-10 shrink-0 transform transition-all">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 rounded-t-xl z-10">
              <h3 className="font-semibold text-slate-900">{editingProgramId ? 'Edit Program' : 'Tambah Program Baru'}</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmitProgram} className="p-6 space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                  {error}
                </div>
              )}
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Nama Program</label>
                <input 
                  name="name" 
                  type="text" 
                  required 
                  defaultValue={editingProgramId ? programs.find(p=>p.id===editingProgramId)?.name : ''}
                  placeholder="Contoh: Kelas Pelatihan BNSP"
                  className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Tugaskan PIC (Penanggung Jawab)</label>
                <select 
                  name="pic_id" 
                  required 
                  defaultValue={editingProgramId ? programs.find(p=>p.id===editingProgramId)?.pic_id || '' : ''}
                  className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                >
                  <option value="" disabled>-- Pilih Akun PIC --</option>
                  {picProfiles && picProfiles.length > 0 ? (
                    picProfiles.map(profile => (
                      <option key={profile.id} value={profile.id}>{profile.name} {profile.whatsapp_number ? `(${profile.whatsapp_number})` : ''}</option>
                    ))
                  ) : (
                    <option value="" disabled>Belum ada user ber-role PIC terdaftar</option>
                  )}
                </select>
                <p className="text-[10px] text-slate-500">Pilih dari daftar User yang memiliki Role sebagai "PIC". (Nama PIC dan No WA akan disalin otomatis).</p>
              </div>

              <div className="border-t border-slate-100 pt-4 mt-2">
                <label className="text-xs font-semibold text-slate-700 mb-2 block">Tipe Target</label>
                <div className="flex gap-3">
                  {(['quantitative', 'qualitative', 'hybrid'] as const).map(type => (
                    <label key={type} className={`flex-1 flex justify-center cursor-pointer border rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      selectedTargetType === type ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                      <input 
                        type="radio" 
                        name="type_selector" 
                        className="hidden" 
                        checked={selectedTargetType === type}
                        onChange={() => setSelectedTargetType(type)}
                      />
                      {getTypeLabel(type)}
                    </label>
                  ))}
                </div>
              </div>

              {/* Conditional Fields based on Target Type */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-4">
                {(selectedTargetType === 'quantitative' || selectedTargetType === 'hybrid') && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5 flex flex-col">
                        <label className="text-xs font-semibold text-slate-700">Target Bulanan (Rupiah)</label>
                        <input 
                          name="monthly_target_rp" 
                          type="number" 
                          min="0"
                          value={monthlyRp}
                          onChange={(e) => setMonthlyRp(e.target.value)}
                          className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          required={selectedTargetType === 'quantitative' || selectedTargetType === 'hybrid'}
                        />
                      </div>
                      <div className="space-y-1.5 flex flex-col">
                        <label className="text-xs font-semibold text-slate-700">Target Bulanan (User)</label>
                        <input 
                          name="monthly_target_user" 
                          type="number" 
                          min="0"
                          value={monthlyUser}
                          onChange={(e) => setMonthlyUser(e.target.value)}
                          className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          required={selectedTargetType === 'quantitative' || selectedTargetType === 'hybrid'}
                        />
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded border border-indigo-100 mt-2">
                       <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold text-indigo-800">Target Harian</label>
                          <label className="text-[10px] font-medium text-slate-600 flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={isManualDaily} onChange={(e) => setIsManualDaily(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500"/>
                            Set Manual (Override)
                          </label>
                       </div>
                       
                       {!isManualDaily ? (
                          <div className="text-xs text-slate-600 space-y-1">
                             <p>Sistem otomatis membagi Target Bulanan dengan Hari Kerja ({workDays} Hari).</p>
                             <div className="flex gap-4 font-semibold text-indigo-700 mt-1">
                                <span>Rp {calcDailyRp.toLocaleString('id-ID')}</span>
                                <span>{calcDailyUser} User</span>
                             </div>
                             {/* Hidden inputs to pass data */}
                             <input type="hidden" name="daily_target_rp" value={calcDailyRp} />
                             <input type="hidden" name="daily_target_user" value={calcDailyUser} />
                          </div>
                       ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5 flex flex-col">
                              <label className="text-[10px] font-semibold text-slate-500 uppercase">Rp Harian</label>
                              <input 
                                name="daily_target_rp" 
                                type="number" 
                                min="0" required
                                defaultValue={editingProgramId && isManualDaily ? programs.find(p=>p.id===editingProgramId)?.daily_target_rp?.toString() : ''}
                                className="w-full text-sm rounded bg-slate-50 border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="space-y-1.5 flex flex-col">
                              <label className="text-[10px] font-semibold text-slate-500 uppercase">User Harian</label>
                              <input 
                                name="daily_target_user" 
                                type="number" 
                                min="0" required
                                defaultValue={editingProgramId && isManualDaily ? programs.find(p=>p.id===editingProgramId)?.daily_target_user?.toString() : ''}
                                className="w-full text-sm rounded bg-slate-50 border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500"
                              />
                            </div>
                          </div>
                       )}
                    </div>
                  </>
                )}

                {(selectedTargetType === 'qualitative' || selectedTargetType === 'hybrid') && (
                  <div className="space-y-1.5 pt-2">
                    <label className="text-xs font-semibold text-slate-700">Deskripsi Target Kualitatif</label>
                    <textarea 
                      name="qualitative_description" 
                      rows={3}
                      defaultValue={editingProgramId ? programs.find(p=>p.id===editingProgramId)?.qualitative_description || '' : ''}
                      placeholder="Gambarkan milestone yang harus dicapai bulan ini..."
                      className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                      required={selectedTargetType === 'qualitative' || selectedTargetType === 'hybrid'}
                    ></textarea>
                  </div>
                )}
              </div>

              <div className="pt-4 flex justify-end gap-3 mt-6 border-t border-slate-100">
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
                  {isLoading ? 'Menyimpan...' : 'Simpan Program'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
