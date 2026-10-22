import { jaccardSimilarity, normalizeLenderTokens } from '../correlation/credit-correlation'
import type { CreditAccountCorrelationInput, FinancialAnalysisConfig, NormalizedTransactionInput } from '../financial-analysis.types'
import { BUSINESS_SUFFIX_PATTERN } from './family-network-detector'
import { guessLender } from './recurring-debt-detector'
import { clusterByAmountTolerance, distinctMonthCount, groupByNarrationFingerprint, median, mergeTruncatedCounterpartyGroups } from './recurring-cluster-utils'

export interface RecurringIncomeSource {
  narrationFingerprint: string
  subcategory: string
  transactionCount: number
  monthsPresent: number
  /** v4.0 spec §6.2: the MEDIAN of this cluster's monthly credits, not a mean — see median()'s own doc comment for why. */
  averageAmount: number
  evidenceLevel: 'DERIVED' | 'INFERRED'
}

export interface RecurringIncomeResult {
  sources: RecurringIncomeSource[]
  /** The full transaction array, with every qualifying recurring-income transaction upgraded in place (category/subcategory/evidenceLevel) — everything else returned unchanged. */
  transactions: NormalizedTransactionInput[]
}

// A credit already confidently classified as one of these can never be
// reinterpreted as earned income, regardless of pattern — Rule 17's own
// explicit exclusion list (loan proceeds/transfers/refunds/cash deposits).
const NEVER_INCOME_CATEGORIES = new Set(['BORROWING', 'TRANSFERS', 'CASH', 'OTHER', 'EXPENSE'])

/**
 * A generic transfer-rail credit (e.g. NEFT with no "salary" keyword) whose
 * structurally-parsed counterparty name reads as a business entity, never a
 * person — confirmed against a real pre-transition employer ("AEREM
 * SOLUTIONS PRIVATE LIMITED") paid via plain NEFT with no income keyword
 * anywhere in the narration. Admits ONLY business-named TRANSFERS candidates
 * into the clustering pipeline below; a personal name (family/friend P2P)
 * never matches BUSINESS_SUFFIX_PATTERN and stays excluded exactly as before.
 * Still has to independently clear the same recurrence/amount-consistency
 * bar as every other income source before being promoted — see the
 * "businessLike" branch in detectRecurringIncome.
 */
function isBusinessNamedTransfer(t: NormalizedTransactionInput): boolean {
  return t.category === 'TRANSFERS' && !!t.narrationDetail?.counterpartyRaw && BUSINESS_SUFFIX_PATTERN.test(t.narrationDetail.counterpartyRaw)
}

/**
 * CRITICAL: a recurring credit with no income keyword is never promoted
 * to income purely because it recurs — "unknown borrowing must not
 * become income." Before falling back to UNCLASSIFIED, cross-check the
 * cluster's guessed counterparty against bureau-reported lenders (the
 * same lender-token-matching logic credit-correlation.ts already uses for
 * the debit side) — a recurring credit that matches a real bureau
 * tradeline is a loan-disbursement pattern, not income.
 */
function findBureauLenderMatch(cluster: NormalizedTransactionInput[], creditAccounts: CreditAccountCorrelationInput[]): CreditAccountCorrelationInput | null {
  const guessedLender = guessLender(cluster[0].narration)
  if (!guessedLender) return null
  const clusterTokens = normalizeLenderTokens(guessedLender)
  for (const account of creditAccounts) {
    if (jaccardSimilarity(clusterTokens, normalizeLenderTokens(account.lender)) > 0) return account
  }
  return null
}

/**
 * F01 — Recurring Income. Never infers salary/recurring income from a
 * single transaction (D08): a cluster must span at least
 * `config.recurringIncomeMinMonths` distinct calendar months before being
 * asserted as recurring at all.
 *
 * Conservative promotion hierarchy (never "recurs -> income"):
 * 1. Keyword-corroborated (classifyTransaction already assigned a real
 *    INCOME subcategory) -> income, DERIVED.
 * 2. No keyword, but the counterparty matches a bureau-reported lender
 *    -> reclassified toward BORROWING, never income.
 * 3. No keyword, no bureau match -> genuinely ambiguous; left exactly as
 *    classify-transaction.ts already classified it (usually
 *    UNCLASSIFIED) — never force-promoted to income.
 */
export function detectRecurringIncome(transactions: NormalizedTransactionInput[], config: FinancialAnalysisConfig, creditAccounts: CreditAccountCorrelationInput[] = []): RecurringIncomeResult {
  const candidates = transactions.filter((t) => t.direction === 'CREDIT' && (!NEVER_INCOME_CATEGORIES.has(t.category) || isBusinessNamedTransfer(t)))
  // Merges e.g. the same employer's IMPS- and NEFT-era salary groups —
  // see mergeTruncatedCounterpartyGroups's own doc comment. Income-specific:
  // never applied to debt/lender clustering.
  const groups = mergeTruncatedCounterpartyGroups(groupByNarrationFingerprint(candidates))

  const sources: RecurringIncomeSource[] = []
  const upgraded = new Map<NormalizedTransactionInput, NormalizedTransactionInput>()

  for (const [fingerprint, groupTransactions] of groups) {
    for (const cluster of clusterByAmountTolerance(groupTransactions, config.recurringIncomeAmountToleranceFraction)) {
      const monthsPresent = distinctMonthCount(cluster)
      if (monthsPresent < config.recurringIncomeMinMonths) continue

      const keywordCorroborated = cluster.some((t) => t.category === 'INCOME' && t.subcategory !== null)

      if (!keywordCorroborated) {
        const bureauMatch = findBureauLenderMatch(cluster, creditAccounts)
        if (bureauMatch) {
          for (const t of cluster) {
            upgraded.set(t, { ...t, category: 'BORROWING', subcategory: 'Recurring credit correlated to a bureau-reported lender', lender: bureauMatch.lender })
          }
          continue
        }

        // No income keyword, no bureau match: check whether every
        // transaction in this cluster is a business-named transfer-rail
        // credit (narrowed candidate set above) — a genuinely recurring,
        // amount-consistent, business-counterparty credit with no income
        // keyword at all (e.g. a pre-transition employer paid over plain
        // NEFT). Promoted at INFERRED (not DERIVED) confidence: lower
        // evidence than a keyword match, but still a real, recurrence-gated
        // signal rather than a guess from a single transaction.
        const businessLike = cluster.every(isBusinessNamedTransfer)
        if (businessLike) {
          const averageAmount = median(cluster.map((t) => t.amount))
          sources.push({
            narrationFingerprint: fingerprint,
            subcategory: 'Probable employer income (unconfirmed)',
            transactionCount: cluster.length,
            monthsPresent,
            averageAmount,
            evidenceLevel: 'INFERRED',
          })
          for (const t of cluster) {
            upgraded.set(t, { ...t, category: 'INCOME', subcategory: 'Probable employer income (unconfirmed)', evidenceLevel: 'INFERRED' })
          }
        }
        // Otherwise genuinely ambiguous: never promoted to income — see
        // this function's own doc comment.
        continue
      }

      const subcategory = cluster.find((t) => t.category === 'INCOME' && t.subcategory)?.subcategory ?? 'Other recurring earned income'
      const averageAmount = median(cluster.map((t) => t.amount))

      sources.push({ narrationFingerprint: fingerprint, subcategory, transactionCount: cluster.length, monthsPresent, averageAmount, evidenceLevel: 'DERIVED' })

      for (const t of cluster) {
        upgraded.set(t, { ...t, category: 'INCOME', subcategory, evidenceLevel: 'DERIVED' })
      }
    }
  }

  return {
    sources: sources.sort((a, b) => b.averageAmount - a.averageAmount),
    transactions: transactions.map((t) => upgraded.get(t) ?? t),
  }
}
