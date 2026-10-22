import type { RecurringIncomeSource } from '../classification/recurring-income-detector'
import type { DataAvailability, FinancialAnalysisConfig, NormalizedTransactionInput } from '../financial-analysis.types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type EmploymentType = 'SALARIED' | 'BUSINESS' | 'GIG' | 'UNKNOWN'
export type IncomeConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_TENURE'

export interface IncomeProfile {
  availability: DataAvailability
  employmentType: EmploymentType
  tenureMonths: number | null
  confidenceLevel: IncomeConfidenceLevel | null
  confidenceDowngradeReason: string | null
  /**
   * The primary recurring income source's own average monthly amount — the
   * "Normalized monthly income (current)" the spec's own Income Source
   * Tracking (§6.2) defines as "median of monthly credits" for that source.
   * CRITICAL: never divide total income by the whole statement window
   * (months.length) to get this — a statement spanning an income
   * transition or employment ramp-up has real months with zero recurring
   * income before the current source existed, which silently understates
   * the customer's actual CURRENT income the longer those zero months are.
   * Confirmed against a real statement: averaging ₹0×4 + ₹99,715 + ₹1,10,613×7
   * over all 12 months produces ₹72,834 — a materially wrong "current
   * income" figure when the real, current, stable salary is ₹1,10,613/month.
   */
  currentMonthlyAmount: number | null
}

/**
 * v4.0 spec §6.2-6.4: employment-type classification + the tenure-based
 * confidence downgrade ladder (>=12mo none, 6-11mo one level,
 * 3-5mo two levels, <3mo INSUFFICIENT_TENURE). This is deliberately
 * informational-only — it layers employment-type + tenure context on top
 * of the EXISTING, unchanged `incomeStabilityScore()` 9-component result;
 * it never recomputes or replaces that score. The spec's own three
 * DIFFERENT per-employment-type stability formulas (salaried uses
 * consistency/variance/employer-changes; business uses rolling-average/
 * income-floor/seasonality; gig uses platform-count/trend) are NOT
 * implemented — only the classification + tenure-confidence layer is,
 * since re-deriving three separate scoring algorithms would mean
 * maintaining a second, competing stability score alongside the one this
 * task explicitly requires to stay unchanged.
 */
export function buildIncomeProfile(sources: RecurringIncomeSource[]): IncomeProfile {
  if (sources.length === 0) {
    return { availability: 'NOT_REPORTED', employmentType: 'UNKNOWN', tenureMonths: null, confidenceLevel: null, confidenceDowngradeReason: null, currentMonthlyAmount: null }
  }

  const primary = sources[0] // detectRecurringIncome() already sorts by averageAmount desc
  const employmentType: EmploymentType =
    primary.subcategory === 'Salary' ? 'SALARIED' : primary.subcategory === 'Business income' ? 'BUSINESS' : primary.subcategory === 'Gig income' ? 'GIG' : 'UNKNOWN'

  const tenureMonths = primary.monthsPresent
  let confidenceLevel: IncomeConfidenceLevel
  let confidenceDowngradeReason: string | null

  if (tenureMonths < 3) {
    confidenceLevel = 'INSUFFICIENT_TENURE'
    confidenceDowngradeReason = `Only ${tenureMonths} month(s) of recurring-income history — insufficient tenure to assess confidently.`
  } else if (tenureMonths <= 5) {
    confidenceLevel = 'LOW'
    confidenceDowngradeReason = `${tenureMonths} months of tenure — confidence downgraded two levels from HIGH.`
  } else if (tenureMonths <= 11) {
    confidenceLevel = 'MEDIUM'
    confidenceDowngradeReason = `${tenureMonths} months of tenure — confidence downgraded one level from HIGH.`
  } else {
    confidenceLevel = 'HIGH'
    confidenceDowngradeReason = null
  }

  return { availability: 'AVAILABLE', employmentType, tenureMonths, confidenceLevel, confidenceDowngradeReason, currentMonthlyAmount: Math.round(primary.averageAmount) }
}

export interface DaysToNextIncomeResult {
  availability: DataAvailability
  daysToNextIncome: number | null
  nextExpectedDate: Date | null
  reason: string
}

/**
 * v4.0 spec §10: "days to next income" — only ever computed when the
 * primary recurring income source has enough history
 * (recurringIncomeMinMonths) AND its credit dates fall on a sufficiently
 * consistent day-of-month (stddev below config threshold). Otherwise
 * returns NOT_AVAILABLE with a reason — never a guessed date.
 */
export function computeDaysToNextIncome(
  transactions: NormalizedTransactionInput[],
  primarySource: RecurringIncomeSource | null,
  referenceDate: Date,
  config: FinancialAnalysisConfig,
): DaysToNextIncomeResult {
  const unavailable = (reason: string): DaysToNextIncomeResult => ({ availability: 'INSUFFICIENT_DATA', daysToNextIncome: null, nextExpectedDate: null, reason })

  if (!primarySource) return unavailable('No recurring income source was identified in the statement.')
  const incomeDates = transactions
    .filter((t) => t.direction === 'CREDIT' && t.category === 'INCOME' && t.subcategory === primarySource.subcategory)
    .map((t) => t.transactionDate)
    .sort((a, b) => a.getTime() - b.getTime())

  if (incomeDates.length < config.recurringIncomeMinMonths) {
    return unavailable(`Only ${incomeDates.length} occurrence(s) of this income source were found — below the ${config.recurringIncomeMinMonths}-month minimum.`)
  }

  const daysOfMonth = incomeDates.map((d) => d.getUTCDate())
  const meanDay = daysOfMonth.reduce((s, d) => s + d, 0) / daysOfMonth.length
  const variance = daysOfMonth.reduce((s, d) => s + (d - meanDay) ** 2, 0) / daysOfMonth.length
  const stdDev = Math.sqrt(variance)

  if (stdDev > config.incomeDayOfMonthMaxStdDevDays) {
    return unavailable(`Income credit dates vary by day ${Math.round(stdDev)} (stddev) — too inconsistent to project a next expected date.`)
  }

  const last = incomeDates[incomeDates.length - 1]
  const nextExpectedDate = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, Math.round(meanDay)))
  const daysToNextIncome = Math.round((nextExpectedDate.getTime() - referenceDate.getTime()) / MS_PER_DAY)

  return { availability: 'AVAILABLE', daysToNextIncome, nextExpectedDate, reason: `Projected from ${incomeDates.length} consistent occurrences (day-of-month stddev ${Math.round(stdDev * 10) / 10}).` }
}
