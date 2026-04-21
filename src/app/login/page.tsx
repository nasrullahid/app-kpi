'use client'

import { useState } from 'react'
import { login } from './actions'
import Image from 'next/image'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const result = await login(formData)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-100 p-8">

      {/* Top accent bar */}
      <div className="absolute inset-x-0 top-0 h-1 bg-indigo-700" />

      <div className="flex w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white">

        {/* ── Left panel ── */}
        <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-indigo-700 p-10 md:flex">

          {/* Decorative circles */}
          <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/5" />
          <div className="absolute -left-10 bottom-10 h-40 w-40 rounded-full bg-white/5" />

          {/* Brand */}
          <div className="relative z-10">
            <div className="flex items-center justify-center">
              <Image src="/logo/logoKPI.png" alt="Logo" width={50} height={50} className='opacity-20' />    
            </div>

            <div className="mt-10">
              <h2 className="text-xl font-medium leading-snug text-white">
                Dashboard KPI
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                Pantau target, analisis tren, dan ambil keputusan berbasis data secara real-time.
              </p>
            </div>
          </div>

          {/* Feature list */}
          <div className="relative z-10 flex flex-col gap-2.5">
            {[
              {
                label: 'Laporan penjualan & pencapaian target',
                icon: (
                  <svg className="h-3.5 w-3.5 text-white/90" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3zm5-4a1 1 0 011-1h2a1 1 0 011 1v7a1 1 0 01-1 1H8a1 1 0 01-1-1V7zm5-5a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V2z" />
                  </svg>
                ),
              },
              {
                label: 'Pantau aktivitas harian Anda terhadap target program berjalan',
                icon: (
                  <svg className="h-3.5 w-3.5 text-white/90" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M1 2.5A1.5 1.5 0 012.5 1h3A1.5 1.5 0 017 2.5v3A1.5 1.5 0 015.5 7h-3A1.5 1.5 0 011 5.5v-3zm8 0A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm-8 8A1.5 1.5 0 012.5 9h3A1.5 1.5 0 017 10.5v3A1.5 1.5 0 015.5 15h-3A1.5 1.5 0 011 13.5v-3zm8 0A1.5 1.5 0 0110.5 9h3a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 019 13.5v-3z" clipRule="evenodd" />
                  </svg>
                ),
              },
              {
                label: 'Akses hanya untuk karyawan internal',
                icon: (
                  <svg className="h-3.5 w-3.5 text-white/90" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V6H3a1 1 0 00-1 1v7a1 1 0 001 1h10a1 1 0 001-1V7a1 1 0 00-1-1h-1.5V4.5A3.5 3.5 0 008 1zm2 5V4.5a2 2 0 10-4 0V6h4z" clipRule="evenodd" />
                  </svg>
                ),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/8 px-3 py-2.5"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/12">
                  {item.icon}
                </div>
                <span className="text-[13px] leading-snug text-white/85">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="flex flex-1 flex-col justify-center p-8 md:p-10">
          <div className="mb-8">
            <h1 className="text-xl font-medium text-slate-900">Selamat datang kembali</h1>
            <p className="mt-1 text-sm text-slate-500">Masuk ke akun Anda untuk melanjutkan</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-medium text-slate-600">
                Alamat email
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="nama@perusahaan.com"
                  required
                  disabled={isLoading}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/10 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/10 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-800 disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Masuk...
                </>
              ) : (
                <>
                  Masuk ke Dashboard
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <p className="mt-8 border-t border-slate-100 pt-5 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} Target Keuangan Internal · Akses terbatas
          </p>
        </div>

      </div>
    </div>
  )
}
