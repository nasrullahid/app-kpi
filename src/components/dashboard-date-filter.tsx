'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { DateRange } from 'react-day-picker'
import { parse, format } from 'date-fns'
import { DatePickerWithRange } from '@/components/date-range-picker'

export function DashboardDateFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [date, setDate] = useState<DateRange | undefined>(() => {
    const start = searchParams.get('startDate')
    const end = searchParams.get('endDate')
    if (start && end) {
      return {
        from: parse(start, 'yyyy-MM-dd', new Date()),
        to: parse(end, 'yyyy-MM-dd', new Date())
      }
    }
    return undefined
  })

  const handleApply = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (date?.from && date?.to) {
      params.set('startDate', format(date.from, 'yyyy-MM-dd'))
      params.set('endDate', format(date.to, 'yyyy-MM-dd'))
      router.push(`${pathname}?${params.toString()}`)
      router.refresh()
    }
  }

  const handleReset = () => {
    setDate(undefined)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('startDate')
    params.delete('endDate')
    router.push(`${pathname}?${params.toString()}`)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <DatePickerWithRange date={date} setDate={setDate} />
      <button 
        onClick={handleApply}
        disabled={!date?.from || !date?.to}
        className="px-3 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Terapkan
      </button>
      {(searchParams.has('startDate') || date) && (
        <button 
          onClick={handleReset}
          className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Reset
        </button>
      )}
    </div>
  )
}
