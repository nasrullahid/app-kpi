'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { 
  LayoutDashboard,
  FileInput, 
  Database,
  ChevronDown,
  HeartPulse,
  Target,
  Layers,
  Handshake,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavLinksProps {
  isCollapsed?: boolean
  onClick?: () => void
}

const dashboardSubItems = [
  {
    name: 'Ringkasan',
    href: '/dashboard?tab=overview',
    activeTab: 'overview',
    icon: HeartPulse,
  },
  {
    name: 'Omzet',
    href: '/dashboard?tab=target',
    activeTab: 'target',
    icon: Target,
  },
  {
    name: 'Ads Performance',
    href: '/dashboard?tab=ads',
    activeTab: 'ads',
    icon: Layers,
  },
  {
    name: 'MoU Tracker',
    href: '/dashboard?tab=mou',
    activeTab: 'mou',
    icon: Handshake,
  },
]

export function NavLinks({ isCollapsed, onClick }: NavLinksProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Auto-expand dashboard group when on any /dashboard route
  const isDashboardActive = pathname?.startsWith('/dashboard')
  const [dashboardOpen, setDashboardOpen] = useState(isDashboardActive ?? false)

  // Keep open if navigating within dashboard
  useEffect(() => {
    if (isDashboardActive) setDashboardOpen(true)
  }, [isDashboardActive])


  return (
    <nav className="flex flex-col gap-1 px-3">
      {!isCollapsed && (
        <p className="px-3 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Main Menu</p>
      )}
      
      {/* ── Dashboard group ───────────────────────────────── */}
      <div className="mb-2">
        {/* Parent button */}
        <button
          onClick={() => setDashboardOpen(v => !v)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-200 group relative",
            isDashboardActive
              ? "bg-[#EEEDFE] text-[#534AB7]"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            isCollapsed ? "justify-center" : ""
          )}
        >
          <LayoutDashboard className={cn(
            "h-5 w-5 shrink-0",
            isDashboardActive ? "text-[#534AB7]" : "text-slate-500 group-hover:text-[#534AB7]"
          )} />

          {!isCollapsed && (
            <>
              <span className="flex-1 text-left truncate animate-in fade-in slide-in-from-left-2 duration-300">
                Dashboard
              </span>
              <ChevronDown className={cn(
                "h-4 w-4 shrink-0 transition-transform duration-200",
                dashboardOpen ? "rotate-180" : ""
              )} />
            </>
          )}

          {/* Collapsed tooltip */}
          {isCollapsed && (
            <div className="absolute left-full ml-4 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
              Dashboard
            </div>
          )}
        </button>

        {/* Sub-items */}
        {(dashboardOpen || isCollapsed) && (
          <div className={cn(
            "flex flex-col gap-0.5 transition-all duration-200",
            isCollapsed ? "mt-1" : "mt-0.5 pl-3"
          )}>
            {dashboardSubItems.map(sub => {
              const currentTab = searchParams.get('tab') || 'overview'
              const active = isDashboardActive && currentTab === sub.activeTab
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  onClick={onClick}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 group relative",
                    active
                      ? "bg-[#EEEDFE] text-[#534AB7]"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                    isCollapsed ? "justify-center" : ""
                  )}
                >
                  <sub.icon className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-[#534AB7]" : "text-slate-400 group-hover:text-[#534AB7]"
                  )} />

                  {!isCollapsed && (
                    <span className="flex-1 truncate animate-in fade-in slide-in-from-left-2 duration-300">
                      {sub.name}
                    </span>
                  )}

                  {/* Collapsed tooltip */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-3 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                      {sub.name}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {!isCollapsed && (
        <p className="px-3 mt-4 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Manajemen</p>
      )}

      {/* ── Other top-level links ─────────────────────────── */}
      {[
        { name: 'Pencapaian Harian', href: '/input-harian', icon: FileInput },
        { name: 'Master Data', href: '/master-data', icon: Database },
      ].map(link => {
        const active = pathname?.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-200 group relative",
              active
                ? "bg-[#EEEDFE] text-[#534AB7]"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              isCollapsed ? "justify-center" : ""
            )}
          >
            <link.icon className={cn(
              "h-5 w-5 shrink-0",
              active ? "text-[#534AB7]" : "text-slate-500 group-hover:text-[#534AB7]"
            )} />

            {!isCollapsed && (
              <span className="flex-1 truncate animate-in fade-in slide-in-from-left-2 duration-300">
                {link.name}
              </span>
            )}

            {isCollapsed && (
              <div className="absolute left-full ml-4 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                {link.name}
              </div>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
