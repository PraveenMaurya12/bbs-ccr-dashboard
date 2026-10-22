import { narrationFingerprint } from '../classification/recurring-cluster-utils'
import type { RecurringIncomeSource } from '../classification/recurring-income-detector'
import type { FinancialAnalysisConfig, MonthlyFinancialAggregateInput, NormalizedTransactionInput } from '../financial-analysis.types'

function sum(values: number[]): number {
  return values.reduce((t, v) => t + v, 0)
}
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

// --- Bonus detection (v4.0 spec §6.5) -----------------------------------

export interface BonusEntry {
  transactionDate: Date
  amount: number
  multipleOfSalary: number
}

export interface BonusDetectionResult {
  transactions: NormalizedTransactionInput[]
  bonuses: BonusEntry[]
}

/**
 * A CREDIT the classify/recurring-income passes left UNCLASSIFIED or OTHER
 * (i.e. not already a confident income/borrowing/transfer/cash
 * classification, and not part of a recurring-income cluster) whose amount
 * exceeds `bonusSalaryMultiplier` x the largest detected recurring income
 * source is reclassified to INCOME/Bonus, INFERRED (never DERIVED — a
 * one-off large credit's true nature is never structurally certain the way
 * a keyword match is). Requires at least one real recurring income source
 * to establish a baseline; without one, bonus detection cannot run at all
 * (never guesses a baseline).
 *
 * Also admits a TRANSFERS/P2P-transfer candidate, but ONLY when its own
 * narration fingerprint matches an ALREADY-CONFIRMED recurring income
 * source's fingerprint — i.e. same employer, different one-off purpose
 * code. Confirmed against a real statement: a Diwali bonus arrives as
 * "IMPS/.../GOLDENLE/AUSMALLF/DiwaliBo/..." — the generic transfer-rail
 * catch-all classifies it P2P transfer since "DiwaliBo" matches no income
 * keyword, which would otherwise hide a real, employer-confirmed bonus
 * entirely. This is deliberately narrower than admitting all TRANSFERS
 * credits (which would risk misreading a large one-off family/friend
 * transfer as a bonus) — the fingerprint match is the same real evidence
 * already used to confirm that employer as a recurring income source.
 */
export function detectBonuses(transactions: NormalizedTransactionInput[], sources: RecurringIncomeSource[], config: FinancialAnalysisConfig): BonusDetectionResult {
  if (sources.length === 0) return { transactions, bonuses: [] }
  const baselineSalary = Math.max(...sources.map((s) => s.averageAmount))
  const threshold = baselineSalary * config.bonusSalaryMultiplier
  const confirmedIncomeFingerprints = new Set(sources.map((s) => s.narrationFingerprint))

  const bonuses: BonusEntry[] = []
  const upgraded = new Map<NormalizedTransactionInput, NormalizedTransactionInput>()

  for (const t of transactions) {
    if (t.direction !== 'CREDIT') continue
    const isGenericCandidate = t.category === 'UNCLASSIFIED' || t.category === 'OTHER'
    const isSameEmployerTransfer = t.category === 'TRANSFERS' && confirmedIncomeFingerprints.has(narrationFingerprint(t.narrationDetail?.counterpartyRaw || t.narration))
    if (!isGenericCandidate && !isSameEmployerTransfer) continue
    if (t.amount < threshold) continue
    bonuses.push({ transactionDate: t.transactionDate, amount: t.amount, multipleOfSalary: Math.round((t.amount / baselineSalary) * 100) / 100 })
    upgraded.set(t, { ...t, category: 'INCOME', subcategory: 'Bonus', evidenceLevel: 'INFERRED' })
  }

  return { transactions: upgraded.size > 0 ? transactions.map((t) => upgraded.get(t) ?? t) : transactions, bonuses }
}

// --- Income transition (v4.0 spec §6.6) ---------------------------------

export interface IncomeTransitionResult {
  detected: boolean
  transitionMonth: Date | null
  previousAverage: number | null
  currentAverage: number | null
  deltaPercent: number | null
}

/**
 * Finds the single split point in the monthly normalized-income series
 * whose before/after averages diverge the most, and reports it only when
 * that divergence exceeds `incomeTransitionDeltaPercentThreshold` — a
 * genuine best-fit transition point (e.g. an employer change mid-window),
 * not a blind midpoint split. Requires at least 4 months of data (2 on
 * each side) before a transition is ever asserted (D08-style minimum
 * evidence discipline).
 *
 * CRITICAL: a month with `normalizedIncome === 0` means no recurring
 * income was RECOGNIZED that month (insufficient recurrence evidence,
 * pre-employment, or a genuine data gap) — it is never a verified zero
 * income (D07). Confirmed against a real statement: without this
 * exclusion, a pre-employment run of unrecognized-income months got
 * averaged into the "before" side of the comparison, diluting it toward
 * zero and producing a wildly inflated, misleading delta% (450%+) built
 * from a "previous income" figure that didn't correspond to any real
 * month's actual pay. Both sides of a candidate split must now have at
 * least 2 months of actually-recognized income before being compared at
 * all — a split that can only be supported by unrecognized-income months
 * is correctly reported as "not detected" rather than a confident but
 * fabricated-looking number.
 */
export function detectIncomeTransition(months: MonthlyFinancialAggregateInput[], config: FinancialAnalysisConfig): IncomeTransitionResult {
  const none: IncomeTransitionResult = { detected: false, transitionMonth: null, previousAverage: null, currentAverage: null, deltaPercent: null }
  if (months.length < 4) return none

  const sorted = [...months].sort((a, b) => a.periodMonth.getTime() - b.periodMonth.getTime())
  let best: { splitIndex: number; before: number; after: number; deltaPercent: number } | null = null

  for (let splitIndex = 2; splitIndex <= sorted.length - 2; splitIndex++) {
    const beforeMonths = sorted.slice(0, splitIndex).filter((m) => m.normalizedIncome > 0)
    const afterMonths = sorted.slice(splitIndex).filter((m) => m.normalizedIncome > 0)
    if (beforeMonths.length < 2 || afterMonths.length < 2) continue
    const before = sum(beforeMonths.map((m) => m.normalizedIncome)) / beforeMonths.length
    const after = sum(afterMonths.map((m) => m.normalizedIncome)) / afterMonths.length
    if (before <= 0) continue
    const deltaPercent = ((after - before) / before) * 100
    if (!best || Math.abs(deltaPercent) > Math.abs(best.deltaPercent)) best = { splitIndex, before, after, deltaPercent }
  }

  if (!best || Math.abs(best.deltaPercent) <= config.incomeTransitionDeltaPercentThreshold) return none

  return {
    detected: true,
    transitionMonth: sorted[best.splitIndex].periodMonth,
    previousAverage: Math.round(best.before),
    currentAverage: Math.round(best.after),
    deltaPercent: Math.round(best.deltaPercent * 10) / 10,
  }
}

// --- Medical event / shock / chronic (v4.0 spec §11.5) ------------------

export interface MedicalMonthEntry {
  periodMonth: Date
  total: number
  distinctMerchantCount: number
  incomeSharePercent: number | null
  shock: boolean
  acute: boolean
}

export interface MedicalEventResult {
  monthlyEntries: MedicalMonthEntry[]
  shockMonths: MedicalMonthEntry[]
  chronic: boolean
}

export function detectMedicalEvents(transactions: NormalizedTransactionInput[], months: MonthlyFinancialAggregateInput[], config: FinancialAnalysisConfig): MedicalEventResult {
  const medical = transactions.filter((t) => t.direction === 'DEBIT' && t.subcategory === 'Medical')
  const byMonth = new Map<string, NormalizedTransactionInput[]>()
  for (const t of medical) {
    const key = monthKey(t.transactionDate)
    const existing = byMonth.get(key)
    if (existing) existing.push(t)
    else byMonth.set(key, [t])
  }
  const incomeByMonth = new Map(months.map((m) => [monthKey(m.periodMonth), m.normalizedIncome]))

  const monthlyEntries: MedicalMonthEntry[] = [...byMonth.entries()].map(([key, group]) => {
    const total = sum(group.map((t) => t.amount))
    const income = incomeByMonth.get(key) ?? null
    const incomeSharePercent = income && income > 0 ? Math.round((total / income) * 1000) / 10 : null
    return {
      periodMonth: group[0].transactionDate,
      total,
      distinctMerchantCount: new Set(group.map((t) => t.narration)).size,
      incomeSharePercent,
      shock: total > config.medicalShockThresholdRupees,
      acute: incomeSharePercent !== null && incomeSharePercent > config.medicalShockIncomeSharePercent,
    }
  })

  return {
    monthlyEntries: monthlyEntries.sort((a, b) => a.periodMonth.getTime() - b.periodMonth.getTime()),
    shockMonths: monthlyEntries.filter((e) => e.shock),
    chronic: monthlyEntries.length >= config.chronicMedicalMinMonths,
  }
}

// --- Related-party employer (v4.0 spec §6.7/§11.7) -----------------------

export function detectRelatedPartyEmployer(sources: RecurringIncomeSource[], transactions: NormalizedTransactionInput[], config: FinancialAnalysisConfig): { detected: boolean; matchedName: string | null } {
  if (config.relatedPartyEmployerNames.length === 0) return { detected: false, matchedName: null }

  const salarySources = sources.filter((s) => s.subcategory === 'Salary' || s.subcategory === 'Business income' || s.subcategory === 'Other recurring earned income')
  if (salarySources.length === 0) return { detected: false, matchedName: null }

  const incomeNarrations = transactions.filter((t) => t.direction === 'CREDIT' && t.category === 'INCOME').map((t) => t.narration.toLowerCase())
  for (const name of config.relatedPartyEmployerNames) {
    const needle = name.toLowerCase()
    if (incomeNarrations.some((n) => n.includes(needle))) return { detected: true, matchedName: name }
  }
  return { detected: false, matchedName: null }
}

// --- Business/personal transaction mixing --------------------------------

/**
 * Real evidence only: fires when classify-transaction.ts has already
 * identified BOTH a personal income subcategory (Salary/Pension) AND a
 * Business-income subcategory credit in the same statement window — never
 * inferred from narration tone or transaction velocity alone.
 */
export function detectBusinessPersonalMixing(transactions: NormalizedTransactionInput[]): boolean {
  const hasPersonalIncome = transactions.some((t) => t.direction === 'CREDIT' && (t.subcategory === 'Salary' || t.subcategory === 'Pension'))
  const hasBusinessIncome = transactions.some((t) => t.direction === 'CREDIT' && t.subcategory === 'Business income')
  return hasPersonalIncome && hasBusinessIncome
}
