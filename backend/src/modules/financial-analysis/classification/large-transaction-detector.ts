import type { FinancialAnalysisConfig, NormalizedTransactionInput, TransactionDirection } from '../financial-analysis.types'

export interface LargeTransactionFlag {
  transactionDate: Date
  amount: number
  direction: TransactionDirection
  narration: string
  category: string
  subcategory: string | null
  whyItMatters: string
  confidence: number
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Rule 18 — Large/Unusual Transactions: threshold = MAX(configured
 * minimum, incomeMultiplier x median monthly income). Derives its own
 * income baseline directly from already-classified INCOME transactions
 * (grouped by month) — deliberately not dependent on aggregateMonthly()'s
 * output, so this stays a standalone, independently-testable function.
 */
export function detectLargeTransactions(transactions: NormalizedTransactionInput[], config: FinancialAnalysisConfig): LargeTransactionFlag[] {
  const incomeByMonth = new Map<string, number>()
  for (const t of transactions) {
    if (t.category !== 'INCOME') continue
    const key = `${t.transactionDate.getUTCFullYear()}-${t.transactionDate.getUTCMonth()}`
    incomeByMonth.set(key, (incomeByMonth.get(key) ?? 0) + t.amount)
  }
  const medianMonthlyIncome = median([...incomeByMonth.values()])

  const incomeBasedThreshold = medianMonthlyIncome !== null ? medianMonthlyIncome * config.largeTransactionIncomeMultiplier : 0
  const threshold = Math.max(config.largeTransactionMinimumRupees, incomeBasedThreshold)
  // Which half of the MAX(...) formula is actually binding, for the human-readable reason.
  const whyItMatters =
    incomeBasedThreshold > config.largeTransactionMinimumRupees
      ? `Exceeds ${config.largeTransactionIncomeMultiplier}x the median monthly income (${Math.round(medianMonthlyIncome ?? 0)}).`
      : `Exceeds the configured minimum of ${config.largeTransactionMinimumRupees}.`

  return transactions
    .filter((t) => t.amount >= threshold)
    .map((t) => ({
      transactionDate: t.transactionDate,
      amount: t.amount,
      direction: t.direction,
      narration: t.narration,
      category: t.category,
      subcategory: t.subcategory,
      whyItMatters,
      confidence: t.confidence,
    }))
    .sort((a, b) => b.amount - a.amount)
}
