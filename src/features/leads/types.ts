/**
 * This screen's own lead-record shape. Two implementations of
 * `LeadRecordsService` back it (see services/leadRecordsService.ts):
 *
 *  - Mock (VITE_API_MODE=mock, the default): fictional development data,
 *    including a credit score / PAN / overdue amount per row.
 *  - Api (VITE_API_MODE=api): the real backend `/leads` endpoint. That
 *    backend deliberately has no credit-score, PAN, or overdue-amount field
 *    on `Lead` — credit score lives on a separate `CreditReport` entity with
 *    no list-by-lead endpoint yet, and a raw PAN is never stored anywhere
 *    per the schema's own privacy design (see backend/prisma/schema.prisma).
 *    Rather than fabricate numbers for those columns, the API-backed
 *    implementation reports them as `null` ("not available") and the table
 *    renders an explicit placeholder instead of inventing data. `status`
 *    there is derived from the lead's six real pipeline-stage fields (see
 *    deriveFunnelStatus in services/leadRecordsService.ts), not fabricated.
 */
export type LeadFunnelStatus = 'new_lead' | 'contacted' | 'in_progress' | 'converted' | 'not_eligible'

export type LeadSourceChannel = 'website' | 'partner'

export interface LeadRecord {
  id: string
  bbsLeadId?: string
  dateTime: string
  fullName: string
  avatarIndex: number
  phone: string
  /** `null` when the backend has no credit score for this lead yet (see module doc). */
  creditScore: number | null
  /** `null` in API mode — a raw PAN is never available from the backend, by design. */
  pan: string | null
  /** `null` when the backend does not track an overdue amount for this lead yet. */
  totalOverdue: number | null
  status: LeadFunnelStatus
  source: LeadSourceChannel
}

export interface LeadRecordStats {
  total: number
  newLead: number
  contacted: number
  inProgress: number
  converted: number
  notEligible: number
  /** True when stats were computed over a capped sample rather than the full dataset (see ApiLeadRecordsService). */
  isPartial: boolean
}

// --- Lead Detail page ------------------------------------------------------

/** Mirrors the backend's `StageStatus` enum values (see backend/prisma/schema.prisma). */
export type PipelineStageStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'REQUIRES_REVIEW'

export interface LeadDetailPipeline {
  leadSubmissionStatus: PipelineStageStatus
  level1Status: PipelineStageStatus
  level2Status: PipelineStageStatus
  level3Status: PipelineStageStatus
  recoveryPlanStatus: PipelineStageStatus
}

/**
 * The Customer profile row a Lead may or may not have yet (see
 * backend/prisma/schema.prisma's doc comment on `Customer` — every field
 * here is genuinely nullable, not just optional-in-TS, because a brand-new
 * lead has nothing saved yet). `null` customer as a whole means no row
 * exists at all; the Lead Details tab still renders every field as blank.
 */
export interface LeadDetailCustomer {
  dateOfBirth: string | null
  gender: string | null
  maritalStatus: string | null
  alternateMobile: string | null
  employmentType: string | null
  companyName: string | null
  designation: string | null
  monthlySalary: number | null
  officialEmail: string | null
  workingExperienceYears: number | null
  addressLine1: string | null
  addressLine2: string | null
  pinCode: string | null
  state: string | null
  sameAsCurrentAddress: boolean
  permanentAddressLine1: string | null
  permanentAddressLine2: string | null
  permanentCity: string | null
  permanentPinCode: string | null
  permanentState: string | null
}

export interface LeadDetail {
  id: string
  bbsLeadId: string
  fullName: string
  phone: string
  email: string | null
  city: string | null
  /** Raw backend LeadSource enum value (e.g. "ONLINE", "PARTNER_DEALER", "WALK_IN") — see LEAD_SOURCE_LABEL. */
  source: string
  helpCategory: string | null
  situation: string | null
  createdAt: string
  status: LeadFunnelStatus
  pipeline: LeadDetailPipeline
  customer: LeadDetailCustomer | null
}

// --- Documents tab ----------------------------------------------------------

/** Mirrors the backend's `DocumentType` enum exactly (see backend/prisma/schema.prisma). */
export type DocumentType =
  | 'PAN_CARD'
  | 'AADHAAR_CARD'
  | 'SALARY_SLIP'
  | 'BANK_STATEMENT'
  | 'FORM_16'
  | 'LOAN_STATEMENT'
  | 'FORECLOSURE_LETTER'
  | 'ADDRESS_PROOF'
  | 'EMPLOYMENT_PROOF'
  | 'OTHER_SUPPORTING'

export type DocumentVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED'

export interface LeadDocument {
  id: string
  documentType: DocumentType
  originalFilename: string
  mimeType: string
  sizeBytes: number
  verificationStatus: DocumentVerificationStatus
  verifiedAt: string | null
  uploadedAt: string
  uploadedBy: { id: string; name: string } | null
  verifiedBy: { id: string; name: string } | null
}

/** Everything a CCR can save from the Lead Details tab in one request. */
export interface UpdateLeadDetailInput {
  fullName?: string
  phone?: string
  helpCategory?: string
  situation?: string
  customer?: Partial<LeadDetailCustomer>
}

// --- Debt analysis tab -------------------------------------------------------
// Mirrors backend/src/modules/debt-analysis/debt-analysis.service.ts's
// `buildResponse` shape field-for-field. Many fields are legitimately `null`
// (not just optional) when the underlying bureau data can't support that
// calculation — several sub-sections also carry their own `available`
// boolean / `unavailableReason` for exactly that reason. Render those as an
// explicit "Not available" state, never as 0 or blank.

export type DebtRiskSeverity = 'High' | 'Medium' | 'Low'

export interface DebtRiskFlag {
  key: string
  label: string
  severity: DebtRiskSeverity
  detail: string
}

export interface DebtAccountTypeSlice {
  accountType: string
  count: number
  percent: number
}

export interface DebtCardUtilizationDetail {
  lender: string
  creditLimit: number
  currentBalance: number
  utilizationPercent: number
  /** Rule 6's own BBS analytical threshold label — not a bureau standard. */
  level: 'Low' | 'Moderate' | 'Elevated' | 'High' | 'Very High'
  overdueAmount: number
  currentDpdDays: number | null
}

export interface DebtUtilization {
  available: boolean
  utilizationPercent: number | null
  totalCreditLimit: number | null
  currentUtilization: number | null
  availableCreditLimit: number | null
  highUtilizationAccounts: number | null
  totalCreditCards: number
  cards: DebtCardUtilizationDetail[]
  highestUtilizedCard: DebtCardUtilizationDetail | null
  unavailableReason: string | null
}

export interface DebtLenderConcentrationEntry {
  lender: string
  outstandingAmount: number
  sharePercent: number
}

export type DebtConcentrationLevel = 'Low' | 'Moderate' | 'High' | 'Very High'

export interface DebtBurden {
  totalActiveDebt: number
  monthlyEmi: number | null
  numbersOfLenders: number
  top3LendersSharePercent: number | null
  top1LenderSharePercent: number | null
  top2LenderSharePercent: number | null
  lenderConcentration: DebtLenderConcentrationEntry[]
  /** Rule 4's own BBS analytical threshold label for the top lender's share — not a bureau standard. */
  topLenderConcentrationLevel: DebtConcentrationLevel | null
  securedUnsecuredAvailable: boolean
  securedAmount: number | null
  unsecuredAmount: number | null
  securedPercent: number | null
  unsecuredPercent: number | null
  securedAccountCount: number
  unsecuredAccountCount: number
  classifiedAccountCount: number
}

export type DebtProductCategory = 'Instalment' | 'Revolving' | 'Short-term' | 'Unclassified'

export interface DebtProductCategorySlice {
  category: DebtProductCategory
  count: number
  outstandingAmount: number
  sharePercent: number | null
}

export interface DebtRecencyWindow {
  windowLabel: string
  windowDays: number
  accountCount: number
  outstandingAmount: number
  percentOfTotalOutstanding: number | null
}

export interface DebtRecency {
  windows: DebtRecencyWindow[]
  substantialRecentConcentration: boolean
}

export interface DebtBorrowingFrequency {
  windows: Array<{ windowLabel: string; windowDays: number; newAccountCount: number }>
  clusterDetected: boolean
}

export interface DebtEnquiryDetail {
  windows: Array<{ windowLabel: string; windowDays: number | null; enquiryCount: number }>
  totalEnquiries: number
  correlatedWithNewAccountCount: number
}

export interface DebtAgeResult {
  oldestActiveAccountDate: string | null
  newestActiveAccountDate: string | null
  averageActiveDebtAgeYears: number | null
  ageOfLargestDebtYears: number | null
  largestDebtLender: string | null
}

export interface DebtLoanSizeBucket {
  bucketLabel: string
  minAmount: number
  maxAmount: number | null
  count: number
  sharePercent: number | null
}

export interface DebtLoanSizeBuckets {
  buckets: DebtLoanSizeBucket[]
  smallTicketLoanCount: number
  smallTicketSharePercent: number | null
}

export interface DebtLenderExposure {
  activeLenders: number
  activeAccounts: number
  productTypesCount: number
}

/** See backend debt-analysis.types.ts's DataAvailability for the full semantics of each state. */
export type DataAvailability = 'AVAILABLE' | 'NOT_REPORTED' | 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA'

export interface DebtServiceRatio {
  availability: DataAvailability
  monthlyEmi: number | null
  monthlyIncome: number | null
  debtServiceRatioPercent: number | null
}

export interface DebtToIncome {
  availability: DataAvailability
  totalOutstanding: number | null
  annualIncome: number | null
  dtiPercent: number | null
}

export type DebtRiskLevel = 'Stable' | 'Attention' | 'High Attention' | 'Critical'

export interface DebtStressLayer {
  level: DebtRiskLevel
  signals: string[]
}

export interface DebtPriorityMatrixEntry {
  lender: string
  accountType: string
  currentBalance: number
  priorityScore: number
  reasons: string[]
}

/** BBS Debt Analysis Module v3.0, §5.3/§5.4 — a 5-component, 100-point data-quality formula. */
export interface DataQualityComponent {
  weight: number
  score: number
  note: string
}

export interface DataQualityFlag {
  code: string
  trigger: string
}

export interface DataQualityScoreResult {
  total: number
  band: 'High confidence' | 'Moderate confidence' | 'Low confidence' | 'Insufficient'
  components: {
    fieldCompleteness: DataQualityComponent
    internalConsistency: DataQualityComponent
    reportRecency: DataQualityComponent
    identityMatchConfidence: DataQualityComponent
    accountLevelSufficiency: DataQualityComponent
  }
  flags: DataQualityFlag[]
  accountCountVerification: {
    summaryActiveCount: number
    detailActiveCount: number
    match: boolean
    note: string
  }
}

/** BBS Debt Analysis Module v3.0, §13 — an 8-component, 100-point weighted risk rubric. */
export interface DebtRiskIndicatorComponent {
  weight: number
  score: number
  evidence: string
}

export interface DebtRiskIndicatorResult {
  total: number
  band: 'Positive' | 'Attention' | 'Elevated' | 'High' | 'Critical'
  components: {
    currentDelinquency: DebtRiskIndicatorComponent
    adverseAccountStatus: DebtRiskIndicatorComponent
    debtBurdenConcentration: DebtRiskIndicatorComponent
    cardUtilisation: DebtRiskIndicatorComponent
    recentBorrowing: DebtRiskIndicatorComponent
    enquiryBehaviour: DebtRiskIndicatorComponent
    historicalRepayment: DebtRiskIndicatorComponent
    dataInconsistencies: DebtRiskIndicatorComponent
  }
}

/** BBS Debt Analysis Module v3.0, §5.5 — "what L1 cannot determine," a first-class, deterministic output, never AI-authored. */
export interface MissingInformationItem {
  category: string
  whatL1CannotDetermine: string
  whoResolves: string
}

/**
 * BBS Debt Analysis Module v3.0, §14: a bureau score is a lagging indicator
 * and can diverge from the debt structure that produced it (e.g. a recent
 * borrowing surge the score hasn't yet reflected). `available: false` only
 * when the bureau reported no score at all — never a fabricated non-divergence.
 */
export interface ScoreStructureDivergenceResult {
  available: boolean
  score: number | null
  scoreBand: string | null
  riskSignalCount: number
  divergenceFlag: boolean
  reason: string | null
  evidence: string[]
  unavailableReason: string | null
}

// --- BBS Debt Analysis Module v3.0, §8/§12 — Risk Signal Engine -------------

export type RiskSignalSeverity = 'Positive' | 'Informational' | 'Attention' | 'Elevated' | 'High' | 'Critical' | 'Data quality'

export interface RiskSignalEngineEntry {
  code: string
  signal: string
  severity: RiskSignalSeverity
  evidence: string
}

export interface NotTriggeredSignal {
  code: string
  reason: string
}

export interface NotEvaluatedSignal {
  code: string
  reason: string
}

export interface RiskSignalEngineResult {
  triggered: RiskSignalEngineEntry[]
  notTriggered: NotTriggeredSignal[]
  /** Codes this integration genuinely cannot evaluate, each with its specific blocker — never placed in either list above. */
  notEvaluated: NotEvaluatedSignal[]
}

// --- BBS Debt Analysis Module v3.0, §14.5/§8.4 — Account Timeline -----------

export interface AccountOpeningVelocityWindow {
  windowLabel: string
  months: number
  accountsOpened: number
}

export interface AccountTimelineYearEntry {
  year: number
  opened: number
  closed: number
  netActive: number
}

export interface AccountChurnEvent {
  lender: string
  accountType: string
  openedOn: string
  closedOn: string
  lifetimeDays: number
}

export interface AccountTimelineResult {
  yearly: AccountTimelineYearEntry[]
  /** `closed` counts above only reflect accounts with a real closedOn date — a ratio below 1.0 here means real closures are understated, never silently guessed. */
  closedAccountsWithKnownDate: number
  closedAccountsTotal: number
  churnEvents: AccountChurnEvent[]
  churnRatePerYear: number | null
  churnPattern: 'HIGH_VELOCITY' | 'MODERATE' | 'LOW' | null
  oldestAccountDate: string | null
  oldestActiveAccountDate: string | null
  creditAgeMonths: number | null
  averageAccountAgeMonths: number | null
}

// --- BBS Debt Analysis Module v3.0, §17/§23 — Final Summary -----------------

export interface FinalSummaryRow {
  dimension: string
  finding: string
  severity: RiskSignalSeverity
}

// --- BBS Debt Analysis Module v3.0, §3.3/§15.4 — Identity Variants ----------

/** `available` is false for this integration's live Signzy provider — see the backend's own doc comment for exactly why. */
export interface IdentityVariantsResult {
  available: boolean
  unavailableReason: string | null
  canonicalName: string | null
  nameVariants: string[]
  mobileVariants: string[]
  addressVariants: string[]
}

export interface DebtUnavailableSection {
  availability: DataAvailability
  reason: string
}

/** One real tradeline's full detail — only the subset of the backend's `level1.debtInventory.accounts` this frontend actually reads, for the Layer 5 account-level table/drawer. */
export interface DebtInventoryAccount {
  lender: string
  accountType: string
  openedOn: string
  currentBalance: number
  overdueAmount: number
  monthlyEmiAmount: number | null
  currentDpdDays: number | null
  maxDpdDays: number | null
  creditLimit: number | null
  isSecured: boolean | null
  lifecycleStatus: string | null
  paymentStatus: string
}

export interface DebtUnavailableSections {
  trajectory: DebtUnavailableSection
  bankCrossCheck: DebtUnavailableSection
  bounceAnalysis: DebtUnavailableSection
  interestRateAndTenure: DebtUnavailableSection
  status99: DebtUnavailableSection
}

export interface DebtConsolidationEvent {
  closedLender: string
  closedOn: string
  closedSanctionedAmount: number
  newAccountLender: string
  newAccountOpenedOn: string
  newAccountSanctionedAmount: number
  daysBetween: number
}

/**
 * Rule 15. Previously folded into `DebtUnavailableSections` as a permanent
 * stub ("closure date is not reported") — that premise was stale (`closedOn`
 * is captured by both bureau mappers and already used by `accountTimeline`),
 * so this is now a genuinely computable result, not a fixed unavailability.
 */
export interface DebtConsolidationResult {
  available: boolean
  detected: boolean
  events: DebtConsolidationEvent[]
  closedAccountsWithKnownDate: number
  closedAccountsTotal: number
  unavailableReason: string | null
}

export interface DebtReconciliation {
  accountLevelTotal: number
  bureauReportedTotal: number
  differenceAmount: number
  reconciliationRequired: boolean
}

export interface DebtRepaymentBehavior {
  available: boolean
  onTimePercent: number | null
  delayedPercent: number | null
  missedPercent: number | null
  onTimeCount: number
  delayedCount: number
  missedCount: number
  increasingDelayTrend: boolean
}

export interface DebtCreditHistory {
  lengthOfHistoryYears: number | null
  oldestAccountDate: string | null
  newestAccountDate: string | null
  monthlyDelinquencyTrend: Array<{ month: string; accountsWithDelinquency: number }>
}

export interface DebtEnquirySummary {
  available: boolean
  totalEnquiries: number
  recentEnquiries: number | null
}

export interface DebtDelinquency {
  currentMaxDpd: number | null
  maxHistoricalDpd: number | null
  buckets: { zeroToSixty: number; sixtyOneToNinety: number; ninetyOnePlus: number }
  accountsWithoutDpdData: number
  accountsWithDpdOver0: number
  accountsWithDpdOver30: number
  accountsWithDpdOver60: number
  accountsWithDpdOver90: number
  /** null when no account reports a monthly payment-history grid at all — distinct from a real 0 (grid present, never late). */
  delinquencyEventsCount: number | null
  mostRecentDelinquencyMonth: string | null
}

export interface DebtSettlement {
  settledCount: number
  settledAmount: number
  writtenOffCount: number
  writtenOffAmount: number
  restructuredCount: number
  suitFiledCount: number
  arcAssignedCount: number
  willfulDefault: boolean | null
}

/**
 * The AI output contract for DEBT_ANALYSIS_INSIGHTS, mirroring the backend's
 * debt-diagnosis.types.ts exactly — advisory only (see InsightsCard/
 * DebtDiagnosisPanel's own doc comments), never a finalized decision.
 * `insights.findings` is typed loosely below (not as this interface
 * directly) because an older AnalysisResult row — seeded or generated
 * before this rebuild — may still contain the previous flat shape; see
 * isDebtDiagnosisFindings for the runtime guard that decides which to render.
 */
export type DebtEvidenceLevel = 'KNOWN' | 'INDICATED' | 'UNKNOWN'

export interface DebtDiagnosisFinding {
  type: string
  severity: 'High' | 'Medium' | 'Low'
  title: string
  statement: string
  evidence: string[]
  evidenceLevel: DebtEvidenceLevel
  relatedAccounts: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface DebtDiagnosisActionPlan {
  verify: string[]
  immediateAttention: string[]
  monitor: string[]
  optimize: string[]
}

export interface DebtDiagnosisFindings {
  executiveSummary: string
  currentPosition: string
  primaryConcerns: DebtDiagnosisFinding[]
  secondaryConcerns: DebtDiagnosisFinding[]
  historicalContext: DebtDiagnosisFinding[]
  debtTrajectory: string
  stressSignals: DebtDiagnosisFinding[]
  possibleDrivers: DebtDiagnosisFinding[]
  dataGaps: string[]
  accountInsights: DebtDiagnosisFinding[]
  resolutionOpportunities: DebtDiagnosisFinding[]
  actionPlan: DebtDiagnosisActionPlan
}

export interface DebtAnalysisInsights {
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  findings?: Record<string, unknown>
  confidence?: number | null
  modelVersion?: string
  generatedAt?: string
}

export interface DebtAnalysisReport {
  reportAvailable: true
  status: 'COMPLETED'
  meta: { bureau: string; reportDate: string }
  summary: {
    totalOutstanding: number
    totalOverdue: number | null
    monthlyEmi: number | null
    totalLenders: number
  }
  creditProfile: {
    /** null for a verified real "no bureau record found" identity — never a fabricated placeholder score. */
    creditScore: number | null
    scoreBand: string
    totalAccounts: number | null
    activeAccounts: number
    closedAccounts: number | null
    defaultedAccounts: number
    totalOutstanding: number
    totalOverdue: number | null
    recentEnquiries: number | null
  }
  accountDistribution: {
    totalAccounts: number
    slices: DebtAccountTypeSlice[]
  }
  utilization: DebtUtilization
  debtBurden: DebtBurden
  repaymentBehavior: DebtRepaymentBehavior
  creditHistory: DebtCreditHistory
  enquiry: DebtEnquirySummary
  delinquency: DebtDelinquency
  settlement: DebtSettlement
  riskFlags: DebtRiskFlag[]
  documentId: string | null
  /** null when no Gemini insights job has ever been kicked off for this report (e.g. seed data). */
  insights: DebtAnalysisInsights | null
  // --- Additive fields for the full BBS Debt Analysis Module rebuild ---
  reconciliation: DebtReconciliation
  productMix: DebtProductCategorySlice[]
  recency: DebtRecency
  borrowing: DebtBorrowingFrequency
  enquiryDetail: DebtEnquiryDetail
  debtAge: DebtAgeResult
  loanSize: DebtLoanSizeBuckets
  lenderExposure: DebtLenderExposure
  debtServiceRatio: DebtServiceRatio
  debtToIncome: DebtToIncome
  stress: DebtStressLayer
  priorityMatrix: DebtPriorityMatrixEntry[]
  /**
   * Optional, not just nullable: this key was added after this module first
   * shipped, so a report served by a backend process that predates the
   * change (or any other source that hasn't been regenerated since) can
   * omit it entirely at runtime — a plain TS non-optional field would lie
   * about that. Always render via a defined-ness check, never assume
   * presence (see ScoreStructureDivergenceCard).
   */
  scoreStructureDivergence?: ScoreStructureDivergenceResult
  /** Optional for the same reason as scoreStructureDivergence above — added after this module first shipped; a report from a backend process or fixture that predates the change can omit it. */
  dataQuality?: DataQualityScoreResult
  debtRiskIndicator?: DebtRiskIndicatorResult
  missingInformation?: MissingInformationItem[]
  riskSignalEngine?: RiskSignalEngineResult
  accountOpeningVelocity?: AccountOpeningVelocityWindow[]
  accountTimeline?: AccountTimelineResult
  finalSummary?: FinalSummaryRow[]
  identityVariants?: IdentityVariantsResult
  /** Optional for the same reason as scoreStructureDivergence above — this moved OUT of `unavailable` (it is no longer a permanent stub) after this module first shipped, so an older cached/fixture report can omit it entirely. */
  consolidationDetection?: DebtConsolidationResult
  unavailable: DebtUnavailableSections
  /** Only the one sub-path this frontend reads from the backend's BBS Level 1 Credit Intelligence regrouping — see DebtInventoryAccount's own doc comment. */
  level1: { debtInventory: { accounts: DebtInventoryAccount[] } }
}

/**
 * The one-and-only Experian call for this lead is still in flight — never
 * carries fabricated report fields. (Business rule: at most one Experian
 * call is ever made per lead — see the backend's BureauReportService.)
 */
export interface DebtAnalysisInProgress {
  reportAvailable: true
  status: 'IN_PROGRESS'
}

/**
 * A legitimate, verified terminal result: Experian's one call for this
 * lead affirmatively found no bureau record for this identity. Not an
 * error — never retried.
 */
export interface DebtAnalysisNoRecord {
  reportAvailable: true
  status: 'NO_RECORD'
}

/** The one call itself never completed (transport/timeout/SOAP fault) — no raw response exists, so it can never be reprocessed either. */
export interface DebtAnalysisFailed {
  reportAvailable: true
  status: 'FAILED'
  errorMessage: string | null
}

/** A real response was received but doesn't match the one verified mapping — can be reprocessed (never re-fetched) once a developer fixes the mapper. */
export interface DebtAnalysisRequiresReview {
  reportAvailable: true
  status: 'REQUIRES_REVIEW'
  errorMessage: string | null
}

/** The discriminated union the frontend actually consumes — `reportAvailable` (then `status`) narrows the rest. */
export type DebtAnalysisResponse =
  | { reportAvailable: false }
  | DebtAnalysisInProgress
  | DebtAnalysisNoRecord
  | DebtAnalysisFailed
  | DebtAnalysisRequiresReview
  | DebtAnalysisReport

// --- CCR Brief (BBS Debt Analysis Module v3.0, §18.1) -----------------------
// Mirrors the backend's DebtAnalysisService.getCallBriefForLead() response
// field-for-field — a read-only projection of the same analysis
// getForLead() already computed, never a second analysis engine.

export interface CcrBriefHeader {
  caseId: string
  customerName: string
  score: number | null
  scoreBand: string
  mobile: string
  email: string | null
  dataQuality: string | null
}

export interface CcrBriefAccountValidationItem {
  lender: string
  accountType: string
  issue: string
  action: string
}

export interface CcrBriefCompleted {
  who: { bbsLeadId: string; fullName: string; helpCategory: string | null; situation: string | null }
  reportAvailable: true
  status: 'COMPLETED'
  header: CcrBriefHeader
  discoveryAgenda: string[]
  accountsNeedingValidation: CcrBriefAccountValidationItem[]
  keyQuestionsForCcr: string[]
  dataGaps: string[]
  aiObservations: { summary: string | null; keyObservations: string[]; concerns: string[] } | null
}

export type CcrBriefResponse =
  | { who: CcrBriefCompleted['who']; reportAvailable: false }
  | { who: CcrBriefCompleted['who']; reportAvailable: true; status: 'IN_PROGRESS' | 'NO_RECORD' | 'FAILED' | 'REQUIRES_REVIEW'; errorMessage: string | null }
  | CcrBriefCompleted

// ============================================================================
// Financial Analysis (bank-statement-driven) — mirrors the backend's
// FinancialAnalysisService.getForLead() response field-for-field, same
// convention as the Debt* block above.
// ============================================================================

export type FinancialAnalysisStatus = 'UPLOADED' | 'EXTRACTING' | 'NORMALIZING' | 'CLASSIFYING' | 'ANALYZING'
export type FinancialTransactionCategory = 'INCOME' | 'BORROWING' | 'EXPENSE' | 'TRANSFERS' | 'CASH' | 'OTHER' | 'UNCLASSIFIED'
export type FinancialBounceEvidenceTier = 'CONFIRMED_BOUNCE' | 'POSSIBLE_BOUNCE' | 'UNKNOWN'
/** Shared by NormalizedTransaction rows AND every AI finding — see debt-diagnosis's KNOWN/INDICATED/UNKNOWN for the (deliberately different) Debt-module equivalent. */
export type FinancialEvidenceLevel = 'CONFIRMED' | 'DERIVED' | 'INFERRED'
/** The deterministic risk-flag severity scale (Prisma enum, UPPERCASE) — distinct from FinancialAiSeverity below (the AI contract's own Title-Case scale). */
export type FinancialFlagSeverity = 'POSITIVE' | 'INFORMATIONAL' | 'ATTENTION' | 'ELEVATED' | 'CRITICAL'
export type FinancialStressBand = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL'

export interface FinancialStatementInfo {
  bankName: string | null
  accountNumberMasked: string | null
  /** Only ever populated from an explicit statement-header line (e.g. "Account Holder:") — never derived from or cross-checked against the lead's own CRM record. Null means the statement header didn't state it in a recognized format. */
  accountHolderName: string | null
  ifscCode: string | null
  accountType: string | null
  statementPeriodStart: string | null
  statementPeriodEnd: string | null
  transactionCount: number | null
  monthsCovered: number | null
  sourceFileFormat: 'PDF' | 'XLSX' | 'CSV'
  /** Always lower for PDF-derived statements than XLSX/CSV — see the confirmed v1 PDF-parsing scope. */
  extractionConfidence: number | null
  documentId: string
  generatedAt: string | null
}

export interface FinancialHealthScoreRecord {
  incomeStabilityScore: number | null
  incomeStabilityAvailability: DataAvailability
  cashFlowStrengthScore: number | null
  cashFlowStrengthAvailability: DataAvailability
  debtServicingCapacityScore: number | null
  debtServicingCapacityAvailability: DataAvailability
  liquidityScore: number | null
  liquidityAvailability: DataAvailability
  expenseBehaviourScore: number | null
  expenseBehaviourAvailability: DataAvailability
  borrowingDependencyScore: number | null
  borrowingDependencyAvailability: DataAvailability
  creditPaymentBehaviourScore: number | null
  creditPaymentBehaviourAvailability: DataAvailability
  transactionBehaviourScore: number | null
  transactionBehaviourAvailability: DataAvailability
  stressSignalsScore: number | null
  stressSignalsAvailability: DataAvailability
  /** Sum of whatever components ARE available — see scorePartial. */
  totalScore: number | null
  /** true whenever any component above wasn't AVAILABLE — never silently presented as a precise 100-point score. */
  scorePartial: boolean
  /** Sum of maxPoints across only the AVAILABLE components (e.g. 85, not a blind 100) — show "62 of 85 assessable points," never a misleading "62 / 100", whenever scorePartial is true. */
  maxAchievablePoints: number | null
  /** Per-component {available, earnedPoints, maxPoints, reason, availability} — the real achievable max per component (which can itself vary, e.g. Debt Servicing Capacity's own F10 sub-signal), never a hardcoded one. Null for a pre-this-feature persisted row. */
  componentDetails: Record<string, { available: boolean; earnedPoints: number | null; maxPoints: number; reason: string; availability: DataAvailability }> | null
  /** The SEPARATE 0-100 stress indicator — kept structurally distinct from stressSignalsScore (the Health Score's own 5-point component); the UI must never combine these into one number. */
  stressIndicator0to100: number
  stressBand: FinancialStressBand
  /** Additive v4.0-spec derived analysis layered on top of (never inside) the 9-component score above — null for a pre-this-feature persisted row. See calculations/extended-metrics.ts on the backend for the exact derivation of every field here. */
  extendedAnalysis: FinancialExtendedAnalysis | null
}

export interface FinancialReconciliationCheck {
  availability: DataAvailability
  reconciled: boolean | null
  openingBalance: number | null
  closingBalance: number | null
  expectedClosingBalance: number | null
  gapRupees: number | null
  toleranceRupees: number
  detail: string
}

export interface FinancialFcfReconciliation {
  availability: DataAvailability
  totalTheoreticalFcf: number | null
  totalActualNetCashFlow: number | null
  gapRupees: number | null
  gapPercent: number | null
  unreconciled: boolean
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

export interface FinancialDsrBreakdown {
  availability: DataAvailability
  dsrFixedPercent: number | null
  dsrTotalPercent: number | null
  dsrWithDiscretionaryPercent: number | null
  detail: string
}

export interface FinancialScoreCashflowDivergence {
  availability: DataAvailability
  divergent: boolean
  totalScore: number | null
  deficitMonths: number
  lowBalanceFrequencyPercent: number | null
  fcfUnreconciled: boolean
  attentionOrWorseFlagCount: number
  detail: string
  /** v4.0 spec §15.3 marks these exact thresholds PROPOSED/unvalidated — always true; `detail` itself also states this. */
  thresholdsRequireCalibration: true
}

export interface FinancialDataQualityScore {
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

export interface FinancialMissingInformationItem {
  category: string
  status: 'NOT_CAPTURED' | 'PARTIAL'
  description: string
  reason: string
}

export interface FinancialFamilyNetworkEntry {
  counterparty: string
  netFlow: number
  direction: 'INBOUND' | 'OUTBOUND' | 'BIDIRECTIONAL'
  confidence: 'HIGH' | 'MEDIUM'
  signals: { recurring: boolean; personalNamePattern: boolean; bidirectional: boolean; surnameMatch: boolean }
  signalCount: number
}

export interface FinancialTransferProfile {
  selfTransfers: { count: number; volumeDebit: number; volumeCredit: number; net: number }
  roundTrips: { count: number; volume: number }
  familyNetwork: FinancialFamilyNetworkEntry[]
  largeRecurringTransfers: Array<{ counterparty: string; occurrences: number; totalVolume: number; averagePerTransfer: number; band: 'LRT_HIGH' | 'LRT_MEDIUM' }>
  businessCounterparties: Array<{ counterparty: string; occurrences: number; totalVolume: number }>
  unclassifiedP2pCount: number
}

export interface FinancialBonusEntry {
  transactionDate: string
  amount: number
  multipleOfSalary: number
}

export interface FinancialMedicalMonthEntry {
  periodMonth: string
  total: number
  distinctMerchantCount: number
  incomeSharePercent: number | null
  shock: boolean
  acute: boolean
}

export interface FinancialEventProfile {
  incomeTransition: { detected: boolean; transitionMonth: string | null; previousAverage: number | null; currentAverage: number | null; deltaPercent: number | null }
  bonuses: FinancialBonusEntry[]
  medicalEvents: { monthlyEntries: FinancialMedicalMonthEntry[]; shockMonths: FinancialMedicalMonthEntry[]; chronic: boolean }
  relatedPartyEmployer: { detected: boolean; matchedName: string | null }
  otherAccountsLikely: boolean
}

export interface FinancialCcrBrief {
  caseId: string
  statementPeriod: { start: string | null; end: string | null }
  dataQuality: { score: number; band: string; capsApplied: boolean }
  bankAccountSummary: { banks: string[]; accountsMasked: string[]; statementMonths: number; transactionCount: number; reconciliation: 'OK' | 'FAILED' | 'NOT_EVALUATED' }
  financialHealthScore: { total: number | null; band: string; components: Record<string, { score: number | null; maxPoints: number }> }
  incomeProfile: {
    normalizedMonthlyIncome: number
    stabilityBand: string | null
    confidenceLevel: string | null
    tenureMonths: number | null
    confidenceDowngradeReason: string | null
    trend: 'increasing' | 'stable' | 'decreasing'
    singleSourceDependency: boolean
    incomeTransition: string
    relatedPartyEmployer: boolean
  }
  debtServicing: { fixedMonthlyDebt: number; variableCardPayments: number; dsrFixedPercent: number | null; dsrTotalPercent: number | null; activeLenders: number | null }
  cashFlow: { averageMonthlyInflow: number; averageMonthlyOutflow: number; theoreticalFcf: number | null; actualNetFlow: number | null; fcfGap: string; deficitMonths: string }
  liquidity: { averageBalance: number | null; minimumBalance: number | null; lowBalanceFrequencyPercent: number | null; negativeBalanceEvents: number; cashVisibilityGap: boolean }
  borrowingAndTransfers: { loanInflows: number; loanInflowSharePercent: number; familyNetwork: string[]; lrtCounterparties: string[]; selfTransfers: number; roundTrips: number }
  eventProfile: { incomeTransition: boolean; bonus: boolean; medicalShock: string; relatedParty: boolean; otherAccountsDetected: string[] }
  topRiskSignals: Array<{ key: string; severity: string; detail: string }>
  missingInformationAgenda: Array<{ item: string; whyItMatters: string }>
  /** v4.0 spec §18.1's own "Suggested Discovery Questions" — deterministic, one per Missing Information Register item plus one per named entity already detected. */
  suggestedDiscoveryQuestions: string[]
}

/** Field names are intentionally snake_case, matching the v4.0 spec's own §18.2 fixed schema verbatim (this is a downstream handoff contract, not an internal TS convention). */
export interface FinancialCohortSignalPackage {
  normalized_monthly_income: number
  income_confidence: string | null
  income_source_count: number
  single_source_dependency: boolean
  income_stability_band: string | null
  income_tenure_months: number | null
  monthly_debt_fixed: number
  monthly_debt_variable: number
  debt_service_ratio_fixed: number | null
  debt_service_ratio_total: number | null
  active_lender_count: number | null
  theoretical_fcf: number | null
  actual_net_flow: number | null
  fcf_reconciliation_gap: number | null
  fcf_unreconciled: boolean
  deficit_months: number
  low_balance_frequency: number | null
  negative_balance_events: number
  loan_inflow_total: number
  loan_inflow_share: number
  borrowing_dependency_band: string | null
  confirmed_bounce_count: number
  possible_bounce_count: number
  cash_visibility_gap: boolean
  recurring_deficit: boolean
  self_transfer_volume: number
  round_trip_count: number
  family_net_flow: number
  lrt_volume: number
  income_transition_delta_pct: number | null
  bonus_amount: number
  medical_shock_amount: number
  related_party_employer: boolean
  other_accounts_likely: boolean
  business_personal_mixed: boolean
  unclassified_share: number
  financial_health_score: number | null
  financial_health_band: string
  data_quality: number
  data_quality_raw: number
  missing_information_count: number
}

export type FinancialEmploymentType = 'SALARIED' | 'BUSINESS' | 'GIG' | 'UNKNOWN'
export type FinancialIncomeConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_TENURE'

export interface FinancialIncomeProfile {
  availability: DataAvailability
  employmentType: FinancialEmploymentType
  tenureMonths: number | null
  confidenceLevel: FinancialIncomeConfidenceLevel | null
  confidenceDowngradeReason: string | null
  /** The current recurring income source's own typical monthly amount — never a whole-statement-window average (a report spanning an income transition has real zero-income months before the current source existed). */
  currentMonthlyAmount: number | null
}

export interface FinancialDaysToNextIncome {
  availability: DataAvailability
  daysToNextIncome: number | null
  nextExpectedDate: string | null
  reason: string
}

export type FinancialReviewChecklistStatus = 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_EVALUATED'

export interface FinancialReviewChecklistItem {
  item: string
  status: FinancialReviewChecklistStatus
  detail: string
}

export interface FinancialFinalSummaryDimensionRow {
  dimension: string
  finding: string
  severity: FinancialFlagSeverity
}

export interface FinancialFinalSummary {
  topFindings: string[]
  dimensions: FinancialFinalSummaryDimensionRow[]
  bottomLine: string
}

export interface FinancialExtendedAnalysis {
  reconciliation: FinancialReconciliationCheck
  fcfReconciliation: FinancialFcfReconciliation
  dsrBreakdown: FinancialDsrBreakdown
  scoreCashflowDivergence: FinancialScoreCashflowDivergence
  dataQuality: FinancialDataQualityScore
  missingInformationRegister: FinancialMissingInformationItem[]
  transferProfile: FinancialTransferProfile
  eventProfile: FinancialEventProfile
  ccrBrief: FinancialCcrBrief
  cohortSignalPackage: FinancialCohortSignalPackage
  incomeProfile: FinancialIncomeProfile
  daysToNextIncome: FinancialDaysToNextIncome
  whatL2CannotDecide: string[]
  reviewChecklist: FinancialReviewChecklistItem[]
  finalSummary: FinancialFinalSummary
}

export interface FinancialRiskFlagRecord {
  key: string
  severity: FinancialFlagSeverity
  detail: string
  evidence: Record<string, unknown>
}

export interface MonthlyFinancialAggregateRecord {
  periodMonth: string
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

export interface FinancialNarrationDetail {
  referenceNumber: string | null
  counterpartyRaw: string | null
  purpose: string | null
  counterpartyBank: string | null
}

export interface NormalizedTransactionRecord {
  id: string
  transactionDate: string
  valueDate: string | null
  narration: string
  amount: number
  direction: 'CREDIT' | 'DEBIT'
  balance: number | null
  counterparty: string | null
  transactionType: string | null
  category: FinancialTransactionCategory
  subcategory: string | null
  lender: string | null
  confidence: number
  evidenceLevel: FinancialEvidenceLevel
  bounceEvidence: FinancialBounceEvidenceTier | null
  sourceRowRef: number | null
  narrationDetail: FinancialNarrationDetail | null
}

// --- The AI contract (FINANCIAL_ANALYSIS_INSIGHTS) — mirrors the backend's financial-assessment.types.ts exactly ---

/** The AI findings' own Title-Case severity scale — distinct from FinancialFlagSeverity (the deterministic risk flags' UPPERCASE scale) above. */
export type FinancialAiSeverity = 'Positive' | 'Informational' | 'Attention' | 'Elevated' | 'Critical'
export type FinancialActionQuadrant = 'IMMEDIATE_REVIEW' | 'VERIFY' | 'MONITOR' | 'OPTIMIZE'

export interface FinancialFinding {
  type: string
  severity: FinancialAiSeverity
  title: string
  statement: string
  evidence: string[]
  evidenceLevel: FinancialEvidenceLevel
  confidence: 'high' | 'medium' | 'low'
  relatedTransactions: string[]
  relatedMonths: string[]
  relatedAccounts: string[]
}

export interface FinancialActionPriority extends FinancialFinding {
  quadrant: FinancialActionQuadrant
  suggestedNextStep: string
}

/** The spec's own 5 fixed questions, as named fields — rendered as 5 separate labeled blocks, never free text. */
export interface FinancialBbsNarrative {
  whatIsHappening: string
  whatIsTheConcern: string
  whatSupportsStability: string
  whatRequiresInvestigation: string
  whatShouldBbsDoNext: string
}

export interface FinancialAssessmentFindings {
  executiveSummary: string
  financialPosition: string
  strengths: FinancialFinding[]
  concerns: FinancialFinding[]
  liquidityAssessment: string
  cashFlowAssessment: string
  incomeAssessment: string
  debtServicingAssessment: string
  borrowingAssessment: string
  transactionBehaviourAssessment: string
  creditCorrelationAssessment: string
  possibleDrivers: FinancialFinding[]
  dataGaps: FinancialFinding[]
  investigationPriorities: FinancialFinding[]
  actionPriorities: FinancialActionPriority[]
  overallAssessment: FinancialBbsNarrative
}

export interface FinancialAnalysisInsights {
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  findings?: Record<string, unknown>
  confidence?: number | null
  modelVersion?: string
  generatedAt?: string
}

export interface FinancialAnalysisLatestUploadFailed {
  documentId: string
  errorMessage: string | null
  errorCode: string | null
  uploadedAt: string
}

export interface FinancialAnalysisReport {
  reportAvailable: true
  status: 'COMPLETED'
  statement: FinancialStatementInfo
  score: FinancialHealthScoreRecord
  riskFlags: FinancialRiskFlagRecord[]
  months: MonthlyFinancialAggregateRecord[]
  transactions: NormalizedTransactionRecord[]
  /** null when no Gemini insights job has ever been kicked off for this analysis (e.g. seed data). */
  insights: FinancialAnalysisInsights | null
  /**
   * Set when a MORE RECENT upload attempt for this lead failed after this
   * report's own analysis completed — this report is still the last
   * known-good data (never silently superseded by the failed attempt), but
   * the failure is surfaced here so the CCR knows to reprocess/re-upload
   * rather than mistaking this for the current state of the latest upload.
   */
  latestUploadFailed: FinancialAnalysisLatestUploadFailed | null
}

/** The pipeline is CCR-initiated (an upload), not automatic — `NOT_STARTED` is an actionable empty state (upload CTA), never a loading one. */
export interface FinancialAnalysisNotStarted {
  reportAvailable: false
}

export interface FinancialAnalysisInProgress {
  reportAvailable: true
  status: FinancialAnalysisStatus
}

export interface FinancialAnalysisFailed {
  reportAvailable: true
  status: 'FAILED'
  errorMessage: string | null
  errorCode: string | null
  /** Travels with a FAILED result specifically so the UI can offer a "reprocess" action without a second round-trip to look it up. */
  documentId: string
}

/** The discriminated union the frontend actually consumes — `reportAvailable` (then `status`) narrows the rest, same convention as DebtAnalysisResponse. */
export type FinancialAnalysisResponse =
  | FinancialAnalysisNotStarted
  | FinancialAnalysisInProgress
  | FinancialAnalysisFailed
  | FinancialAnalysisReport

// ============================================================================
// Master Profile (synthesis layer) — mirrors the backend's
// MasterProfileService.getForLead() response field-for-field, same
// convention as the Debt*/Financial* blocks above. This module never
// re-derives Debt/Financial Analysis's own figures — the Final Profile tab
// fetches those two endpoints directly (via debtAnalysisService/
// financialAnalysisService) for the credit/debt/income/cashflow/liquidity
// side of the two-column comparison; this block only covers what Master
// Profile itself computes: reconciliation, alignment, stress synthesis,
// strengths/concerns/opportunities/causes/validation, cohort attributes,
// and the AI narrative.
// ============================================================================

export type MasterProfileStatus = 'GENERATING' | 'COMPLETED' | 'FAILED'

/**
 * BBS Master Profile Module v3.0 §12.1's 5-state model. COMPLIANCE_HOLD
 * always supersedes every other state (§12.3). v3.0 removed the prior
 * version's HIGH_DEBT_CAPACITY_ALIGNED and DATA_CONFLICT_VALIDATION_REQUIRED
 * states — insufficient evidence to classify is now `null`, not a 6th state.
 */
export type CreditFinancialAlignmentState = 'ALIGNED_HEALTHY' | 'CREDIT_STRONG_FINANCIAL_STRESSED' | 'CREDIT_STRESSED_FINANCIAL_STRONG' | 'BOTH_STRESSED' | 'COMPLIANCE_HOLD'

/** v3.0 §16.5's exact 6-band resolution-capacity table. */
export type ResolutionCapacityLevel = 'STRONG' | 'MODERATE' | 'TIGHT' | 'MARGINAL' | 'NONE' | 'UNKNOWN'
export type MasterConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'

/** v3.0 §5.2's 8-state credit<->bank reconciliation match. */
export type ReconciliationMatchState = 'MATCHED' | 'PARTIALLY_MATCHED' | 'NOT_OBSERVED' | 'UNMATCHED_PAYMENT' | 'AMOUNT_MISMATCH' | 'TIMING_MISMATCH' | 'POST_STATEMENT' | 'UNKNOWN'
export type CauseConfidence = 'OBSERVED' | 'SUPPORTED' | 'POSSIBLE' | 'UNKNOWN'

/** v3.0 §4.4.1's qualitative Data Quality band — replaces a numeric score entirely. */
export type MasterDataQualityBand = 'HIGH' | 'MODERATE' | 'LOW_MODERATE' | 'LOW' | 'INSUFFICIENT'
/** v3.0 §22.2's readiness-gate outcome. */
export type ReadinessOutcome = 'READY' | 'CCR_FIRST' | 'COMPLIANCE_HOLD' | 'SPECIALIST_REVIEW' | 'X1_CANDIDATE' | 'REGENERATE'
/** v3.0 §20.2's Missing Information Register priority tiers. */
export type MirPriority = 'P1' | 'P2' | 'P3'

export interface MasterDataQualityResult {
  band: MasterDataQualityBand
  flags: string[]
}

export interface MasterComplianceRouting {
  complianceHold: boolean
  reason: string | null
  matchedEntity: string | null
  since: string | null
  slaHours: number | null
  escalationHours: number | null
}

export interface MasterPostStatementDebt {
  detected: boolean
  accountCount: number
  totalAmount: number
  repaymentUnverified: boolean
  ccrPriority: 'P1' | null
  accounts: Array<{ lender: string; outstanding: number; openedOn: string }>
}

export interface MasterReadinessCondition {
  code: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8'
  label: string
  passed: boolean
  detail: string
}

export interface MasterReadinessGate {
  conditions: MasterReadinessCondition[]
  outcome: ReadinessOutcome
  blockingFactors: string[]
}

export interface MasterMissingInformationItem {
  itemText: string
  sourceModule: string
  priority: MirPriority
  resolved?: boolean
}

export type MasterDimensionName = 'IDENTITY_COMPLIANCE' | 'CREDIT_HEALTH' | 'INCOME_CASH_FLOW' | 'DEBT_LIQUIDITY' | 'ALIGNMENT_CAPACITY'
export type MasterDimensionConfidences = Record<MasterDimensionName, MasterConfidenceLevel>

export interface MasterFamilyNetworkMember {
  name: string
  inferredRelation: string
  verificationStatus: 'UNVERIFIED' | 'VERIFIED'
  ccrAction: string
}

export interface MasterFamilyNetworkVerification {
  members: MasterFamilyNetworkMember[]
  treatedAsEssentialPendingCcr: boolean
}

export interface MasterIdentityFieldValue {
  value: string
  source: 'LEAD_FORM' | 'CCR_VERIFIED'
}

export interface MasterIdentityFieldResult {
  field: string
  canonicalValue: string | null
  sourceValues: MasterIdentityFieldValue[]
  confidence: MasterConfidenceLevel
  conflict: boolean
}

export interface MasterIdentitySnapshot {
  fields: MasterIdentityFieldResult[]
  hasConflict: boolean
  panAvailable: boolean
  /** v3.0 §3.3 G6: true only when Lead.panRef and Customer.panRef are both present AND their hashes differ — never the raw PAN itself. */
  panRefConflict: boolean
}

export interface MasterStressProfile {
  level: 'Stable' | 'Attention' | 'High Attention' | 'Critical'
  drivers: string[]
  confidence: MasterConfidenceLevel
}

export interface MasterSignalEvidence {
  key: string
  label: string
  detail: string
  confidence: MasterConfidenceLevel
  sourceModules: Array<'DEBT_ANALYSIS' | 'FINANCIAL_ANALYSIS'>
}

export interface MasterPossibleCause {
  key: string
  label: string
  detail: string
  causeConfidence: CauseConfidence
}

export interface MasterValidationRequiredItem {
  item: string
  why: string
}

export type MasterCreditScoreBand = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'NO_SCORE'
export type MasterDebtBand = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'UNKNOWN'
export type MasterIncomeBand = 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN'
export type MasterRatioBand = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'UNKNOWN'

export interface MasterCohortAttributeVector {
  creditScoreBand: MasterCreditScoreBand
  currentDelinquency: boolean | null
  historicalDelinquency: boolean | null
  writeoffStatus: boolean | null
  settlementStatus: boolean | null
  totalDebtBand: MasterDebtBand
  unsecuredDebtRatio: number | null
  recentBorrowingLevel: 'NONE' | 'MODERATE' | 'ELEVATED' | 'UNKNOWN'
  normalizedIncomeBand: MasterIncomeBand
  incomeStability: 'STABLE' | 'VOLATILE' | 'UNKNOWN'
  freeCashflowBand: MasterRatioBand
  debtServiceBand: MasterRatioBand
  liquidityBand: MasterRatioBand
  borrowingDependency: 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN'
  lenderCount: number | null
  cardUtilisation: MasterRatioBand
  creditBankAlignment: CreditFinancialAlignmentState | null
  repaymentObserved: boolean | null
  financialStressLevel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'UNKNOWN'
  resolutionCapacity: ResolutionCapacityLevel
  dataConfidence: MasterConfidenceLevel
}

export interface MasterProfileReconciliationRowRecord {
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

// --- AI contract mirror (master-profile-assessment.types.ts) ------------

export type MasterProfileEvidenceLevel = 'KNOWN' | 'DERIVED' | 'INDICATED' | 'UNKNOWN'
export type MasterProfileAiSeverity = 'Positive' | 'Informational' | 'Attention' | 'Elevated' | 'Critical'

export interface MasterProfileFinding {
  type: string
  severity: MasterProfileAiSeverity
  title: string
  statement: string
  evidence: string[]
  evidenceLevel: MasterProfileEvidenceLevel
  confidence: 'high' | 'medium' | 'low'
  sourceModules: Array<'DEBT_ANALYSIS' | 'FINANCIAL_ANALYSIS'>
  relatedDebtAccounts: string[]
  relatedFinancialMetrics: string[]
}

export interface MasterProfileAssessmentFindings {
  executiveProfile: string
  currentPosition: string
  creditPosition: string
  financialPosition: string
  debtBurden: string
  repaymentCapacity: string
  liquidityAssessment: string
  stressAssessment: string
  alignmentExplanation: string
  strengths: MasterProfileFinding[]
  concerns: MasterProfileFinding[]
  opportunitySignals: MasterProfileFinding[]
  possibleCauses: MasterProfileFinding[]
  keyContradictions: MasterProfileFinding[]
  validationRequired: MasterProfileFinding[]
  resolutionReadinessNarrative: string
  confidence: 'high' | 'medium' | 'low'
}

export interface MasterProfileInsights {
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  findings?: MasterProfileAssessmentFindings
  confidence?: number | null
  modelVersion?: string
  generatedAt?: string
}

export interface MasterProfileNotStarted {
  profileAvailable: false
  debtAnalysisReady: boolean
  financialAnalysisReady: boolean
}

export interface MasterProfileInProgress {
  profileAvailable: true
  status: 'GENERATING'
  errorMessage: string | null
}

export interface MasterProfileFailed {
  profileAvailable: true
  status: 'FAILED'
  errorMessage: string | null
}

export interface MasterProfileReport {
  profileAvailable: true
  status: 'COMPLETED'
  version: number
  generatedAt: string | null
  isStale: boolean
  alignmentState: CreditFinancialAlignmentState | null
  resolutionCapacity: ResolutionCapacityLevel | null
  overallConfidence: MasterConfidenceLevel | null
  bureauDsrPercent: number | null
  bankDsrPercent: number | null
  masterDsrPercent: number | null
  identitySnapshot: MasterIdentitySnapshot | null
  stressProfile: MasterStressProfile | null
  strengths: MasterSignalEvidence[] | null
  concerns: MasterSignalEvidence[] | null
  opportunitySignals: MasterSignalEvidence[] | null
  possibleCauses: MasterPossibleCause[] | null
  validationRequired: MasterValidationRequiredItem[] | null
  cohortAttributes: MasterCohortAttributeVector | null
  reconciliationRows: MasterProfileReconciliationRowRecord[]
  insights: MasterProfileInsights | null
  // --- Additive v3.0 fields — optional for the same reason every other
  // module's additive fields are in this codebase: an older persisted
  // profile version, generated before this rebuild, can omit them entirely. ---
  l1DataAsOf?: string | null
  l2DataAsOf?: string | null
  dataQuality?: MasterDataQualityResult
  complianceRouting?: MasterComplianceRouting
  postStatementDebt?: MasterPostStatementDebt
  readinessGate?: MasterReadinessGate
  dimensionConfidences?: MasterDimensionConfidences
  familyNetworkVerification?: MasterFamilyNetworkVerification
  missingInformation?: MasterMissingInformationItem[]
}

/** The discriminated union the frontend actually consumes — `profileAvailable` (then `status`) narrows the rest, same convention as DebtAnalysisResponse/FinancialAnalysisResponse. */
export type MasterProfileResponse = MasterProfileNotStarted | MasterProfileInProgress | MasterProfileFailed | MasterProfileReport

// ============================================================================
// Cohort Engine — mirrors the backend's CohortEngineService.getForLead()
// response field-for-field, same convention as the Debt*/Financial*/
// Master* blocks above. Deterministic only — this module never calls an
// AI provider (the spec's own first product principle, "Rules over
// free-form AI"), so there is no insights/AI contract block here at all.
// ============================================================================

export type CohortDecisionStatus = 'GENERATING' | 'COMPLETED' | 'FAILED'

/** BBS Cohort Engine Module v3.0 §4: stores either a real Type-A terminal cohort OR a BLOCKED reason code — see `primaryState`/`primaryReasonCode` below for the derived two-field split the UI should actually branch on. */
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

/** v3.0 §12's own `primary_state` vocabulary — the 8 real Type-A cohorts, or the literal `BLOCKED` (in which case `primaryReasonCode` is set). */
export type CohortPrimaryStateCategory = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'X1' | 'X2' | 'BLOCKED'
export type CohortBlockedReasonCode = 'CONSENT_PENDING' | 'KYC_PENDING' | 'COMPLIANCE_HOLD' | 'DATA_REFRESH_REQUIRED' | 'OTHER_ACCOUNTS_REQUIRED' | 'P1_INFORMATION_REQUIRED' | 'MANUAL_REVIEW' | 'SPECIALIST_REQUIRED' | 'CCR_REQUIRED' | 'CUSTOMER_UNRESPONSIVE'
export type CohortLifecycleState = 'CCR_REVIEW' | 'CUSTOMER_ACCEPTANCE_PENDING' | 'EXECUTION_READY' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'CUSTOMER_DECLINED' | 'STALE_90D'
export type CohortComplianceAgingState = 'COMPLIANCE_HOLD' | 'COMPLIANCE_AGING' | 'COMPLIANCE_ESCALATED' | 'COMPLIANCE_CLEARED' | 'COMPLIANCE_DECLINED'
/** v3.0 §7.4 compliance feedback loop: the two actions Compliance can take against an active hold. */
export type CohortComplianceActionType = 'CLEARED' | 'DECLINED'
export type CohortCaseAgingState = 'AGING_15D' | 'AGING_30D' | 'AGING_60D' | 'STALE_90D'

export type CohortArchetype = 'CIRCUMSTANTIAL' | 'DEBT_SPIRAL' | 'HABITUAL_AVOIDER' | 'UNCLASSIFIED'
export type CohortPathway = 'OPTIMISE' | 'STABILISE' | 'CONSOLIDATE' | 'RESTRUCTURE' | 'RESOLVE' | 'RECOVER'
export type CohortCapacityBand = 'DISTRESSED' | 'STRESSED' | 'TIGHT' | 'COMFORTABLE' | 'UNKNOWN'
export type CohortDebtComplexityBand = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH'
export type CohortPlanEligibility = 'DRAFT' | 'CCR_REVIEW' | 'SPECIALIST' | 'INSUFFICIENT_DATA' | 'OUT_OF_SCOPE'
export type CohortConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'
export type CohortRuleSeverity = 'HIGH' | 'MEDIUM' | 'LOW'
export type CohortEvidenceLevel = 'CONFIRMED' | 'DERIVED' | 'INDICATED' | 'UNKNOWN'

export interface CohortRuleResultRecord {
  ruleId: string
  evaluated: boolean
  matched: boolean
  severity: CohortRuleSeverity
  evidence: Record<string, unknown>
  evidenceLevel: CohortEvidenceLevel
  reason: string
  sourceFields: string[]
}

export interface CohortSecondaryFlag {
  key: string
  label: string
  reason: string
}

export interface CohortMissingDataItem {
  field: string
  why: string
  document: string | null
  owner: string
  nextAction: string
}

export interface CohortDataProvenanceEntry {
  field: string
  source: 'DEBT_ANALYSIS' | 'FINANCIAL_ANALYSIS' | 'MASTER_PROFILE' | 'LEAD' | 'CCR_VERIFICATION' | 'DOCUMENT' | 'CALCULATED'
  asOf: string | null
  verified: boolean
  confidence: CohortConfidenceLevel
}

export interface CohortNextReviewEvent {
  scheduledDaysFromNow: number[]
  eventTriggers: string[]
}

export interface CohortDecisionNotRun {
  decisionAvailable: false
  masterProfileReady: boolean
}

export interface CohortDecisionInProgress {
  decisionAvailable: true
  status: 'GENERATING'
  errorMessage: string | null
}

export interface CohortDecisionFailed {
  decisionAvailable: true
  status: 'FAILED'
  errorMessage: string | null
}

export interface CohortCaseAging {
  agingState: CohortCaseAgingState | null
  ttlDays: number | null
  ttlExpiresAt: string | null
}

export interface CohortDecisionReport {
  decisionAvailable: true
  status: 'COMPLETED'
  version: number
  ruleVersion: string
  isStale: boolean
  generatedAt: string | null
  decidedAt: string | null
  primaryCohort: CohortPrimaryState | null
  /** v3.0 §12's own two-field split, derived server-side from `primaryCohort` — branch UI rendering on these, not on `primaryCohort` directly. */
  primaryState: CohortPrimaryStateCategory | null
  primaryReasonCode: CohortBlockedReasonCode | null
  lifecycleState: CohortLifecycleState | null
  secondaryFlags: CohortSecondaryFlag[] | null
  archetype: CohortArchetype | null
  pathway: CohortPathway | null
  capacityBand: CohortCapacityBand | null
  capacityRatio: number | null
  sustainableCashFlow: number | null
  stabilisationCoverage: number | null
  debtComplexityBand: CohortDebtComplexityBand | null
  planEligibility: CohortPlanEligibility | null
  customerExplanation: string | null
  customerReasons: string[] | null
  internalReasons: string[] | null
  missingData: CohortMissingDataItem[] | null
  requiredDocuments: string[] | null
  specialistReviewRequired: boolean
  specialistReviewReason: string | null
  manualReviewRequired: boolean
  requiresManualOverride: boolean
  confidence: CohortConfidenceLevel | null
  dataProvenance: CohortDataProvenanceEntry[] | null
  consentVersion: string | null
  nextReviewEvent: CohortNextReviewEvent | null
  complianceHold: boolean
  complianceReason: string | null
  complianceMatchedEntity: string | null
  complianceSlaHours: number | null
  complianceEscalationAt: string | null
  complianceAgingState: CohortComplianceAgingState | null
  complianceClearedAt: string | null
  complianceDeclinedAt: string | null
  /** v3.0 §7.4: the compliance action (if any) that produced THIS decision version from its predecessor. */
  complianceAction: { action: CohortComplianceActionType; reason: string; actorName: string; createdAt: string } | null
  declinedAt: string | null
  declineReason: string | null
  caseAging: CohortCaseAging | null
  ruleResults: CohortRuleResultRecord[]
}

/** The discriminated union the frontend actually consumes — `decisionAvailable` (then `status`) narrows the rest, same convention as the Debt/Financial/Master responses. */
export type CohortDecisionResponse = CohortDecisionNotRun | CohortDecisionInProgress | CohortDecisionFailed | CohortDecisionReport

export interface CohortDecisionHistoryEntry {
  version: number
  status: CohortDecisionStatus
  primaryCohort: CohortPrimaryState | null
  lifecycleState: CohortLifecycleState | null
  pathway: CohortPathway | null
  generatedAt: string | null
  decidedAt: string | null
}

/** v3.0 §15.1's own "Layers Re-run" vocabulary (§2): L1 Debt Analysis, L2 Financial Analysis, L3 Master Profile, L4 Cohort Decision. */
export type CohortRefreshLayer = 'L1_DEBT_ANALYSIS' | 'L2_FINANCIAL_ANALYSIS' | 'L3_MASTER_PROFILE' | 'L4_COHORT_DECISION'
export type CohortRefreshTriggerId = 'NEW_BANK_STATEMENT' | 'NEW_BUREAU_PULL' | 'CCR_DISCOVERY_COMPLETE' | 'COMPLIANCE_CLEARED' | 'POLICY_CHANGE' | 'MATERIAL_EVENT'

export interface CohortRefreshTrigger {
  id: CohortRefreshTriggerId
  label: string
  layersRerun: CohortRefreshLayer[]
  requiredConditions: string
  affectedAssessment: string
  expectedReevaluationBehavior: string
  mechanicallyDetectable: boolean
  detectionNote: string
  /** Only present when `perLeadApplicability` is true on the parent response. */
  currentlyApplicable?: boolean
  applicabilityBasis?: string
}

export interface CohortRefreshTriggersResponse {
  triggers: CohortRefreshTrigger[]
  /** false when no COMPLETED decision exists yet for this lead — the static catalog is still returned, just without per-lead applicability. */
  perLeadApplicability: boolean
}

// ============================================================================
// BBS Pathway Engine v3.0 (L5) — strictly between Cohort Decision (L4) and
// the BBS Plan (L6, consumes this module's output, never Cohort Decision's
// own simpler static cohort->pathway map). Never recomputes an L1-L4 fact,
// never overrides L4's primary state.
// ============================================================================

export type PathwayGenerationStatus = 'GENERATING' | 'COMPLETED' | 'FAILED'
export type PathwayStatus = 'READY' | 'BLOCKED' | 'INSUFFICIENT_DATA' | 'SPECIALIST_REVIEW' | 'MANUAL_REVIEW' | 'OUT_OF_SCOPE' | 'NO_SUITABLE_PATHWAY' | 'EXPIRED' | 'EXPIRED_UNACCEPTED'
export type PathwayVariant = 'STANDARD' | 'NINETY_DAY'
export type PathwayConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED'
export type PathwayEvaluationResult = 'FIRED' | 'NOT_FIRED' | 'NOT_EVALUATED' | 'UNKNOWN'
export type PathwayLiveTtlStatus = 'ACTIVE' | 'EXPIRED' | 'EXPIRED_UNACCEPTED' | 'ACCEPTED_NO_EXPIRY' | 'NOT_APPLICABLE'

export interface PathwayRuleResultRecord {
  ruleId: string
  evaluation: PathwayEvaluationResult
  severity: CohortRuleSeverity
  evidence: Record<string, unknown>
  reason: string
  sourceFields: string[]
}

export interface PathwayAlternative {
  pathway: CohortPathway
  suitabilityScore: number
  metConditions: string[]
  blockingConditions: string[]
  reasonNotPrimary: string
  switchTrigger: string
}

export interface PathwayDecisionNotRun {
  decisionAvailable: false
  cohortDecisionReady: boolean
}

export interface PathwayDecisionInProgress {
  decisionAvailable: true
  status: 'GENERATING'
  errorMessage: string | null
}

export interface PathwayDecisionFailed {
  decisionAvailable: true
  status: 'FAILED'
  errorMessage: string | null
}

export interface PathwayDecisionReport {
  decisionAvailable: true
  status: 'COMPLETED'
  version: number
  ruleVersion: string
  isStale: boolean
  generatedAt: string | null
  primaryPathway: CohortPathway | null
  pathwayVariant: PathwayVariant | null
  pathwayStatus: PathwayStatus | null
  blockingReason: string | null
  inheritedBlocks: string[] | null
  l4Reference: { cohortDecisionId: string | null; primaryState: CohortPrimaryState | null; primaryReasonCode: string | null; secondaryFlags: unknown } | null
  alternatives: PathwayAlternative[] | null
  sequencingHint: { naturalNext: CohortPathway; trigger: string } | null
  confidence: PathwayConfidenceLevel | null
  confidenceMethod: string | null
  dataQualityBand: string | null
  dimensionConfidences: Record<string, unknown> | null
  capacityBand: CohortCapacityBand | null
  capacityCap: CohortCapacityBand | null
  resolutionCapacity: string | null
  archetype: CohortArchetype | null
  archetypeConfidence: string | null
  customerReasons: Array<{ tier: 'primary' | 'detail'; text: string }>
  internalReasons: string[] | null
  unresolvedQuestions: Array<{ question: string; priority: string; owner: string }> | null
  riskFlags: string[] | null
  requiredApprovals: Array<{ approver: string; status: string }> | null
  specialistReviewRequired: boolean
  complianceHold: boolean
  nextActions: string[] | null
  ttl: { pathwayTtlDays: number | null; expiresAt: string | null; liveStatus: PathwayLiveTtlStatus }
  reviewSchedule: { scheduled: string | null; eventDriven: string[] } | null
  changeSummary: unknown
  dataProvenance: Array<{ field: string; source: string; verified: boolean; confidence: string }> | null
  ruleResults: PathwayRuleResultRecord[]
}

export type PathwayDecisionResponse = PathwayDecisionNotRun | PathwayDecisionInProgress | PathwayDecisionFailed | PathwayDecisionReport

export interface PathwayDecisionHistoryEntry {
  version: number
  status: PathwayGenerationStatus
  primaryPathway: CohortPathway | null
  pathwayStatus: PathwayStatus | null
  confidence: PathwayConfidenceLevel | null
  generatedAt: string | null
}

// ============================================================================
// BBS Plan Engine — strictly downstream of Cohort Decision + Master Profile.
// Never re-analyzes raw bureau/bank data, never re-decides the cohort.
// Deterministic composition; AI (when present) only ever explains the
// already-decided plan in `narrative` below — never a decision input.
// ============================================================================

export type BbsPlanGenerationStatus = 'GENERATING' | 'COMPLETED' | 'FAILED'
export type BbsPlanLifecycleStatus = 'DRAFT' | 'CCR_REVIEW' | 'SPECIALIST_REVIEW' | 'CUSTOMER_ACCEPTANCE_PENDING' | 'EXECUTION_READY' | 'ACTIVE' | 'PAUSED' | 'REASSESSMENT_REQUIRED' | 'COMPLETED' | 'CANCELLED'
export type BbsPlanActionOwner = 'CUSTOMER' | 'BBS' | 'CREDITOR'
export type BbsPlanActionPhase = 'IMMEDIATE' | 'DAY_30' | 'DAY_60' | 'DAY_90'
/** v3.0 §11.2 — was an untyped free string; now a real, backend-enforced state machine (see PlanEngineService.updateActionStatus()'s own legal-transition table). */
export type BbsPlanActionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED' | 'FAILED' | 'CANCELLED' | 'ESCALATED'
export type BbsPlanConditionState = 'MET' | 'PENDING' | 'FAILED' | 'NOT_APPLICABLE' | 'UNKNOWN'
export type BbsPlanRuleEvaluation = 'FIRED' | 'NOT_FIRED' | 'NOT_EVALUATED'

export interface BbsPlanActionRecord {
  actionId: string
  ownerType: BbsPlanActionOwner
  phase: BbsPlanActionPhase
  description: string
  owner: string
  timing: string
  dependency: string | null
  evidenceRequired: string[] | null
  status: BbsPlanActionStatus
  /** v3.0 §10.4 — populated only for canonical Action Library actions; null for plan-specific template actions (which carry a prose `timing` instead). */
  slaDays: number | null
}

export interface BbsPlanConditionRecord {
  conditionId: string
  description: string
  state: BbsPlanConditionState
  source: string
  verificationStatus: string
  /** v3.0 §13.4 standard-conditions priority ("P1"/"P2"/"P3") — absent for most template-authored conditions. */
  priority?: string | null
  escalationPath?: string | null
  verificationEvidence?: string | null
  verifiedById?: string | null
}

export interface BbsPlanRuleResult {
  ruleId: string
  evaluation: BbsPlanRuleEvaluation
  reason: string
  evidence: Record<string, unknown>
}

export interface BbsPlanChangeSummary {
  changes: Array<{ field: string; from: string | null; to: string | null }>
  materiality: 'LOW' | 'MEDIUM' | 'HIGH'
  overrideReason?: string
}

export type BbsPlanTtlLiveStatus = 'ACTIVE' | 'EXPIRED' | 'ACCEPTED_NO_EXPIRY' | 'NOT_APPLICABLE'

export interface BbsPlanTtl {
  planTtlDays: number | null
  expiresAt: string | null
  liveStatus: BbsPlanTtlLiveStatus
}

export interface BbsPlanDataProvenanceEntry {
  field: string
  source: string
  verified: boolean
  confidence: string
}

export interface BbsPlanNarrative {
  status: string
  findings?: Record<string, unknown>
  confidence: number | null
  modelVersion?: string
  generatedAt?: string
}

export interface BbsPlanNotRun {
  planAvailable: false
  cohortDecisionReady: boolean
}

export interface BbsPlanInProgress {
  planAvailable: true
  status: 'GENERATING'
  errorMessage: string | null
}

export interface BbsPlanFailed {
  planAvailable: true
  status: 'FAILED'
  errorMessage: string | null
}

export interface BbsPlanReport {
  planAvailable: true
  status: 'COMPLETED'
  version: number
  templateId: string
  templateVersion: string
  isStale: boolean
  generatedAt: string | null
  cohort: CohortPrimaryState | null
  pathway: CohortPathway | null
  lifecycleStatus: BbsPlanLifecycleStatus | null
  situationAssessment: Record<string, unknown> | null
  problemDefinition: Record<string, unknown> | null
  financialCapacity: Record<string, unknown> | null
  debtStrategy: Record<string, unknown> | null
  financialTargets: Record<string, unknown> | null
  debtTargets: Record<string, unknown> | null
  risks: string[] | null
  disclosures: string[] | null
  successCriteria: string[] | null
  monitoringTriggers: { scheduledDaysFromNow: number[]; eventTriggers: string[] } | null
  reviewSchedule: { cadenceDays: number[]; nextReviewDueInDays: number } | null
  dataProvenance: BbsPlanDataProvenanceEntry[] | null
  missingData: CohortMissingDataItem[] | null
  customerExplanation: string | null
  specialistReviewRequired: boolean
  ruleResults: BbsPlanRuleResult[] | null
  changeSummary: BbsPlanChangeSummary | null
  ttl: BbsPlanTtl
  actions: BbsPlanActionRecord[]
  conditions: BbsPlanConditionRecord[]
  narrative: BbsPlanNarrative | null
}

/** The discriminated union the frontend actually consumes — `planAvailable` (then `status`) narrows the rest, same convention as CohortDecisionResponse. */
export type BbsPlanResponse = BbsPlanNotRun | BbsPlanInProgress | BbsPlanFailed | BbsPlanReport

export interface BbsPlanHistoryEntry {
  version: number
  generationStatus: BbsPlanGenerationStatus
  lifecycleStatus: BbsPlanLifecycleStatus | null
  cohort: CohortPrimaryState | null
  pathway: CohortPathway | null
  templateId: string
  generatedAt: string | null
  changeSummary: BbsPlanChangeSummary | null
}

export interface CreateLeadRecordInput {
  fullName: string
  phone: string
  email: string
  city: string
  source: LeadSourceChannel
  /** Only meaningful in mock mode — the real backend has no field for these (see module doc). */
  pan?: string
  creditScore?: number
  totalOverdue?: number
}
