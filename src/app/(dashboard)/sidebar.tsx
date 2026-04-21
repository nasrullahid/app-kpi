'use client'

import { useState, useEffect } from 'react'
import { NavLinks } from './nav-links'
import { 
  Menu, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  LogOut,
  User 
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logout } from '@/app/login/actions'
import Image from 'next/image'
interface LocalProfile {
  id: string
  name: string
  role: 'admin' | 'pic' | null
}

interface SidebarProps {
  profile: LocalProfile | null
  userEmail: string
  isCollapsed: boolean
  setIsCollapsed: (val: boolean) => void
}

export function Sidebar({ profile, userEmail, isCollapsed, setIsCollapsed }: SidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // Autoclose mobile sidebar on navigation
  useEffect(() => {
    setIsMobileOpen(false)
  }, [])

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white w-8 h-8 rounded flex items-center justify-center font-bold text-sm">
            DT
          </div>
          <span className="font-bold text-slate-900">Dashboard KPI</span>
        </div>
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Content */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full bg-white border-r border-[#E5E7EB] transition-all duration-300 ease-in-out flex flex-col",
          isMobileOpen ? "translate-x-0 w-72" : "-translate-x-full lg:translate-x-0",
          isCollapsed ? "lg:w-20" : "lg:w-72"
        )}
      >
        <div className="h-20 flex items-center px-4 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex items-center justify-center font-bold text-xl shrink-0">
              <Image src="/logo/logoKPI.png" alt="Logo" width={30} height={30} />
            </div>
            {!isCollapsed && (
              <span className="font-semibold text-lg text-[#111827] truncate animate-in fade-in duration-500 whitespace-nowrap">
                Dashboard KPI
              </span>
            )}
          </div>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 py-8 overflow-y-auto overflow-x-hidden">
          <NavLinks 
            isCollapsed={isCollapsed} 
            onClick={() => setIsMobileOpen(false)} 
            role={profile?.role}
          />
        </div>

        <div className="p-4 border-t border-[#E5E7EB]">
          <div className={cn(
            "flex items-center gap-3 p-3 rounded-xl transition-all duration-300 overflow-hidden",
            isCollapsed ? "justify-center" : "bg-white border border-[#E5E7EB]"
          )}>
            <div className="h-10 w-10 rounded-full bg-[#EEEDFE] flex items-center justify-center text-[#534AB7] shrink-0 font-bold">
              {profile?.name?.charAt(0).toUpperCase() || <User className="h-5 w-5" />}
            </div>
            
            {!isCollapsed && (
              <div className="flex-1 truncate animate-in fade-in duration-300">
                <p className="text-sm font-semibold text-[#111827] truncate">{profile?.name || userEmail}</p>
                <p className="text-[10px] font-medium text-[#6B7280] uppercase tracking-wider">{profile?.role || 'User'}</p>
              </div>
            )}
          </div>

          <form action={logout} className="mt-4">
            <button
              type="submit"
              className={cn(
                "flex items-center gap-3 w-full p-3 rounded-xl text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-all duration-200 group font-bold",
                isCollapsed ? "justify-center" : ""
              )}
            >
              <LogOut className="h-5 w-5 group-hover:scale-110 transition-transform" />
              {!isCollapsed && <span>Keluar</span>}
            </button>
          </form>
        </div>

        {/* Desktop Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex absolute top-24 -right-3 h-6 w-6 rounded-full bg-white border border-slate-200 items-center justify-center text-slate-400 hover:text-indigo-600 shadow-sm hover:shadow-md transition-all z-50 translate-x-1"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {/* Mobile Close Button */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
        >
          <X className="h-6 w-6" />
        </button>
      </aside>
    </>
  )
}
