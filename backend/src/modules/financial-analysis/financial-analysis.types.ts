/**
 * Plain, Prisma-independent shapes for the pure classification/aggregation/
 * scoring functions in this module — Decimal columns are plain `number`
 * here (the service layer converts via `.toNumber()` at the boundary) so
 * every calculation can be unit-tested with plain object literals, exactly
 * like debt-analysis.types.ts/debt-analysis.calculations.ts already
 * established for the sibling Debt Analysis module.
 */

export type TransactionDirection = 'CREDIT' | 'DEBIT'

export type TransactionCategory = 'INCOME' | 'BORROWING' | 'EXPENSE' | 'TRANSFERS' | 'CASH' | 'OTHER' | 'UNCLASSIFIED'

/** The spec's evidence model — see schema.prisma's EvidenceLevel doc comment for the full semantics. */
export type EvidenceLevel = 'CONFIRMED' | 'DERIVED' | 'INFERRED'

export type BounceEvidenceTier = 'CONFIRMED_BOUNCE' | 'POSSIBLE_BOUNCE' | 'UNKNOWN'

/** Reused as-is from the Debt Analysis module's own convention — see src/features/leads/types.ts's identical frontend type. */
export type DataAvailability = 'AVAILABLE' | 'NOT_REPORTED' | 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA'

export type FinancialSeverity = 'POSITIVE' | 'INFORMATIONAL' | 'ATTENTION' | 'ELEVATED' | 'CRITICAL'

export type FinancialStressBand = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL'

/**
 * One real transaction row — the output of normalizeTransactions() and the
 * input to every classifier/detector/aggregator in this module. No
 * `id`/`analysisId`/`leadId`/`createdAt` here (those are persistence-layer
 * concerns the service adds), matching CreditAccountInput's own convention
 * of staying Prisma-row-shape-free.
 */
/** Narration canonical-field parse (v4.0 spec §3.8) — see narration-detail-parser.ts. Every field null when the narration didn't match a recognized structural pattern; never guessed. */
export interface NarrationDetail {
  referenceNumber: string | null
  counterpartyRaw: string | null
  purpose: string | null
  counterpartyBank: string | null
}

export interface NormalizedTransactionInput {
  transactionDate: Date
  valueDate: Date | null
  narration: string
  amount: number
  direction: TransactionDirection
  balance: number | null
  counterparty: string | null
  transactionType: string | null
  category: TransactionCategory
  subcategory: string | null
  lender: string | null
  confidence: number
  evidenceLevel: EvidenceLevel
  bounceEvidence: BounceEvidenceTier | null
  sourceRowRef: number | null
  narrationDetail: NarrationDetail | null
}

export interface MonthlyFinancialAggregateInput {
  periodMonth: Date // first-of-month, UTC
  totalInflow: number
  totalOutflow: number
  netCashFlow: number
  normalizedIncome: number
  essentialExpenses: number
  financialExpenses: number
  discretionaryExpenses: number
  mandatoryDebtPayments: number
  creditCardPayments: number
  loanInflows: number
  transferInflows: number
  transferOutflows: number
  cashWithdrawals: number
  cashDeposits: number
  closingBalance: number | null
  minBalance: number | null
  lowBalanceDays: number | null
  observedDays: number
  hadNegativeBalance: boolean | null
  transactionCount: number
  isExceptionalMonth: boolean
  exceptionalMonthReason: string | null
}

/** Mirrors debt-analysis's RiskFlag shape — see that file's own doc comment for why `evidence` is structured, not just the formatted `detail` string. */
export interface FinancialRiskFlagResult {
  key: string
  severity: FinancialSeverity
  detail: string
  evidence: Record<string, number | string | boolean | null>
  relatedMonth: Date | null
  relatedTransactionIndex: number | null
}

export interface CreditAccountCorrelationInput {
  lender: string
  monthlyEmiAmount: number | null
  lifecycleStatus: string | null
  // Added for the Master Profile module: a lead with two tradelines from the
  // same lender produces two correlation flags with byte-identical
  // `evidence.bureauLender` — stamping this into the flag's evidence (see
  // credit-correlation.ts) gives a downstream consumer a real per-account
  // join key instead of an ambiguous lender-name-only one. Not read by
  // anything in this module itself.
  openedOn: Date
}

export interface FinancialAnalysisConfig {
  lowBalanceThresholdRupees: number
  largeTransactionMinimumRupees: number
  largeTransactionIncomeMultiplier: number
  recurringIncomeMinMonths: number
  recurringIncomeAmountToleranceFraction: number
  recurringDebtMinMonths: number
  recurringDebtAmountToleranceFraction: number
  creditCorrelationAmountToleranceFraction: number
  exceptionalMonthInflowMultiplier: number
  /** Minimum number of usable (balance-pair, debit/credit) transitions before a DR/CR inversion verdict is even considered — never asserted from a handful of rows. */
  directionInversionMinSampleSize: number
  /** Fraction of evaluated transitions that must agree with ONE interpretation (conventional or inverted) before that interpretation is asserted — a genuinely ambiguous/mixed statement stays at the conventional default. */
  directionInversionConfidenceThreshold: number
  balanceReconciliationToleranceRupees: number
  fcfUnreconciledGapPercentThreshold: number
  dataQualityUnclassifiedSharePercentThreshold: number
  dataQualityUnclassifiedCapPoints: number
  dataQualityOtherAccountsCapPoints: number
  dataQualityFcfUnreconciledCapPoints: number
  dataQualityReconciliationFailedCapPoints: number
  dataQualityBusinessPersonalMixedCapPoints: number
  singleSourceDependencyThresholdPercent: number
  otherAccountsLikelyIncomeSharePercent: number
  largeRecurringTransferMinOccurrences: number
  largeRecurringTransferMinTotalRupees: number
  largeRecurringTransferMinAverageRupees: number
  /** An LRT counterparty at or above this total volume is banded LRT_HIGH rather than LRT_MEDIUM — a severity label only, never a new detection threshold. */
  largeRecurringTransferHighVolumeRupees: number
  /** A one-off credit above this multiple of the largest detected recurring income source is a candidate BONUS (v4.0 spec §6.5's own "1.5x monthly salary" threshold). */
  bonusSalaryMultiplier: number
  /** v4.0 spec §6.6: income delta between the pre/post-transition average above this percent flags INCOME_TRANSITION. */
  incomeTransitionDeltaPercentThreshold: number
  /** v4.0 spec §11.5: total Medical-subcategory spend in a single month above this is MEDICAL_SHOCK. */
  medicalShockThresholdRupees: number
  /** v4.0 spec §11.5: a medical shock exceeding this share of that month's normalized income is additionally marked ACUTE and requires CCR. */
  medicalShockIncomeSharePercent: number
  /** v4.0 spec §11.5: medical spend (any amount) present in at least this many distinct months is CHRONIC_MEDICAL. */
  chronicMedicalMinMonths: number
  /** v4.0 spec §6.7/§11.7: salary-source narration/counterparty tokens matching any of these (case-insensitive substring) is RELATED_PARTY_EMPLOYER. Pilot V1 — must be populated with the real BBS/GLLFL affiliate legal names before production; empty by default (never a guessed match). */
  relatedPartyEmployerNames: string[]
  /** v4.0 spec §10 "days to next income": income credit dates with a day-of-month standard deviation above this are too inconsistent to project a next expected date. */
  incomeDayOfMonthMaxStdDevDays: number
}
