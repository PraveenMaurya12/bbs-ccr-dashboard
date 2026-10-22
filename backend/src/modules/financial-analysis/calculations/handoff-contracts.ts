import type { ComponentScoreResult } from '../scoring/financial-health-scoring'
import type { FinancialRiskFlagResult, MonthlyFinancialAggregateInput } from '../financial-analysis.types'
import type { DataQualityScoreResult, DsrBreakdownResult, FcfReconciliationResult, MissingInformationItem, ReconciliationResult, TransferProfile, EventProfile } from './extended-metrics'
import type { IncomeProfile } from './income-profile'

function sum(values: number[]): number {
  return values.reduce((t, v) => t + v, 0)
}

// --- CCR Brief (v4.0 spec §18.1 — fixed template) ------------------------

export interface CcrBrief {
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
  /**
   * v4.0 spec §18.1's own "Suggested Discovery Questions" — deterministic,
   * never AI-authored: one question per Missing Information Register item
   * (generic) plus one per named entity this module already detected
   * (family network counterparty, LRT counterparty, cash-visibility-gap
   * peak month, medical shock month, income transition, bonus,
   * related-party employer, other-accounts-likely). Never invents a fact
   * not already present elsewhere in this same analysis response.
   */
  suggestedDiscoveryQuestions: string[]
}

export interface CcrBriefInputs {
  caseId: string
  statementPeriodStart: Date | null
  statementPeriodEnd: Date | null
  banks: string[]
  accountsMasked: string[]
  monthsCovered: number
  transactionCount: number
  reconciliation: ReconciliationResult
  totalScore: number | null
  scoreBand: string
  components: Record<string, ComponentScoreResult>
  dataQuality: DataQualityScoreResult
  months: MonthlyFinancialAggregateInput[]
  incomeStability: ComponentScoreResult
  debtServicing: ComponentScoreResult
  dsrBreakdown: DsrBreakdownResult
  activeLenderCount: number | null
  fcfReconciliation: FcfReconciliationResult
  liquidity: ComponentScoreResult
  transactionBehaviour: ComponentScoreResult
  transferProfile: TransferProfile
  eventProfile: EventProfile
  riskFlags: FinancialRiskFlagResult[]
  missingInformationRegister: MissingInformationItem[]
  incomeProfile: IncomeProfile
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 5, ELEVATED: 4, ATTENTION: 3, INFORMATIONAL: 2, POSITIVE: 1 }

/**
 * v4.0 spec §18.1's own "Suggested Discovery Questions" list — one question
 * per Missing Information Register item, plus one per named entity this
 * module already detected. Deterministic string templates only; every
 * figure/name used is read from an input already computed elsewhere in the
 * same analysis — this function introduces no new fact.
 */
function buildSuggestedDiscoveryQuestions(input: CcrBriefInputs): string[] {
  const questions: string[] = []

  for (const item of input.missingInformationRegister) {
    questions.push(`Regarding ${item.category.toLowerCase()}: ${item.description}`)
  }

  for (const entry of input.transferProfile.familyNetwork) {
    const direction = entry.netFlow >= 0 ? 'received from' : 'sent to'
    questions.push(`Who is ${entry.counterparty}, and what is your relationship? (₹${Math.abs(entry.netFlow)} net ${direction} this counterparty over the statement period — inferred, not confirmed.)`)
  }

  for (const lrt of input.transferProfile.largeRecurringTransfers) {
    questions.push(`What is the purpose of the ₹${lrt.totalVolume} transferred to ${lrt.counterparty} (${lrt.occurrences} transfers)?`)
  }

  if (Boolean(input.transactionBehaviour.evidence.cashVisibilityGap) && input.months.length > 0) {
    const peakCashMonth = [...input.months].sort((a, b) => b.cashWithdrawals - a.cashWithdrawals)[0]
    if (peakCashMonth.cashWithdrawals > 0) {
      const peakMonthLabel = peakCashMonth.periodMonth.toISOString().slice(0, 7)
      // v4.0 spec §10.5's own 5 fixed discovery questions, verbatim — only
      // the first was previously generated; the other 4 are equally
      // deterministic (no new inference, just the spec's own template).
      questions.push(`What was the ₹${Math.round(peakCashMonth.cashWithdrawals)} cash withdrawn in ${peakMonthLabel} used for?`)
      questions.push('Was this a one-time expense or a recurring pattern?')
      questions.push('Were there any purchases made in cash?')
      questions.push('Was this for medical, education, or business expenses?')
      questions.push('Do you have receipts or records for these cash expenses?')
    }
  }

  if (input.eventProfile.medicalEvents.shockMonths.length > 0) {
    const worst = input.eventProfile.medicalEvents.shockMonths.reduce((a, b) => (b.total > a.total ? b : a))
    questions.push(`What was the ₹${Math.round(worst.total)} medical expense in ${worst.periodMonth.toISOString().slice(0, 7)} for? Is treatment ongoing?`)
  }

  if (input.eventProfile.incomeTransition.detected) {
    questions.push(
      `Can you confirm the reason for the income change from ₹${input.eventProfile.incomeTransition.previousAverage}/month to ₹${input.eventProfile.incomeTransition.currentAverage}/month around ${input.eventProfile.incomeTransition.transitionMonth?.toISOString().slice(0, 7) ?? 'the transition'}?`,
    )
  }

  for (const bonus of input.eventProfile.bonuses) {
    questions.push(`Was the ₹${Math.round(bonus.amount)} payment on ${bonus.transactionDate.toISOString().slice(0, 10)} a one-time bonus, or does it recur?`)
  }

  if (input.eventProfile.relatedPartyEmployer.detected) {
    questions.push(`Can you confirm your employment relationship with ${input.eventProfile.relatedPartyEmployer.matchedName}?`)
  }

  if (input.eventProfile.otherAccountsLikely) {
    questions.push('Can you provide statements for any other bank accounts you hold?')
  }

  return questions
}

/**
 * v4.0 spec §18.1 "CCR Brief — Fixed Template" — a deterministic, one-page
 * composition of fields this module has already computed; never AI-
 * authored, never introduces a figure not already present elsewhere in the
 * same analysis response. Mirrors the Debt Analysis module's own
 * `GET .../debt-analysis/call-brief` endpoint convention exactly.
 */
export function buildCcrBrief(input: CcrBriefInputs): CcrBrief {
  const componentEntries = Object.entries(input.components).map(([key, c]) => [key, { score: c.score, maxPoints: c.maxPoints }] as const)
  const totalInflow = sum(input.months.map((m) => m.totalInflow))
  const totalOutflow = sum(input.months.map((m) => m.totalOutflow))
  const loanInflowTotal = sum(input.months.map((m) => m.loanInflows))
  const deficitMonths = input.months.filter((m) => m.netCashFlow < 0).length
  const avgBalance = input.months.some((m) => m.closingBalance !== null)
    ? sum(input.months.filter((m) => m.closingBalance !== null).map((m) => m.closingBalance!)) / input.months.filter((m) => m.closingBalance !== null).length
    : null

  const topRiskSignals = [...input.riskFlags]
    .filter((f) => f.severity !== 'POSITIVE')
    .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0))
    .slice(0, 10)
    .map((f) => ({ key: f.key, severity: f.severity, detail: f.detail }))

  return {
    caseId: input.caseId,
    statementPeriod: { start: input.statementPeriodStart?.toISOString() ?? null, end: input.statementPeriodEnd?.toISOString() ?? null },
    dataQuality: { score: input.dataQuality.finalScore, band: input.dataQuality.band, capsApplied: input.dataQuality.appliedCaps.length > 0 },
    bankAccountSummary: {
      banks: input.banks,
      accountsMasked: input.accountsMasked,
      statementMonths: input.monthsCovered,
      transactionCount: input.transactionCount,
      reconciliation: input.reconciliation.availability !== 'AVAILABLE' ? 'NOT_EVALUATED' : input.reconciliation.reconciled ? 'OK' : 'FAILED',
    },
    financialHealthScore: { total: input.totalScore, band: input.scoreBand, components: Object.fromEntries(componentEntries) },
    incomeProfile: {
      // CRITICAL: the current primary source's own typical amount, never a
      // whole-statement-window average — see IncomeProfile.currentMonthlyAmount's
      // own doc comment for why averaging over months before the current
      // source existed silently understates current income.
      normalizedMonthlyIncome: input.incomeProfile.currentMonthlyAmount ?? 0,
      stabilityBand: (input.incomeStability.evidence.band as string | undefined) ?? null,
      confidenceLevel: input.incomeProfile.confidenceLevel,
      tenureMonths: input.incomeProfile.tenureMonths,
      confidenceDowngradeReason: input.incomeProfile.confidenceDowngradeReason,
      trend: input.eventProfile.incomeTransition.detected ? (input.eventProfile.incomeTransition.deltaPercent! > 0 ? 'increasing' : 'decreasing') : 'stable',
      singleSourceDependency: input.riskFlags.some((f) => f.key === 'SINGLE_SOURCE_DEPENDENCY'),
      incomeTransition: input.eventProfile.incomeTransition.detected
        ? `Yes — ₹${input.eventProfile.incomeTransition.previousAverage} to ₹${input.eventProfile.incomeTransition.currentAverage} (${input.eventProfile.incomeTransition.deltaPercent}%)`
        : 'No',
      relatedPartyEmployer: input.eventProfile.relatedPartyEmployer.detected,
    },
    debtServicing: {
      fixedMonthlyDebt: input.months.length > 0 ? Math.round(sum(input.months.map((m) => m.mandatoryDebtPayments)) / input.months.length) : 0,
      variableCardPayments: input.months.length > 0 ? Math.round(sum(input.months.map((m) => m.creditCardPayments)) / input.months.length) : 0,
      dsrFixedPercent: input.dsrBreakdown.dsrFixedPercent,
      dsrTotalPercent: input.dsrBreakdown.dsrTotalPercent,
      activeLenders: input.activeLenderCount,
    },
    cashFlow: {
      averageMonthlyInflow: input.months.length > 0 ? Math.round(totalInflow / input.months.length) : 0,
      averageMonthlyOutflow: input.months.length > 0 ? Math.round(totalOutflow / input.months.length) : 0,
      theoreticalFcf: input.fcfReconciliation.totalTheoreticalFcf,
      actualNetFlow: input.fcfReconciliation.totalActualNetCashFlow,
      fcfGap: input.fcfReconciliation.availability === 'AVAILABLE' ? `₹${input.fcfReconciliation.gapRupees} (${input.fcfReconciliation.gapPercent ?? 'N/A'}%)` : 'Not available',
      deficitMonths: `${deficitMonths} of ${input.months.length}`,
    },
    liquidity: {
      averageBalance: avgBalance !== null ? Math.round(avgBalance) : null,
      minimumBalance: (input.liquidity.evidence.overallMinBalance as number | undefined) ?? null,
      lowBalanceFrequencyPercent: (input.liquidity.evidence.lowBalanceFrequencyPercent as number | undefined) ?? null,
      negativeBalanceEvents: input.months.filter((m) => m.hadNegativeBalance === true).length,
      cashVisibilityGap: Boolean(input.transactionBehaviour.evidence.cashVisibilityGap),
    },
    borrowingAndTransfers: {
      loanInflows: Math.round(loanInflowTotal),
      loanInflowSharePercent: totalInflow > 0 ? Math.round((loanInflowTotal / totalInflow) * 1000) / 10 : 0,
      familyNetwork: input.transferProfile.familyNetwork.map((f) => `${f.counterparty} (${f.direction.toLowerCase()}, net ₹${f.netFlow}, ${f.confidence})`),
      lrtCounterparties: input.transferProfile.largeRecurringTransfers.map((l) => `${l.counterparty} (₹${l.totalVolume}, ${l.band})`),
      selfTransfers: input.transferProfile.selfTransfers.count,
      roundTrips: input.transferProfile.roundTrips.count,
    },
    eventProfile: {
      incomeTransition: input.eventProfile.incomeTransition.detected,
      bonus: input.eventProfile.bonuses.length > 0,
      medicalShock: input.eventProfile.medicalEvents.shockMonths.length > 0 ? `Yes — ₹${Math.round(input.eventProfile.medicalEvents.shockMonths[0].total)}, ${input.eventProfile.medicalEvents.shockMonths[0].periodMonth.toISOString().slice(0, 7)}` : 'No',
      relatedParty: input.eventProfile.relatedPartyEmployer.detected,
      otherAccountsDetected: input.eventProfile.otherAccountsLikely ? ['See OTHER_ACCOUNTS_LIKELY risk signal'] : [],
    },
    topRiskSignals,
    missingInformationAgenda: input.missingInformationRegister.map((item) => ({ item: item.category, whyItMatters: item.description })),
    suggestedDiscoveryQuestions: buildSuggestedDiscoveryQuestions(input),
  }
}

// --- Cohort Signal Package (v4.0 spec §18.2 — fixed schema) --------------

export interface CohortSignalPackage {
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

export interface CohortSignalPackageInputs {
  months: MonthlyFinancialAggregateInput[]
  recurringIncomeSourceCount: number
  incomeStability: ComponentScoreResult
  dsrBreakdown: DsrBreakdownResult
  activeLenderCount: number | null
  fcfReconciliation: FcfReconciliationResult
  borrowingDependency: ComponentScoreResult
  liquidity: ComponentScoreResult
  confirmedBounceCount: number
  possibleBounceCount: number
  transactionBehaviour: ComponentScoreResult
  riskFlags: FinancialRiskFlagResult[]
  transferProfile: TransferProfile
  eventProfile: EventProfile
  businessPersonalMixed: boolean
  unclassifiedSharePercent: number
  totalScore: number | null
  scoreBand: string
  dataQuality: DataQualityScoreResult
  missingInformationRegister: MissingInformationItem[]
  incomeProfile: IncomeProfile
}

/**
 * v4.0 spec §18.2 — a flat, fixed-schema signal export for downstream
 * engines (the Cohort Engine, per the report's own example). This module
 * never calls the Cohort Engine itself and the Cohort Engine does not
 * currently read this field (it reads Master Profile's own `cohortAttributes`
 * vector) — this is forward-compatible plumbing matching the spec's own
 * contract, not a rewire of an existing, working integration.
 */
export function buildCohortSignalPackage(input: CohortSignalPackageInputs): CohortSignalPackage {
  const totalInflow = sum(input.months.map((m) => m.totalInflow))
  const loanInflowTotal = sum(input.months.map((m) => m.loanInflows))
  const deficitMonths = input.months.filter((m) => m.netCashFlow < 0).length

  return {
    // Current primary source's own amount, not a whole-window average — see
    // IncomeProfile.currentMonthlyAmount's own doc comment.
    normalized_monthly_income: input.incomeProfile.currentMonthlyAmount ?? 0,
    income_confidence: input.incomeProfile.confidenceLevel,
    income_source_count: input.recurringIncomeSourceCount,
    single_source_dependency: input.riskFlags.some((f) => f.key === 'SINGLE_SOURCE_DEPENDENCY'),
    income_stability_band: (input.incomeStability.evidence.band as string | undefined) ?? null,
    income_tenure_months: input.incomeProfile.tenureMonths,
    monthly_debt_fixed: input.months.length > 0 ? Math.round(sum(input.months.map((m) => m.mandatoryDebtPayments)) / input.months.length) : 0,
    monthly_debt_variable: input.months.length > 0 ? Math.round(sum(input.months.map((m) => m.creditCardPayments)) / input.months.length) : 0,
    debt_service_ratio_fixed: input.dsrBreakdown.dsrFixedPercent,
    debt_service_ratio_total: input.dsrBreakdown.dsrTotalPercent,
    active_lender_count: input.activeLenderCount,
    theoretical_fcf: input.fcfReconciliation.totalTheoreticalFcf,
    actual_net_flow: input.fcfReconciliation.totalActualNetCashFlow,
    fcf_reconciliation_gap: input.fcfReconciliation.gapRupees,
    fcf_unreconciled: input.fcfReconciliation.unreconciled,
    deficit_months: deficitMonths,
    low_balance_frequency: input.liquidity.availability === 'AVAILABLE' ? (input.liquidity.evidence.lowBalanceFrequencyPercent as number) / 100 : null,
    negative_balance_events: input.months.filter((m) => m.hadNegativeBalance === true).length,
    loan_inflow_total: Math.round(loanInflowTotal),
    loan_inflow_share: totalInflow > 0 ? Math.round((loanInflowTotal / totalInflow) * 1000) / 1000 : 0,
    borrowing_dependency_band: input.borrowingDependency.availability === 'AVAILABLE' ? input.borrowingDependency.detail : null,
    confirmed_bounce_count: input.confirmedBounceCount,
    possible_bounce_count: input.possibleBounceCount,
    cash_visibility_gap: Boolean(input.transactionBehaviour.evidence.cashVisibilityGap),
    recurring_deficit: input.riskFlags.some((f) => f.key === 'RECURRING_DEFICIT'),
    self_transfer_volume: input.transferProfile.selfTransfers.volumeCredit + input.transferProfile.selfTransfers.volumeDebit,
    round_trip_count: input.transferProfile.roundTrips.count,
    family_net_flow: sum(input.transferProfile.familyNetwork.map((f) => f.netFlow)),
    lrt_volume: sum(input.transferProfile.largeRecurringTransfers.map((l) => l.totalVolume)),
    income_transition_delta_pct: input.eventProfile.incomeTransition.deltaPercent,
    bonus_amount: sum(input.eventProfile.bonuses.map((b) => b.amount)),
    medical_shock_amount: input.eventProfile.medicalEvents.shockMonths.length > 0 ? Math.round(sum(input.eventProfile.medicalEvents.shockMonths.map((m) => m.total))) : 0,
    related_party_employer: input.eventProfile.relatedPartyEmployer.detected,
    other_accounts_likely: input.eventProfile.otherAccountsLikely,
    business_personal_mixed: input.businessPersonalMixed,
    unclassified_share: Math.round(input.unclassifiedSharePercent) / 100,
    financial_health_score: input.totalScore,
    financial_health_band: input.scoreBand,
    data_quality: input.dataQuality.finalScore,
    data_quality_raw: input.dataQuality.rawScore,
    missing_information_count: input.missingInformationRegister.length,
  }
}
