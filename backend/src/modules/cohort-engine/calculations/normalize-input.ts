import { applyEventDrivenCapacityDowngrade, calculateCapacity } from './capacity'
import { debtComplexityBand } from './archetype-and-complexity'
import type { CohortEngineConfig, CohortInput, DpdTrend } from '../cohort-engine.types'

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null
}

/**
 * New BBS convention (neither source document gives a formula): a simple
 * slope over the trailing 3 entries of Debt Analysis's own
 * `monthlyDelinquencyTrend` (accounts-with-delinquency per month,
 * derived from the real payment-history grid). Fewer than 2 data points
 * means the trend cannot be determined — never fabricated as STABLE.
 */
export function deriveDpdTrend(monthlyDelinquencyTrend: Array<{ month: string; accountsWithDelinquency: number }>): DpdTrend {
  if (monthlyDelinquencyTrend.length < 2) return 'UNKNOWN'
  const trailing = monthlyDelinquencyTrend.slice(-3)
  const first = trailing[0].accountsWithDelinquency
  const last = trailing[trailing.length - 1].accountsWithDelinquency
  if (last > first) return 'ESCALATING'
  if (last < first) return 'IMPROVING'
  return 'STABLE'
}

export interface NormalizeInputParams {
  leadId: string
  helpCategory: string | null
  situation: string | null
  leadPanAvailable: boolean
  customerPanAvailable: boolean
  consentGranted: boolean
  consentVersion: string | null
  debtAnalysis: {
    complete: boolean
    creditScore: number | null
    scoreBand: string
    totalOverdue: number | null
    currentMaxDpd: number | null
    maxHistoricalDpd: number | null
    writtenOffCount: number
    settledCount: number
    suitFiledCount: number
    arcAssignedCount: number
    willfulDefault: boolean | null
    monthlyDelinquencyTrend: Array<{ month: string; accountsWithDelinquency: number }>
    enquiries30d: number | null
    recentEnquiries: number | null
    totalOutstanding: number
    unsecuredPercent: number | null
    activeAccounts: number
    numbersOfLenders: number
    totalActiveDebt: number
    clusterDetected: boolean
    newAccountsPerYear: number | null
    distinctAccountTypeCount: number
  } | null
  financialAnalysis: {
    complete: boolean
    averageNormalizedIncome: number | null
    averageEssentialExpenses: number | null
    averageMandatoryDebtPayments: number | null
    borrowingDependencyPatternDetected: boolean
    /** v3.0 §9.3 — Financial Analysis's own OTHER_ACCOUNTS_LIKELY risk flag + its real evidence.selfTransferIncomeSharePercent, never a new calculation. */
    otherAccountsLikely: boolean
    otherAccountsIncomeSharePercent: number | null
    /** v3.0 §9.1 — Financial Analysis's own eventProfile.incomeTransition, verbatim. */
    incomeTransitionDetected: boolean
    incomeTransitionDeltaPercent: number | null
    incomeTransitionMonthsSinceTransition: number | null
    /** v3.0 §9.2 — Financial Analysis's own eventProfile.medicalEvents, verbatim. */
    medicalShockMonthCount: number
    medicalShockChronic: boolean
    medicalShockMaxIncomeSharePercent: number | null
  } | null
  masterProfile: {
    stale: boolean
    alignmentState: string | null
    overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | null
    resolutionCapacity: string | null
    liquidityBand: string
    incomeStability: 'STABLE' | 'VOLATILE' | 'UNKNOWN'
    recentBorrowingLevel: 'NONE' | 'MODERATE' | 'ELEVATED' | 'UNKNOWN'
    repaymentObserved: boolean | null
    totalDebtBand: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'UNKNOWN'
    /** v3.0 §3.2 — Master Profile's own already-computed readiness-gate outcome. */
    readinessOutcome: 'READY' | 'CCR_FIRST' | 'COMPLIANCE_HOLD' | 'SPECIALIST_REVIEW' | 'X1_CANDIDATE' | 'REGENERATE' | null
    /** v3.0 §3.2/§5.4/§7 — Master Profile's own already-computed complianceRouting, verbatim. */
    complianceHold: boolean
    complianceReason: string | null
    complianceMatchedEntity: string | null
    complianceSince: string | null
    complianceSlaHours: number | null
    complianceEscalationHours: number | null
    /** v3.0 §5.2/§9.4 — Master Profile's own already-computed postStatementDebt, verbatim. */
    postStatementDetected: boolean
    postStatementAccountCount: number
    postStatementTotalAmount: number
    postStatementRepaymentUnverified: boolean
    /** v3.0 §3.3/§9.5 — P1/P2 counts from Master Profile's own missingInformation[] register. */
    missingInformationP1Count: number
    missingInformationP2Count: number
    /** v3.0 §4.4/§9.6 — Master Profile's own dataQuality band + flag count (the "exception count"). */
    dataQualityBand: string | null
    dataQualityExceptionCount: number
    dataQualityFlags: string[]
  } | null
}

/**
 * Builds the normalized CohortInput from Master Profile's own
 * `cohortAttributes` vector (its intended consumer) plus a handful of
 * additional already-computed Debt Analysis / Financial Analysis fields —
 * never re-reads a CreditAccount/NormalizedTransaction Prisma row, never
 * recalculates a ratio/score any sibling module already computed. Every
 * group matches the spec's own 8-group CohortInput shape, extended for
 * v3.0's compliance/post-statement/P1/exception/income-transition/
 * medical-shock groups — all of which are plain reads of fields Master
 * Profile and Financial Analysis already compute, confirmed via direct
 * source inspection before this rebuild (see
 * docs/cohort-engine-vnext-parity-matrix.md).
 */
export function buildCohortInput(params: NormalizeInputParams, config: CohortEngineConfig): CohortInput {
  const { debtAnalysis: d, financialAnalysis: f, masterProfile: m } = params

  const dpdTrend: DpdTrend = d ? deriveDpdTrend(d.monthlyDelinquencyTrend) : 'UNKNOWN'
  const legalOrSpecialistTrigger = d ? d.suitFiledCount > 0 || d.arcAssignedCount > 0 || d.willfulDefault === true : false

  const activeOverdueRatio = d && d.totalOverdue !== null && d.totalActiveDebt > 0 ? d.totalOverdue / d.totalActiveDebt : null

  const dataQualityBand = m?.dataQualityBand ?? null
  const fcfReconciled = dataQualityBand === null ? null : !(m?.dataQualityFlags ?? []).includes('FCF_UNRECONCILED')

  const baseCapacity = calculateCapacity(f?.averageNormalizedIncome ?? null, f?.averageEssentialExpenses ?? null, f?.averageMandatoryDebtPayments ?? null, fcfReconciled, config)

  const incomeTransitionDetected = f?.incomeTransitionDetected ?? false
  const incomeTransitionDirection: 'UP' | 'DOWN' | null = incomeTransitionDetected ? ((f?.incomeTransitionDeltaPercent ?? 0) >= 0 ? 'UP' : 'DOWN') : null
  const incomeDownwardTransition = incomeTransitionDetected && incomeTransitionDirection === 'DOWN' && Math.abs(f?.incomeTransitionDeltaPercent ?? 0) > 15
  const medicalChronic = f?.medicalShockChronic ?? false

  const capacityBand = applyEventDrivenCapacityDowngrade(baseCapacity.capacityBand, incomeDownwardTransition, medicalChronic)

  const postStatementTotal = m?.postStatementTotalAmount ?? 0
  const percentOfActiveDebt = m?.postStatementDetected && d && d.totalActiveDebt > 0 ? (postStatementTotal / d.totalActiveDebt) * 100 : m?.postStatementDetected ? null : 0

  return {
    lead: {
      leadId: params.leadId,
      persona: params.helpCategory,
      goal: params.situation,
      consentGranted: params.consentGranted,
      consentVersion: params.consentVersion,
      panAvailable: params.leadPanAvailable || params.customerPanAvailable,
    },
    credit: {
      score: d?.creditScore ?? null,
      scoreBand: d?.scoreBand ?? 'not_found',
      currentOverdue: d?.totalOverdue ?? null,
      currentDpd: d?.currentMaxDpd ?? null,
      historicalMaxDpd: d?.maxHistoricalDpd ?? null,
      writeoffStatus: d ? d.writtenOffCount > 0 : null,
      settlementStatus: d ? d.settledCount > 0 : null,
      suitFiled: d ? d.suitFiledCount > 0 : false,
      arcAssigned: d ? d.arcAssignedCount > 0 : false,
      willfulDefault: d?.willfulDefault ?? null,
      legalOrSpecialistTrigger,
      enquiries30d: d?.enquiries30d ?? null,
      dpdTrend,
      recentEnquiries: d?.recentEnquiries ?? null,
    },
    debt: {
      totalDebt: d?.totalOutstanding ?? 0,
      unsecuredRatio: d?.unsecuredPercent ?? null,
      activeAccounts: d?.activeAccounts ?? 0,
      lenderCount: d?.numbersOfLenders ?? 0,
      debtComplexityBand: debtComplexityBand(d?.numbersOfLenders ?? 0, m?.totalDebtBand ?? 'UNKNOWN', d?.distinctAccountTypeCount ?? null),
      recentStackingClusterDetected: d?.clusterDetected ?? false,
      newAccountsPerYear: d?.newAccountsPerYear ?? null,
      activeOverdueRatio,
    },
    financial: {
      verifiedIncomeAvailable: f?.averageNormalizedIncome !== null && f?.averageNormalizedIncome !== undefined,
      verifiedMonthlyIncome: f?.averageNormalizedIncome ?? null,
      essentialExpenses: f?.averageEssentialExpenses ?? null,
      mandatoryDebtPayments: f?.averageMandatoryDebtPayments ?? null,
      sustainableSurplus: baseCapacity.sustainableSurplus,
      capacityRatio: baseCapacity.capacityRatio,
      capacityBand,
      liquidityBand: m?.liquidityBand ?? 'UNKNOWN',
      incomeStability: m?.incomeStability ?? 'UNKNOWN',
      incomeTrajectory: 'UNKNOWN',
    },
    behaviour: {
      borrowingToRepay: f?.borrowingDependencyPatternDetected ?? false,
      recentBorrowingLevel: m?.recentBorrowingLevel ?? 'UNKNOWN',
    },
    reconciliation: {
      creditBankAlignment: m?.alignmentState ?? null,
      repaymentObserved: m?.repaymentObserved ?? null,
      // BBS Master Profile Module v3.0 §12.1 removed the old 6th
      // "DATA_CONFLICT_VALIDATION_REQUIRED" alignment state — insufficient
      // evidence to classify is now honestly `null` rather than a named
      // state (see classifyAlignment's own doc comment). `m != null` keeps
      // this distinct from "no Master Profile exists at all" (a separate,
      // already-captured concern below in `readiness.masterProfileStale`).
      unresolvedMismatch: m != null && m.alignmentState === null,
    },
    readiness: {
      debtAnalysisComplete: d?.complete ?? false,
      financialAnalysisComplete: f?.complete ?? false,
      masterProfileStale: m?.stale ?? true,
      overallConfidence: m?.overallConfidence ?? null,
      resolutionReadiness: m?.resolutionCapacity ?? null,
      readinessOutcome: m?.readinessOutcome ?? null,
    },
    customer: {
      goal: params.situation,
      engagement: 'UNKNOWN',
    },
    compliance: {
      hold: m?.complianceHold ?? false,
      reason: m?.complianceReason ?? null,
      matchedEntity: m?.complianceMatchedEntity ?? null,
      since: m?.complianceSince ?? null,
      slaHours: m?.complianceSlaHours ?? null,
      escalationHours: m?.complianceEscalationHours ?? null,
    },
    dataQuality: {
      band: dataQualityBand,
      p1Count: m?.missingInformationP1Count ?? 0,
      p2Count: m?.missingInformationP2Count ?? 0,
      exceptionCount: m?.dataQualityExceptionCount ?? 0,
    },
    postStatementDebt: {
      detected: m?.postStatementDetected ?? false,
      accountCount: m?.postStatementAccountCount ?? 0,
      totalAmount: postStatementTotal,
      repaymentUnverified: m?.postStatementRepaymentUnverified ?? false,
      percentOfActiveDebt,
    },
    otherAccounts: {
      likely: f?.otherAccountsLikely ?? false,
      incomeSharePercent: f?.otherAccountsIncomeSharePercent ?? null,
    },
    incomeTransition: {
      detected: incomeTransitionDetected,
      deltaPercent: f?.incomeTransitionDeltaPercent ?? null,
      direction: incomeTransitionDirection,
      monthsSinceTransition: f?.incomeTransitionMonthsSinceTransition ?? null,
    },
    medicalShock: {
      shockMonthCount: f?.medicalShockMonthCount ?? 0,
      chronic: medicalChronic,
      maxIncomeSharePercent: f?.medicalShockMaxIncomeSharePercent ?? null,
    },
  }
}

export { average }
