/**
 * Safe Formula Evaluator
 * 
 * Evaluates metric formulas without using eval().
 * Supports operators: + - * /
 * Tokens can be metric_keys (resolved from `values`) or numeric literals.
 * 
 * Examples:
 *   'omzet / budget_iklan'      → ROAS
 *   'closing / lead_masuk'      → Conversion Rate (as decimal, * 100 for %)
 *   'budget_iklan / closing'    → CPP Real
 */

type TokenType = 'number' | 'operator' | 'identifier' | 'logic' | 'symbol'

interface Token {
  type: TokenType
  value: string
}

export type MetricForOrdering = {
  metric_key: string;
  input_type: "manual" | "calculated";
  formula?: string | null;
};

const ALLOWED_OPERATORS = new Set(['+', '-', '*', '/'])
const LOGIC_OPERATORS = new Set(['>', '<', '>=', '<=', '==', '!='])
const FUNCTION_NAMES = new Set(['IF', 'AVG'])

/**
 * Tokenize a formula string into a flat list of tokens.
 */
function tokenize(formula: string): Token[] {
  const tokens: Token[] = []
  const cleaned = formula.trim()
  
  // Split on symbols and operators while keeping them
  // Order matters for multi-character operators (>= before >)
  const regex = /([+\-*/(),]|>=|<=|==|!=|>|<)/
  const parts = cleaned.split(regex).map(p => p.trim()).filter(Boolean)
  
  for (const part of parts) {
    if (ALLOWED_OPERATORS.has(part)) {
      tokens.push({ type: 'operator', value: part })
    } else if (LOGIC_OPERATORS.has(part)) {
      tokens.push({ type: 'logic', value: part })
    } else if (part === '(' || part === ')' || part === ',') {
      tokens.push({ type: 'symbol', value: part })
    } else if (/^\d+(\.\d+)?$/.test(part)) {
      tokens.push({ type: 'number', value: part })
    } else if (/^[a-z_][a-z0-9_]*$/i.test(part)) {
      tokens.push({ type: 'identifier', value: part })
    } else {
      throw new Error(`Invalid token in formula: "${part}"`)
    }
  }
  
  return tokens
}


/**
 * Recursive Parser for Formulas with IF support.
 * Implements standard operator precedence (PEMDAS).
 */
class Parser {
  private pos = 0
  private tokens: Token[]
  private values: Record<string, number | null>

  constructor(tokens: Token[], values: Record<string, number | null>) {
    this.tokens = tokens
    this.values = values
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private consume(): Token {
    return this.tokens[this.pos++]
  }

  private expect(type: TokenType, value?: string): Token {
    const t = this.peek()
    if (!t || t.type !== type || (value && t.value !== value)) {
      throw new Error(`Expected ${type}${value ? ':' + value : ''}`)
    }
    return this.consume()
  }

  /**
   * Addition and Subtraction
   */
  public parseExpression(): number | null {
    let left = this.parseTerm()
    
    while (true) {
      const t = this.peek()
      if (t && t.type === 'operator' && (t.value === '+' || t.value === '-')) {
        this.consume()
        const op = t.value
        const right = this.parseTerm()
        if (left === null || right === null) {
          left = null
        } else {
          left = op === '+' ? left + right : left - right
        }
      } else {
        break
      }
    }
    return left
  }

  /**
   * Multiplication and Division
   */
  private parseTerm(): number | null {
    let left = this.parseFactor()
    
    while (true) {
      const t = this.peek()
      if (t && t.type === 'operator' && (t.value === '*' || t.value === '/')) {
        this.consume()
        const op = t.value
        const right = this.parseFactor()
        if (left === null || right === null) {
          left = null
        } else {
          if (op === '/') {
            if (right === 0) return null
            left = left / right
          } else {
            left = left * right
          }
        }
      } else {
        break
      }
    }
    return left
  }

  /**
   * Atoms: Numbers, Identifiers, Functions
   */
  private parseFactor(): number | null {
    const t = this.peek()
    if (!t) throw new Error('Unexpected end of formula')

    if (t.type === 'number') {
      return parseFloat(this.consume().value)
    }

    if (t.type === 'identifier') {
      const name = this.consume().value
      const upper = name.toUpperCase()

      // Function Call
      if (upper === 'IF') {
        return this.parseIfFunction()
      }
      if (upper === 'AVG') {
        return this.parseAvgFunction()
      }

      // Metric Resolver
      const v = this.values[name]
      return v ?? null
    }

    if (t.type === 'symbol' && t.value === '(') {
      this.consume()
      const result = this.parseExpression()
      this.expect('symbol', ')')
      return result
    }

    throw new Error(`Unexpected token type in factor: ${t.type} (${t.value})`)
  }

  private parseIfFunction(): number | null {
    this.expect('symbol', '(')
    
    // 1. Parse Condition
    const condLeft = this.parseExpression()
    const opToken = this.expect('logic')
    const condRight = this.parseExpression()
    
    let conditionResult = false
    if (condLeft !== null && condRight !== null) {
      switch (opToken.value) {
        case '>': conditionResult = condLeft > condRight; break
        case '<': conditionResult = condLeft < condRight; break
        case '>=': conditionResult = condLeft >= condRight; break
        case '<=': conditionResult = condLeft <= condRight; break
        case '==': conditionResult = condLeft === condRight; break
        case '!=': conditionResult = condLeft !== condRight; break
      }
    } else {
      // Any null in condition → null result for IF
      // But we must still consume the rest of the arguments
      this.expect('symbol', ',')
      this.skipExpression() // true branch
      this.expect('symbol', ',')
      this.skipExpression() // false branch
      this.expect('symbol', ')')
      return null
    }

    this.expect('symbol', ',')
    
    if (conditionResult) {
      const result = this.parseExpression()
      this.expect('symbol', ',')
      this.skipExpression()
      this.expect('symbol', ')')
      return result
    } else {
      this.skipExpression()
      this.expect('symbol', ',')
      const result = this.parseExpression()
      this.expect('symbol', ')')
      return result
    }
  }

  private parseAvgFunction(): number | null {
    this.expect('symbol', '(')
    
    const values: number[] = []
    
    while (true) {
      const t = this.peek()
      if (!t) throw new Error('Unterminated AVG function')
      
      if (t.type === 'identifier') {
        const name = this.consume().value
        const val = this.values[name]
        if (val !== null && val !== undefined) {
          values.push(val)
        }
      } else {
        throw new Error(`AVG function arguments must be metric keys, found ${t.type}`)
      }
      
      const next = this.peek()
      if (next && next.type === 'symbol' && next.value === ',') {
        this.consume()
      } else if (next && next.type === 'symbol' && next.value === ')') {
        this.consume()
        break
      } else {
        throw new Error('Expected "," or ")" in AVG function')
      }
    }
    
    if (values.length === 0) return null
    const sum = values.reduce((s, v) => s + v, 0)
    return sum / values.length
  }

  /**
   * Consume tokens for an expression without evaluating (used for skipping branches)
   */
  private skipExpression(): void {
    let depth = 0
    while (true) {
      const t = this.peek()
      if (!t) break
      if (t.type === 'symbol' && t.value === '(') depth++
      if (t.type === 'symbol' && t.value === ')') {
        if (depth === 0) break
        depth--
      }
      if (t.type === 'symbol' && t.value === ',' && depth === 0) break
      this.consume()
    }
  }
}

/**
 * Evaluate a formula string with given metric values.
 */
export function evaluateFormula(
  formula: string,
  values: Record<string, number | null>
): number | null {
  if (!formula || formula.trim() === '') return null

  let tokens: Token[]
  try {
    tokens = tokenize(formula)
  } catch {
    return null
  }

  if (tokens.length === 0) return null

  try {
    const parser = new Parser(tokens, values)
    const result = parser.parseExpression()
    return result
  } catch {
    return null
  }
}

/**
 * Extract dependencies (metric keys) from a formula string.
 */
function getFormulaDependencies(formula: string): string[] {
  if (!formula) return []
  
  // Find all words that start with a letter/underscore and contain letters/numbers/underscores
  // but are NOT logic operators, and NOT purely numbers.
  const parts = formula.split(/[\s+\-*/(),><=!]+/).filter(Boolean)
  const dependencies = new Set<string>()
  
  for (const part of parts) {
    // Skip numbers
    if (/^\d+(\.\d+)?$/.test(part)) continue
    
    const upper = part.toUpperCase()
    // Skip function names
    if (FUNCTION_NAMES.has(upper)) continue
    // Skip literal keywords if any
    
    // Check if it's a valid identifier
    if (/^[a-z_][a-z0-9_]*$/i.test(part)) {
      dependencies.add(part)
    }
  }
  
  return Array.from(dependencies)
}

/**
 * Resolve the order in which metrics should be calculated based on their dependencies.
 * Uses topological sort.
 */
export function resolveCalculationOrder(
  metrics: MetricForOrdering[]
): MetricForOrdering[] {
  const manualMetrics = metrics.filter(m => m.input_type === 'manual')
  const calculatedMetrics = metrics.filter(m => m.input_type === 'calculated')
  
  const metricMap = new Map<string, MetricForOrdering>()
  metrics.forEach(m => metricMap.set(m.metric_key, m))
  
  const visited = new Set<string>()
  const recStack = new Set<string>()
  const result: MetricForOrdering[] = []
  
  function visit(key: string) {
    if (recStack.has(key)) {
      throw new Error(`Circular dependency detected involving metric: "${key}"`)
    }
    if (visited.has(key)) return
    
    const metric = metricMap.get(key)
    if (!metric) return // External dependency or typo in formula — skip
    
    if (metric.input_type === 'calculated' && metric.formula) {
      recStack.add(key)
      const deps = getFormulaDependencies(metric.formula)
      for (const dep of deps) {
        visit(dep)
      }
      recStack.delete(key)
    }
    
    visited.add(key)
    result.push(metric)
  }
  
  // Start with manual metrics to ensure they come first
  manualMetrics.forEach(m => visit(m.metric_key))
  
  // Then visit all calculated metrics
  calculatedMetrics.forEach(m => visit(m.metric_key))
  
  return result
}

/**
 * Evaluate all metrics in the correct order.
 */
export function evaluateAllMetrics(
  metrics: MetricForOrdering[],
  manualValues: Record<string, number | null>
): Record<string, number | null> {
  const orderedMetrics = resolveCalculationOrder(metrics)
  const results: Record<string, number | null> = { ...manualValues }
  
  for (const m of orderedMetrics) {
    if (m.input_type === 'calculated') {
      if (m.formula) {
        results[m.metric_key] = evaluateFormula(m.formula, results)
      } else {
        results[m.metric_key] = null
      }
    } else {
      // Manual values are already in `results` from initialization
      // but we ensure we only return manual values that are in the input list
      results[m.metric_key] = manualValues[m.metric_key] ?? null
    }
  }
  
  return results
}

/**
 * Format a metric value for display based on its data_type.
 */
export function formatMetricValue(
  value: number | null,
  dataType: 'integer' | 'currency' | 'percentage' | 'float' | 'boolean',
  unitLabel?: string | null
): string {
  if (value === null || value === undefined) return '—'
  
  switch (dataType) {
    case 'currency': {
      if (value >= 1_000_000_000) {
        return `Rp ${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}M`
      }
      if (value >= 1_000_000) {
        return `Rp ${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}jt`
      }
      return `Rp ${value.toLocaleString('id-ID')}`
    }
    case 'percentage':
      return `${(value * 100).toFixed(1)}%`
    case 'float':
      return `${value.toFixed(2)}${unitLabel ? ' ' + unitLabel : ''}`
    case 'integer':
      return `${Math.round(value).toLocaleString('id-ID')}${unitLabel ? ' ' + unitLabel : ''}`
    case 'boolean':
      return value ? 'Ya' : 'Tidak'
    default:
      return `${value}${unitLabel ? ' ' + unitLabel : ''}`
  }
}
