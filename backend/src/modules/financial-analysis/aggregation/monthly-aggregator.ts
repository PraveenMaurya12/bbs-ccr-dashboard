import { isExceptionalMonth } from '../classification/exceptional-month-detector'
import { detectLargeTransactions } from '../classification/large-transaction-detector'
import { DISCRETIONARY_SUBCATEGORIES, ESSENTIAL_SUBCATEGORIES, FINANCIAL_SUBCATEGORIES } from '../classification/subcategories'
import type { FinancialAnalysisConfig, MonthlyFinancialAggregateInput, NormalizedTransactionInput } from '../financial-analysis.types'

function periodMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function sumWhere(transactions: NormalizedTransactionInput[], predicate: (t: NormalizedTransactionInput) => boolean): number {
  return transactions.filter(predicate).reduce((sum, t) => sum + t.amount, 0)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * One MonthlyFinancialAggregateInput per calendar month actually present in
 * the statement — the unit every scoring rule (F05-F16) operates over.
 * Every balance-derived field stays null (not 0/false) when the month has
 * no transaction reporting a running balance at all (D12) — distinct from
 * a real, confirmed 0 in the flow fields (normalizedIncome etc.), where an
 * empty month genuinely means no qualifying activity occurred.
 */
export function aggregateMonthly(transactions: NormalizedTransactionInput[], config: FinancialAnalysisConfig): MonthlyFinancialAggregateInput[] {
  if (transactions.length === 0) return []

  const byMonth = new Map<string, NormalizedTransactionInput[]>()
  for (const t of transactions) {
    const key = periodMonthKey(t.transactionDate)
    const existing = byMonth.get(key)
    if (existing) existing.push(t)
    else byMonth.set(key, [t])
  }

  const monthKeys = [...byMonth.keys()].sort()
  const largeTransactionFlags = detectLargeTransactions(transactions, config)
  const largeTransactionMonths = new Set(largeTransactionFlags.map((f) => periodMonthKey(f.transactionDate)))

  // Rule 16/D10: the baseline every month is compared against is the
  // MEDIAN inflow across the whole statement window, never a mean — with
  // only ~12 months ever available per statement (never a true multi-year
  // rolling window), the full-series median IS the "trailing" baseline.
  const inflowByMonth = monthKeys.map((key) => sumWhere(byMonth.get(key)!, (t) => t.direction === 'CREDIT'))
  const medianMonthlyInflow = median(inflowByMonth)

  return monthKeys.map((key) => {
    const monthTransactions = byMonth.get(key)!
    const [year, month] = key.split('-').map(Number)
    const periodMonth = new Date(Date.UTC(year, month - 1, 1))

    const totalInflow = sumWhere(monthTransactions, (t) => t.direction === 'CREDIT')
    const totalOutflow = sumWhere(monthTransactions, (t) => t.direction === 'DEBIT')
    const loanInflows = sumWhere(monthTransactions, (t) => t.direction === 'CREDIT' && t.category === 'BORROWING')

    const balances = monthTransactions.filter((t) => t.balance !== null)
    const sortedByDate = [...monthTransactions].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime())
    const lastWithBalance = [...sortedByDate].reverse().find((t) => t.balance !== null)
    const distinctDates = new Set(monthTransactions.map((t) => t.transactionDate.toDateString()))
    const lowBalanceDates = new Set(
      balances.filter((t) => t.balance! < config.lowBalanceThresholdRupees).map((t) => t.transactionDate.toDateString()),
    )

    const { isExceptional, reason } = isExceptionalMonth(
      totalInflow,
      medianMonthlyInflow,
      loanInflows > 0,
      largeTransactionMonths.has(key),
      config.exceptionalMonthInflowMultiplier,
    )

    const aggregate: MonthlyFinancialAggregateInput = {
      periodMonth,
      totalInflow,
      totalOutflow,
      netCashFlow: totalInflow - totalOutflow,
      // Excludes subcategory 'Bonus' — v4.0 spec §6.5: a detected bonus is
      // reported separately and never folded into normalized (recurring)
      // income, same exclusion discipline already applied to loan
      // proceeds/self-transfers/refunds elsewhere in this function.
      normalizedIncome: sumWhere(monthTransactions, (t) => t.direction === 'CREDIT' && t.category === 'INCOME' && t.subcategory !== 'Bonus'),
      essentialExpenses: sumWhere(monthTransactions, (t) => t.direction === 'DEBIT' && t.category === 'EXPENSE' && !!t.subcategory && ESSENTIAL_SUBCATEGORIES.includes(t.subcategory)),
      financialExpenses: sumWhere(monthTransactions, (t) => t.direction === 'DEBIT' && t.category === 'EXPENSE' && !!t.subcategory && FINANCIAL_SUBCATEGORIES.includes(t.subcategory)),
      discretionaryExpenses: sumWhere(monthTransactions, (t) => t.direction === 'DEBIT' && t.category === 'EXPENSE' && !!t.subcategory && DISCRETIONARY_SUBCATEGORIES.includes(t.subcategory)),
      // Deliberately excludes Credit-card payment (D05 / F17 double-count prevention) — see schema.prisma's own doc comment.
      mandatoryDebtPayments: sumWhere(monthTransactions, (t) => t.direction === 'DEBIT' && (t.subcategory === 'EMI' || t.subcategory === 'Loan repayment')),
      creditCardPayments: sumWhere(monthTransactions, (t) => t.direction === 'DEBIT' && t.subcategory === 'Credit-card payment'),
      loanInflows,
      transferInflows: sumWhere(monthTransactions, (t) => t.direction === 'CREDIT' && t.category === 'TRANSFERS'),
      transferOutflows: sumWhere(monthTransactions, (t) => t.direction === 'DEBIT' && t.category === 'TRANSFERS'),
      cashWithdrawals: sumWhere(monthTransactions, (t) => t.direction === 'DEBIT' && t.subcategory === 'ATM withdrawal'),
      cashDeposits: sumWhere(monthTransactions, (t) => t.direction === 'CREDIT' && t.subcategory === 'Cash deposit'),
      closingBalance: lastWithBalance?.balance ?? null,
      minBalance: balances.length > 0 ? Math.min(...balances.map((t) => t.balance!)) : null,
      lowBalanceDays: balances.length > 0 ? lowBalanceDates.size : null,
      observedDays: distinctDates.size,
      hadNegativeBalance: balances.length > 0 ? balances.some((t) => t.balance! < 0) : null,
      transactionCount: monthTransactions.length,
      isExceptionalMonth: isExceptional,
      exceptionalMonthReason: reason,
    }

    return aggregate
  })
}
