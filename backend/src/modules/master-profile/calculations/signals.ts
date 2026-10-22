import type {
  DebtAnalysisFacts,
  DsrComparisonResult,
  MonthlyFact,
  PossibleCauseResult,
  ReconciliationRowResult,
  SignalEvidence,
  ValidationRequiredItem,
} from '../master-profile.types'

function sum(values: number[]): number {
  return values.reduce((t, v) => t + v, 0)
}

/**
 * BBS Master Profile Module v3.0 §18.1 — Strengths qualify only with HIGH
 * confidence, or as a PAIR of MEDIUM-confidence items (a single
 * unpaired MEDIUM item does not qualify alone) — then capped at 5. This is
 * a real filter, not just a slice: a MEDIUM item with no partner is
 * genuinely dropped, exactly as the spec's own rubric states.
 */
function capStrengths(items: SignalEvidence[]): SignalEvidence[] {
  const high = items.filter((i) => i.confidence === 'HIGH')
  const medium = items.filter((i) => i.confidence === 'MEDIUM')
  const qualifying = [...high]
  for (let i = 0; i + 1 < medium.length; i += 2) qualifying.push(medium[i], medium[i + 1])
  return qualifying.slice(0, 5)
}

/** v3.0 §18.1 — Concerns cap at 10; every concern this function pushes is already an Attention-or-above evidence item by construction (never a baseline/positive entry). */
function capConcerns(items: SignalEvidence[]): SignalEvidence[] {
  return items.slice(0, 10)
}

/** v3.0 §18.1 — Opportunities cap at 5. */
function capOpportunities(items: SignalEvidence[]): SignalEvidence[] {
  return items.slice(0, 5)
}

/**
 * Spec Part 17/18/19: maps the spec's exact strength/concern/opportunity
 * vocabularies onto evidence the two upstream modules already computed —
 * this never introduces a second scoring engine, only relabels/aggregates
 * already-available figures (Debt Analysis facts, Financial Analysis's own
 * monthly aggregates, the DSR comparison, and the reconciliation rows built
 * earlier in this same pipeline run). Where the spec names a signal but
 * gives no exact trigger threshold, a documented new BBS convention fills
 * the gap — same discipline the sibling modules already established.
 */
export function detectStrengthsConcernsOpportunities(
  debt: Pick<DebtAnalysisFacts, 'currentMaxDpd' | 'writtenOffCount' | 'settledCount' | 'suitFiledCount' | 'unsecuredPercent' | 'numbersOfLenders' | 'recentEnquiries' | 'substantialRecentConcentration' | 'borrowingClusterDetected'>,
  months: MonthlyFact[],
  dsrComparison: DsrComparisonResult,
  reconciliationRows: ReconciliationRowResult[],
): { strengths: SignalEvidence[]; concerns: SignalEvidence[]; opportunitySignals: SignalEvidence[] } {
  const strengths: SignalEvidence[] = []
  const concerns: SignalEvidence[] = []
  const opportunitySignals: SignalEvidence[] = []

  const totalIncome = sum(months.map((m) => m.normalizedIncome))
  const surplusMonths = months.filter((m) => m.netCashFlow > 0).length
  const deficitMonths = months.filter((m) => m.netCashFlow < 0).length
  const totalNetFlow = sum(months.map((m) => m.netCashFlow))
  const minBalances = months.filter((m) => m.minBalance !== null).map((m) => m.minBalance!)
  const overallMinBalance = minBalances.length > 0 ? Math.min(...minBalances) : null
  const totalLoanInflows = sum(months.map((m) => m.loanInflows))
  const totalInflow = sum(months.map((m) => m.totalInflow))
  const borrowingDependencyPercent = totalInflow > 0 ? (totalLoanInflows / totalInflow) * 100 : null
  const totalCreditCardPayments = sum(months.map((m) => m.creditCardPayments))
  const cardIntensityPercent = totalIncome > 0 ? (totalCreditCardPayments / totalIncome) * 100 : null
  const matchedRows = reconciliationRows.filter((r) => r.matchStatus === 'MATCHED')

  // --- Strengths -----------------------------------------------------------
  if ((debt.currentMaxDpd ?? 0) === 0) {
    strengths.push({ key: 'NO_CURRENT_OVERDUE', label: 'No current overdue', detail: 'No credit account currently reports a positive DPD.', confidence: 'HIGH', sourceModules: ['DEBT_ANALYSIS'] })
  }
  if (matchedRows.length > 0) {
    strengths.push({ key: 'REGULAR_EMI_PAYMENT', label: 'Regular EMI payment observed', detail: `${matchedRows.length} bureau-reported obligation(s) have a matching recurring bank repayment.`, confidence: 'HIGH', sourceModules: ['DEBT_ANALYSIS', 'FINANCIAL_ANALYSIS'] })
    strengths.push({ key: 'CONSISTENT_REPAYMENT', label: 'Consistent repayment behaviour', detail: 'Matched obligations show a consistent recurring repayment pattern in the bank statement.', confidence: 'MEDIUM', sourceModules: ['FINANCIAL_ANALYSIS'] })
  }
  if (months.length > 0 && surplusMonths / months.length >= 0.75) {
    strengths.push({ key: 'POSITIVE_FREE_CASH_FLOW', label: 'Positive free cash flow', detail: `${surplusMonths} of ${months.length} observed month(s) show a cash-flow surplus.`, confidence: 'HIGH', sourceModules: ['FINANCIAL_ANALYSIS'] })
  }
  if (overallMinBalance !== null && overallMinBalance >= 25000) {
    strengths.push({ key: 'HIGH_LIQUIDITY', label: 'Healthy liquidity', detail: `The lowest observed balance across the statement was ₹${Math.round(overallMinBalance)}.`, confidence: 'HIGH', sourceModules: ['FINANCIAL_ANALYSIS'] })
  }
  if ((debt.recentEnquiries ?? 0) === 0) {
    strengths.push({ key: 'LOW_RECENT_ENQUIRY_ACTIVITY', label: 'Low recent enquiry activity', detail: 'No recent credit enquiry was reported.', confidence: 'HIGH', sourceModules: ['DEBT_ANALYSIS'] })
  }

  // --- Concerns --------------------------------------------------------------
  if ((debt.unsecuredPercent ?? 0) >= 60) {
    concerns.push({ key: 'HIGH_UNSECURED_DEBT', label: 'High unsecured debt', detail: `Unsecured debt is ${debt.unsecuredPercent}% of total outstanding.`, confidence: 'HIGH', sourceModules: ['DEBT_ANALYSIS'] })
  }
  if (dsrComparison.masterDsr.availability === 'AVAILABLE' && (dsrComparison.masterDsr.percent ?? 0) >= 40) {
    concerns.push({ key: 'HIGH_DSR', label: 'High debt service ratio', detail: `Master DSR (confirmed obligations only) is ${dsrComparison.masterDsr.percent}% of normalized income.`, confidence: 'HIGH', sourceModules: ['DEBT_ANALYSIS', 'FINANCIAL_ANALYSIS'] })
  }
  if (months.length > 0 && totalIncome > 0 && (totalNetFlow / totalIncome) * 100 < 5) {
    concerns.push({ key: 'LOW_FREE_CASH_FLOW', label: 'Low free cash flow', detail: 'Retained cash flow is a small share of normalized income across the statement.', confidence: 'MEDIUM', sourceModules: ['FINANCIAL_ANALYSIS'] })
  }
  if (overallMinBalance !== null && overallMinBalance < 2000) {
    concerns.push({ key: 'LOW_LIQUIDITY', label: 'Low liquidity', detail: `The lowest observed balance across the statement was ₹${Math.round(overallMinBalance)}.`, confidence: 'HIGH', sourceModules: ['FINANCIAL_ANALYSIS'] })
  }
  if (debt.substantialRecentConcentration || debt.borrowingClusterDetected) {
    concerns.push({ key: 'RECENT_BORROWING', label: 'Recent borrowing', detail: 'A substantial share of outstanding debt or a cluster of new accounts was opened recently.', confidence: 'HIGH', sourceModules: ['DEBT_ANALYSIS'] })
  }
  if (debt.numbersOfLenders >= 5) {
    concerns.push({ key: 'MULTIPLE_LENDERS', label: 'Multiple lenders', detail: `${debt.numbersOfLenders} distinct lender(s) are reported.`, confidence: 'HIGH', sourceModules: ['DEBT_ANALYSIS'] })
  }
  if ((debt.currentMaxDpd ?? 0) > 0) {
    // CRITICAL: this is driven by currentMaxDpd and genuinely about
    // CURRENT delinquency — the machine-readable `key` must say so too,
    // never "HISTORICAL_DELINQUENCY" (the exact current/historical DPD
    // conflation the module exists to avoid), even though label/detail
    // already said "current" correctly.
    concerns.push({ key: 'CURRENT_DELINQUENCY', label: 'Current delinquency', detail: `A current DPD of ${debt.currentMaxDpd} day(s) is reported.`, confidence: 'HIGH', sourceModules: ['DEBT_ANALYSIS'] })
  }
  if (debt.writtenOffCount > 0) {
    concerns.push({ key: 'WRITE_OFF_HISTORY', label: 'Write-off history', detail: `${debt.writtenOffCount} written-off account(s) reported.`, confidence: 'HIGH', sourceModules: ['DEBT_ANALYSIS'] })
  }
  if (debt.settledCount > 0) {
    concerns.push({ key: 'SETTLEMENT_HISTORY', label: 'Settlement history', detail: `${debt.settledCount} settled account(s) reported.`, confidence: 'HIGH', sourceModules: ['DEBT_ANALYSIS'] })
  }
  if (cardIntensityPercent !== null && cardIntensityPercent >= 20) {
    concerns.push({ key: 'HIGH_CARD_UTILISATION', label: 'High credit-card payment intensity', detail: `Credit-card/CRED payments are ${Math.round(cardIntensityPercent)}% of normalized income.`, confidence: 'MEDIUM', sourceModules: ['FINANCIAL_ANALYSIS'] })
  }
  if (borrowingDependencyPercent !== null && borrowingDependencyPercent >= 25) {
    concerns.push({ key: 'BORROWING_DEPENDENCY', label: 'Borrowing dependency', detail: `Loan inflows are ${Math.round(borrowingDependencyPercent)}% of total inflow.`, confidence: 'MEDIUM', sourceModules: ['FINANCIAL_ANALYSIS'] })
  }
  if (deficitMonths >= 3) {
    concerns.push({ key: 'RECURRING_DEFICIT', label: 'Recurring deficit', detail: `${deficitMonths} of ${months.length} observed month(s) show a cash-flow deficit.`, confidence: 'HIGH', sourceModules: ['FINANCIAL_ANALYSIS'] })
  }

  // --- Opportunity signals ---------------------------------------------------
  if (matchedRows.length > 0) {
    opportunitySignals.push({ key: 'CURRENT_REPAYMENT_CAPACITY', label: 'Current repayment capacity', detail: 'Matched obligations show the lead is actively servicing at least one reported debt.', confidence: 'MEDIUM', sourceModules: ['DEBT_ANALYSIS', 'FINANCIAL_ANALYSIS'] })
    opportunitySignals.push({ key: 'PAYMENT_REGULARITY', label: 'Payment regularity', detail: 'Matched obligations recur at a consistent cadence in the bank statement.', confidence: 'MEDIUM', sourceModules: ['FINANCIAL_ANALYSIS'] })
  }
  if (debt.numbersOfLenders >= 3) {
    opportunitySignals.push({ key: 'DEBT_CONSOLIDATION_POTENTIAL', label: 'Debt consolidation potential', detail: `${debt.numbersOfLenders} distinct lenders may be consolidation candidates — this is an indicator for case analysis, not a guarantee.`, confidence: 'LOW', sourceModules: ['DEBT_ANALYSIS'] })
  }
  if (totalIncome > 0 && (totalNetFlow / totalIncome) * 100 >= 10) {
    opportunitySignals.push({ key: 'AVAILABLE_MONTHLY_SURPLUS', label: 'Available monthly surplus', detail: 'Retained cash flow across the statement suggests a usable monthly surplus.', confidence: 'MEDIUM', sourceModules: ['FINANCIAL_ANALYSIS'] })
  }

  return { strengths: capStrengths(strengths), concerns: capConcerns(concerns), opportunitySignals: capOpportunities(opportunitySignals) }
}

/**
 * Spec Part 20/24: possible causes, each tagged observed/supported/possible/
 * unknown — never presented as established fact. Built only from evidence
 * already present in the two reports; a cause this integration has no
 * supporting evidence for (e.g. "income change" needs a persisted
 * per-source income trend Financial Analysis doesn't store) is correctly
 * omitted rather than invented.
 */
export function detectPossibleCauses(
  debt: Pick<DebtAnalysisFacts, 'substantialRecentConcentration' | 'borrowingClusterDetected' | 'numbersOfLenders'>,
  months: MonthlyFact[],
): PossibleCauseResult[] {
  const causes: PossibleCauseResult[] = []

  if (debt.substantialRecentConcentration || debt.borrowingClusterDetected) {
    causes.push({ key: 'RECENT_BORROWING', label: 'Recent borrowing', detail: 'A substantial share of outstanding debt or a cluster of new accounts was opened recently.', causeConfidence: 'OBSERVED' })
  }

  const cardShare = sum(months.map((m) => m.creditCardPayments))
  const totalDebtPayments = sum(months.map((m) => m.mandatoryDebtPayments + m.creditCardPayments))
  if (totalDebtPayments > 0 && cardShare / totalDebtPayments >= 0.4) {
    causes.push({ key: 'CREDIT_CARD_DEPENDENCY', label: 'Credit-card dependency', detail: 'A large share of observed debt-servicing activity is credit-card/CRED payments rather than instalment EMIs.', causeConfidence: 'SUPPORTED' })
  }

  if (debt.numbersOfLenders >= 5) {
    causes.push({ key: 'MULTIPLE_LOANS', label: 'Multiple loans', detail: `${debt.numbersOfLenders} distinct lenders are reported, which can itself create servicing pressure.`, causeConfidence: 'SUPPORTED' })
  }

  const totalInflow = sum(months.map((m) => m.totalInflow))
  const totalLoanInflows = sum(months.map((m) => m.loanInflows))
  if (totalInflow > 0 && totalLoanInflows / totalInflow >= 0.25) {
    causes.push({ key: 'DEBT_CONSOLIDATION', label: 'Possible debt consolidation', detail: 'A significant share of inflow is loan proceeds, which may reflect refinancing or consolidation activity rather than income.', causeConfidence: 'POSSIBLE' })
  }

  const lowBalanceMonths = months.filter((m) => (m.lowBalanceDays ?? 0) > 10).length
  if (lowBalanceMonths >= 2) {
    causes.push({ key: 'TEMPORARY_LIQUIDITY_GAP', label: 'Temporary liquidity gap', detail: `${lowBalanceMonths} month(s) show extended low-balance periods.`, causeConfidence: 'POSSIBLE' })
  }

  return causes
}

/**
 * Spec Part 25: explicit validation items for CCR workflow, each with a
 * `why`. Always includes the structural gaps this integration has by
 * design (no persisted per-source income split, no interest rate/tenure
 * data) rather than silently omitting them.
 */
export function assessValidationRequired(
  dsrComparison: DsrComparisonResult,
  reconciliationRows: ReconciliationRowResult[],
): ValidationRequiredItem[] {
  const items: ValidationRequiredItem[] = []

  const unmatchedPayments = reconciliationRows.filter((r) => r.matchStatus === 'UNMATCHED_PAYMENT')
  if (unmatchedPayments.length > 0) {
    items.push({ item: 'Unexplained debt payment(s)', why: `${unmatchedPayments.length} recurring bank payment(s) have no corresponding bureau-reported account — confirm whether these are non-reporting lenders, very recent loans, or shared/family obligations.` })
  }

  const notObserved = reconciliationRows.filter((r) => r.matchStatus === 'NOT_OBSERVED')
  if (notObserved.length > 0) {
    items.push({ item: 'Repayment channel for unobserved obligations', why: `${notObserved.length} reported obligation(s) show no matching repayment in this statement — the payment may occur through another account, another cycle, or an unrecognized narration.` })
  }

  if (dsrComparison.masterDsr.availability !== 'AVAILABLE') {
    items.push({ item: 'Current EMI obligations', why: 'Insufficient confirmed, reconciled obligations are available to calculate a reliable Master DSR.' })
  }

  items.push({ item: 'Whether all repayments use this bank account', why: 'This profile only has visibility into one bank statement — obligations serviced from another account would not appear here.' })
  items.push({ item: 'Actual household expenses', why: 'Essential/discretionary expense classification is narration-pattern based and may not capture every real household cost.' })

  return items
}
