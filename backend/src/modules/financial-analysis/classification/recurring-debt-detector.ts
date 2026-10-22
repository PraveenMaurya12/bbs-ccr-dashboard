import type { FinancialAnalysisConfig, NormalizedTransactionInput } from '../financial-analysis.types'
import { clusterByAmountTolerance, distinctMonthCount, groupByNarrationFingerprint } from './recurring-cluster-utils'

export interface RecurringDebtPayment {
  narrationFingerprint: string
  lender: string | null
  transactionCount: number
  monthsPresent: number
  averageAmount: number
  evidenceLevel: 'DERIVED' | 'INFERRED'
}

export interface RecurringDebtResult {
  payments: RecurringDebtPayment[]
  transactions: NormalizedTransactionInput[]
}

const MANDATORY_DEBT_SUBCATEGORIES = new Set(['EMI', 'Loan repayment'])
// New BBS-established cadence check (no prior rule): EMI/loan auto-debits
// are mechanical — the same day of month, give or take a few business
// days — so a cluster spanning more than this day-of-month range is
// unlikely to be one real recurring obligation, even if the amount and
// narration otherwise matched.
const MAX_DAY_OF_MONTH_SPREAD = 6

const GENERIC_DEBT_TOKENS = new Set(['emi', 'loan', 'repayment', 'installment', 'inst', 'nach', 'ecs', 'auto', 'debit', 'payment', 'ac', 'a/c'])

/** Exported for reuse by recurring-income-detector.ts's own bureau-loan cross-check. */
export function guessLender(narration: string): string | null {
  const tokens = narration
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !GENERIC_DEBT_TOKENS.has(t.toLowerCase()) && !/^\d+$/.test(t))
  return tokens.length > 0 ? tokens.slice(0, 2).join(' ') : null
}

function isCandidate(t: NormalizedTransactionInput): boolean {
  if (t.direction !== 'DEBIT') return false
  if (t.category === 'EXPENSE') return t.subcategory !== null && MANDATORY_DEBT_SUBCATEGORIES.has(t.subcategory)
  return t.category === 'UNCLASSIFIED'
}

/**
 * EMI/debt-payment recurring-cluster detection — tighter floor/tolerance
 * than recurring income (auto-debits are inherently more mechanical than
 * income), and never infers an EMI from a single transaction (D09).
 */
export function detectRecurringDebtPayments(transactions: NormalizedTransactionInput[], config: FinancialAnalysisConfig): RecurringDebtResult {
  const candidates = transactions.filter(isCandidate)
  const groups = groupByNarrationFingerprint(candidates)

  const payments: RecurringDebtPayment[] = []
  const upgraded = new Map<NormalizedTransactionInput, NormalizedTransactionInput>()

  for (const [fingerprint, groupTransactions] of groups) {
    for (const cluster of clusterByAmountTolerance(groupTransactions, config.recurringDebtAmountToleranceFraction)) {
      const monthsPresent = distinctMonthCount(cluster)
      if (monthsPresent < config.recurringDebtMinMonths) continue

      const daysOfMonth = cluster.map((t) => t.transactionDate.getUTCDate())
      if (Math.max(...daysOfMonth) - Math.min(...daysOfMonth) > MAX_DAY_OF_MONTH_SPREAD) continue

      const keywordCorroborated = cluster.some((t) => t.category === 'EXPENSE' && t.subcategory !== null)
      const subcategory = cluster.find((t) => t.subcategory)?.subcategory ?? 'EMI'
      const evidenceLevel = keywordCorroborated ? 'DERIVED' : 'INFERRED'
      const averageAmount = cluster.reduce((sum, t) => sum + t.amount, 0) / cluster.length
      const lender = guessLender(cluster[0].narration)

      payments.push({ narrationFingerprint: fingerprint, lender, transactionCount: cluster.length, monthsPresent, averageAmount, evidenceLevel })

      for (const t of cluster) {
        upgraded.set(t, { ...t, category: 'EXPENSE', subcategory, evidenceLevel, lender })
      }
    }
  }

  return {
    payments: payments.sort((a, b) => b.averageAmount - a.averageAmount),
    transactions: transactions.map((t) => upgraded.get(t) ?? t),
  }
}
