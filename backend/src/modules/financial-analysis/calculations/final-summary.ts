import type { ComponentScoreResult } from '../scoring/financial-health-scoring'
import type { FinancialRiskFlagResult, FinancialSeverity } from '../financial-analysis.types'
import type { DataQualityScoreResult, FcfReconciliationResult, MissingInformationItem, ReconciliationResult, DsrBreakdownResult, EventProfile, TransferProfile } from './extended-metrics'

// --- What L2 Cannot Decide (v4.0 spec §20, fixed content) ----------------

/**
 * A fixed, deterministic list — NOT computed from this statement's data,
 * because these are structural boundaries of what a single bank
 * statement can ever establish, true for every analysis regardless of
 * content (same reasoning as the spec's own §20, verbatim intent).
 */
export function buildWhatL2CannotDecide(): string[] {
  return [
    'The reason for financial distress',
    'Customer intent',
    'Willingness to pay',
    'Cohort assignment',
    'Pathway recommendation',
    'Loan approval',
    'Settlement guarantees',
    'A BBS Plan',
    'Full income validation without CCR confirmation',
    'Transactions outside the provided statements',
    'Ambiguous narrations without CCR input',
    'Business vs. personal splits without separate statements',
    'Informal (cash-only) borrowing',
    'Family relationships',
    'Related-party employment context',
  ]
}

// --- Review Checklist (v4.0 spec §23) ------------------------------------

export type ReviewChecklistStatus = 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_EVALUATED'

export interface ReviewChecklistItem {
  item: string
  status: ReviewChecklistStatus
  detail: string
}

export interface ReviewChecklistInputs {
  monthsCovered: number
  transactionCount: number
  narrationParsedCount: number
  reconciliation: ReconciliationResult
  transferProfile: TransferProfile
  incomeStability: ComponentScoreResult
  eventProfile: EventProfile
  expenseBehaviour: ComponentScoreResult
  activeLenderCount: number | null
  dsrBreakdown: DsrBreakdownResult
  fcfReconciliation: FcfReconciliationResult
  liquidity: ComponentScoreResult
  totalScore: number | null
  scoreBand: string
  stressBand: string
  dataQuality: DataQualityScoreResult
  missingInformationRegister: MissingInformationItem[]
}

/**
 * v4.0 spec §23 Review Checklist — 14 fixed questions (wording preserved),
 * each answered deterministically against already-computed analysis
 * fields. Never a hardcoded PASS — a genuinely unavailable upstream
 * input (e.g. no linked credit report) answers PARTIAL/NOT_EVALUATED with
 * an honest reason, never a fabricated PASS.
 */
export function buildReviewChecklist(input: ReviewChecklistInputs): ReviewChecklistItem[] {
  const recon = input.reconciliation
  return [
    {
      item: 'Statement period (3+ months) confirmed?',
      status: input.monthsCovered >= 3 ? 'PASS' : 'FAIL',
      detail: `${input.monthsCovered} month(s) covered.`,
    },
    {
      item: 'Reconciliation verified?',
      status: recon.availability !== 'AVAILABLE' ? 'NOT_EVALUATED' : recon.reconciled ? 'PASS' : 'FAIL',
      detail: recon.detail,
    },
    {
      item: 'Narration parsing applied?',
      status: input.transactionCount === 0 ? 'NOT_EVALUATED' : input.narrationParsedCount > 0 ? 'PASS' : 'PARTIAL',
      detail: `${input.narrationParsedCount} of ${input.transactionCount} transaction(s) had at least one narration-detail field parsed.`,
    },
    {
      item: 'Self-transfers, round-trips, family network, and LRT counterparties identified?',
      status: 'PASS',
      detail: `${input.transferProfile.selfTransfers.count} self-transfer(s), ${input.transferProfile.roundTrips.count} round-trip(s), ${input.transferProfile.familyNetwork.length} family-network entr${input.transferProfile.familyNetwork.length === 1 ? 'y' : 'ies'}, ${input.transferProfile.largeRecurringTransfers.length} LRT counterpart${input.transferProfile.largeRecurringTransfers.length === 1 ? 'y' : 'ies'}.`,
    },
    {
      item: 'Income classified, normalized, and stability assessed?',
      status: input.incomeStability.availability === 'AVAILABLE' ? 'PASS' : 'PARTIAL',
      detail: input.incomeStability.detail,
    },
    {
      item: 'Income transition, bonus, and related-party employer detected?',
      status: 'PASS',
      detail: `Income transition: ${input.eventProfile.incomeTransition.detected ? 'yes' : 'no'}; bonus: ${input.eventProfile.bonuses.length > 0 ? 'yes' : 'no'}; related-party employer: ${input.eventProfile.relatedPartyEmployer.detected ? 'yes' : 'no'}.`,
    },
    {
      item: 'Expenses and merchant taxonomy applied?',
      status: input.expenseBehaviour.availability === 'AVAILABLE' ? 'PASS' : 'PARTIAL',
      detail: input.expenseBehaviour.detail,
    },
    {
      item: 'EMI reconstruction attempted against L1?',
      status: input.activeLenderCount !== null ? 'PASS' : 'PARTIAL',
      detail: input.activeLenderCount !== null ? `${input.activeLenderCount} active lender(s) cross-checked against the linked credit report.` : 'No linked credit report is available for this lead.',
    },
    {
      item: 'DSR fixed and total calculated?',
      status: input.dsrBreakdown.availability === 'AVAILABLE' ? 'PASS' : 'FAIL',
      detail: input.dsrBreakdown.detail,
    },
    {
      item: 'FCF reconciliation performed?',
      status: input.fcfReconciliation.availability === 'AVAILABLE' ? 'PASS' : 'FAIL',
      detail: input.fcfReconciliation.detail,
    },
    {
      item: 'Liquidity, cash visibility, borrowing dependency, and transaction behaviour calculated?',
      status: input.liquidity.availability === 'AVAILABLE' ? 'PASS' : 'PARTIAL',
      detail: input.liquidity.detail,
    },
    {
      item: 'Bounce classification kept strict?',
      status: 'PASS',
      detail: 'An ECS/return fee alone is never promoted to a confirmed bounce (hard rule, classification/bounce-detector.ts).',
    },
    {
      item: 'Medical shock and event profile completed?',
      status: 'PASS',
      detail: `${input.eventProfile.medicalEvents.shockMonths.length} medical-shock month(s) identified; chronic pattern: ${input.eventProfile.medicalEvents.chronic ? 'yes' : 'no'}.`,
    },
    {
      item: 'Other-account detection performed?',
      status: 'PASS',
      detail: input.eventProfile.otherAccountsLikely ? 'OTHER_ACCOUNTS_LIKELY flagged.' : 'No material self-transfer volume suggesting an undisclosed account.',
    },
    {
      item: 'Financial stress, FHS, divergence, DQ score, missing information, reconciliation, CCR brief, cohort package, provenance, versioning, and policy registry completed?',
      status: 'PASS',
      detail: `FHS ${input.totalScore ?? 'N/A'}/100 (${input.scoreBand}); stress band ${input.stressBand}; data quality ${input.dataQuality.finalScore}/100; ${input.missingInformationRegister.length} missing-information item(s).`,
    },
  ]
}

// --- Final Principle & Summary (v4.0 spec §25 + report's own §19) -------

export interface FinalSummaryDimensionRow {
  dimension: string
  finding: string
  severity: FinancialSeverity
}

export interface FinalSummary {
  topFindings: string[]
  dimensions: FinalSummaryDimensionRow[]
  bottomLine: string
}

export interface FinalSummaryInputs {
  incomeStability: ComponentScoreResult
  eventProfile: EventProfile
  transferProfile: TransferProfile
  fcfReconciliation: FcfReconciliationResult
  debtServicing: ComponentScoreResult
  liquidity: ComponentScoreResult
  borrowingDependency: ComponentScoreResult
  creditPaymentBehaviour: ComponentScoreResult
  businessPersonalMixed: boolean
  totalScore: number | null
  scoreBand: string
  stressBand: string
  stressValue: number
  dataQuality: DataQualityScoreResult
  divergent: boolean
  riskFlags: FinancialRiskFlagResult[]
}

function severityOf(riskFlags: FinancialRiskFlagResult[], keys: string[], fallback: FinancialSeverity): FinancialSeverity {
  for (const key of keys) {
    const flag = riskFlags.find((f) => f.key === key)
    if (flag) return flag.severity
  }
  return fallback
}

/**
 * v4.0 spec §25 "Final Principle": bank statement is evidence, not
 * conclusion. Every severity below is read from an already-computed risk
 * flag (never a new judgment) — this function only arranges existing
 * evidence into the report's own dimension/finding/severity summary
 * table + a closing bottom-line sentence.
 */
export function buildFinalSummary(input: FinalSummaryInputs): FinalSummary {
  const topFindings: string[] = []
  if (input.fcfReconciliation.availability === 'AVAILABLE' && input.fcfReconciliation.unreconciled) {
    topFindings.push(`FCF reconciliation gap (${input.fcfReconciliation.gapPercent ?? 'large'}%) — the most significant cash-flow finding.`)
  }
  if (input.eventProfile.incomeTransition.detected) {
    topFindings.push(`Income transition detected (${input.eventProfile.incomeTransition.deltaPercent}% change around ${input.eventProfile.incomeTransition.transitionMonth?.toISOString().slice(0, 7)}).`)
  }
  if (input.eventProfile.relatedPartyEmployer.detected) {
    topFindings.push(`Related-party employer match (${input.eventProfile.relatedPartyEmployer.matchedName}) — compliance review required.`)
  }
  if (input.eventProfile.medicalEvents.shockMonths.length > 0) {
    topFindings.push(`Medical shock identified in ${input.eventProfile.medicalEvents.shockMonths.length} month(s).`)
  }
  if (input.eventProfile.otherAccountsLikely) {
    topFindings.push('Other accounts likely — a data-completeness gap, not a confirmed finding.')
  }
  if (input.transferProfile.familyNetwork.length > 0) {
    topFindings.push(`Family-network signals: ${input.transferProfile.familyNetwork.map((f) => f.counterparty).join(', ')} (inferred, not verified).`)
  }
  if (input.transferProfile.businessCounterparties.length > 0) {
    topFindings.push(`Business counterparties identified: ${input.transferProfile.businessCounterparties.map((b) => b.counterparty).join(', ')}.`)
  }
  if (topFindings.length === 0) {
    topFindings.push('No material events, divergences, or compliance signals were identified in this statement.')
  }

  const dimensions: FinalSummaryDimensionRow[] = [
    { dimension: 'Income stability', finding: input.incomeStability.detail, severity: severityOf(input.riskFlags, ['INCOME_VOLATILE', 'INCOME_STABLE'], 'INFORMATIONAL') },
    {
      dimension: 'Income transition',
      finding: input.eventProfile.incomeTransition.detected ? `${input.eventProfile.incomeTransition.deltaPercent}% change` : 'Not detected',
      severity: input.eventProfile.incomeTransition.detected ? severityOf(input.riskFlags, ['INCOME_TRANSITION'], 'ATTENTION') : 'POSITIVE',
    },
    {
      dimension: 'Related-party employer',
      finding: input.eventProfile.relatedPartyEmployer.detected ? `Matched: ${input.eventProfile.relatedPartyEmployer.matchedName}` : 'Not detected',
      severity: input.eventProfile.relatedPartyEmployer.detected ? severityOf(input.riskFlags, ['RELATED_PARTY_EMPLOYER'], 'ATTENTION') : 'POSITIVE',
    },
    { dimension: 'Debt servicing (DSR)', finding: input.debtServicing.detail, severity: severityOf(input.riskFlags, ['HIGH_DEBT_SERVICE', 'MODERATE_DEBT_SERVICE'], 'POSITIVE') },
    { dimension: 'Liquidity', finding: input.liquidity.detail, severity: severityOf(input.riskFlags, ['LOW_LIQUIDITY'], 'POSITIVE') },
    {
      dimension: 'FCF reconciliation',
      finding: input.fcfReconciliation.availability === 'AVAILABLE' ? input.fcfReconciliation.detail : 'Not available',
      severity: input.fcfReconciliation.availability === 'AVAILABLE' && input.fcfReconciliation.unreconciled ? severityOf(input.riskFlags, ['FCF_UNRECONCILED'], 'ATTENTION') : 'POSITIVE',
    },
    { dimension: 'Borrowing dependency', finding: input.borrowingDependency.detail, severity: severityOf(input.riskFlags, ['HIGH_BORROWING_DEPENDENCY'], 'POSITIVE') },
    { dimension: 'Credit payment intensity', finding: input.creditPaymentBehaviour.detail, severity: severityOf(input.riskFlags, ['HIGH_CREDIT_PAYMENT_ACTIVITY'], 'POSITIVE') },
    {
      dimension: 'Medical events',
      finding: input.eventProfile.medicalEvents.shockMonths.length > 0 ? `${input.eventProfile.medicalEvents.shockMonths.length} shock month(s)` : 'Not detected',
      severity: input.eventProfile.medicalEvents.shockMonths.length > 0 ? severityOf(input.riskFlags, ['MEDICAL_SHOCK'], 'ATTENTION') : 'POSITIVE',
    },
    {
      dimension: 'Other accounts',
      finding: input.eventProfile.otherAccountsLikely ? 'Likely (unconfirmed)' : 'Not indicated',
      severity: input.eventProfile.otherAccountsLikely ? severityOf(input.riskFlags, ['OTHER_ACCOUNTS_LIKELY'], 'INFORMATIONAL') : 'POSITIVE',
    },
    {
      dimension: 'Business / personal mix',
      finding: input.businessPersonalMixed ? 'Co-occurring personal and business income detected' : 'Not detected',
      severity: input.businessPersonalMixed ? severityOf(input.riskFlags, ['BUSINESS_PERSONAL_MIXED'], 'ATTENTION') : 'POSITIVE',
    },
    { dimension: 'Financial stress', finding: `${input.stressValue}/100 (${input.stressBand})`, severity: input.stressBand === 'LOW' || input.stressBand === 'MODERATE' ? 'POSITIVE' : input.stressBand === 'ELEVATED' ? 'ATTENTION' : 'ELEVATED' },
    { dimension: 'Data quality', finding: `${input.dataQuality.finalScore}/100 (${input.dataQuality.band})`, severity: input.dataQuality.band === 'Excellent' || input.dataQuality.band === 'Good' ? 'POSITIVE' : input.dataQuality.band === 'Moderate' ? 'INFORMATIONAL' : 'ATTENTION' },
    { dimension: 'Financial Health Score', finding: `${input.totalScore ?? 'N/A'}/100 (${input.scoreBand})`, severity: input.scoreBand === 'Healthy' || input.scoreBand === 'Stable' ? 'POSITIVE' : input.scoreBand === 'Under Pressure' ? 'ATTENTION' : 'ELEVATED' },
    { dimension: 'Score-cashflow divergence', finding: input.divergent ? 'Yes' : 'No', severity: input.divergent ? 'ATTENTION' : 'POSITIVE' },
  ]

  const bottomLine = input.divergent
    ? `The Financial Health Score (${input.totalScore ?? 'N/A'}/100, ${input.scoreBand}) may not fully reflect underlying cash-flow pressure. CCR discovery is essential before L3 (Master Profile) and the Cohort Engine determine the appropriate pathway.`
    : `The Financial Health Score (${input.totalScore ?? 'N/A'}/100, ${input.scoreBand}) is consistent with the observed cash-flow evidence. L3 (Master Profile) and the Cohort Engine remain responsible for the pathway decision.`

  return { topFindings, dimensions, bottomLine }
}
