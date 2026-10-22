/**
 * Plain, Prisma-independent shapes for the pure reconciliation/synthesis
 * functions in calculations/ — same convention debt-analysis.types.ts and
 * financial-analysis.types.ts already established, so every calculation can
 * be unit-tested with plain object literals.
 *
 * Master Profile never re-reads CreditAccount/NormalizedTransaction/etc.
 * Prisma rows directly, and never recalculates a ratio/score either sibling
 * module already computed. The *Facts shapes below are deliberately thin,
 * distilled projections of DebtAnalysisService.getForLead()'s `level1` and
 * FinancialAnalysisService.getForLead()'s COMPLETED shape — built once by
 * the orchestration service (master-profile.service.ts) and passed into
 * every pure function below.
 */

import type { MonthlyFinancialAggregateInput } from '@/modules/financial-analysis/financial-analysis.types'

export type DataAvailability = 'AVAILABLE' | 'NOT_REPORTED' | 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA'

/**
 * BBS Master Profile Module v3.0 §12.1's exact 5-state classification.
 * COMPLIANCE_HOLD always supersedes every other state when a related-party
 * or legal compliance flag is active (§12.3) — it is a real alignment state
 * here, not merely a UI banner, because it is persisted and read by
 * downstream consumers exactly like the other 4 states.
 */
export type CreditFinancialAlignmentState =
  | 'ALIGNED_HEALTHY'
  | 'CREDIT_STRONG_FINANCIAL_STRESSED'
  | 'CREDIT_STRESSED_FINANCIAL_STRONG'
  | 'BOTH_STRESSED'
  | 'COMPLIANCE_HOLD'

/** v3.0 §16.5's exact 6-band resolution-capacity table. */
export type ResolutionCapacityLevel = 'STRONG' | 'MODERATE' | 'TIGHT' | 'MARGINAL' | 'NONE' | 'UNKNOWN'

/** v3.0 §4.4.1's qualitative Data Quality band — replaces a numeric score entirely. */
export type MasterDataQualityBand = 'HIGH' | 'MODERATE' | 'LOW_MODERATE' | 'LOW' | 'INSUFFICIENT'

/** v3.0 §22.2's readiness-gate outcome. */
export type ReadinessOutcome = 'READY' | 'CCR_FIRST' | 'COMPLIANCE_HOLD' | 'SPECIALIST_REVIEW' | 'X1_CANDIDATE' | 'REGENERATE'

/** v3.0 §20.2's Missing Information Register priority tiers. */
export type MirPriority = 'P1' | 'P2' | 'P3'

/** The spec's own confidence model (Part 21/27). */
export type MasterConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'

/**
 * BBS Master Profile Module v3.0 §5.2's 8-state credit<->bank reconciliation
 * match — richer than Financial Analysis's own 3-key risk-flag vocabulary
 * (CREDIT_BANK_MATCH/CREDIT_OBLIGATION_NOT_OBSERVED/UNMATCHED_DEBT_PAYMENT),
 * which buildReconciliationRows() translates into these states rather than
 * recomputing the match itself. NOT_OBSERVED must never be read as "missed
 * payment" (the spec's own explicit instruction). POST_STATEMENT means the
 * L1 account was opened after the L2 statement period ended (§5.7) — its
 * repayment behaviour cannot be assessed from the current statement.
 */
export type ReconciliationMatchState =
  | 'MATCHED'
  | 'PARTIALLY_MATCHED'
  | 'NOT_OBSERVED'
  | 'UNMATCHED_PAYMENT'
  | 'AMOUNT_MISMATCH'
  | 'TIMING_MISMATCH'
  | 'POST_STATEMENT'
  | 'UNKNOWN'

/** Spec Part 23 — always UNKNOWN in this version (see schema.prisma's FinancialTrajectory doc comment for why). */
export type FinancialTrajectory = 'IMPROVING' | 'STABLE' | 'DETERIORATING' | 'VOLATILE' | 'UNKNOWN'

/** Spec Part 20/24 — every possible cause must carry one of these, never presented as established fact. */
export type CauseConfidence = 'OBSERVED' | 'SUPPORTED' | 'POSSIBLE' | 'UNKNOWN'

// --- Distilled upstream facts --------------------------------------------

export interface DebtAccountFact {
  lender: string
  accountType: string
  openedOn: string
  currentBalance: number
  monthlyEmiAmount: number | null
  lifecycleStatus: string | null
}

/**
 * Distilled from DebtAnalysisService.getForLead()'s `level1` object — see
 * master-profile.service.ts's assembly. The credit report's own pulledAt
 * date (used by detectDateAlignment) is passed as that function's own
 * standalone argument rather than duplicated as a field here.
 */
export interface DebtAnalysisFacts {
  creditScore: number | null
  scoreBand: string
  totalAccounts: number | null
  activeAccounts: number
  totalOutstanding: number
  totalOverdue: number | null
  monthlyEmi: number | null
  numbersOfLenders: number
  top3LendersSharePercent: number | null
  securedPercent: number | null
  unsecuredPercent: number | null
  currentMaxDpd: number | null
  maxHistoricalDpd: number | null
  writtenOffCount: number
  settledCount: number
  suitFiledCount: number
  restructuredCount: number
  willfulDefault: boolean | null
  recentEnquiries: number | null
  substantialRecentConcentration: boolean
  borrowingClusterDetected: boolean
  debtServiceRatio: { availability: DataAvailability; debtServiceRatioPercent: number | null; monthlyIncome: number | null }
  debtToIncome: { availability: DataAvailability; dtiPercent: number | null }
  stressLevel: 'Stable' | 'Attention' | 'High Attention' | 'Critical'
  stressSignals: string[]
  accounts: DebtAccountFact[]
  /** Debt Analysis's own §4.3 Data Quality Score (0-100) — read directly, never recomputed. */
  dataQualityTotal: number
  /** Debt Analysis's own already-computed data-quality flag codes (e.g. EMI_SCHEDULED_MISSING, HISTORY_INCOMPLETE, ACCOUNT_COUNT_MISMATCH) — v3.0 §4.4.2's "inherited from L1" flags are these exact codes, not reinvented here. */
  dataQualityFlagCodes: string[]
  /** Debt Analysis's own §5.5 Missing Information Register items — folded into Master Profile's own §20 register, never reinvented. */
  missingInformationItems: Array<{ category: string; description: string }>
}

/**
 * Deliberately the SAME type Financial Analysis's own scoring functions use
 * (aliased, not re-defined) — compareDebtServicing() in
 * calculations/debt-servicing.ts calls debtServicingCapacityScore() from
 * financial-analysis/scoring directly, so every month object flowing
 * through this module must already satisfy that function's real input
 * type. Keeping one shared type (rather than two near-identical ones)
 * means a future field added to MonthlyFinancialAggregateInput can't
 * silently drift out of sync here.
 */
export type MonthlyFact = MonthlyFinancialAggregateInput

export interface FinancialRiskFlagFact {
  key: string
  severity: string
  detail: string
  evidence: Record<string, unknown>
  relatedMonth: Date | null
}

/** Distilled from FinancialAnalysisService.getForLead()'s COMPLETED shape. */
export interface FinancialAnalysisFacts {
  statementPeriodStart: Date | null
  statementPeriodEnd: Date | null
  bankName: string | null
  accountNumberMasked: string | null
  months: MonthlyFact[]
  riskFlags: FinancialRiskFlagFact[]
  totalScore: number | null
  scorePartial: boolean
  stressIndicator0to100: number
  stressBand: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL'
  /** Financial Analysis's own Data Quality Score (0-100, `finalScore`) — read directly, never recomputed. */
  dataQualityTotal: number
  /**
   * Financial Analysis's own already-computed related-party/BBS-affiliate
   * employer match (`detectRelatedPartyEmployer()`, config-driven via
   * `FINANCIAL_RELATED_PARTY_EMPLOYER_NAMES`) — v3.0 §14's compliance
   * routing reads this signal directly rather than re-detecting it, per
   * this module's own "never recalculates a ratio/score either sibling
   * module already computed" discipline.
   */
  relatedPartyEmployer: { detected: boolean; matchedName: string | null }
  /**
   * Financial Analysis's own already-computed inferred family/P2P network
   * (`detectFamilyNetwork()`, exposed via `transferProfile.familyNetwork`)
   * — v3.0 §9.2's Family Network Verification reframes these exact entries
   * for capacity-calculation purposes rather than re-detecting them.
   */
  familyNetwork: Array<{ counterparty: string; netFlow: number; direction: 'INBOUND' | 'OUTBOUND' | 'BIDIRECTIONAL'; confidence: 'HIGH' | 'MEDIUM'; signals: { recurring: boolean; personalNamePattern: boolean; bidirectional: boolean; surnameMatch: boolean } }>
  /**
   * Financial Analysis's own already-computed FCF reconciliation
   * (`computeFcfReconciliation()`, exposed via `score.extendedAnalysis.
   * fcfReconciliation`) — v3.0 §16.5's resolution-capacity band table reads
   * this directly (the `FCF_UNRECONCILED -> MARGINAL` cap rule), never
   * recomputing the reconciliation itself.
   */
  fcfReconciliationAvailable: boolean
  fcfUnreconciled: boolean
  /** Financial Analysis's own §5.5-equivalent Missing Information Register items — folded into Master Profile's own §20 register, never reinvented. */
  missingInformationItems: Array<{ category: string; description: string }>
}

export interface LeadIdentityFact {
  fullName: string
  phone: string
  email: string | null
  city: string | null
  panAvailable: boolean
  /**
   * The one-way HMAC of the PAN (see `hashPan()`), never the raw PAN
   * itself — safe to carry around and compare for equality, since this
   * schema never persists a plaintext PAN anywhere by design.
   */
  panRef: string | null
}

export interface CustomerIdentityFact {
  fullName: string | null
  phone: string | null
  email: string | null
  city: string | null
  dateOfBirth: Date | null
  gender: string | null
  occupation: string | null
  employmentType: string | null
  companyName: string | null
  designation: string | null
  monthlySalary: number | null
  panAvailable: boolean
  panRef: string | null
}

// --- Identity reconciliation ----------------------------------------------

export interface IdentityFieldValue {
  value: string
  source: 'LEAD_FORM' | 'CCR_VERIFIED'
}

export interface IdentityFieldResult {
  field: string
  canonicalValue: string | null
  sourceValues: IdentityFieldValue[]
  confidence: MasterConfidenceLevel
  conflict: boolean
}

export interface IdentitySnapshot {
  fields: IdentityFieldResult[]
  hasConflict: boolean
  panAvailable: boolean
  /**
   * BBS Master Profile Module v3.0 §3.3 G6 ("Identity consistent (PAN +
   * name)"): true only when BOTH Lead.panRef and Customer.panRef are
   * present AND their hashes differ — a genuine, CCR-actionable mismatch,
   * never raised merely because one side has no PAN on file at all (that
   * case is `panAvailable: false`/partial, not a conflict).
   */
  panRefConflict: boolean
}

// --- Debt-servicing comparison (Bureau / Bank / Master DSR) ---------------

export interface DsrComparisonResult {
  bureauDsr: { availability: DataAvailability; percent: number | null }
  bankDsr: { availability: DataAvailability; percent: number | null }
  masterDsr: { availability: DataAvailability; percent: number | null; confirmedMonthlyObligations: number | null }
  debtCoverage: { availability: DataAvailability; ratio: number | null }
}

// --- Credit <-> bank reconciliation ----------------------------------------

export interface ReconciliationRowResult {
  lender: string
  product: string | null
  reportedOutstanding: number | null
  reportedEmi: number | null
  observedPayment: number | null
  observedFrequencyMonths: number | null
  matchStatus: ReconciliationMatchState
  confidence: number | null
  explanation: string
}

// --- Master Stress Profile -------------------------------------------------

export interface StressProfileResult {
  level: 'Stable' | 'Attention' | 'High Attention' | 'Critical'
  drivers: string[]
  confidence: MasterConfidenceLevel
}

// --- Date alignment ----------------------------------------------------

export interface DateAlignmentResult {
  creditReportDate: string | null
  bankStatementPeriodStart: string | null
  bankStatementPeriodEnd: string | null
  aligned: boolean
  warning: string | null
}

// --- Evidence-backed signal lists (strengths/concerns/opportunities/causes/validation) ---

export interface SignalEvidence {
  key: string
  label: string
  detail: string
  confidence: MasterConfidenceLevel
  sourceModules: Array<'DEBT_ANALYSIS' | 'FINANCIAL_ANALYSIS'>
}

export interface PossibleCauseResult {
  key: string
  label: string
  detail: string
  causeConfidence: CauseConfidence
}

export interface ValidationRequiredItem {
  item: string
  why: string
}

// --- Resolution readiness & cohort vector --------------------------------

export interface ResolutionReadinessResult {
  level: ResolutionCapacityLevel
  factors: string[]
}

export type CreditScoreBand = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'NO_SCORE'
export type DebtBand = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'UNKNOWN'
export type IncomeBand = 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN'
export type RatioBand = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'UNKNOWN'

export interface CohortAttributeVector {
  creditScoreBand: CreditScoreBand
  currentDelinquency: boolean | null
  historicalDelinquency: boolean | null
  writeoffStatus: boolean | null
  settlementStatus: boolean | null
  totalDebtBand: DebtBand
  unsecuredDebtRatio: number | null
  recentBorrowingLevel: 'NONE' | 'MODERATE' | 'ELEVATED' | 'UNKNOWN'

  normalizedIncomeBand: IncomeBand
  incomeStability: 'STABLE' | 'VOLATILE' | 'UNKNOWN'
  freeCashflowBand: RatioBand
  debtServiceBand: RatioBand
  liquidityBand: RatioBand

  borrowingDependency: 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN'
  lenderCount: number | null
  cardUtilisation: RatioBand

  creditBankAlignment: CreditFinancialAlignmentState | null
  repaymentObserved: boolean | null
  financialStressLevel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'UNKNOWN'

  resolutionCapacity: ResolutionCapacityLevel
  dataConfidence: MasterConfidenceLevel
}

// --- v3.0 §4.4 Data Quality (band + flags, replaces a numeric score) -----

export interface DataQualityResult {
  band: MasterDataQualityBand
  flags: string[]
}

// --- v3.0 §14 Compliance routing -------------------------------------------

export interface ComplianceRoutingResult {
  complianceHold: boolean
  reason: string | null
  matchedEntity: string | null
  since: string | null
  slaHours: number | null
  escalationHours: number | null
}

// --- v3.0 §5.7 L1 post-statement debt ---------------------------------------

export interface PostStatementDebtResult {
  detected: boolean
  accountCount: number
  totalAmount: number
  repaymentUnverified: boolean
  ccrPriority: 'P1' | null
  accounts: Array<{ lender: string; outstanding: number; openedOn: string }>
}

// --- v3.0 §22 Readiness Gate -------------------------------------------------

export interface ReadinessConditionResult {
  code: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8'
  label: string
  passed: boolean
  detail: string
}

export interface ReadinessGateResult {
  conditions: ReadinessConditionResult[]
  outcome: ReadinessOutcome
  blockingFactors: string[]
}

// --- v3.0 §20 Missing Information Register (P1/P2/P3) -----------------------

export interface MissingInformationItemResult {
  itemText: string
  sourceModule: string
  priority: MirPriority
}

// --- v3.0 §4.2 Per-dimension confidence (5 named dimensions, §7) -----------

export type MasterDimensionName = 'IDENTITY_COMPLIANCE' | 'CREDIT_HEALTH' | 'INCOME_CASH_FLOW' | 'DEBT_LIQUIDITY' | 'ALIGNMENT_CAPACITY'

export type DimensionConfidences = Record<MasterDimensionName, MasterConfidenceLevel>

// --- v3.0 §9.2 Family network verification ----------------------------------

export interface FamilyNetworkMemberResult {
  name: string
  inferredRelation: string
  verificationStatus: 'UNVERIFIED' | 'VERIFIED'
  ccrAction: string
}

export interface FamilyNetworkVerificationResult {
  members: FamilyNetworkMemberResult[]
  treatedAsEssentialPendingCcr: boolean
}

// --- v3.0 §13.1 Three as-of dates --------------------------------------------

export interface AsOfDates {
  profileGeneratedAt: string | null
  l1DataAsOf: string | null
  l2DataAsOf: string | null
  combinedDataWindowStart: string | null
  combinedDataWindowEnd: string | null
}
