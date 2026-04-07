import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logout } from '@/app/login/actions'
import { NavLinks } from './nav-links'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  console.log("=== DIAGNOSTIC DBG ===")
  console.log("User Email:", user.email)
  console.log("User ID:", user.id)
  console.log("Profile Data:", profile)
  console.log("Profile Error:", profileError)
  console.log("======================")

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-100 text-indigo-700 w-10 h-10 rounded-lg flex items-center justify-center font-bold shadow-sm">
            TK
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-purple-600">
            Target Keuangan
          </h1>
        </div>
        
        <NavLinks />
          
        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-bold text-slate-800">{profile?.name || user.email}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wide">
              {profile?.role || 'User'}
            </span>
          </div>
          
          <form action={logout}>
            <button type="submit" className="text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-md px-3 py-1.5 transition-colors">
              Keluar
            </button>
          </form>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-8">
        {children}
      </main>
    </div>
  )
}
