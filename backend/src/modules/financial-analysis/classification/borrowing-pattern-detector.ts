import type { FinancialAnalysisConfig, NormalizedTransactionInput } from '../financial-analysis.types'

const MS_PER_DAY = 24 * 60 * 60 * 1000
// New BBS-established windows (no prior rule — the spec describes the
// pattern qualitatively, not a number): large debits within 7 days of a
// loan credit, totaling at least half the loan amount, followed by a
// low-balance event within 30 days of the same loan credit.
const SPENDING_WINDOW_DAYS = 7
const SPENDING_SHARE_THRESHOLD = 0.5
const LOW_BALANCE_WINDOW_DAYS = 30

/**
 * Rule 16 (F16) — Borrowing-Followed-by-Spending. An INVESTIGATION SIGNAL
 * only — this function returns a plain boolean precisely so the caller
 * can never attach a conclusion like "debt trap" to it; it only means
 * "this pattern's objective preconditions were observed," nothing more.
 */
export function detectBorrowingDependencyPattern(transactions: NormalizedTransactionInput[], config: FinancialAnalysisConfig): boolean {
  const loanInflows = transactions.filter((t) => t.category === 'BORROWING' && t.direction === 'CREDIT')

  return loanInflows.some((loan) => {
    const loanTime = loan.transactionDate.getTime()
    const spendingWindowEnd = loanTime + SPENDING_WINDOW_DAYS * MS_PER_DAY
    const followingDebitTotal = transactions
      .filter((t) => t.direction === 'DEBIT' && t.transactionDate.getTime() > loanTime && t.transactionDate.getTime() <= spendingWindowEnd)
      .reduce((sum, t) => sum + t.amount, 0)

    if (followingDebitTotal < loan.amount * SPENDING_SHARE_THRESHOLD) return false

    const lowBalanceWindowEnd = loanTime + LOW_BALANCE_WINDOW_DAYS * MS_PER_DAY
    return transactions.some(
      (t) =>
        t.balance !== null &&
        t.transactionDate.getTime() > loanTime &&
        t.transactionDate.getTime() <= lowBalanceWindowEnd &&
        t.balance < config.lowBalanceThresholdRupees,
    )
  })
}
