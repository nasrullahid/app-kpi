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
  status: 'KRITIS' | 'PERHATIAN' | 'SEHAT'
  totalTargetMetrics: number
  isQualitativeOnly: boolean
  calculatedMetrics?: Record<string, number | null>
  effectiveTargets?: Record<string, number> // Stores prorated targets for health calculation
  absoluteTargets?: Record<string, number>  // Stores full monthly targets for UI display
}

export interface MetricComparison {
  value: number | null
  percentage?: number | null
  status?: 'ahead' | 'behind' | 'on track' | 'sehat' | 'perhatian' | 'kritis' | 'improving' | 'declining'
  label: string
  type: 'flow' | 'ratio' | 'target' | 'status' | 'index'
}

export function getHealthStatus(score: number): ProgramHealthResult['status'] {
  if (score < 50) return 'KRITIS'
  if (score <= 80) return 'PERHATIAN'
  return 'SEHAT'
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

  // ── RE-INTRODUCTION OF LEGACY ACHIEVEMENT FALLBACK ─────────────────────────
  // If we have 0/null in revenue or user_count from metrics, check daily_inputs
  const legacyInputs = dailyInputsByProgram.get(program.id) || []
  if (!manualValues['revenue'] || manualValues['revenue'] === 0) {
    const legacySum = legacyInputs.reduce((sum, i) => sum + Number(i.achievement_rp || 0), 0)
    if (legacySum > 0) manualValues['revenue'] = legacySum
  }
  if (!manualValues['user_count'] || manualValues['user_count'] === 0) {
    const legacySum = legacyInputs.reduce((sum, i) => sum + Number(i.achievement_user || 0), 0)
    if (legacySum > 0) manualValues['user_count'] = legacySum
  }
  // ───────────────────────────────────────────────────────────────────────────

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
        const mTarget = m.monthly_target || 0
        
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

      // Fallback: If no primary metrics have non-zero targets, use Milestone progress
      let healthScore = validMetrics > 0 ? sumPercentage / validMetrics : 0
      
      let isQualitativeOnly = false
      const progMilestones = program.program_milestones || []
      if (validMetrics === 0) {
        if (progMilestones.length > 0) {
          const completedMilestones = progMilestones.filter(m => milestoneCompletionsByMilestone.get(m.id)?.is_completed).length
          healthScore = (completedMilestones / progMilestones.length) * 100
          isQualitativeOnly = true
        } else {
          // New: If no primary metrics have targets, check if there's any achievement in primary metrics
          const hasAnyAchievement = primaryMetrics.some(m => (evaluatedMetrics[m.metric_key] || 0) > 0)
          if (hasAnyAchievement) healthScore = 100
        }
      }

      return {
        programId: program.id,
        healthScore,
        status: getHealthStatus(healthScore),
        totalTargetMetrics: validMetrics,
        isQualitativeOnly,
        calculatedMetrics: evaluatedMetrics,
        effectiveTargets,
        absoluteTargets
      }
    }
  }

  // ── Case 2: Qualitative only (milestone-based) fallback ─────────────────
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
export interface AggregateItem {
  actual: number
  target: number
  totalTarget: number
  isComputed: boolean
  comparison?: MetricComparison
  requiredDaily?: number
}

export function aggregateByMetricGroup(
  programs: ProgramWithRelations[],
  metricValuesByProgram: Map<string, MetricValue[]>,
  dailyInputsByProgram: Map<string, DailyInput[]>,
  prorationFactor: number
): Record<string, AggregateItem> {
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
    
    // Group definitions by category
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
          
          const sumCustomTarget = vals.reduce((s, v) => s + (Number(v.target_value) || 0), 0)
          customTarget += sumCustomTarget
          
          let mTarget = m.monthly_target || 0
          
          // Fallback to program-level target if metric definition is uninitialized (0)
          if (mTarget === 0) {
            if (m.metric_group === 'revenue' || keys.includes('revenue')) {
              mTarget = (prog as unknown as { monthly_target_rp: number }).monthly_target_rp || 0
            } else if (m.metric_group === 'user_acquisition' || keys.includes('user_count')) {
              mTarget = (prog as unknown as { monthly_target_user: number }).monthly_target_user || 0
            }
          }

          // Important: Reconstruct absolute target from periodized targets if monthly is 0
          const absTarget = (m.monthly_target || 0) === 0 && sumCustomTarget > 0 
            ? sumCustomTarget / prorationFactor 
            : mTarget

          customAbsolute += absTarget
        }
      })

      // LEGACY FALLBACK for aggregation
      if (customSum === 0) {
        const legacyInputs = dailyInputsByProgram.get(prog.id) || []
        if (group === 'revenue' || keys.includes('revenue')) {
          const lSum = legacyInputs.reduce((sum, i) => sum + Number(i.achievement_rp || 0), 0)
          if (lSum > 0) {
            customSum = lSum
            foundCustom = true
          }
        } else if (group === 'user_acquisition' || keys.includes('user_count')) {
          const lSum = legacyInputs.reduce((sum, i) => sum + Number(i.achievement_user || 0), 0)
          if (lSum > 0) {
            customSum = lSum
            foundCustom = true
          }
        }
      }
      
      return { actual: customSum, target: customTarget, absolute: customAbsolute, found: foundCustom }
    }

    const rev = getProgValue('revenue', ['revenue', 'omzet', 'pemasukan', 'revenue_from_paid_traffic'])
    const acq = getProgValue('user_acquisition', ['user_count', 'closing', 'leads_converted', 'pembelian'])
    const spd = getProgValue('ad_spend', ['ads_spent', 'ad_spend', 'budget_iklan', 'spent'])
    const lds = getProgValue('leads', ['leads', 'lead_masuk', 'prospek', 'leads_count'])

    // Update global aggregates
    const processGroup = (g: string, data: { actual: number, target: number, absolute: number, found: boolean }) => {
      if (data.found) {
        existingGroups.add(g)
        groupRawTotals[g].actual += data.actual
        
        // Use custom targets (either periodized sum or monthly prorated)
        groupRawTotals[g].target += data.target > 0 ? data.target : (data.absolute * prorationFactor)
        groupRawTotals[g].totalTarget += data.absolute
      }
    }

    processGroup('revenue', rev)
    processGroup('user_acquisition', acq)
    
    if (spd.found) {
      existingGroups.add('ad_spend')
      groupRawTotals.ad_spend.actual += spd.actual
      groupRawTotals.ad_spend.target += spd.target > 0 ? spd.target : (spd.absolute * prorationFactor)
      groupRawTotals.ad_spend.totalTarget += spd.absolute
    }
    if (lds.found) {
      existingGroups.add('leads')
      groupRawTotals.leads.actual += lds.actual
    }

    // Mark as existing for computed metrics
    if (definitions.some(m => m.metric_group === 'conversion')) existingGroups.add('conversion')
    if (definitions.some(m => m.metric_group === 'efficiency')) existingGroups.add('efficiency')
  })


  const result: Record<string, AggregateItem> = {}

  Object.keys(groupRawTotals).forEach(g => {
    if (existingGroups.has(g)) {
      const { actual, target, totalTarget } = groupRawTotals[g]
      const actualProgress = totalTarget > 0 ? actual / totalTarget : 0
      
      const comparison: MetricComparison | undefined = (g === 'revenue' || g === 'user_acquisition') ? {
        value: actual,
        type: 'target',
        label: 'vs expected progress',
        status: actualProgress >= prorationFactor ? 'ahead' : 'behind'
      } : undefined

      result[g] = { actual, target, totalTarget, isComputed: false, comparison }
    }
  })

  // Conversion
  if (existingGroups.has('conversion')) {
    const acq = groupRawTotals['user_acquisition']?.actual || 0
    const lds = groupRawTotals['leads']?.actual || 0
    const actual = lds > 0 ? (acq / lds) * 100 : 0
    result['conversion'] = { actual, target: 0, totalTarget: 0, isComputed: true }
  }

  // Efficiency
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


export function isAdsProgram(metrics: MetricDefinition[]): boolean {
  if (!metrics || metrics.length === 0) return false
  
  // Exclude MoU programs as they have their own tab
  if (isMouProgram(metrics)) return false

  // Include if it has specific ads metrics
  return metrics.some(m => 
    m.metric_group === 'ad_spend' ||
    ['ads_spent', 'leads', 'roas', 'cpp', 'cpm', 'cpc', 'adds_to_cart', 'conversion_rate', 'cost_per_goal'].includes(m.metric_key)
  )
}

export function isMouProgram(metrics: MetricDefinition[]): boolean {
  if (!metrics || metrics.length === 0) return false
  
  // MoU program tracks users/closing but NOT revenue as a target
  const hasUserTarget = metrics.some(m => 
    (m.metric_group === 'user_acquisition' || m.metric_key === 'user_count') && m.is_target_metric
  )
  const hasRevenueTarget = metrics.some(m => 
    (m.metric_group === 'revenue' || m.metric_key === 'revenue') && m.is_target_metric
  )
  
  return hasUserTarget && !hasRevenueTarget
}

export interface AdsAggregateResult {
  totalAdsSpent: number
  totalRevenue: number
  totalGoals: number
  totalLeads: number
  avgRoas: number   // total_revenue / total_ads_spent (weighted)
  avgCpp: number    // total_ads_spent / total_goals (weighted)
  avgCr: number     // total_goals / total_leads (weighted)
  comparisons?: Record<string, MetricComparison>
}

/**
 * Aggregates ads metrics across programs using weighted averages.
 */
export function aggregateAdsMetrics(
  programs: ProgramWithRelations[],
  metricValuesByProgram: Map<string, MetricValue[]>,
  dailyInputsByProgram?: Map<string, DailyInput[]>
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

    // If no goals from modern metrics, fallback to legacy achievement_user ONLY IF it's an ads program
    if (totalGoals === 0 && isAdsProgram(defs)) {
      const legacyInputs = dailyInputsByProgram?.get(prog.id) || []
      const lGoals = legacyInputs.reduce((sum: number, i: Database['public']['Tables']['daily_inputs']['Row']) => sum + Number(i.achievement_user || 0), 0)
      const lRev = legacyInputs.reduce((sum: number, i: Database['public']['Tables']['daily_inputs']['Row']) => sum + Number(i.achievement_rp || 0), 0)
      totalGoals += lGoals
      totalRevenue += lRev
    }
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

export interface GlobalKPIResult {
  avgHealth: number
  activeProgramsCount: number
  totalPrograms: number
  targetsHit: number
  totalMilestones: number
  completedMilestones: number
  healthStatus: ProgramHealthResult['status']
  comparison?: MetricComparison
}

/**
 * Universal KPI aggregation for Overview Tab
 */
export function aggregateGlobalKPIs(
  programResults: ProgramHealthResult[],
  programs: ProgramWithRelations[],
  milestoneCompletions: MilestoneCompletion[]
): GlobalKPIResult {
  const totalPrograms = programs.length
  const activeProgramsCount = programs.filter(p => 
    (p.program_metric_definitions?.length || 0) > 0 || 
    (p.program_milestones?.length || 0) > 0
  ).length
  
  const avgHealth = programResults.length > 0 
    ? programResults.reduce((sum, r) => sum + r.healthScore, 0) / programResults.length 
    : 0

  const targetsHit = programResults.filter(r => r.healthScore >= 100).length
  
  const totalMilestones = programs.reduce((sum, p) => sum + (p.program_milestones?.length || 0), 0)
  const completedMilestones = milestoneCompletions.filter(c => c.is_completed).length

  const healthStatus = getHealthStatus(avgHealth)

  return {
    avgHealth,
    activeProgramsCount,
    totalPrograms,
    targetsHit,
    totalMilestones,
    completedMilestones,
    healthStatus,
    comparison: {
      value: avgHealth,
      type: 'index',
      label: '● Health Score',
      status: healthStatus.toLowerCase() as 'sehat' | 'perhatian' | 'kritis'
    }
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
  overriddenTargetRevenue?: number,
  overriddenTargetUser?: number,
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

  // Use overridden values if provided, otherwise sum up from programs
  let totalMonthlyTargetRevenue = overriddenTargetRevenue ?? 0
  let totalMonthlyTargetUser = overriddenTargetUser ?? 0

  if (overriddenTargetRevenue === undefined && overriddenTargetUser === undefined) {
    programs.forEach(p => {
      const metrics = p.program_metric_definitions || []
      const revMetric = metrics.find(m => m.metric_key === 'revenue')
      const userMetric = metrics.find(m => m.metric_key === 'user_count')

      totalMonthlyTargetRevenue += (Number(revMetric?.monthly_target) || 0)
      totalMonthlyTargetUser += (Number(userMetric?.monthly_target) || 0)
    })
  }

  const dailyTargetRevenue = totalMonthlyTargetRevenue / workingDays
  const dailyTargetUser = totalMonthlyTargetUser / workingDays

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
    let dailyActualRevenue = 0
    let dailyActualUser = 0

    programs.forEach(p => {
      const defs = p.program_metric_definitions || []
      const progMetrics = metricsByProgram.get(p.id) || []
      const dayMetrics = progMetrics.filter(mv => mv.date === d)

      // Identify metric IDs using synonyms or group
      const findIds = (group: string, keys: string[]) => 
        defs.filter(m => m.metric_group === group || keys.includes(m.metric_key?.toLowerCase())).map(m => m.id)

      const revIds = findIds('revenue', ['revenue', 'omzet', 'pemasukan', 'revenue_from_paid_traffic'])
      const acqIds = findIds('user_acquisition', ['user_count', 'closing', 'leads_converted', 'pembelian'])

      const revVal = dayMetrics.filter(mv => revIds.includes(mv.metric_definition_id)).reduce((s, v) => s + (v.value || 0), 0)
      const userVal = dayMetrics.filter(mv => acqIds.includes(mv.metric_definition_id)).reduce((s, v) => s + (v.value || 0), 0)

      // LEGACY FALLBACK for trend series
      const progInputs = inputsByProgram.get(p.id)?.filter(di => di.date === d) || []
      const legacyRev = progInputs.reduce((s, v) => s + (Number(v.achievement_rp) || 0), 0)
      const legacyUser = progInputs.reduce((s, v) => s + (Number(v.achievement_user) || 0), 0)

      dailyActualRevenue += (revVal || legacyRev)
      dailyActualUser += (userVal || legacyUser)
    })

    return {
      date: d,
      displayDate: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(d)),
      actualRevenue: Math.round(dailyActualRevenue),
      targetRevenue: Math.round(dailyTargetRevenue),
      actualUser: Math.round(dailyActualUser),
      targetUser: Math.round(dailyTargetUser)
    }
  })
}

// ─── Stat Helpers ─────────────────────────────────────────────────────────────

/**
 * Calculates a rolling average for a sequence of daily values.
 * windowDays: number of days to look back for the average.
 * endDate: the reference end date (ISO string).
 * values: array of { date, value } objects.
 */
export function getRollingAverage(
  values: { date: string; value: number }[],
  endDate: string,
  windowDays: number = 3
): number {
  if (values.length === 0) return 0
  
  const targetDate = new Date(endDate)
  const windowStart = new Date(targetDate)
  windowStart.setDate(targetDate.getDate() - windowDays + 1)
  
  const startStr = windowStart.toISOString().split('T')[0]
  
  const windowValues = values.filter(v => v.date >= startStr && v.date <= endDate)
  if (windowValues.length === 0) return 0
  
  const sum = windowValues.reduce((acc, v) => acc + (v.value || 0), 0)
  return sum / windowDays // Always divide by window length for consistency
}

/**
 * Calculates expected progress (0.0 to 1.0) based on elapsed days.
 */
export function calculateExpectedProgress(elapsedDays: number, totalDays: number): number {
  if (totalDays <= 0) return 0
  return Math.min(elapsedDays / totalDays, 1)
}

/**
 * Standard growth / change calculation with safety checks.
 */
export function calculateGrowth(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : 0
  if (previous === null || current === null) return null
  return ((current - previous) / previous) * 100
}
