import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatMonth(monthNumber: number): string {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]
  return months[monthNumber - 1] || 'Bulan Tidak Valid'
}

export function getPreviousPeriodLabel(startDate?: string, endDate?: string): string {
  if (!startDate || !endDate) return 'vs periode sblmnya'
  
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const daysInSelection = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
  
  const prevEnd = new Date(start)
  prevEnd.setDate(prevEnd.getDate() - 1)
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevStart.getDate() - daysInSelection + 1)
  
  const format = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  
  return `vs ${format(prevStart)} - ${format(prevEnd)}`
}
