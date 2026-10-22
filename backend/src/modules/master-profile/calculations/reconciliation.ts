import type { DebtAccountFact, FinancialRiskFlagFact, ReconciliationRowResult } from '../master-profile.types'

const ACTIVE_LIFECYCLE_STATUSES = new Set<string | null>(['ACTIVE', null])
const CORRELATION_FLAG_KEYS = new Set(['CREDIT_BANK_MATCH', 'CREDIT_OBLIGATION_NOT_OBSERVED', 'UNMATCHED_DEBT_PAYMENT'])

/**
 * Spec Part 12/13/35: the Credit <-> Bank Reconciliation table. This never
 * recomputes the lender/amount/cadence match itself — Financial Analysis's
 * own correlateWithCreditReport() already did that once, during its own
 * pipeline run, and persisted the outcome as ordinary FinancialRiskFlag rows
 * (CREDIT_BANK_MATCH / CREDIT_OBLIGATION_NOT_OBSERVED / UNMATCHED_DEBT_PAYMENT).
 * This function only joins those persisted flags back against Debt
 * Analysis's own account list and translates the 3-outcome vocabulary into
 * the spec's richer 5-state one.
 *
 * The join key is `evidence.bureauLender` + `evidence.bureauAccountOpenedOn`
 * (the latter added specifically for this module — see
 * financial-analysis.types.ts's CreditAccountCorrelationInput — so two
 * tradelines from the same lender can be told apart; lender name alone is
 * ambiguous).
 *
 * Scoping mirrors correlateWithCreditReport()'s own gate exactly: that
 * function only ever emits CREDIT_OBLIGATION_NOT_OBSERVED for an account
 * whose lifecycleStatus is ACTIVE/null AND whose monthlyEmiAmount is
 * non-null. A closed/settled/written-off account with no flag is the
 * CORRECT, expected outcome (closed debt isn't actively being serviced) —
 * NOT an UNKNOWN. UNKNOWN is reserved for an in-scope account that
 * genuinely has no flag at all (Financial Analysis hasn't completed, or ran
 * before this account existed).
 */
export function buildReconciliationRows(accounts: DebtAccountFact[], riskFlags: FinancialRiskFlagFact[]): ReconciliationRowResult[] {
  const correlationFlags = riskFlags.filter((f) => CORRELATION_FLAG_KEYS.has(f.key))
  const matchedFlagIndices = new Set<number>()

  function findFlag(account: DebtAccountFact, key: string): { flag: FinancialRiskFlagFact; index: number } | null {
    for (let i = 0; i < correlationFlags.length; i++) {
      if (matchedFlagIndices.has(i)) continue
      const flag = correlationFlags[i]
      if (flag.key !== key) continue
      const evidence = flag.evidence
      if (evidence.bureauLender === account.lender && evidence.bureauAccountOpenedOn === account.openedOn) {
        return { flag, index: i }
      }
    }
    return null
  }

  const rows: ReconciliationRowResult[] = []

  for (const account of accounts) {
    const inScope = ACTIVE_LIFECYCLE_STATUSES.has(account.lifecycleStatus) && account.monthlyEmiAmount !== null

    const match = findFlag(account, 'CREDIT_BANK_MATCH')
    if (match) {
      matchedFlagIndices.add(match.index)
      const confidenceLabel = match.flag.evidence.confidenceLabel
      const confidence = typeof match.flag.evidence.confidence === 'number' ? match.flag.evidence.confidence : null
      rows.push({
        lender: account.lender,
        product: account.accountType,
        reportedOutstanding: account.currentBalance,
        reportedEmi: account.monthlyEmiAmount,
        observedPayment: typeof match.flag.evidence.observedPayment === 'number' ? match.flag.evidence.observedPayment : null,
        observedFrequencyMonths: null,
        matchStatus: confidenceLabel === 'high' ? 'MATCHED' : 'PARTIALLY_MATCHED',
        confidence,
        explanation: match.flag.detail,
      })
      continue
    }

    const notObserved = findFlag(account, 'CREDIT_OBLIGATION_NOT_OBSERVED')
    if (notObserved) {
      matchedFlagIndices.add(notObserved.index)
      rows.push({
        lender: account.lender,
        product: account.accountType,
        reportedOutstanding: account.currentBalance,
        reportedEmi: account.monthlyEmiAmount,
        observedPayment: null,
        observedFrequencyMonths: null,
        matchStatus: 'NOT_OBSERVED',
        confidence: null,
        explanation: notObserved.flag.detail,
      })
      continue
    }

    if (!inScope) continue // closed/settled debt with no reported EMI — correctly out of scope, never UNKNOWN

    rows.push({
      lender: account.lender,
      product: account.accountType,
      reportedOutstanding: account.currentBalance,
      reportedEmi: account.monthlyEmiAmount,
      observedPayment: null,
      observedFrequencyMonths: null,
      matchStatus: 'UNKNOWN',
      confidence: null,
      explanation: 'No reconciliation evidence is available for this obligation yet.',
    })
  }

  // Bank-observed recurring payments with no bureau-reported account at all.
  for (let i = 0; i < correlationFlags.length; i++) {
    if (matchedFlagIndices.has(i)) continue
    const flag = correlationFlags[i]
    if (flag.key !== 'UNMATCHED_DEBT_PAYMENT') continue
    rows.push({
      lender: typeof flag.evidence.statementLender === 'string' ? flag.evidence.statementLender : 'Lender not identified',
      product: null,
      reportedOutstanding: null,
      reportedEmi: null,
      observedPayment: typeof flag.evidence.averageAmount === 'number' ? flag.evidence.averageAmount : null,
      observedFrequencyMonths: typeof flag.evidence.monthsPresent === 'number' ? flag.evidence.monthsPresent : null,
      matchStatus: 'UNMATCHED_PAYMENT',
      confidence: null,
      explanation: flag.detail,
    })
  }

  return rows
}
