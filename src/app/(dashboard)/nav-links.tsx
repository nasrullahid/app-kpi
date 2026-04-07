'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavLinks() {
  const pathname = usePathname()

  const isActive = (path: string) => {
    // If we are at root dashboard
    if (path === '/dashboard' && pathname === '/dashboard') return true
    
    // If we are at master data
    if (path === '/master-data' && pathname?.startsWith('/master-data')) return true
    
    return false
  }

  return (
    <div className="hidden md:flex space-x-8 ml-6 mr-auto h-full">
      <Link 
        href="/dashboard" 
        className={`h-16 flex items-center px-1 border-b-2 text-sm font-medium transition-colors ${
          isActive('/dashboard') 
            ? 'text-indigo-600 border-indigo-600' 
            : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
        }`}
      >
        Dashboard
      </Link>
      <Link 
        href="/master-data" 
        className={`h-16 flex items-center px-1 border-b-2 text-sm font-medium transition-colors ${
          isActive('/master-data') 
            ? 'text-indigo-600 border-indigo-600' 
            : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
        }`}
      >
        Master Data
      </Link>
    </div>
  )
}
