import type { RecurringDebtPayment } from '../classification/recurring-debt-detector'
import type { CreditAccountCorrelationInput, FinancialAnalysisConfig, FinancialRiskFlagResult } from '../financial-analysis.types'

// A small, deliberately non-exhaustive alias dictionary for common
// narration short-codes that don't token-match a bureau's canonical lender
// name at all — new BBS-maintained list, extend as real mismatches are found.
const LENDER_ALIASES: Record<string, string> = {
  BAJAJFIN: 'BAJAJ FINANCE',
  HDFCBANK: 'HDFC BANK',
  ICICIBANK: 'ICICI BANK',
  SBICARD: 'SBI CARD',
}

const SUFFIX_WORDS = new Set(['LTD', 'LIMITED', 'PVT', 'PRIVATE', 'FINANCE', 'FIN', 'BANK', 'NBFC', 'CO', 'CORP', 'FINANCIAL', 'SERVICES', 'INDIA'])

/** Exported for reuse by recurring-income-detector.ts's own bureau-loan cross-check (same lender-name-matching logic, never duplicated). */
export function normalizeLenderTokens(name: string): Set<string> {
  const upper = name.toUpperCase()
  const aliased = LENDER_ALIASES[upper.replace(/[^A-Z]/g, '')] ?? upper
  return new Set(
    aliased
      .replace(/[^A-Z\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0 && !SUFFIX_WORDS.has(t)),
  )
}

/** Exported for reuse by recurring-income-detector.ts. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  const intersection = [...a].filter((x) => b.has(x)).length
  const union = new Set([...a, ...b]).size
  return intersection / union
}

export interface CorrelationResult {
  flags: FinancialRiskFlagResult[]
}

/**
 * Rule 15 (Credit Report Correlation): matches bank-statement recurring
 * debt payments against bureau-reported lenders (CreditAccountInput,
 * reused as-is from debt-analysis.types.ts). Every outcome is an
 * investigation signal, never a conclusion — in particular,
 * CREDIT_OBLIGATION_NOT_OBSERVED's detail always reads "repayment not
 * observed in this statement," never "not paying" (D13), and a
 * low-confidence name/amount match is reported AS low-confidence, never
 * silently promoted to a certain match ("keep match confidence low rather
 * than forcing a match").
 */
export function correlateWithCreditReport(
  payments: RecurringDebtPayment[],
  creditAccounts: CreditAccountCorrelationInput[],
  config: FinancialAnalysisConfig,
): CorrelationResult {
  const flags: FinancialRiskFlagResult[] = []
  const matchedPayments = new Set<RecurringDebtPayment>()

  const ACTIVE_LIFECYCLE_STATUSES = new Set(['ACTIVE', null])

  for (const account of creditAccounts) {
    const accountTokens = normalizeLenderTokens(account.lender)

    let best: { payment: RecurringDebtPayment; confidence: number; nameMatch: number; amountConfirmed: boolean } | null = null
    for (const payment of payments) {
      if (!payment.lender) continue
      const nameMatch = jaccardSimilarity(accountTokens, normalizeLenderTokens(payment.lender))
      if (nameMatch === 0) continue

      const amountConfirmed =
        account.monthlyEmiAmount !== null &&
        account.monthlyEmiAmount > 0 &&
        Math.abs(payment.averageAmount - account.monthlyEmiAmount) <= account.monthlyEmiAmount * config.creditCorrelationAmountToleranceFraction
      // Unavailable (null) neither confirms nor denies a match — never
      // substituted with 0 — but, per "keep match confidence low rather
      // than forcing a match," an unconfirmed amount also never allows a
      // HIGH-confidence label below, regardless of how strong the name
      // match alone is.
      const amountMatch = account.monthlyEmiAmount === null ? 0.5 : amountConfirmed ? 1 : 0
      const cadenceQuality = payment.monthsPresent >= 3 ? 1 : 0.5
      const confidence = 0.5 * nameMatch + 0.35 * amountMatch + 0.15 * cadenceQuality

      if (!best || confidence > best.confidence) best = { payment, confidence, nameMatch, amountConfirmed }
    }

    if (best && best.nameMatch > 0) {
      matchedPayments.add(best.payment)
      const confidenceLabel = best.nameMatch >= 0.8 && best.amountConfirmed ? 'high' : 'low'
      flags.push({
        key: 'CREDIT_BANK_MATCH',
        severity: 'POSITIVE',
        detail: `${account.lender}: bureau-reported obligation matched to a recurring bank repayment (${confidenceLabel} confidence).`,
        evidence: {
          bureauLender: account.lender,
          bureauAccountOpenedOn: account.openedOn.toISOString(),
          statementLender: best.payment.lender,
          reportedEmi: account.monthlyEmiAmount,
          observedPayment: best.payment.averageAmount,
          confidence: Math.round(best.confidence * 100) / 100,
          confidenceLabel,
        },
        relatedMonth: null,
        relatedTransactionIndex: null,
      })
    } else if (ACTIVE_LIFECYCLE_STATUSES.has(account.lifecycleStatus) && account.monthlyEmiAmount !== null) {
      flags.push({
        key: 'CREDIT_OBLIGATION_NOT_OBSERVED',
        severity: 'ATTENTION',
        detail: `${account.lender}: reported obligation — repayment not observed in this statement.`,
        evidence: { bureauLender: account.lender, bureauAccountOpenedOn: account.openedOn.toISOString(), reportedEmi: account.monthlyEmiAmount },
        relatedMonth: null,
        relatedTransactionIndex: null,
      })
    }
  }

  for (const payment of payments) {
    if (matchedPayments.has(payment)) continue
    flags.push({
      key: 'UNMATCHED_DEBT_PAYMENT',
      severity: 'ATTENTION',
      detail: `A recurring debt payment (${payment.lender ?? 'lender not identified'}) was observed in the statement with no corresponding bureau-reported account — may be a non-reporting lender, a very recent loan, or a shared/family/business obligation.`,
      evidence: { statementLender: payment.lender, averageAmount: payment.averageAmount, monthsPresent: payment.monthsPresent },
      relatedMonth: null,
      relatedTransactionIndex: null,
    })
  }

  return { flags }
}
