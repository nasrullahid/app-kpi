import { Database } from '@/types/database'
import { evaluateAllMetrics, MetricForOrdering } from './formula-evaluator'

type Milestone = Database['public']['Tables']['program_milestones']['Row']
type MilestoneCompletion = Database['public']['Tables']['milestone_completions']['Row']
type MetricDefinition = Database['public']['Tables']['program_metric_definitions']['Row']
type MetricValue = Database['public']['Tables']['daily_metric_values']['Row']
type DailyInput = Database['public']['Tables']['daily_inputs']['Row']

export type ProgramWithRelations = Database['public']['Tables']['programs']['Row'] & {
  program_pics?: { profile_id: string }[]
  program_milestones?: Milestone[]
  program_metric_definitions?: MetricDefinition[]
}

export interface ProgramHealthResult {
  programId: string
  healthScore: number
  status: 'KRITIS' | 'PERLU PERHATIAN' | 'CUKUP' | 'BAIK' | 'EXCELLENT'
  totalTargetMetrics: number
  isQualitativeOnly: boolean
  calculatedMetrics?: Record<string, number | null>
  effectiveTargets?: Record<string, number> // Stores prorated targets for health calculation
  absoluteTargets?: Record<string, number>  // Stores full monthly targets for UI display
}

export function getHealthStatus(score: number): ProgramHealthResult['status'] {
  if (score < 40) return 'KRITIS'
  if (score < 60) return 'PERLU PERHATIAN'
  if (score < 80) return 'CUKUP'
  if (score < 100) return 'BAIK'
  return 'EXCELLENT'
}

/**
 * Calculates the overall health score and all metric values for a single program.
 */
export function calculateProgramHealth(
  program: ProgramWithRelations,
  metricValuesByProgram: Map<string, MetricValue[]>,
  dailyInputsByProgram: Map<string, DailyInput[]>,
  milestoneCompletionsByMilestone: Map<string, MilestoneCompletion>,
  prorationFactor: number,
  workingDaysInPeriod: number = 20
): ProgramHealthResult {
  const metrics = program.program_metric_definitions || []
  const hasCustomMetrics = metrics.length > 0
  const progMetricValues = metricValuesByProgram.get(program.id) || []

  // 1. Calculate All Metrics using evaluateAllMetrics pipeline
  const manualValues: Record<string, number | null> = {}
  
  // Aggregate manual values (SUM) from daily_metric_values table
  metrics.filter(m => m.input_type === 'manual').forEach(m => {
    const vals = progMetricValues.filter(mv => mv.metric_definition_id === m.id)
    // Only set if we actually have meaningful values for this metric in this period
    if (vals.length > 0 && vals.some(v => v.value !== null)) {
      manualValues[m.metric_key] = vals.reduce((sum, v) => sum + (v.value || 0), 0)
    }
  })

  // Fallback to legacy daily_inputs (achievement_rp/user) if no data found in custom metrics
  // We prioritize the new system (daily_metric_values) if any non-null data exists there for these keys
  const inputs = dailyInputsByProgram.get(program.id) || []
  if (manualValues['revenue'] === undefined || manualValues['revenue'] === null || manualValues['revenue'] === 0) {
    const legacySum = inputs.reduce((sum, i) => sum + Number(i.achievement_rp || 0), 0)
    if (legacySum > 0) manualValues['revenue'] = legacySum
  }
  if (manualValues['user_count'] === undefined || manualValues['user_count'] === null || manualValues['user_count'] === 0) {
    const legacySum = inputs.reduce((sum, i) => sum + Number(i.achievement_user || 0), 0)
    if (legacySum > 0) manualValues['user_count'] = legacySum
  }

  // Pre-load baseline and target metrics for formulas
  metrics.forEach(m => {
    if (m.input_type === 'manual' && !(m.metric_key in manualValues)) {
      manualValues[m.metric_key] = manualValues[m.metric_key] ?? null
    }
  })

  const orderingMetrics: MetricForOrdering[] = metrics.map(m => ({
    metric_key: m.metric_key,
    input_type: m.input_type,
    formula: m.formula
  }))

  let evaluatedMetrics: Record<string, number | null> = {}
  try {
    evaluatedMetrics = evaluateAllMetrics(orderingMetrics, manualValues)
  } catch (e) {
    console.error(`Calculation error for program ${program.name}:`, e)
    evaluatedMetrics = { ...manualValues }
  }

  // ── Case 1 & 3: Program with custom metrics — use PRIMARY metrics for Health Score ──────
  if (hasCustomMetrics) {
    const primaryMetrics = metrics.filter(m => m.is_primary && m.is_target_metric)

    if (primaryMetrics.length > 0) {
      let sumPercentage = 0
      let validMetrics = 0
      const effectiveTargets: Record<string, number> = {}
      const absoluteTargets: Record<string, number> = {}

      // First, calculate absolute targets for ALL metrics
      metrics.forEach(m => {
        let mTarget = m.monthly_target || 0
        if (mTarget === 0) {
          if (m.data_type === 'currency') mTarget = program.monthly_target_rp || 0
          else if (m.data_type === 'integer') mTarget = program.monthly_target_user || 0
        }
        
        const vals = progMetricValues.filter(mv => mv.metric_definition_id === m.id)
        const sumCustomTarget = vals.reduce((sum, v) => sum + (v.target_value || 0), 0)
        
        // If custom target list exists, use its sum (periodized) or fallback to monthly
        const absTarget = sumCustomTarget > 0 ? sumCustomTarget / prorationFactor : mTarget
        const isInt = m.data_type === 'integer' || m.unit_label?.toLowerCase().includes('user') || m.unit_label?.toLowerCase().includes('lead')
        
        absoluteTargets[m.metric_key] = isInt ? Math.round(absTarget) : absTarget
      })

      // Second, calculate health and effective targets for PRIMARY metrics
      primaryMetrics.forEach(m => {
        const sumActual = evaluatedMetrics[m.metric_key] || 0
        const vals = progMetricValues.filter(mv => mv.metric_definition_id === m.id)
        const sumCustomTarget = vals.reduce((sum, v) => sum + (v.target_value || 0), 0)

        const daysInSelection = prorationFactor * workingDaysInPeriod
        const manualDaily = m.metric_key === 'revenue' ? (program.daily_target_rp || 0) : 
                            m.metric_key === 'user_count' ? (program.daily_target_user || 0) : 0

        const isInteger = m.data_type === 'integer' || m.unit_label?.toLowerCase().includes('user') || m.unit_label?.toLowerCase().includes('lead')
        
        // Effective target used for Health Score (prorated)
        const effectiveTarget = sumCustomTarget > 0 ? sumCustomTarget : 
                                manualDaily > 0 ? (manualDaily * daysInSelection) : 
                                ((absoluteTargets[m.metric_key] || 0) * prorationFactor)

        effectiveTargets[m.metric_key] = isInteger ? Math.round(effectiveTarget) : effectiveTarget

        if (effectiveTarget > 0) {
          let pct = (sumActual / effectiveTarget) * 100
          if (m.target_direction === 'lower_is_better') {
            pct = sumActual > 0 ? (effectiveTarget / sumActual) * 100 : 0
          }
          sumPercentage += pct
          validMetrics++
        }
      })

      const healthScore = validMetrics > 0 ? sumPercentage / validMetrics : 0
      return {
        programId: program.id,
        healthScore,
        status: getHealthStatus(healthScore),
        totalTargetMetrics: validMetrics,
        isQualitativeOnly: false,
        calculatedMetrics: evaluatedMetrics,
        effectiveTargets,
        absoluteTargets
      }
    }
  }

  // ── Case 2: Qualitative only (milestone-based) ────────────────────────────
  const isExplicitlyQualitative = program.target_type === 'qualitative'
  const hasNoLegacyTargets = (program.monthly_target_rp || 0) === 0 && (program.monthly_target_user || 0) === 0

  if (isExplicitlyQualitative || (hasCustomMetrics && hasNoLegacyTargets) || (!hasCustomMetrics && hasNoLegacyTargets)) {
    const milestones = program.program_milestones || []
    if (milestones.length > 0) {
      const completed = milestones.filter(ms =>
        milestoneCompletionsByMilestone.get(ms.id)?.is_completed
      ).length

      const healthScore = (completed / milestones.length) * 100
      return {
        programId: program.id,
        healthScore,
        status: getHealthStatus(healthScore),
        totalTargetMetrics: milestones.length,
        isQualitativeOnly: true,
        calculatedMetrics: evaluatedMetrics
      }
    }
    return {
      programId: program.id,
      healthScore: 0,
      status: 'KRITIS',
      totalTargetMetrics: 0,
      isQualitativeOnly: true,
      calculatedMetrics: evaluatedMetrics
    }
  }

  // ── Legacy Fallback: program with no custom metrics, has Rp/User targets ──────────
  const cumulativeRp = evaluatedMetrics['revenue'] || 0
  const cumulativeUser = evaluatedMetrics['user_count'] || 0

  const daysInSelection = prorationFactor * workingDaysInPeriod
  const effectiveRp = program.daily_target_rp ? (program.daily_target_rp * daysInSelection) : (program.monthly_target_rp || 0) * prorationFactor
  const effectiveUser = program.daily_target_user ? (program.daily_target_user * daysInSelection) : (program.monthly_target_user || 0) * prorationFactor

  const finalRp = Math.round(effectiveRp)
  const finalUser = Math.round(effectiveUser)

  let scoreRp = 0, scoreUser = 0
  let totalValidMetrics = 0

  if (effectiveRp > 0) { scoreRp = (cumulativeRp / effectiveRp) * 100; totalValidMetrics++ }
  if (effectiveUser > 0) { scoreUser = (cumulativeUser / effectiveUser) * 100; totalValidMetrics++ }

  const healthScore = totalValidMetrics > 0 ? (scoreRp + scoreUser) / totalValidMetrics : 0

  return {
    programId: program.id,
    healthScore,
    status: getHealthStatus(healthScore),
    totalTargetMetrics: totalValidMetrics,
    isQualitativeOnly: false,
    calculatedMetrics: evaluatedMetrics,
    effectiveTargets: {
      revenue: finalRp,
      user_count: finalUser
    },
    absoluteTargets: {
      revenue: program.monthly_target_rp || 0,
      user_count: program.monthly_target_user || 0
    }
  }
}

/**
 * Calculates average health across a set of programs.
 */
export function calculateDepartmentHealth(
  programs: ProgramWithRelations[],
  metricValuesByProgram: Map<string, MetricValue[]>,
  dailyInputsByProgram: Map<string, DailyInput[]>,
  milestoneCompletionsByMilestone: Map<string, MilestoneCompletion>,
  prorationFactor: number,
  workingDaysInPeriod: number
) {
  if (programs.length === 0) return { score: 0, status: 'KRITIS' as const }
  let sumHealth = 0

  programs.forEach(p => {
    const health = calculateProgramHealth(
      p, 
      metricValuesByProgram, 
      dailyInputsByProgram, 
      milestoneCompletionsByMilestone, 
      prorationFactor, 
      workingDaysInPeriod
    )
    sumHealth += health.healthScore
  })

  const avgHealth = sumHealth / programs.length
  return {
    score: avgHealth,
    status: getHealthStatus(avgHealth)
  }
}

/**
 * Aggregates all metrics grouped by metric_group across programs.
 */
export function aggregateByMetricGroup(
  programs: ProgramWithRelations[],
  metricValuesByProgram: Map<string, MetricValue[]>,
  dailyInputsByProgram: Map<string, DailyInput[]>,
  prorationFactor: number,
  workingDaysInPeriod: number
) {
  const groupRawTotals: Record<string, { actual: number, target: number, totalTarget: number }> = {
    revenue: { actual: 0, target: 0, totalTarget: 0 },
    user_acquisition: { actual: 0, target: 0, totalTarget: 0 },
    ad_spend: { actual: 0, target: 0, totalTarget: 0 },
    leads: { actual: 0, target: 0, totalTarget: 0 }
  }

  const existingGroups = new Set<string>()

  programs.forEach(prog => {
    const definitions = prog.program_metric_definitions || []
    const progMetricValues = metricValuesByProgram.get(prog.id) || []
    const progInputs = dailyInputsByProgram.get(prog.id) || []
    
    // Group definitions by category using synonyms and metric_group
    const getProgValue = (group: string, keys: string[]) => {
      let customSum = 0
      let customTarget = 0
      let customAbsolute = 0
      let foundCustom = false

      definitions.forEach(m => {
        const k = m.metric_key?.toLowerCase()
        const match = m.metric_group === group || keys.includes(k)
        if (match) {
          const vals = progMetricValues.filter(mv => mv.metric_definition_id === m.id)
          foundCustom = true
          customSum += vals.reduce((s, v) => s + (Number(v.value) || 0), 0)
          customTarget += vals.reduce((s, v) => s + (Number(v.target_value) || 0), 0)
          
          let mTarget = m.monthly_target || 0
          if (mTarget === 0) {
            if (m.data_type === 'currency') mTarget = prog.monthly_target_rp || 0
            else if (m.data_type === 'integer') mTarget = prog.monthly_target_user || 0
          }
          customAbsolute += mTarget
        }
      })
      
      return { actual: customSum, target: customTarget, absolute: customAbsolute, found: foundCustom }
    }

    const rev = getProgValue('revenue', ['revenue', 'omzet', 'pemasukan', 'revenue_from_paid_traffic'])
    const acq = getProgValue('user_acquisition', ['user_count', 'closing', 'leads_converted', 'pembelian'])
    const spd = getProgValue('ad_spend', ['ads_spent', 'ad_spend', 'budget_iklan', 'spent'])
    const lds = getProgValue('leads', ['leads', 'lead_masuk', 'prospek', 'leads_count'])

    // Update global aggregates
    const processGroup = (g: string, data: { actual: number, target: number, absolute: number, found: boolean }, legacyActual: number, legacyTarget: number, legacyDaily: number) => {
      const daysInSelection = prorationFactor * workingDaysInPeriod
      
      // We use custom if found ANY data there, even if 0 (prioritize new system)
      // Otherwise fallback to legacy
      let actual = 0
      let target = 0
      let totalTarget = 0

      if (data.found) {
        existingGroups.add(g)
        actual = data.actual
        // If custom target is 0, use legacy target as fallback for the target value
        target = data.target > 0 ? data.target : 
                 legacyDaily > 0 ? (legacyDaily * daysInSelection) : (legacyTarget * prorationFactor)
        totalTarget = data.absolute > 0 ? data.absolute : legacyTarget
      } else if (legacyActual > 0 || legacyTarget > 0) {
        existingGroups.add(g)
        actual = legacyActual
        target = legacyDaily > 0 ? (legacyDaily * daysInSelection) : (legacyTarget * prorationFactor)
        totalTarget = legacyTarget
      }

      if (existingGroups.has(g)) {
        groupRawTotals[g].actual += actual
        groupRawTotals[g].target += target
        groupRawTotals[g].totalTarget += totalTarget
      }
    }

    processGroup('revenue', rev, progInputs.reduce((sum, i) => sum + (Number(i.achievement_rp) || 0), 0), prog.monthly_target_rp || 0, prog.daily_target_rp || 0)
    processGroup('user_acquisition', acq, progInputs.reduce((sum, i) => sum + (Number(i.achievement_user) || 0), 0), prog.monthly_target_user || 0, prog.daily_target_user || 0)
    
    // Ads groups usually don't have legacy fallbacks
    if (spd.found) {
      existingGroups.add('ad_spend')
      groupRawTotals.ad_spend.actual += spd.actual
      groupRawTotals.ad_spend.target += spd.target
      groupRawTotals.ad_spend.totalTarget += spd.absolute > 0 ? spd.absolute : spd.target
    }
    if (lds.found) {
      existingGroups.add('leads')
      groupRawTotals.leads.actual += lds.actual
    }

    // Mark as existing for computed metrics
    if (definitions.some(m => m.metric_group === 'conversion')) existingGroups.add('conversion')
    if (definitions.some(m => m.metric_group === 'efficiency')) existingGroups.add('efficiency')
  })


  const result: Record<string, { actual: number, target: number, totalTarget: number, isComputed: boolean }> = {}

  Object.keys(groupRawTotals).forEach(g => {
    if (existingGroups.has(g)) {
      result[g] = { ...groupRawTotals[g], isComputed: false }
    }
  })

  // Group by metric_group handled by aggregateByMetricGroup
  if (existingGroups.has('conversion')) {
    const acq = groupRawTotals['user_acquisition']?.actual || 0
    const lds = groupRawTotals['leads']?.actual || 0
    const actual = lds > 0 ? (acq / lds) * 100 : 0
    result['conversion'] = { actual, target: 0, totalTarget: 0, isComputed: true }
  }

  if (existingGroups.has('efficiency')) {
    const rev = groupRawTotals['revenue']?.actual || 0
    const spd = groupRawTotals['ad_spend']?.actual || 0
    const actual = spd > 0 ? (rev / spd) : 0
    result['efficiency'] = { actual, target: 0, totalTarget: 0, isComputed: true }
  }

  return result
}

/**
 * Standard performance grading for TV Dashboard
 */
export function getPerformanceGrade(score: number): { label: string, color: string } {
  if (score >= 100) return { label: 'S', color: 'text-emerald-400' }
  if (score >= 90)  return { label: 'A', color: 'text-emerald-400' }
  if (score >= 80)  return { label: 'B', color: 'text-emerald-400' }
  if (score >= 60)  return { label: 'C', color: 'text-amber-400' }
  if (score >= 40)  return { label: 'D', color: 'text-rose-400' }
  return { label: 'E', color: 'text-rose-600' }
}

// ─── Ads Performance Utilities ────────────────────────────────────────────────


/**
 * Detects if a program is an "Ads Program"
 */
export function isAdsProgram(metricDefinitions: MetricDefinition[]): boolean {
  if (!metricDefinitions || metricDefinitions.length === 0) return false
  
  return metricDefinitions.some(
    m => 
      m.metric_group === 'ad_spend' || 
      m.metric_group === 'leads' ||
      m.metric_key === 'ads_spent' ||
      m.metric_key === 'leads' ||
      m.metric_key === 'roas' ||
      m.metric_key === 'cpp'
  )
}

export interface AdsAggregateResult {
  totalAdsSpent: number
  totalRevenue: number
  totalGoals: number
  totalLeads: number
  avgRoas: number   // total_revenue / total_ads_spent (weighted)
  avgCpp: number    // total_ads_spent / total_goals (weighted)
  avgCr: number     // total_goals / total_leads (weighted)
}

/**
 * Aggregates ads metrics across programs using weighted averages.
 */
export function aggregateAdsMetrics(
  programs: ProgramWithRelations[],
  metricValuesByProgram: Map<string, MetricValue[]>
): AdsAggregateResult {
  let totalAdsSpent = 0
  let totalRevenue = 0
  let totalGoals = 0
  let totalLeads = 0

  programs.forEach(prog => {
    const defs = prog.program_metric_definitions || []
    const progMetricValues = metricValuesByProgram.get(prog.id) || []

    defs.forEach(m => {
      const vals = progMetricValues.filter(mv => mv.metric_definition_id === m.id)
      const sum = vals.reduce((acc, v) => acc + (Number(v.value) || 0), 0)

      const g = m.metric_group
      const k = m.metric_key?.toLowerCase()

      if (g === 'ad_spend' || k === 'ads_spent' || k === 'ad_spend' || k === 'budget_iklan' || k === 'spent') {
        totalAdsSpent += sum
      } else if (g === 'revenue' || k === 'revenue' || k === 'omzet' || k === 'pemasukan' || k === 'revenue_from_paid_traffic') {
        totalRevenue += sum
      } else if (g === 'user_acquisition' || k === 'user_count' || k === 'closing' || k === 'leads_converted' || k === 'pembelian') {
        totalGoals += sum
      } else if (g === 'leads' || k === 'leads' || k === 'lead_masuk' || k === 'prospek' || k === 'leads_count') {
        totalLeads += sum
      }
    })
  })

  return {
    totalAdsSpent,
    totalRevenue,
    totalGoals,
    totalLeads,
    avgRoas: totalAdsSpent > 0 ? totalRevenue / totalAdsSpent : 0,
    avgCpp: totalGoals > 0 ? totalAdsSpent / totalGoals : 0,
    avgCr: totalLeads > 0 ? (totalGoals / totalLeads) * 100 : 0,
  }
}

export interface AdsDailyPoint {
  date: string
  displayDate: string
  x: number   // metric for bar (e.g. ads_spent)
  y: number   // metric for line overlay (recalculated daily)
}

/**
 * Builds daily time series for dual-axis ads chart.
 */
export function buildAdsDailySeries(
  programs: ProgramWithRelations[],
  metricValuesByProgram: Map<string, MetricValue[]>,
  metricX: string,
  metricY: string
): AdsDailyPoint[] {
  const byDate = new Map<string, { xSum: number; revSum: number; spendSum: number; goalsSum: number; leadsSum: number }>()

  programs.forEach(prog => {
    const defs = prog.program_metric_definitions || []
    const progValues = metricValuesByProgram.get(prog.id) || []

    progValues.forEach(mv => {
      const d = mv.date
      const entry = byDate.get(d) || { xSum: 0, revSum: 0, spendSum: 0, goalsSum: 0, leadsSum: 0 }
      const val = Number(mv.value) || 0

      const def = defs.find(m => m.id === mv.metric_definition_id)
      if (!def) return

      const k = def.metric_key?.toLowerCase()
      const g = def.metric_group

      // Match logic with aggregateAdsMetrics synonyms
      const isSpend = g === 'ad_spend' || k === 'ads_spent' || k === 'ad_spend' || k === 'budget_iklan' || k === 'spent'
      const isRevenue = g === 'revenue' || k === 'revenue' || k === 'omzet' || k === 'pemasukan' || k === 'revenue_from_paid_traffic'
      const isGoal = g === 'user_acquisition' || k === 'user_count' || k === 'closing' || k === 'leads_converted' || k === 'pembelian'
      const isLead = g === 'leads' || k === 'leads' || k === 'lead_masuk' || k === 'prospek' || k === 'leads_count'

      // Check for exact key match first, then fall back to synonyms if metricX is a standard key
      const isXMatch = def.metric_key === metricX || 
                       (metricX === 'ads_spent' && isSpend) ||
                       (metricX === 'revenue' && isRevenue) ||
                       (metricX === 'user_count' && isGoal) ||
                       (metricX === 'leads' && isLead)

      if (isXMatch) entry.xSum += val
      if (isRevenue) entry.revSum += val
      if (isSpend) entry.spendSum += val
      if (isGoal) entry.goalsSum += val
      if (isLead) entry.leadsSum += val

      byDate.set(d, entry)
    })
  })

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => {
      let yVal = 0
      if (metricY === 'roas') yVal = entry.spendSum > 0 ? entry.revSum / entry.spendSum : 0
      else if (metricY === 'cpp' || metricY === 'cost_per_goal') yVal = entry.goalsSum > 0 ? entry.spendSum / entry.goalsSum : 0
      else if (metricY === 'conversion_rate') yVal = entry.leadsSum > 0 ? (entry.goalsSum / entry.leadsSum) * 100 : 0
      else if (metricY === 'goals') yVal = entry.goalsSum
      else if (metricY === 'leads') yVal = entry.leadsSum

      return {
        date,
        displayDate: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(date)),
        x: entry.xSum,
        y: yVal,
      }
    })
}

/**
 * Universal KPI aggregation for Overview Tab
 */
export function aggregateGlobalKPIs(
  programResults: ProgramHealthResult[],
  programs: ProgramWithRelations[],
  milestoneCompletions: MilestoneCompletion[]
) {
  const totalPrograms = programs.length
  const activeProgramsCount = programs.filter(p => 
    (p.program_metric_definitions?.length || 0) > 0 || 
    (p.program_milestones?.length || 0) > 0 ||
    (Number(p.monthly_target_rp) || 0) > 0 ||
    (Number(p.monthly_target_user) || 0) > 0
  ).length
  
  const avgHealth = programResults.length > 0 
    ? programResults.reduce((sum, r) => sum + r.healthScore, 0) / programResults.length 
    : 0

  const targetsHit = programResults.filter(r => r.healthScore >= 100).length
  
  const totalMilestones = programs.reduce((sum, p) => sum + (p.program_milestones?.length || 0), 0)
  const completedMilestones = milestoneCompletions.filter(c => c.is_completed).length

  return {
    avgHealth,
    activeProgramsCount,
    totalPrograms,
    targetsHit,
    totalMilestones,
    completedMilestones,
    healthStatus: getHealthStatus(avgHealth)
  }
}

export interface HealthTrendPoint {
  date: string
  displayDate: string
  health: number
}

/**
 * Builds daily health trend series for the main global chart.
 * Replaces the static overallHealth average with a real daily progression.
 */
export function buildHealthTrendSeries(
  programs: ProgramWithRelations[],
  metricValues: MetricValue[],
  dailyInputs: DailyInput[],
  milestoneCompletions: MilestoneCompletion[],
  activePeriod: Database['public']['Tables']['periods']['Row'],
  startDate?: string,
  endDate?: string
): HealthTrendPoint[] {
  const dateRange: string[] = []
  const workingDays = activePeriod.working_days || 30

  if (startDate && endDate) {
    const start = new Date(startDate); const end = new Date(endDate); const cur = new Date(start)
    while (cur <= end) { dateRange.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }
  } else {
    // Current month view: from day 1 to today (capped at 31)
    const today = new Date().getDate()
    for (let i = 1; i <= Math.min(today, 31); i++) {
      dateRange.push(`${activePeriod.year}-${String(activePeriod.month).padStart(2, '0')}-${String(i).padStart(2, '0')}`)
    }
  }

  // To optimize, we group data by date once
  const metricsByProgram = new Map<string, MetricValue[]>()
  metricValues.forEach(mv => {
    const list = metricsByProgram.get(mv.program_id) || []
    list.push(mv)
    metricsByProgram.set(mv.program_id, list)
  })

  const inputsByProgram = new Map<string, DailyInput[]>()
  dailyInputs.forEach(di => {
    const list = inputsByProgram.get(di.program_id) || []
    list.push(di)
    inputsByProgram.set(di.program_id, list)
  })

  const completionsByMilestone = new Map<string, MilestoneCompletion>()
  milestoneCompletions.forEach(mc => {
    completionsByMilestone.set(mc.milestone_id, mc)
  })

  return dateRange.map(d => {
    const dayOfMonth = new Date(d).getDate()
    const prorationFactor = Math.min(dayOfMonth / workingDays, 1)

    // Filter values up to this date
    const dailyMetricValuesByProgram = new Map<string, MetricValue[]>()
    metricsByProgram.forEach((vals, pid) => {
      dailyMetricValuesByProgram.set(pid, vals.filter(v => v.date <= d))
    })

    const dailyInputsSliceByProgram = new Map<string, DailyInput[]>()
    inputsByProgram.forEach((vals, pid) => {
      dailyInputsSliceByProgram.set(pid, vals.filter(v => v.date <= d))
    })

    const dailyCompletionsByMilestone = new Map<string, MilestoneCompletion>()
    completionsByMilestone.forEach((val, mid) => {
      // Completed_at is ISO string or null
      if (val.completed_at && val.completed_at.split('T')[0] <= d) {
        dailyCompletionsByMilestone.set(mid, val)
      }
    })

    // Calculate health for all programs at this point in time
    const programHealths = programs.map(p => 
      calculateProgramHealth(
        p, 
        dailyMetricValuesByProgram, 
        dailyInputsSliceByProgram, 
        dailyCompletionsByMilestone, 
        prorationFactor, 
        workingDays
      )
    )

    const avgHealth = programHealths.length > 0
      ? programHealths.reduce((sum, ph) => sum + ph.healthScore, 0) / programHealths.length
      : 0

    return {
      date: d,
      displayDate: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(d)),
      health: Math.round(avgHealth)
    }
  })
}

export interface TargetTrendPoint {
  date: string
  displayDate: string
  actualRevenue: number
  targetRevenue: number
  actualUser: number
  targetUser: number
}

/**
 * Builds daily cumulative target versus actual series for Revenue and User count.
 */
export function buildTargetTrendSeries(
  programs: ProgramWithRelations[],
  metricValues: MetricValue[],
  dailyInputs: DailyInput[],
  activePeriod: Database['public']['Tables']['periods']['Row'],
  startDate?: string,
  endDate?: string
): TargetTrendPoint[] {
  const dateRange: string[] = []
  const workingDays = activePeriod.working_days || 30

  if (startDate && endDate) {
    const start = new Date(startDate); const end = new Date(endDate); const cur = new Date(start)
    while (cur <= end) { dateRange.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }
  } else {
    const today = new Date().getDate()
    for (let i = 1; i <= Math.min(today, 31); i++) {
      dateRange.push(`${activePeriod.year}-${String(activePeriod.month).padStart(2, '0')}-${String(i).padStart(2, '0')}`)
    }
  }

  // Pre-calculate total targets for all active programs
  let totalMonthlyTargetRevenue = 0
  let totalMonthlyTargetUser = 0

  programs.forEach(p => {
    const metrics = p.program_metric_definitions || []
    const revMetric = metrics.find(m => m.metric_key === 'revenue')
    const userMetric = metrics.find(m => m.metric_key === 'user_count')

    totalMonthlyTargetRevenue += (revMetric?.monthly_target || p.monthly_target_rp || 0)
    totalMonthlyTargetUser += (userMetric?.monthly_target || p.monthly_target_user || 0)
  })

  // Group data by program to avoid quadratic lookups
  const metricsByProgram = new Map<string, MetricValue[]>()
  metricValues.forEach(mv => {
    const list = metricsByProgram.get(mv.program_id) || []
    list.push(mv)
    metricsByProgram.set(mv.program_id, list)
  })

  const inputsByProgram = new Map<string, DailyInput[]>()
  dailyInputs.forEach(di => {
    const list = inputsByProgram.get(di.program_id) || []
    list.push(di)
    inputsByProgram.set(di.program_id, list)
  })

  return dateRange.map(d => {
    const dayOfMonth = new Date(d).getDate()
    const prorationFactor = Math.min(dayOfMonth / workingDays, 1)

    let dailyActualRevenue = 0
    let dailyActualUser = 0

    programs.forEach(p => {
      const defs = p.program_metric_definitions || []
      const progMetrics = metricsByProgram.get(p.id) || []
      const dayMetrics = progMetrics.filter(mv => mv.date <= d)

      // Identify metric IDs using synonyms or group
      const findIds = (group: string, keys: string[]) => 
        defs.filter(m => m.metric_group === group || keys.includes(m.metric_key?.toLowerCase())).map(m => m.id)

      const revIds = findIds('revenue', ['revenue', 'omzet', 'pemasukan', 'revenue_from_paid_traffic'])
      const acqIds = findIds('user_acquisition', ['user_count', 'closing', 'leads_converted', 'pembelian'])

      const revVal = dayMetrics.filter(mv => revIds.includes(mv.metric_definition_id)).reduce((s, v) => s + (v.value || 0), 0)
      const userVal = dayMetrics.filter(mv => acqIds.includes(mv.metric_definition_id)).reduce((s, v) => s + (v.value || 0), 0)

      // Fallback to daily inputs (legacy system)
      const progInputs = inputsByProgram.get(p.id) || []
      const dayInputs = progInputs.filter(di => di.date <= d)

      const legacyRev = dayInputs.reduce((s, i) => s + Number(i.achievement_rp || 0), 0)
      const legacyUser = dayInputs.reduce((s, i) => s + Number(i.achievement_user || 0), 0)

      dailyActualRevenue += (revVal || (revIds.length === 0 ? legacyRev : 0))
      dailyActualUser += (userVal || (acqIds.length === 0 ? legacyUser : 0))
    })

    return {
      date: d,
      displayDate: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(d)),
      actualRevenue: Math.round(dailyActualRevenue),
      targetRevenue: Math.round(totalMonthlyTargetRevenue * prorationFactor),
      actualUser: Math.round(dailyActualUser),
      targetUser: Math.round(totalMonthlyTargetUser * prorationFactor)
    }
  })
}
