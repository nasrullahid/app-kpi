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
  const legacyInputs = dailyInputsByProgram.get(program.id) || []
  
  // Aggregate manual values (SUM) from daily_metric_values table WITH Date-Level Legacy Fallback
  metrics.filter(m => m.input_type === 'manual').forEach(m => {
    const vals = progMetricValues.filter(mv => mv.metric_definition_id === m.id)
    const k = m.metric_key?.toLowerCase()
    
    // Check if this metric qualifies for legacy fallback (Revenue or User Acquisition)
    const isRevenue = m.metric_group === 'revenue' || k === 'revenue' || k === 'omzet'
    const isAcquisition = m.metric_group === 'user_acquisition' || k === 'user_count' || k === 'closing'

    if (isRevenue || isAcquisition) {
      // DATE-LEVEL MERGING LOGIC (Matches Pivot Table 0-fallback)
      const legacyField = isRevenue ? 'achievement_rp' : 'achievement_user'
      
      const allDates = new Set([
        ...vals.map(v => v.date),
        ...legacyInputs.filter(li => Number(li[legacyField] || 0) > 0).map(li => li.date)
      ])

      let unifiedSum = 0
      let hasData = false
      
      allDates.forEach(date => {
        const modern = vals.find(v => v.date === date)
        const modernVal = Number(modern?.value || 0)

        // FALLBACK LOGIC: Take legacy if modern value is missing OR exactly 0
        if (modernVal > 0) {
          unifiedSum += modernVal
          hasData = true
        } else {
          const legacy = legacyInputs.find(li => li.date === date)
          if (legacy) {
            unifiedSum += Number(legacy[legacyField] || 0)
            hasData = true
          } else if (modern) {
            // Include explicit 0 if no legacy exists for that date
            hasData = true
          }
        }
      })

      if (hasData) {
        manualValues[m.metric_key] = unifiedSum
      }
    } else {
      // Standard local-only aggregation
      if (vals.length > 0 && vals.some(v => v.value !== null)) {
        manualValues[m.metric_key] = vals.reduce((sum, v) => sum + (v.value || 0), 0)
      }
    }
  })

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
        
        // SPECIAL: For MoU programs, "Prospek" calculation is cumulative "Aktif"
        // prospek_aktif = SUM(prospek_baru) - SUM(ttd) - SUM(drop)
        if (program.target_type === 'mou' && (m.metric_key === 'leads' || m.metric_key === 'agreement_leads' || m.metric_key === 'prospek' || m.metric_key === 'prospek_kerja_sama')) {
          const totalProspekBaru = manualValues[m.metric_key] || 0
          const totalTTD = evaluatedMetrics['mou_signed'] || evaluatedMetrics['user_count'] || evaluatedMetrics['tanda_tangan_mou'] || 0
          const legacyInputs = dailyInputsByProgram.get(program.id) || []
          const totalDrop = legacyInputs.reduce((s, li) => s + (Number(li.prospek_drop) || 0), 0)
          
          // Store raw cumulative for rate calculations elsewhere (e.g. TV Dashboard)
          evaluatedMetrics['mou_total_leads_raw'] = totalProspekBaru
          evaluatedMetrics['mou_total_ttd_raw'] = totalTTD
          
          evaluatedMetrics[m.metric_key] = Math.max(0, totalProspekBaru - totalTTD - totalDrop)
        }

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
      let customTarget = 0
      let customAbsolute = 0
      let foundData = false
      
      const legacyInputs = dailyInputsByProgram.get(prog.id) || []
      const legacyField = (group === 'revenue' || keys.includes('revenue')) ? 'achievement_rp' : 'achievement_user'
      const isAdsRelated = group === 'revenue' || group === 'user_acquisition' || group === 'leads' || keys.includes('user_count') || keys.includes('revenue')

      // Identify relevant modern metrics
      const relevantDefs = definitions.filter(m => m.metric_group === group || keys.includes(m.metric_key?.toLowerCase()))
      
      // Values grouped by date for this program and metric category
      const modernValuesByDate = new Map<string, number>()
      
      relevantDefs.forEach(m => {
        const vals = progMetricValues.filter(mv => mv.metric_definition_id === m.id)
        if (vals.length > 0) foundData = true
        
        vals.forEach(v => {
          const current = modernValuesByDate.get(v.date) || 0
          modernValuesByDate.set(v.date, current + (Number(v.value) || 0))
        })

        // Target calculation
        const sumCustomTarget = vals.reduce((s, v) => s + (Number(v.target_value) || 0), 0)
        customTarget += sumCustomTarget
        
        let mTarget = m.monthly_target || 0
        if (mTarget === 0) {
          if (m.metric_group === 'revenue' || keys.includes('revenue')) {
            mTarget = (prog as unknown as { monthly_target_rp: number }).monthly_target_rp || 0
          } else if (m.metric_group === 'user_acquisition' || keys.includes('user_count')) {
            mTarget = (prog as unknown as { monthly_target_user: number }).monthly_target_user || 0
          }
        }
        const absTarget = (m.monthly_target || 0) === 0 && sumCustomTarget > 0 
          ? sumCustomTarget / prorationFactor 
          : mTarget
        customAbsolute += absTarget
      })

      // Fallback for programs without custom metrics in this group.
      // Only applies when no relevant custom metric definitions exist to prevent double-counting.
      if (relevantDefs.length === 0) {
        if (group === 'revenue' || keys.includes('revenue')) {
          customAbsolute = prog.monthly_target_rp || 0
        } else if (group === 'user_acquisition' || keys.includes('user_count')) {
          customAbsolute = prog.monthly_target_user || 0
        }
      }

      // Collect dates from both sources
      const allDates = new Set([
        ...Array.from(modernValuesByDate.keys()),
        ...(isAdsRelated ? legacyInputs.filter(li => Number(li[legacyField] || 0) > 0).map(li => li.date) : [])
      ])

      let unifiedSum = 0
      allDates.forEach(date => {
        const modernVal = modernValuesByDate.get(date)
        
        // 0-FALLBACK Logic: Use legacy if modern is missing OR exactly 0
        if (modernVal !== undefined && modernVal > 0) {
          unifiedSum += modernVal
          foundData = true
        } else if (isAdsRelated) {
          const legacy = legacyInputs.find(li => li.date === date)
          if (legacy) {
            unifiedSum += Number(legacy[legacyField] || 0)
            foundData = true
          } else if (modernVal !== undefined) {
            // Keep the 0 if it's there but no legacy fallback exists for that date
            unifiedSum += modernVal
            foundData = true
          }
        }
      })

      return { actual: unifiedSum, target: customTarget, absolute: customAbsolute, found: foundData }
    }

    const rev = getProgValue('revenue', ['revenue', 'omzet', 'pemasukan', 'revenue_from_paid_traffic'])
    const acq = getProgValue('user_acquisition', ['user_count', 'closing', 'leads_converted', 'pembelian'])
    const spd = getProgValue('ad_spend', ['ads_spent', 'ad_spend', 'budget_iklan', 'spent'])
    const lds = getProgValue('leads', ['leads', 'lead_masuk', 'prospek', 'leads_count'])

    // Update global aggregates
    const processGroup = (g: string, data: { actual: number, target: number, absolute: number, found: boolean }) => {
      // Include in totals if either data was found OR a target exists
      if (data.found || data.absolute > 0) {
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
        status: actualProgress >= prorationFactor ? 'ahead' : 'behind',
        percentage: prorationFactor * 100
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
    (m.metric_group === 'user_acquisition' || 
     ['user_count', 'mou_signed', 'agreement_count', 'closing'].includes(m.metric_key?.toLowerCase() || '')) && 
    m.is_target_metric
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

    const legacyInputs = dailyInputsByProgram?.get(prog.id) || []

    const getAdsUnifiedSum = (group: string, keys: string[], legacyField?: 'achievement_rp' | 'achievement_user'): number => {
      const relevantDefs = defs.filter(m => m.metric_group === group || keys.includes(m.metric_key?.toLowerCase()))
      const modernByDate = new Map<string, number>()
      
      relevantDefs.forEach(m => {
        const vals = progMetricValues.filter(mv => mv.metric_definition_id === m.id)
        vals.forEach(v => {
          const current = modernByDate.get(v.date) || 0
          modernByDate.set(v.date, current + (Number(v.value) || 0))
        })
      })

      const allDates = new Set([
        ...Array.from(modernByDate.keys()),
        ...(legacyField ? legacyInputs.filter(li => Number(li[legacyField] || 0) > 0).map(li => li.date) : [])
      ])

      let unified = 0
      allDates.forEach(date => {
        const modernVal = modernByDate.get(date)
        
        // Match pivot table fallback logic (0-fallback)
        if (modernVal !== undefined && modernVal > 0) {
          unified += modernVal
        } else if (legacyField) {
          const legacy = legacyInputs.find(li => li.date === date)
          if (legacy) {
            unified += Number(legacy[legacyField] || 0)
          } else if (modernVal !== undefined) {
            unified += modernVal
          }
        }
      })
      return unified
    }

    totalAdsSpent += getAdsUnifiedSum('ad_spend', ['ads_spent', 'ad_spend', 'budget_iklan', 'spent'])
    totalRevenue += getAdsUnifiedSum('revenue', ['revenue', 'omzet', 'pemasukan', 'revenue_from_paid_traffic'], 'achievement_rp')
    totalGoals += getAdsUnifiedSum('user_acquisition', ['user_count', 'closing', 'leads_converted', 'pembelian'], 'achievement_user')
    totalLeads += getAdsUnifiedSum('leads', ['leads', 'lead_masuk', 'prospek', 'leads_count'])
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
    (p.program_milestones?.length || 0) > 0 ||
    (p.monthly_target_rp || 0) > 0 ||
    (p.monthly_target_user || 0) > 0
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
      const revMetric = metrics.find(m => m.metric_key === 'revenue' || m.metric_group === 'revenue')
      const userMetric = metrics.find(m => m.metric_key === 'user_count' || m.metric_group === 'user_acquisition')

      // Only fall back to legacy fields if NO custom metric definition exists for that group.
      // This prevents double-counting when createProgram auto-creates metric definitions.
      totalMonthlyTargetRevenue += revMetric ? (Number(revMetric.monthly_target) || 0) : (p.monthly_target_rp || 0)
      totalMonthlyTargetUser += userMetric ? (Number(userMetric.monthly_target) || 0) : (p.monthly_target_user || 0)
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

// ── Status helpers ───────────────────────────────────────────────────────────
export function getStatusLabelAndColor(score: number): { label: string; dot: string; badge: string, accent: string } {
  if (score >= 100) return { label: 'Excellent', dot: 'bg-blue-500',   badge: 'text-blue-700 bg-blue-50 border-blue-200',   accent: '#FCD34D' } // Gold/Excellent
  if (score >= 80)  return { label: 'Baik',      dot: 'bg-emerald-500', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200', accent: '#639922' } // Green
  if (score >= 60)  return { label: 'Cukup',     dot: 'bg-amber-400',   badge: 'text-amber-700 bg-amber-50 border-amber-200',   accent: '#EAB308' } // Amber
  if (score >= 40)  return { label: 'Perlu perhatian', dot: 'bg-orange-500', badge: 'text-orange-700 bg-orange-50 border-orange-200', accent: '#378ADD' } // Blue/Info
  return { label: 'Kritis', dot: 'bg-red-500', badge: 'text-red-700 bg-red-50 border-red-200', accent: '#E24B4A' } // Red
}

export function getProgressColor(score: number) {
  if (score >= 100) return 'bg-blue-500'
  if (score >= 80)  return 'bg-emerald-500'
  if (score >= 60)  return 'bg-amber-400'
  if (score >= 40)  return 'bg-orange-500'
  return 'bg-red-500'
}

export function getBannerInfo(score: number) {
  if (score < 40)  return { text: 'Target jauh tertinggal — fokus dan kejar sekarang! 💪', bg: 'bg-[#FCEBEB]', border: 'border-[#F7C1C1]', textCol: 'text-[#791F1F]', accent: '#E24B4A' }
  if (score < 60)  return { text: 'Masih ada waktu — tingkatkan intensitas! 🔥', bg: 'bg-orange-50', border: 'border-orange-200', textCol: 'text-orange-800', accent: '#F97316' }
  if (score < 80)  return { text: 'Progres bagus — jangan kendur! 🎯', bg: 'bg-blue-50', border: 'border-blue-200', textCol: 'text-blue-800', accent: '#3B82F6' }
  if (score < 100) return { text: 'Hampir sampai — satu langkah lagi! 🚀', bg: 'bg-indigo-50', border: 'border-[#EEEDFE]', textCol: 'text-[#534AB7]', accent: '#6366F1' }
  if (score < 105) return { text: 'ALHAMDULILLAH TARGET TERCAPAI 🏆', bg: 'bg-emerald-50', border: 'border-emerald-200', textCol: 'text-emerald-800', accent: '#10B981' }
  return { text: 'MASYAALLAH WOW TARGET TERLAMPAUI! 🚀', bg: 'bg-blue-50', border: 'border-blue-200', textCol: 'text-blue-800', accent: '#3B82F6' }
}
