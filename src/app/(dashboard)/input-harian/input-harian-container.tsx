'use client'

import { useState, useEffect } from 'react'
import { InputFormClient } from './input-form-client'
import { PivotTableClient } from './pivot-table-client'
import { Database } from '@/types/database'
import { List, LayoutGrid, PlusCircle } from 'lucide-react'

type ProgramMilestone = Database['public']['Tables']['program_milestones']['Row']
type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
type MetricDefinition = Database['public']['Tables']['program_metric_definitions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']

type Program = Database['public']['Tables']['programs']['Row'] & {
  program_milestones: ProgramMilestone[]
  program_metric_definitions: MetricDefinition[]
}

type DailyInput = Database['public']['Tables']['daily_inputs']['Row'] & {
  programs: { name: string; target_type: 'quantitative' | 'qualitative' | 'hybrid' } | null
  profiles?: { name: string } | null
}
type Period = Database['public']['Tables']['periods']['Row']

interface InputHarianContainerProps {
  programs: Program[]
  pastInputs: DailyInput[]
  isAdmin?: boolean
  activePeriod?: Period
  milestoneCompletions: MilestoneCompletion[]
  existingMetricValues?: MetricValue[]
  allPeriodMetricValues?: MetricValue[]
}

export function InputHarianContainer(props: InputHarianContainerProps) {
  const [viewMode, setViewMode] = useState<'compact' | 'detail'>('compact')
  const [isMounted, setIsMounted] = useState(false)

  // Load preference from localStorage
  useEffect(() => {
    setIsMounted(true)
    const saved = localStorage.getItem('dashboard_input_view_mode')
    if (saved === 'detail') setViewMode('detail')
  }, [])

  const handleToggle = (mode: 'compact' | 'detail') => {
    setViewMode(mode)
    localStorage.setItem('dashboard_input_view_mode', mode)
  }

  // Pass all programs to the pivot table
  const pivotPrograms = props.programs

  // Don't render toggle until mounted to avoid hydration mismatch
  if (!isMounted) return null

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Modern Toggle Header */}
        <div className="bg-slate-50/80 border-b border-slate-200 p-2 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex bg-slate-200/50 p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => handleToggle('compact')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                viewMode === 'compact' 
                  ? 'bg-white text-indigo-700 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <List className="w-4 h-4" />
              Semua Program
            </button>
            <button
              onClick={() => handleToggle('detail')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                viewMode === 'detail' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Detail Program
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6">
          {viewMode === 'compact' ? (
            <InputFormClient {...props} />
          ) : (
            <PivotTableClient
              programs={pivotPrograms}
              activePeriod={props.activePeriod}
              allPeriodMetricValues={props.allPeriodMetricValues || []}
              isAdmin={props.isAdmin}
            />
          )}
        </div>
      </div>
    </div>
  )
}
