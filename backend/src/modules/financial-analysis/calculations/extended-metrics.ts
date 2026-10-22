import type { ComponentScoreResult } from '../scoring/financial-health-scoring'
import type {
  DataAvailability,
  FinancialAnalysisConfig,
  FinancialRiskFlagResult,
  FinancialSeverity,
  MonthlyFinancialAggregateInput,
  NormalizedTransactionInput,
} from '../financial-analysis.types'
import type { P2PCounterpartySummary } from '../classification/p2p-detector'
import { BUSINESS_SUFFIX_PATTERN, type FamilyNetworkEntry } from '../classification/family-network-detector'
import { isAmbiguousMerchantMatch } from '../classification/classify-transaction'
import type { RoundTripPair } from '../classification/round-trip-detector'
import type { BonusEntry, IncomeTransitionResult, MedicalEventResult } from './behavioural-event-detectors'

/**
 * Genuinely NEW analysis the v4.0 L2 spec asks for that the existing 9-
 * component scoring/risk-flag engine does not yet compute — every function
 * here is additive, deterministic (never AI), and built entirely from
 * fields `aggregateMonthly()`/`classifyAllTransactions()` already produce.
 * None of this touches the 9-component Financial Health Score itself (see
 * this module's own README note on the 9-vs-5-component fork) — these are
 * independent, display-and-flag-only derivations layered on top of it.
 */

function sum(values: number[]): number {
  return values.reduce((t, v) => t + v, 0)
}

function flag(key: string, severity: FinancialSeverity, detail: string, evidence: Record<string, number | string | boolean | null>): FinancialRiskFlagResult {
  return { key, severity, detail, evidence, relatedMonth: null, relatedTransactionIndex: null }
}

// --- Balance reconciliation (opening + credits - debits = closing) -----

export interface ReconciliationResult {
  availability: DataAvailability
  reconciled: boolean | null
  openingBalance: number | null
  closingBalance: number | null
  expectedClosingBalance: number | null
  gapRupees: number | null
  toleranceRupees: number
  detail: string
}

/** Rule: never asserts success/failure when either endpoint balance is unreported — reads as NOT_REPORTED rather than a fabricated "reconciled: true". */
export function checkBalanceReconciliation(
  openingBalance: number | null,
  closingBalance: number | null,
  months: MonthlyFinancialAggregateInput[],
  toleranceRupees: number,
): ReconciliationResult {
  if (openingBalance === null || closingBalance === null) {
    return {
      availability: 'NOT_REPORTED',
      reconciled: null,
      openingBalance,
      closingBalance,
      expectedClosingBalance: null,
      gapRupees: null,
      toleranceRupees,
      detail: 'Opening and/or closing balance was not reported in the statement — internal balance consistency could not be verified.',
    }
  }

  const totalCredits = sum(months.map((m) => m.totalInflow))
  const totalDebits = sum(months.map((m) => m.totalOutflow))
  const expectedClosingBalance = openingBalance + totalCredits - totalDebits
  const gapRupees = Math.round((closingBalance - expectedClosingBalance) * 100) / 100
  const reconciled = Math.abs(gapRupees) <= toleranceRupees

  return {
    availability: 'AVAILABLE',
    reconciled,
    openingBalance,
    closingBalance,
    expectedClosingBalance: Math.round(expectedClosingBalance * 100) / 100,
    gapRupees,
    toleranceRupees,
    detail: reconciled
      ? 'Opening balance plus classified credits/debits matches the reported closing balance within tolerance.'
      : `Opening balance plus classified credits/debits implies a closing balance of ${Math.round(expectedClosingBalance)}, a gap of ${Math.round(Math.abs(gapRupees))} against the reported closing balance.`,
  }
}

// --- FCF reconciliation (theoretical vs. actual net cash flow) ----------

export interface FcfReconciliationResult {
  availability: DataAvailability
  totalTheoreticalFcf: number | null
  totalActualNetCashFlow: number | null
  gapRupees: number | null
  gapPercent: number | null
  unreconciled: boolean
  /** Six named buckets that algebraically sum to exactly `gapRupees` — see this function's own derivation comment. */
  attribution: {
    creditCardPayments: number
    transferOutflows: number
    cashWithdrawals: number
    discretionaryExpenses: number
    otherFinancialAndUnclassifiedOutflows: number
    nonIncomeInflowsOffset: number
  } | null
  detail: string
}

/**
 * Theoretical FCF = Normalized Income − Essential Expenses − Mandatory Debt
 * Payments (the spec's own formula, verbatim). The gap against the actual
 * net cash flow already computed per month is attributed across 6 buckets
 * that are an EXACT algebraic decomposition of
 * `(actualNetCashFlow - theoreticalFcf)`, not an estimate:
 *
 *   gap = (totalInflow - normalizedIncome)                         [nonIncomeInflowsOffset, sign-flipped — it REDUCES the gap]
 *       - (creditCardPayments + transferOutflows + cashWithdrawals
 *          + discretionaryExpenses + otherFinancialAndUnclassifiedOutflows)
 *
 * because `totalOutflow - essentialExpenses - mandatoryDebtPayments` splits
 * exactly into those five outflow buckets (financialExpenses always equals
 * mandatoryDebtPayments + creditCardPayments + other-financial subcategories
 * — see monthly-aggregator.ts). A unit test asserts the buckets sum to the
 * gap within floating-point tolerance for every fixture.
 */
export function computeFcfReconciliation(months: MonthlyFinancialAggregateInput[], gapPercentThreshold: number): FcfReconciliationResult {
  if (months.length === 0) {
    return { availability: 'INSUFFICIENT_DATA', totalTheoreticalFcf: null, totalActualNetCashFlow: null, gapRupees: null, gapPercent: null, unreconciled: false, attribution: null, detail: 'No monthly data is available to compute FCF reconciliation.' }
  }

  const totalNormalizedIncome = sum(months.map((m) => m.normalizedIncome))
  const totalEssentialExpenses = sum(months.map((m) => m.essentialExpenses))
  const totalMandatoryDebtPayments = sum(months.map((m) => m.mandatoryDebtPayments))
  const totalTheoreticalFcf = totalNormalizedIncome - totalEssentialExpenses - totalMandatoryDebtPayments

  const totalActualNetCashFlow = sum(months.map((m) => m.netCashFlow))
  const totalInflow = sum(months.map((m) => m.totalInflow))
  const totalOutflow = sum(months.map((m) => m.totalOutflow))
  const totalCreditCardPayments = sum(months.map((m) => m.creditCardPayments))
  const totalTransferOutflows = sum(months.map((m) => m.transferOutflows))
  const totalCashWithdrawals = sum(months.map((m) => m.cashWithdrawals))
  const totalDiscretionaryExpenses = sum(months.map((m) => m.discretionaryExpenses))

  // otherOutflow = totalOutflow - essentialExpenses - mandatoryDebtPayments
  // (the full debit-side gap against theoreticalFcf's own exclusions);
  // subtracting the four explicit buckets leaves exactly the remainder —
  // "other financial" (insurance/investment) + anything OTHER/UNCLASSIFIED
  // on the debit side. Verified by this file's own unit test to sum back
  // to `gapRupees` exactly (within floating-point tolerance).
  const otherOutflow = totalOutflow - totalEssentialExpenses - totalMandatoryDebtPayments
  const otherFinancialAndUnclassifiedOutflows = otherOutflow - totalCreditCardPayments - totalTransferOutflows - totalCashWithdrawals - totalDiscretionaryExpenses
  const nonIncomeInflowsOffset = totalInflow - totalNormalizedIncome

  const gapRupees = Math.round((totalActualNetCashFlow - totalTheoreticalFcf) * 100) / 100
  const gapPercent = totalTheoreticalFcf !== 0 ? Math.round((Math.abs(gapRupees) / Math.abs(totalTheoreticalFcf)) * 1000) / 10 : null
  // Falls back to a share-of-income test when the theoretical FCF is itself
  // near zero (a percentage against a near-zero denominator would otherwise
  // be meaninglessly large or undefined) — never silently reports "0% gap".
  const unreconciled =
    gapPercent !== null
      ? gapPercent > gapPercentThreshold
      : totalNormalizedIncome > 0 && Math.abs(gapRupees) / totalNormalizedIncome > gapPercentThreshold / 100

  return {
    availability: 'AVAILABLE',
    totalTheoreticalFcf: Math.round(totalTheoreticalFcf),
    totalActualNetCashFlow: Math.round(totalActualNetCashFlow),
    gapRupees,
    gapPercent,
    unreconciled,
    attribution: {
      creditCardPayments: Math.round(totalCreditCardPayments),
      transferOutflows: Math.round(totalTransferOutflows),
      cashWithdrawals: Math.round(totalCashWithdrawals),
      discretionaryExpenses: Math.round(totalDiscretionaryExpenses),
      otherFinancialAndUnclassifiedOutflows: Math.round(otherFinancialAndUnclassifiedOutflows),
      nonIncomeInflowsOffset: Math.round(nonIncomeInflowsOffset),
    },
    detail: unreconciled
      ? `Theoretical free cash flow (₹${Math.round(totalTheoreticalFcf)}) diverges from actual net cash flow (₹${Math.round(totalActualNetCashFlow)}) by ${gapPercent ?? 'a large'}% — spending/transfers outside the Essential/Mandatory-Debt definition account for the difference.`
      : 'Theoretical free cash flow approximately matches actual net cash flow for the statement window.',
  }
}

// --- DSR breakdown (fixed / total / with-discretionary) -----------------

export interface DsrBreakdownResult {
  availability: DataAvailability
  dsrFixedPercent: number | null
  dsrTotalPercent: number | null
  dsrWithDiscretionaryPercent: number | null
  detail: string
}

/**
 * `dsrFixedPercent` mirrors F08 exactly (mandatory EMI/loan repayment only
 * — the existing, scored metric). `dsrTotalPercent` and
 * `dsrWithDiscretionaryPercent` are new, NON-scoring context metrics the
 * spec asks for alongside it — they never feed back into the 9-component
 * score, only into this module's own reporting surface.
 */
export function computeDsrBreakdown(months: MonthlyFinancialAggregateInput[]): DsrBreakdownResult {
  const totalIncome = sum(months.map((m) => m.normalizedIncome))
  if (totalIncome <= 0) {
    return { availability: 'NOT_REPORTED', dsrFixedPercent: null, dsrTotalPercent: null, dsrWithDiscretionaryPercent: null, detail: 'No normalized income is available to calculate a debt service ratio.' }
  }

  const totalMandatoryDebtPayments = sum(months.map((m) => m.mandatoryDebtPayments))
  const totalCreditCardPayments = sum(months.map((m) => m.creditCardPayments))
  const totalDiscretionaryExpenses = sum(months.map((m) => m.discretionaryExpenses))

  const dsrFixedPercent = Math.round((totalMandatoryDebtPayments / totalIncome) * 1000) / 10
  const dsrTotalPercent = Math.round(((totalMandatoryDebtPayments + totalCreditCardPayments) / totalIncome) * 1000) / 10
  const dsrWithDiscretionaryPercent = Math.round(((totalMandatoryDebtPayments + totalCreditCardPayments + totalDiscretionaryExpenses) / totalIncome) * 1000) / 10

  return {
    availability: 'AVAILABLE',
    dsrFixedPercent,
    dsrTotalPercent,
    dsrWithDiscretionaryPercent,
    detail: `Fixed-debt DSR ${dsrFixedPercent}%; including credit-card payments ${dsrTotalPercent}%; including discretionary spend ${dsrWithDiscretionaryPercent}%.`,
  }
}

// --- Score vs. cash flow divergence --------------------------------------

export interface ScoreCashflowDivergenceResult {
  availability: DataAvailability
  divergent: boolean
  totalScore: number | null
  deficitMonths: number
  lowBalanceFrequencyPercent: number | null
  fcfUnreconciled: boolean
  attentionOrWorseFlagCount: number
  detail: string
  /** Spec §15.3's own explicit marking — these exact thresholds are proposed, not yet validated against a labelled sample. Always true while this remains unvalidated; surfaced so CCR/reviewers never mistake this for settled, production-calibrated logic. */
  thresholdsRequireCalibration: true
}

/**
 * Spec's own trigger: (score>=60 AND [>=3 deficit months OR low-balance
 * frequency >20% OR FCF unreconciled]) OR (score>=40 AND >=5 risk signals
 * at ATTENTION-or-worse severity) — read verbatim off this module's own
 * already-computed totalScore/months/risk-flags, no new ingestion.
 *
 * Spec §15.3 marks these exact thresholds "⚠️ PROPOSED — REQUIRES
 * CALIBRATION... must be validated against a labelled sample before
 * production use." This is surfaced via `thresholdsRequireCalibration`
 * and in `detail` itself, never presented as settled, production-grade logic.
 */
export function computeScoreCashflowDivergence(
  totalScore: number | null,
  months: MonthlyFinancialAggregateInput[],
  liquidity: ComponentScoreResult,
  fcfUnreconciled: boolean,
  riskFlags: FinancialRiskFlagResult[],
): ScoreCashflowDivergenceResult {
  const deficitMonths = months.filter((m) => m.netCashFlow < 0).length
  const lowBalanceFrequencyPercent = liquidity.availability === 'AVAILABLE' ? (liquidity.evidence.lowBalanceFrequencyPercent as number) : null
  const attentionOrWorseFlagCount = riskFlags.filter((f) => f.severity === 'ATTENTION' || f.severity === 'ELEVATED' || f.severity === 'CRITICAL').length

  const CALIBRATION_CAVEAT = 'These divergence thresholds are PROPOSED and not yet validated against a labelled sample (spec §15.3) — treat as an indicative signal, not a calibrated production rule.'

  if (totalScore === null) {
    return { availability: 'INSUFFICIENT_DATA', divergent: false, totalScore: null, deficitMonths, lowBalanceFrequencyPercent, fcfUnreconciled, attentionOrWorseFlagCount, detail: 'The Financial Health Score is not available — divergence cannot be assessed.', thresholdsRequireCalibration: true }
  }

  const strongScoreWithStressSignals = totalScore >= 60 && (deficitMonths >= 3 || (lowBalanceFrequencyPercent !== null && lowBalanceFrequencyPercent > 20) || fcfUnreconciled)
  const moderateScoreWithManyFlags = totalScore >= 40 && attentionOrWorseFlagCount >= 5
  const divergent = strongScoreWithStressSignals || moderateScoreWithManyFlags

  return {
    availability: 'AVAILABLE',
    divergent,
    totalScore,
    deficitMonths,
    lowBalanceFrequencyPercent,
    fcfUnreconciled,
    attentionOrWorseFlagCount,
    thresholdsRequireCalibration: true,
    detail: (divergent
      ? `The Financial Health Score (${totalScore}) appears stronger than the underlying cash-flow evidence suggests — ${deficitMonths} deficit month(s), ${attentionOrWorseFlagCount} elevated-or-worse risk signal(s)${fcfUnreconciled ? ', and an unreconciled FCF gap' : ''}. Treat the score as provisional pending CCR review.`
      : 'The Financial Health Score is consistent with the underlying cash-flow evidence — no divergence detected.') + ` ${CALIBRATION_CAVEAT}`,
  }
}

// --- Data Quality Score (5-component, with caps) ------------------------

export interface DataQualityScoreResult {
  rawScore: number
  finalScore: number
  appliedCaps: Array<{ reason: string; capPoints: number }>
  components: {
    statementCompleteness: { score: number; maxPoints: number; detail: string }
    reconciliationStatus: { score: number; maxPoints: number; detail: string }
    classificationConfidence: { score: number; maxPoints: number; detail: string }
    statementHeaderCompleteness: { score: number; maxPoints: number; detail: string }
    otherAccountDetection: { score: number; maxPoints: number; detail: string }
  }
  band: 'Excellent' | 'Good' | 'Moderate' | 'Limited' | 'Poor'
  detail: string
}

export interface DataQualityInputs {
  monthsCovered: number
  idealMonthsCovered: number
  reconciliation: ReconciliationResult
  transactions: NormalizedTransactionInput[]
  statementHeaderFieldsPresent: number
  statementHeaderFieldsTotal: number
  otherAccountsLikely: boolean | null
  fcfUnreconciled: boolean
  businessPersonalMixed: boolean
  config: FinancialAnalysisConfig
}

/**
 * The spec's own 5-component formula (25/15/35/15/10 = 100), followed by a
 * cap system (`Final = min(raw, ...applicable caps)`). Two components are
 * necessarily proxies given this codebase's real data model — documented
 * inline rather than silently presented as the spec's literal identity-
 * verification/other-account-confirmation semantics (see
 * `statementHeaderCompleteness`'s and `otherAccountDetection`'s own
 * comments): customer-name/PAN/account-type/IFSC are not captured anywhere
 * in this schema (a genuine, separate gap — see the Missing Information
 * Register), and "other accounts" can only ever be inferred from this
 * statement's own self-transfer volume, never confirmed against another
 * bank's own records.
 */
export function buildDataQualityScore(inputs: DataQualityInputs): DataQualityScoreResult {
  const { reconciliation, transactions, config } = inputs

  // Statement Completeness — /25: months actually covered vs. the ideal window.
  const completenessRatio = inputs.idealMonthsCovered > 0 ? Math.min(1, inputs.monthsCovered / inputs.idealMonthsCovered) : 0
  const statementCompletenessScore = Math.round(completenessRatio * 25)

  // Reconciliation Status — /15: full credit when balances cross-foot within
  // tolerance, zero when they don't, half-credit when it couldn't be evaluated
  // at all (distinct from "evaluated and failed").
  const reconciliationScore = reconciliation.availability !== 'AVAILABLE' ? 8 : reconciliation.reconciled ? 15 : 0

  // Classification Confidence — /35: average per-transaction extraction/
  // classification confidence, penalized multiplicatively by the share of
  // transactions left UNCLASSIFIED (a statement that is both low-confidence
  // AND heavily unclassified should score far below one with only one of
  // those problems).
  const avgConfidence = transactions.length > 0 ? sum(transactions.map((t) => t.confidence)) / transactions.length : 0
  const unclassifiedCount = transactions.filter((t) => t.category === 'UNCLASSIFIED').length
  const unclassifiedSharePercent = transactions.length > 0 ? (unclassifiedCount / transactions.length) * 100 : 0
  const classificationConfidenceScore = Math.round(35 * avgConfidence * (1 - unclassifiedSharePercent / 100))

  // Statement Header Completeness — /15 (spec's "Identity Data Completeness"
  // sub-component, renamed here — see this function's own doc comment for why).
  const headerRatio = inputs.statementHeaderFieldsTotal > 0 ? inputs.statementHeaderFieldsPresent / inputs.statementHeaderFieldsTotal : 0
  const statementHeaderScore = Math.round(headerRatio * 15)

  // Other-Account Detection — /10 (proxy only — see doc comment above).
  const otherAccountScore = inputs.otherAccountsLikely === null ? 5 : inputs.otherAccountsLikely ? 0 : 10

  const rawScore = statementCompletenessScore + reconciliationScore + classificationConfidenceScore + statementHeaderScore + otherAccountScore

  const appliedCaps: Array<{ reason: string; capPoints: number }> = []
  if (unclassifiedSharePercent > config.dataQualityUnclassifiedSharePercentThreshold) {
    appliedCaps.push({ reason: `${Math.round(unclassifiedSharePercent)}% of transactions are unclassified`, capPoints: config.dataQualityUnclassifiedCapPoints })
  }
  if (inputs.otherAccountsLikely === true) {
    appliedCaps.push({ reason: 'Other accounts likely (unconfirmed self-transfer volume outside this statement)', capPoints: config.dataQualityOtherAccountsCapPoints })
  }
  if (inputs.fcfUnreconciled) {
    appliedCaps.push({ reason: 'FCF reconciliation gap exceeds threshold', capPoints: config.dataQualityFcfUnreconciledCapPoints })
  }
  if (reconciliation.availability === 'AVAILABLE' && reconciliation.reconciled === false) {
    appliedCaps.push({ reason: 'Opening/closing balance reconciliation failed', capPoints: config.dataQualityReconciliationFailedCapPoints })
  }
  if (inputs.businessPersonalMixed) {
    appliedCaps.push({ reason: 'Business and personal transactions appear mixed in this statement', capPoints: config.dataQualityBusinessPersonalMixedCapPoints })
  }

  const finalScore = Math.min(rawScore, ...appliedCaps.map((c) => c.capPoints))
  const band = finalScore >= 90 ? 'Excellent' : finalScore >= 75 ? 'Good' : finalScore >= 60 ? 'Moderate' : finalScore >= 40 ? 'Limited' : 'Poor'

  return {
    rawScore,
    finalScore,
    appliedCaps,
    components: {
      statementCompleteness: { score: statementCompletenessScore, maxPoints: 25, detail: `${inputs.monthsCovered} of ${inputs.idealMonthsCovered} ideal month(s) covered.` },
      reconciliationStatus: { score: reconciliationScore, maxPoints: 15, detail: reconciliation.detail },
      classificationConfidence: { score: classificationConfidenceScore, maxPoints: 35, detail: `Average confidence ${Math.round(avgConfidence * 100)}%, ${Math.round(unclassifiedSharePercent)}% unclassified.` },
      statementHeaderCompleteness: { score: statementHeaderScore, maxPoints: 15, detail: `${inputs.statementHeaderFieldsPresent} of ${inputs.statementHeaderFieldsTotal} statement header field(s) captured (bank/account/period/account-holder) — PAN is never captured from a bank statement; see the Missing Information Register.` },
      otherAccountDetection: { score: otherAccountScore, maxPoints: 10, detail: inputs.otherAccountsLikely === null ? 'Not evaluated.' : inputs.otherAccountsLikely ? 'Self-transfer volume suggests funds routed to an account outside this statement — not confirmed.' : 'No material self-transfer volume suggesting an undisclosed account.' },
    },
    band,
    detail: appliedCaps.length > 0
      ? `Raw data quality score ${rawScore}/100, capped to ${finalScore} by: ${appliedCaps.map((c) => c.reason).join('; ')}.`
      : `Data quality score ${finalScore}/100.`,
  }
}

// --- Missing Information Register ---------------------------------------

export interface MissingInformationItem {
  category: string
  status: 'NOT_CAPTURED' | 'PARTIAL'
  description: string
  reason: string
}

export interface MissingInformationInputs {
  hasAnyBalanceData: boolean
  hasAccountHolderName: boolean
  hasIfscOrAccountType: boolean
  otherStatementsOnFileCount: number
  familyNetworkEntryCount: number
  businessPersonalMixed: boolean
}

/**
 * L2's own structural limits, surfaced honestly rather than silently
 * omitted — every item here reflects a genuine gap in this codebase's data
 * model or detection scope, not a placeholder. Several items that were
 * NOT_CAPTURED before this phase are now PARTIAL (family network, event
 * detection subset, business/personal mixing, customer identity) because
 * real, evidence-based detection now exists for them — but each is still
 * explicitly caveated as inferred/incomplete, never claimed as a verified
 * fact L2 can hand off without CCR review.
 */
export function buildMissingInformationRegister(inputs: MissingInformationInputs): MissingInformationItem[] {
  const items: MissingInformationItem[] = [
    {
      category: 'Customer identity',
      status: inputs.hasAccountHolderName || inputs.hasIfscOrAccountType ? 'PARTIAL' : 'NOT_CAPTURED',
      description: 'PAN is never captured from a bank statement. Account holder name/IFSC/account type are captured only when the statement header explicitly states them.',
      reason: inputs.hasAccountHolderName || inputs.hasIfscOrAccountType ? 'This statement\'s own header supplied some identity fields; PAN and cross-verification against the CRM record remain out of scope for this module.' : 'This statement\'s header did not state these fields in a recognized format — a genuine extraction gap, not a parsing failure.',
    },
    { category: 'Narration detail fields', status: 'PARTIAL', description: 'Transaction mode, reference number, counterparty, purpose, and counterparty bank are now parsed for UPI/IMPS/NEFT/RTGS/ACH/SB-formatted narrations; other banks\' narration formats are not yet covered.', reason: 'Parsing is structural (slash/dash-delimited), not a general narration-understanding model — a bank with a differently formatted narration yields narrationDetail: null for every field.' },
    {
      category: 'Multi-account aggregation',
      status: inputs.otherStatementsOnFileCount > 0 ? 'PARTIAL' : 'NOT_CAPTURED',
      description: inputs.otherStatementsOnFileCount > 0
        ? `${inputs.otherStatementsOnFileCount} other statement(s) are on file for this lead, surfaced for reference; their monthly figures are NOT merged into this statement's totals.`
        : 'Each uploaded statement is analyzed independently; no other statement is currently on file for this lead.',
      reason: 'Merging monthly financials across accounts risks double-counting inter-account transfers without a much more rigorous reconciliation step than this phase implements — deferred as a correctness-risk, not a missing feature.',
    },
    {
      category: 'Family / household transfer network',
      status: inputs.familyNetworkEntryCount > 0 ? 'PARTIAL' : 'NOT_CAPTURED',
      description: inputs.familyNetworkEntryCount > 0
        ? `${inputs.familyNetworkEntryCount} counterpart(y/ies) show a signal pattern (recurring, personal name, bidirectional and/or surname match) consistent with a family/household transfer.`
        : 'No counterparty in this statement matched enough signals to suggest a family/household transfer relationship.',
      reason: 'This is an INFERRED pattern only — this module can never confirm an actual relationship from a bank statement alone (see "What L2 Cannot Decide"); CCR must ask the customer directly.',
    },
    { category: 'Event detection — income transition, medical, bonus, related-party employer', status: 'PARTIAL', description: 'Detected from real transaction evidence where present (recurring-income-source change, Medical-subcategory spend, one-off large credits, configured affiliate-name matches).', reason: 'Each of these is a pattern match over already-classified transactions, not a verified narrative — CCR must still confirm the underlying cause.' },
    { category: 'Event detection — job loss, marital event, bereavement, property event', status: 'NOT_CAPTURED', description: 'These events are not detected at all.', reason: 'No bank-statement pattern reliably distinguishes these from an ordinary income/expense change without speculative assumptions this module deliberately avoids making.' },
    { category: 'Other-account confirmation', status: 'PARTIAL', description: 'OTHER_ACCOUNTS_LIKELY is inferred from self-transfer volume, refined by counterparty-bank parsing where the narration states a different bank.', reason: 'A single account\'s statement cannot confirm the destination account\'s true owner or balance — this is a proxy signal, not a verified finding.' },
    {
      category: 'Business/personal transaction mixing',
      status: inputs.businessPersonalMixed ? 'PARTIAL' : 'NOT_CAPTURED',
      description: inputs.businessPersonalMixed
        ? 'Both a personal income subcategory (Salary/Pension) and a Business-income subcategory credit were identified in this statement.'
        : 'No co-occurring personal and business income subcategory was identified in this statement.',
      reason: 'This only detects CO-OCCURRENCE of both patterns already classified elsewhere — it cannot separate which individual transactions are business-purpose without the customer\'s own business statements.',
    },
  ]
  if (!inputs.hasAnyBalanceData) {
    items.push({ category: 'Running balance', status: 'NOT_CAPTURED', description: 'No transaction in this statement reports a running balance.', reason: 'Liquidity, reconciliation, and low-balance analysis could not be performed for this statement.' })
  }
  return items
}

// --- Extended risk flags (thin wrappers over already-computed data) -----

export interface ExtendedRiskFlagInputs {
  months: MonthlyFinancialAggregateInput[]
  incomeStability: ComponentScoreResult
  reconciliation: ReconciliationResult
  fcfReconciliation: FcfReconciliationResult
  config: FinancialAnalysisConfig
  normalizedTransactions: NormalizedTransactionInput[]
  p2pCounterparties: P2PCounterpartySummary[]
  roundTripPairCount: number
  familyNetworkEntryCount: number
  businessPersonalMixed: boolean
  incomeTransition: IncomeTransitionResult
  medicalEvents: MedicalEventResult
  relatedPartyEmployer: { detected: boolean; matchedName: string | null }
  bonusCount: number
}

export function buildExtendedRiskFlags(input: ExtendedRiskFlagInputs): FinancialRiskFlagResult[] {
  const flags: FinancialRiskFlagResult[] = []
  const { months, incomeStability, reconciliation, fcfReconciliation, config } = input

  // --- Reconciliation ---
  if (reconciliation.availability === 'AVAILABLE' && reconciliation.reconciled === false) {
    flags.push(flag('RECONCILIATION_FAILED', 'ATTENTION', `Opening balance plus classified credits/debits does not match the reported closing balance (gap ₹${Math.round(Math.abs(reconciliation.gapRupees ?? 0))}).`, { gapRupees: reconciliation.gapRupees }))
  }

  // --- FCF ---
  if (fcfReconciliation.availability === 'AVAILABLE' && fcfReconciliation.unreconciled) {
    flags.push(flag('FCF_UNRECONCILED', fcfReconciliation.gapPercent !== null && fcfReconciliation.gapPercent > 60 ? 'ELEVATED' : 'ATTENTION', fcfReconciliation.detail, { gapPercent: fcfReconciliation.gapPercent, gapRupees: fcfReconciliation.gapRupees }))
  }

  // --- Income ---
  if (incomeStability.availability === 'AVAILABLE') {
    const largestMonthSharePercent = incomeStability.evidence.largestMonthSharePercent as number
    if (largestMonthSharePercent >= config.singleSourceDependencyThresholdPercent) {
      flags.push(flag('SINGLE_SOURCE_DEPENDENCY', 'ATTENTION', `${largestMonthSharePercent}% of normalized income is concentrated in a single month/source.`, { largestMonthSharePercent }))
    }
  }

  // --- Cash flow trend (positive-news flags, explicitly enumerated) ---
  const deficitMonths = months.filter((m) => m.netCashFlow < 0).length
  if (months.length > 0 && deficitMonths === 0) {
    flags.push(flag('NO_CURRENT_DEFICIT', 'POSITIVE', 'No month in the statement window showed a net cash-flow deficit.', { deficitMonths: 0 }))
  }
  if (months.length >= 4) {
    const sortedByMonth = [...months].sort((a, b) => a.periodMonth.getTime() - b.periodMonth.getTime())
    const midpoint = Math.floor(sortedByMonth.length / 2)
    const firstHalfAvg = sum(sortedByMonth.slice(0, midpoint).map((m) => m.normalizedIncome)) / midpoint
    const secondHalfAvg = sum(sortedByMonth.slice(midpoint).map((m) => m.normalizedIncome)) / (sortedByMonth.length - midpoint)
    if (firstHalfAvg > 0 && secondHalfAvg > firstHalfAvg * 1.15) {
      const increasePercent = Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100)
      flags.push(flag('INCOME_INCREASED', 'POSITIVE', `Normalized income in the second half of the statement window is ${increasePercent}% higher than the first half.`, { increasePercent }))
    }
  }

  // --- Other accounts (proxy; refined when counterparty-bank evidence is available — v4.0 spec §3.7) ---
  const totalNormalizedIncome = sum(months.map((m) => m.normalizedIncome))
  const selfTransfers = input.normalizedTransactions.filter((t) => t.subcategory === 'Self transfer' && t.direction === 'CREDIT')
  const namedOtherBankTotal = sum(selfTransfers.filter((t) => t.narrationDetail?.counterpartyBank).map((t) => t.amount))
  const selfTransferCreditTotal = namedOtherBankTotal > 0 ? namedOtherBankTotal : sum(selfTransfers.map((t) => t.amount))
  const selfTransferIncomeSharePercent = totalNormalizedIncome > 0 ? (selfTransferCreditTotal / totalNormalizedIncome) * 100 : 0
  if (totalNormalizedIncome > 0 && selfTransferIncomeSharePercent > config.otherAccountsLikelyIncomeSharePercent) {
    const otherBanks = [...new Set(selfTransfers.map((t) => t.narrationDetail?.counterpartyBank).filter((b): b is string => !!b))]
    flags.push(
      flag(
        'OTHER_ACCOUNTS_LIKELY',
        'INFORMATIONAL',
        otherBanks.length > 0
          ? `Self-transfer credits naming another bank (${otherBanks.join(', ')}) are ${Math.round(selfTransferIncomeSharePercent)}% of normalized income.`
          : `Self-transfer credits are ${Math.round(selfTransferIncomeSharePercent)}% of normalized income — this statement alone cannot confirm whether the receiving account is at another bank.`,
        { selfTransferIncomeSharePercent: Math.round(selfTransferIncomeSharePercent), otherBanks: otherBanks.length > 0 ? otherBanks.join(', ') : null },
      ),
    )
  }

  // --- Large Recurring Transfer ---
  for (const lrt of findLargeRecurringTransfers(input.p2pCounterparties, config)) {
    flags.push(flag('LARGE_RECURRING_TRANSFER', 'INFORMATIONAL', `${lrt.occurrences} recurring transfers totaling ₹${lrt.totalVolume} with a counterparty (avg ₹${lrt.averagePerTransfer}/transfer) — warrants investigation, not a conclusion.`, { occurrences: lrt.occurrences, totalVolume: lrt.totalVolume, averagePerTransfer: lrt.averagePerTransfer }))
  }

  // --- Round trip (v4.0 spec §5.4 — real detector, see round-trip-detector.ts) ---
  if (input.roundTripPairCount > 0) {
    flags.push(flag('ROUND_TRIP', 'INFORMATIONAL', `${input.roundTripPairCount} round-trip transaction pair(s) detected (same-amount debit+credit within 48 hours) — excluded from income and expense.`, { roundTripPairCount: input.roundTripPairCount }))
  }

  // --- Family network (v4.0 spec §5.7 — INFERRED only, never a verified relationship) ---
  if (input.familyNetworkEntryCount > 0) {
    flags.push(flag('TRANSFER_FAMILY', 'INFORMATIONAL', `${input.familyNetworkEntryCount} counterpart(y/ies) show a signal pattern consistent with a family/household transfer relationship — inferred, not confirmed.`, { familyNetworkEntryCount: input.familyNetworkEntryCount }))
  }

  // --- Business/personal mixing (v4.0 spec §19 — real co-occurrence evidence only) ---
  if (input.businessPersonalMixed) {
    flags.push(flag('BUSINESS_PERSONAL_MIXED', 'ATTENTION', 'Both a personal income subcategory (Salary/Pension) and a Business-income subcategory credit were identified in this statement.', {}))
  }

  // --- Income transition (v4.0 spec §6.6) ---
  if (input.incomeTransition.detected) {
    flags.push(
      flag(
        'INCOME_TRANSITION',
        'ATTENTION',
        `Normalized income shifted from ₹${input.incomeTransition.previousAverage}/month to ₹${input.incomeTransition.currentAverage}/month (${input.incomeTransition.deltaPercent}%) around ${input.incomeTransition.transitionMonth?.toISOString().slice(0, 7)}.`,
        { previousAverage: input.incomeTransition.previousAverage, currentAverage: input.incomeTransition.currentAverage, deltaPercent: input.incomeTransition.deltaPercent },
      ),
    )
  }

  // --- Bonus (v4.0 spec §6.5 — informational, already excluded from normalized income) ---
  if (input.bonusCount > 0) {
    flags.push(flag('BONUS', 'INFORMATIONAL', `${input.bonusCount} one-off credit(s) classified as a bonus (>${config.bonusSalaryMultiplier}x the detected recurring income) — excluded from normalized income.`, { bonusCount: input.bonusCount }))
  }

  // --- Medical shock / chronic (v4.0 spec §11.5) ---
  if (input.medicalEvents.shockMonths.length > 0) {
    const worst = input.medicalEvents.shockMonths.reduce((a, b) => (b.total > a.total ? b : a))
    flags.push(
      flag(
        'MEDICAL_SHOCK',
        worst.acute ? 'ELEVATED' : 'ATTENTION',
        `Medical spend of ₹${Math.round(worst.total)} in ${worst.periodMonth.toISOString().slice(0, 7)}${worst.acute ? ` (${worst.incomeSharePercent}% of that month's income — ACUTE)` : ''}.`,
        { total: Math.round(worst.total), periodMonth: worst.periodMonth.toISOString().slice(0, 7), acute: worst.acute },
      ),
    )
  }
  if (input.medicalEvents.chronic) {
    flags.push(flag('CHRONIC_MEDICAL', 'ATTENTION', `Medical spend recurred across ${input.medicalEvents.monthlyEntries.length} distinct month(s).`, { monthCount: input.medicalEvents.monthlyEntries.length }))
  }

  // --- Related-party employer (v4.0 spec §6.7/§11.7 — compliance review required) ---
  if (input.relatedPartyEmployer.detected) {
    flags.push(flag('RELATED_PARTY_EMPLOYER', 'ATTENTION', `Income source narration matched a configured related-party/affiliate name (${input.relatedPartyEmployer.matchedName}) — compliance review required.`, { matchedName: input.relatedPartyEmployer.matchedName }))
  }

  // --- Unclassified transactions (v4.0 spec §13 — distinct from LOW_CLASSIFICATION_CONFIDENCE) ---
  const unclassifiedCount = input.normalizedTransactions.filter((t) => t.category === 'UNCLASSIFIED').length
  if (input.normalizedTransactions.length > 0) {
    const unclassifiedSharePercent = (unclassifiedCount / input.normalizedTransactions.length) * 100
    if (unclassifiedSharePercent > config.dataQualityUnclassifiedSharePercentThreshold) {
      flags.push(flag('UNCLASSIFIED_TRANSACTIONS', 'INFORMATIONAL', `${unclassifiedCount} transaction(s) (${Math.round(unclassifiedSharePercent)}%) could not be classified into any category — preserved as-is, never guessed.`, { unclassifiedCount, unclassifiedSharePercent: Math.round(unclassifiedSharePercent) }))
    }
  }

  // --- Merchant ambiguity (v4.0 spec §8.3) ---
  const ambiguousMerchantCount = input.normalizedTransactions.filter((t) => t.category === 'EXPENSE' && isAmbiguousMerchantMatch(t)).length
  if (ambiguousMerchantCount > 0) {
    flags.push(
      flag(
        'MERCHANT_AMBIGUOUS',
        'INFORMATIONAL',
        `${ambiguousMerchantCount} transaction(s) matched a generic merchant keyword (e.g. "shop"/"mall"/"kirana") rather than a specific named merchant — the classification stands, but carries lower certainty and is preserved for CCR confirmation.`,
        { ambiguousMerchantCount },
      ),
    )
  }

  return flags
}

// --- Transfer & P2P profile (v4.0 spec §5.8 Transfer Profile Output) ----

export interface TransferProfile {
  selfTransfers: { count: number; volumeDebit: number; volumeCredit: number; net: number }
  roundTrips: { count: number; volume: number }
  familyNetwork: FamilyNetworkEntry[]
  largeRecurringTransfers: Array<{ counterparty: string; occurrences: number; totalVolume: number; averagePerTransfer: number; band: 'LRT_HIGH' | 'LRT_MEDIUM' }>
  businessCounterparties: Array<{ counterparty: string; occurrences: number; totalVolume: number }>
  unclassifiedP2pCount: number
}

export function findLargeRecurringTransfers(counterparties: P2PCounterpartySummary[], config: FinancialAnalysisConfig) {
  return counterparties
    .map((c) => ({ counterparty: c.counterparty, occurrences: c.occurrences, totalVolume: c.totalInflow + c.totalOutflow, averagePerTransfer: c.occurrences > 0 ? (c.totalInflow + c.totalOutflow) / c.occurrences : 0, recurring: c.recurring }))
    .filter((c) => c.recurring && c.occurrences >= config.largeRecurringTransferMinOccurrences && c.totalVolume >= config.largeRecurringTransferMinTotalRupees && c.averagePerTransfer >= config.largeRecurringTransferMinAverageRupees)
    .map(({ counterparty, occurrences, totalVolume, averagePerTransfer }) => ({
      counterparty,
      occurrences,
      totalVolume: Math.round(totalVolume),
      averagePerTransfer: Math.round(averagePerTransfer),
      band: (totalVolume >= config.largeRecurringTransferHighVolumeRupees ? 'LRT_HIGH' : 'LRT_MEDIUM') as 'LRT_HIGH' | 'LRT_MEDIUM',
    }))
}

export function buildTransferProfile(
  transactions: NormalizedTransactionInput[],
  p2pCounterparties: P2PCounterpartySummary[],
  roundTripPairs: RoundTripPair[],
  familyNetwork: FamilyNetworkEntry[],
  unclassifiedP2pCount: number,
  config: FinancialAnalysisConfig,
): TransferProfile {
  const selfTransferTxns = transactions.filter((t) => t.subcategory === 'Self transfer')
  const volumeDebit = sum(selfTransferTxns.filter((t) => t.direction === 'DEBIT').map((t) => t.amount))
  const volumeCredit = sum(selfTransferTxns.filter((t) => t.direction === 'CREDIT').map((t) => t.amount))

  const familyCounterpartyNames = new Set(familyNetwork.map((f) => f.counterparty))
  const businessCounterparties = p2pCounterparties
    .filter((c) => !familyCounterpartyNames.has(c.counterparty) && BUSINESS_SUFFIX_PATTERN.test(c.counterparty))
    .map((c) => ({ counterparty: c.counterparty, occurrences: c.occurrences, totalVolume: Math.round(c.totalInflow + c.totalOutflow) }))

  return {
    selfTransfers: { count: selfTransferTxns.length, volumeDebit: Math.round(volumeDebit), volumeCredit: Math.round(volumeCredit), net: Math.round(volumeCredit - volumeDebit) },
    roundTrips: { count: roundTripPairs.length, volume: Math.round(sum(roundTripPairs.map((p) => p.amount))) },
    familyNetwork,
    largeRecurringTransfers: findLargeRecurringTransfers(p2pCounterparties, config),
    businessCounterparties,
    unclassifiedP2pCount,
  }
}

// --- Event profile (v4.0 spec §11.8 Event Profile Output) ---------------

export interface EventProfile {
  incomeTransition: IncomeTransitionResult
  bonuses: BonusEntry[]
  medicalEvents: MedicalEventResult
  relatedPartyEmployer: { detected: boolean; matchedName: string | null }
  otherAccountsLikely: boolean
}

export function buildEventProfile(
  incomeTransition: IncomeTransitionResult,
  bonuses: BonusEntry[],
  medicalEvents: MedicalEventResult,
  relatedPartyEmployer: { detected: boolean; matchedName: string | null },
  otherAccountsLikely: boolean,
): EventProfile {
  return { incomeTransition, bonuses, medicalEvents, relatedPartyEmployer, otherAccountsLikely }
}
