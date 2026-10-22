/**
 * Plain, Prisma-independent shapes for the pure rule-evaluation/precedence
 * functions in calculations/ — same convention debt-analysis.types.ts,
 * financial-analysis.types.ts, and master-profile.types.ts already
 * established, so every calculation can be unit-tested with plain object
 * literals.
 *
 * The Cohort Engine never reparses a credit report or bank statement, and
 * never recalculates a ratio/score any sibling module already computed —
 * `CohortInput` is a thin, distilled normalization built once by
 * cohort-engine.service.ts from Master Profile's own `cohortAttributes`
 * vector (built specifically for this purpose) plus a handful of
 * additional already-computed Debt Analysis / Financial Analysis fields
 * neither Master Profile nor Debt Analysis expose as a single ready-made
 * figure (sustainable surplus, capacity ratio, enquiry-burst/stacking-
 * index/active-overdue-ratio counts) — every one of those is still a
 * cheap derived read of an already-computed field, never a second
 * analysis engine over raw transactions/tradelines.
 */

export type DataAvailability = 'AVAILABLE' | 'NOT_REPORTED' | 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA'

/** Spec Part 27's exact 4-tier vocabulary for this module — deliberately distinct from every sibling module's own evidence scale. */
export type CohortEvidenceLevel = 'CONFIRMED' | 'DERIVED' | 'INDICATED' | 'UNKNOWN'

export type CohortRuleSeverity = 'HIGH' | 'MEDIUM' | 'LOW'

export type CohortConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'

/**
 * Spec's exact 11-priority precedence vocabulary (Cohort Precedence sheet)
 * plus CUSTOMER_UNRESPONSIVE — a real 13th value at the storage level, but
 * evaluated as a priority-0 short-circuit BEFORE any of the 22 rules run
 * (see cohort-engine.service.ts), never a competing row inside the
 * 11-priority table itself. The algorithmic engine never auto-assigns it
 * in v1 — no honest engagement/responsiveness signal exists anywhere in
 * this codebase yet; it is settable only through an explicit CCR override.
 */
export type CohortPrimaryState =
  | 'CONSENT_PENDING'
  | 'KYC_PENDING'
  | 'X1'
  | 'C6'
  | 'C5'
  | 'C4'
  | 'C3'
  | 'C2'
  | 'C1'
  | 'C7'
  | 'X2'
  | 'MANUAL_REVIEW'
  | 'CUSTOMER_UNRESPONSIVE'
  | 'COMPLIANCE_HOLD'
  | 'DATA_REFRESH_REQUIRED'
  | 'OTHER_ACCOUNTS_REQUIRED'
  | 'P1_INFORMATION_REQUIRED'
  | 'SPECIALIST_REQUIRED'
  | 'CCR_REQUIRED'

export type CohortArchetype = 'CIRCUMSTANTIAL' | 'DEBT_SPIRAL' | 'HABITUAL_AVOIDER' | 'UNCLASSIFIED'
export type CohortPathway = 'OPTIMISE' | 'STABILISE' | 'CONSOLIDATE' | 'RESTRUCTURE' | 'RESOLVE' | 'RECOVER'
export type CapacityBand = 'DISTRESSED' | 'STRESSED' | 'TIGHT' | 'COMFORTABLE' | 'UNKNOWN'
export type DebtComplexityBand = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH'
export type CohortPlanEligibility = 'DRAFT' | 'CCR_REVIEW' | 'SPECIALIST' | 'INSUFFICIENT_DATA' | 'OUT_OF_SCOPE'
export type DpdTrend = 'ESCALATING' | 'STABLE' | 'IMPROVING' | 'UNKNOWN'

/** v3.0 §4.2's blocked-reason-code vocabulary — a SUBSET of `CohortPrimaryState` (never a separate enum; see schema.prisma's own doc comment on why). */
export type CohortBlockedReasonCode = 'CONSENT_PENDING' | 'KYC_PENDING' | 'COMPLIANCE_HOLD' | 'DATA_REFRESH_REQUIRED' | 'OTHER_ACCOUNTS_REQUIRED' | 'P1_INFORMATION_REQUIRED' | 'MANUAL_REVIEW' | 'SPECIALIST_REQUIRED' | 'CCR_REQUIRED' | 'CUSTOMER_UNRESPONSIVE'
export type CohortLifecycleState = 'CCR_REVIEW' | 'CUSTOMER_ACCEPTANCE_PENDING' | 'EXECUTION_READY' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'CUSTOMER_DECLINED' | 'STALE_90D'
export type CohortComplianceAgingState = 'COMPLIANCE_HOLD' | 'COMPLIANCE_AGING' | 'COMPLIANCE_ESCALATED' | 'COMPLIANCE_CLEARED' | 'COMPLIANCE_DECLINED'
/** v3.0 §7.4: the compliance clear/decline feedback-loop action a compliance reviewer actually took — persisted on `CohortComplianceDecision`, distinct from the computed-on-read `CohortComplianceAgingState` above. */
export type CohortComplianceActionType = 'CLEARED' | 'DECLINED'
/** v3.0 §3.2's Master Profile readiness-gate routing — read verbatim from Master Profile's own already-computed `readinessGate.outcome`, never re-derived. */
export type MasterReadinessOutcome = 'READY' | 'CCR_FIRST' | 'COMPLIANCE_HOLD' | 'SPECIALIST_REVIEW' | 'X1_CANDIDATE' | 'REGENERATE'

export interface CohortEngineConfig {
  overdueCapacityTriggerRupees: number
  enquiryBurstThreshold30d: number
  stackingIndexPerYear: number
  activeOverdueRatioThreshold: number
  stressedCapacityRatioMax: number
  tightCapacityRatioMax: number
  stabilisationCoverageStrongMin: number
  stabilisationCoverageMinimum: number
  ruleVersion: string
  postStatementMinorMaxPercent: number
  postStatementMaterialMaxPercent: number
  otherAccountsMinorMaxPercent: number
  otherAccountsFlagMaxPercent: number
  p1ForceBlockThreshold: number
  exceptionSpecialistThreshold: number
  exceptionManualReviewThreshold: number
  complianceSlaRelatedPartyHours: number
  complianceSlaRegulatoryHours: number
  complianceSlaLegalHours: number
  ttlConsentPendingDays: number
  ttlKycPendingDays: number
  ttlDataRefreshRequiredDays: number
  ttlOtherAccountsRequiredDays: number
  ttlP1InformationRequiredDays: number
  ttlManualReviewRequiredDays: number
  ttlSpecialistRequiredDays: number
}

// --- CohortInput — the spec's own 8-group normalized shape --------------

export interface CohortLeadInput {
  leadId: string
  persona: string | null
  goal: string | null
  consentGranted: boolean
  consentVersion: string | null
  panAvailable: boolean
}

export interface CohortCreditInput {
  score: number | null
  scoreBand: string
  currentOverdue: number | null
  currentDpd: number | null
  historicalMaxDpd: number | null
  writeoffStatus: boolean | null
  settlementStatus: boolean | null
  suitFiled: boolean
  arcAssigned: boolean
  willfulDefault: boolean | null
  /** OR of suitFiled/willfulDefault/arcAssigned — "ownership dispute" has no data source in this codebase and never contributes (documented, never fabricated). */
  legalOrSpecialistTrigger: boolean
  enquiries30d: number | null
  dpdTrend: DpdTrend
  recentEnquiries: number | null
}

export interface CohortDebtInput {
  totalDebt: number
  unsecuredRatio: number | null
  activeAccounts: number
  lenderCount: number
  debtComplexityBand: DebtComplexityBand
  /** R010 (Recent stacking, "within 6 months") — reuses Debt Analysis's own already-computed `borrowing.clusterDetected` (>=2 accounts opened within 180 days) rather than introducing a second, redundant count+threshold. */
  recentStackingClusterDetected: boolean
  /** R012 (Stacking index, "accounts/year") — Debt Analysis's own borrowing.windows('12mo').newAccountCount, already annualized by the window itself. */
  newAccountsPerYear: number | null
  /** R013 (Active overdue ratio) — totalOverdue / totalActiveDebt, both already-computed Debt Analysis figures; null when totalActiveDebt is 0/unavailable, never a fabricated 0. */
  activeOverdueRatio: number | null
}

export interface CohortFinancialInput {
  verifiedIncomeAvailable: boolean
  verifiedMonthlyIncome: number | null
  essentialExpenses: number | null
  mandatoryDebtPayments: number | null
  sustainableSurplus: number | null
  capacityRatio: number | null
  capacityBand: CapacityBand
  liquidityBand: string
  incomeStability: 'STABLE' | 'VOLATILE' | 'UNKNOWN'
  /** No multi-snapshot income history exists anywhere in this codebase (single bank statement per lead) — always UNKNOWN, documented, never fabricated. */
  incomeTrajectory: 'UNKNOWN'
}

export interface CohortBehaviourInput {
  /** R009 — the closest already-computed signal is Financial Analysis's own BORROWING_DEPENDENCY_PATTERN risk flag (a loan credit followed by large transfers/withdrawals and a subsequent low balance). Confirmed-absent (false) is a real, available signal, not a gap. */
  borrowingToRepay: boolean
  recentBorrowingLevel: 'NONE' | 'MODERATE' | 'ELEVATED' | 'UNKNOWN'
}

export interface CohortReconciliationInput {
  creditBankAlignment: string | null
  repaymentObserved: boolean | null
  unresolvedMismatch: boolean
}

export interface CohortReadinessInput {
  debtAnalysisComplete: boolean
  financialAnalysisComplete: boolean
  masterProfileStale: boolean
  overallConfidence: CohortConfidenceLevel | null
  resolutionReadiness: string | null
  /** v3.0 §3.2 — Master Profile's own already-computed readiness-gate outcome, read verbatim, never re-derived by Cohort Engine. */
  readinessOutcome: MasterReadinessOutcome | null
}

export interface CohortCustomerInput {
  goal: string | null
  /** No engagement/last-contacted field exists anywhere in this codebase — always UNKNOWN (see CUSTOMER_UNRESPONSIVE's own doc comment). */
  engagement: 'UNKNOWN'
}

/** v3.0 §3.2/§5.4/§7 — read verbatim from Master Profile's own `complianceRouting` (already computed there); Cohort Engine never re-derives a related-party/PEP/sanctions/fraud match itself. */
export interface CohortComplianceInput {
  hold: boolean
  reason: string | null
  matchedEntity: string | null
  since: string | null
  slaHours: number | null
  escalationHours: number | null
}

/** v3.0 §3.3/§9.5/§9.6 — read verbatim from Master Profile's own `missingInformation[]` (P1/P2/P3 register) and `dataQuality.flags` (the "exception" count), never recounted from raw data. */
export interface CohortDataQualityInput {
  band: string | null
  p1Count: number
  p2Count: number
  exceptionCount: number
}

/** v3.0 §5.2/§9.4 — read verbatim from Master Profile's own `postStatementDebt`; `percentOfActiveDebt` is a cheap derived ratio of two already-computed figures (post-statement total ÷ total active debt), never a new analysis. */
export interface CohortPostStatementDebtInput {
  detected: boolean
  accountCount: number
  totalAmount: number
  repaymentUnverified: boolean
  percentOfActiveDebt: number | null
}

/** v3.0 §9.3 — read verbatim from Financial Analysis's own `OTHER_ACCOUNTS_LIKELY` risk-flag evidence (`selfTransferIncomeSharePercent`), never a new calculation. */
export interface CohortOtherAccountsInput {
  likely: boolean
  incomeSharePercent: number | null
}

/** v3.0 §9.1 — read verbatim from Financial Analysis's own `eventProfile.incomeTransition`. */
export interface CohortIncomeTransitionInput {
  detected: boolean
  deltaPercent: number | null
  direction: 'UP' | 'DOWN' | null
  /** Months of normalized-income history available after the detected transition month — a proxy for "tenure at the new level" per §9.1's own upward->tenure distinction (no employment-start-date field exists anywhere in this codebase; this is the closest honest signal). */
  monthsSinceTransition: number | null
}

/** v3.0 §9.2 — read verbatim from Financial Analysis's own `eventProfile.medicalEvents`. */
export interface CohortMedicalShockInput {
  shockMonthCount: number
  chronic: boolean
  maxIncomeSharePercent: number | null
}

export interface CohortInput {
  lead: CohortLeadInput
  credit: CohortCreditInput
  debt: CohortDebtInput
  financial: CohortFinancialInput
  behaviour: CohortBehaviourInput
  reconciliation: CohortReconciliationInput
  readiness: CohortReadinessInput
  customer: CohortCustomerInput
  compliance: CohortComplianceInput
  dataQuality: CohortDataQualityInput
  postStatementDebt: CohortPostStatementDebtInput
  otherAccounts: CohortOtherAccountsInput
  incomeTransition: CohortIncomeTransitionInput
  medicalShock: CohortMedicalShockInput
}

// --- Rule evaluation output ----------------------------------------------

export interface CohortRuleResultOutput {
  ruleId: string
  ruleVersion: string
  /** false means the rule's required source signal was itself NOT_REPORTED/UNKNOWN — not "skipped". A direct input to X1. */
  evaluated: boolean
  matched: boolean
  severity: CohortRuleSeverity
  evidence: Record<string, number | string | boolean | null>
  evidenceLevel: CohortEvidenceLevel
  reason: string
  sourceFields: string[]
}

export interface PrecedenceResult {
  /** Either a real Type-A cohort (C1-C7/X1/X2) or a BLOCKED reason code — see schema.prisma's own doc comment on why these share one enum rather than two columns. */
  primaryCohort: CohortPrimaryState
  secondaryFlags: Array<{ key: string; label: string; reason: string }>
  specialistReviewRequired: boolean
  specialistReviewReason: string | null
  manualReviewRequired: boolean
  precedenceExplanation: string
}

const BLOCKED_REASON_CODES: ReadonlySet<CohortPrimaryState> = new Set(['CONSENT_PENDING', 'KYC_PENDING', 'COMPLIANCE_HOLD', 'DATA_REFRESH_REQUIRED', 'OTHER_ACCOUNTS_REQUIRED', 'P1_INFORMATION_REQUIRED', 'MANUAL_REVIEW', 'SPECIALIST_REQUIRED', 'CCR_REQUIRED', 'CUSTOMER_UNRESPONSIVE'])

/** True when `cohort` is a blocked-reason value rather than a real Type-A terminal cohort — the one place this distinction is computed, so every caller (service, API serializer, UI) agrees. */
export function isBlockedReasonCode(cohort: CohortPrimaryState): boolean {
  return BLOCKED_REASON_CODES.has(cohort)
}

/** v3.0 §12's exact two-field split (`primary_state` / `primary_reason_code`), derived from the one stored `primaryCohort` column — never two parallel columns that could drift (see schema.prisma's own doc comment). */
export function toPrimaryStateAndReasonCode(cohort: CohortPrimaryState): { primaryState: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'X1' | 'X2' | 'BLOCKED'; primaryReasonCode: CohortBlockedReasonCode | null } {
  if (isBlockedReasonCode(cohort)) {
    return { primaryState: 'BLOCKED', primaryReasonCode: cohort as CohortBlockedReasonCode }
  }
  return { primaryState: cohort as 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'X1' | 'X2', primaryReasonCode: null }
}

export interface DataProvenanceEntry {
  field: string
  source: 'DEBT_ANALYSIS' | 'FINANCIAL_ANALYSIS' | 'MASTER_PROFILE' | 'LEAD' | 'CCR_VERIFICATION' | 'DOCUMENT' | 'CALCULATED'
  asOf: string | null
  verified: boolean
  confidence: CohortConfidenceLevel
}

export interface MissingDataItem {
  field: string
  why: string
  document: string | null
  owner: string
  nextAction: string
}
