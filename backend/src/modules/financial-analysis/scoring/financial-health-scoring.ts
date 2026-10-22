import type { DataAvailability, FinancialStressBand, MonthlyFinancialAggregateInput, NormalizedTransactionInput } from '../financial-analysis.types'

export interface ComponentScoreResult {
  availability: DataAvailability
  score: number | null
  maxPoints: number
  detail: string
  evidence: Record<string, number | string | boolean | null>
}

function unavailable(maxPoints: number, availability: DataAvailability, detail: string): ComponentScoreResult {
  return { availability, score: null, maxPoints, detail, evidence: {} }
}

function sum(values: number[]): number {
  return values.reduce((t, v) => t + v, 0)
}

/**
 * Every band/weight below is a NEW BBS-established convention proposed for
 * this module — the spec (F01-F18) states the rule and, for several
 * components, SOME of the bands, but not a complete, internally-consistent
 * point allocation across every sub-rule for every 100-point category.
 * Where the spec gives explicit bands (F03, F06-F10, F12, F14-F15) those
 * are used verbatim; where it doesn't (F01/F02/F09/F15 exact points,
 * F17/F18 bands), a documented new scale fills the gap so every category
 * still sums to its own spec'd weight (15/15/20/15/10/10/5/5/5 = 100).
 */

// --- Income Stability — /15 (F01-F04) -----------------------------------

export function incomeStabilityScore(
  months: MonthlyFinancialAggregateInput[],
  recurringIncomeMonthsPresent: number | null,
): ComponentScoreResult {
  if (recurringIncomeMonthsPresent === null || recurringIncomeMonthsPresent === 0) {
    return unavailable(15, 'NOT_REPORTED', 'No recurring income source was identified in the statement (F01).')
  }

  const monthlyIncomes = months.map((m) => m.normalizedIncome).filter((v) => v > 0)
  if (monthlyIncomes.length < 2) {
    return unavailable(15, 'INSUFFICIENT_DATA', 'Fewer than 2 months of normalized income are available to assess consistency (F02).')
  }

  const mean = sum(monthlyIncomes) / monthlyIncomes.length
  const variance = sum(monthlyIncomes.map((v) => (v - mean) ** 2)) / monthlyIncomes.length
  const stdDev = Math.sqrt(variance)
  // F02's own formula: Income Stability = 1 - (StdDev / Average), normalized 0-100.
  const stabilityPercent = Math.max(0, Math.min(100, (1 - stdDev / mean) * 100))

  let band: string
  let bandScore: number
  if (stabilityPercent >= 85) { band = 'Very stable'; bandScore = 15 }
  else if (stabilityPercent >= 70) { band = 'Stable'; bandScore = 12 }
  else if (stabilityPercent >= 50) { band = 'Moderate'; bandScore = 8 }
  else if (stabilityPercent >= 30) { band = 'Volatile'; bandScore = 4 }
  else { band = 'Highly volatile'; bandScore = 0 }

  // F03 — Income Concentration (spec's own exact bands): largest recurring
  // source's share of total normalized income across the window. Approximated
  // here from the single largest month (a per-source breakdown belongs to
  // detectRecurringIncome's own `sources[]`, not re-derived here) — a
  // reasonable proxy, not a second calculation engine.
  const totalIncome = sum(monthlyIncomes)
  const largestMonthShare = totalIncome > 0 ? (Math.max(...monthlyIncomes) / totalIncome) * 100 : 0
  // F03's own bands (<70%:+2, 70-85%:+1, >85%:0), applied here as a
  // deduction from F02's band score rather than a literal addition — the
  // spec puts both F02 and F03 inside this same 15-point category without
  // separately-summing point allocations for each, so a pure addition
  // would risk exceeding the category's own 15-point ceiling. Ordering is
  // preserved: more concentration always scores no better than less.
  const concentrationPenalty = largestMonthShare > 85 ? 2 : largestMonthShare > 70 ? 1 : 0
  const score = Math.max(0, Math.min(15, bandScore - concentrationPenalty))

  return {
    availability: 'AVAILABLE',
    score,
    maxPoints: 15,
    detail: `Income stability ${Math.round(stabilityPercent)}% (${band}).`,
    evidence: { stabilityPercent: Math.round(stabilityPercent), band, largestMonthSharePercent: Math.round(largestMonthShare) },
  }
}

// --- Cash Flow Strength — /15 (F05-F07) ---------------------------------

export function cashFlowStrengthScore(months: MonthlyFinancialAggregateInput[]): ComponentScoreResult {
  if (months.length === 0) return unavailable(15, 'INSUFFICIENT_DATA', 'No monthly data is available to assess cash flow.')

  const surplusMonths = months.filter((m) => m.netCashFlow > 0).length
  const surplusRatio = surplusMonths / months.length
  // F05 — Monthly Surplus (max +5): consistent surplus across the window scores highest.
  const surplusScore = surplusRatio >= 0.9 ? 5 : surplusRatio >= 0.6 ? 4 : surplusRatio >= 0.3 ? 2 : 0

  // F06 — Annual Retention (spec's own bands, points newly allocated to sum with F05/F07 to 15).
  const totalInflow = sum(months.map((m) => m.totalInflow))
  const totalNetFlow = sum(months.map((m) => m.netCashFlow))
  const retentionPercent = totalInflow > 0 ? (totalNetFlow / totalInflow) * 100 : 0
  const retentionScore = retentionPercent > 20 ? 7 : retentionPercent >= 10 ? 5 : retentionPercent >= 5 ? 3 : retentionPercent >= 0 ? 1 : 0

  // F07 — Deficit Months (spec's own exact bands, max +3).
  const deficitMonths = months.filter((m) => m.netCashFlow < 0).length
  const deficitScore = deficitMonths <= 1 ? 3 : deficitMonths <= 3 ? 2 : deficitMonths <= 5 ? 1 : 0

  return {
    availability: 'AVAILABLE',
    score: surplusScore + retentionScore + deficitScore,
    maxPoints: 15,
    detail: `${Math.round(retentionPercent)}% annual retention, ${deficitMonths} deficit month(s).`,
    evidence: { retentionPercent: Math.round(retentionPercent), deficitMonths, surplusMonths },
  }
}

// --- Debt Servicing Capacity — /20 (F08-F10) ----------------------------

export function debtServicingCapacityScore(
  months: MonthlyFinancialAggregateInput[],
  activeLenderCount: number | null,
): ComponentScoreResult {
  const totalIncome = sum(months.map((m) => m.normalizedIncome))
  const totalDebtPayments = sum(months.map((m) => m.mandatoryDebtPayments))

  if (totalIncome <= 0) {
    return unavailable(20, 'NOT_REPORTED', 'No normalized income is available to calculate a debt service ratio (F08).')
  }
  if (totalDebtPayments === 0) {
    return { availability: 'AVAILABLE', score: 20, maxPoints: 20, detail: 'No mandatory debt payments were identified.', evidence: { dsrPercent: 0 } }
  }

  // F08 — Debt Service Ratio (spec's own exact bands, max +8).
  const dsrPercent = (totalDebtPayments / totalIncome) * 100
  const dsrScore = dsrPercent < 20 ? 8 : dsrPercent < 30 ? 6 : dsrPercent < 40 ? 4 : dsrPercent < 50 ? 2 : 0

  // F09 — Loan Repayment Coverage (no spec bands given; new BBS scale, max +9).
  const coverage = totalDebtPayments > 0 ? totalIncome / totalDebtPayments : null
  const coverageScore = coverage === null ? 0 : coverage >= 3 ? 9 : coverage >= 2 ? 6 : coverage >= 1.5 ? 3 : 0

  // F10 — Multiple Active Lenders (spec's own exact bands, max +3).
  // CRITICAL: no linked credit-report lender count is NOT evidence of
  // "2 or fewer lenders" — it is simply unevaluated. Awarding the maximum
  // +3 here would silently treat "unknown" as the single most favorable
  // outcome. When unavailable, this sub-signal contributes 0 points AND
  // is excluded from the category's own achievable maximum (17, not 20),
  // so the resulting score is never diluted by a signal that was never
  // actually checked.
  const lenderScoreAvailable = activeLenderCount !== null
  const lenderScore = !lenderScoreAvailable ? 0 : activeLenderCount <= 2 ? 3 : activeLenderCount <= 4 ? 2 : activeLenderCount <= 6 ? 1 : 0
  const lenderMaxPoints = lenderScoreAvailable ? 3 : 0

  return {
    availability: 'AVAILABLE',
    score: dsrScore + coverageScore + lenderScore,
    maxPoints: 17 + lenderMaxPoints,
    detail: `DSR ${Math.round(dsrPercent)}%, repayment coverage ${coverage?.toFixed(1) ?? 'N/A'}x${lenderScoreAvailable ? '' : ' (active-lender count not available — excluded from this score)'}.`,
    evidence: { dsrPercent: Math.round(dsrPercent), coverage, activeLenderCount },
  }
}

// --- Liquidity — /15 (F11-F13) ------------------------------------------

export function liquidityScore(months: MonthlyFinancialAggregateInput[], lowBalanceThresholdRupees: number): ComponentScoreResult {
  const withBalanceData = months.filter((m) => m.minBalance !== null)
  if (withBalanceData.length === 0) {
    return unavailable(15, 'NOT_REPORTED', 'No month in the statement reports a running balance.')
  }

  // F11 — Minimum Balance (new BBS scale, max +5): how far above the configured tight-liquidity threshold the worst month's balance fell.
  const overallMinBalance = Math.min(...withBalanceData.map((m) => m.minBalance!))
  const minBalanceScore =
    overallMinBalance >= lowBalanceThresholdRupees * 5 ? 5 : overallMinBalance >= lowBalanceThresholdRupees * 2 ? 3 : overallMinBalance >= lowBalanceThresholdRupees ? 1 : 0

  // F12 — Low Balance Frequency (spec's own exact bands, max +5).
  const totalLowBalanceDays = sum(withBalanceData.map((m) => m.lowBalanceDays ?? 0))
  const totalObservedDays = sum(withBalanceData.map((m) => m.observedDays))
  const lowBalanceFrequencyPercent = totalObservedDays > 0 ? (totalLowBalanceDays / totalObservedDays) * 100 : 0
  const frequencyScore = lowBalanceFrequencyPercent < 5 ? 5 : lowBalanceFrequencyPercent < 10 ? 4 : lowBalanceFrequencyPercent < 20 ? 3 : lowBalanceFrequencyPercent < 30 ? 1 : 0

  // F13 — Negative Balance (spec: "critical liquidity signal" — binary, max +5).
  const hadNegativeBalance = withBalanceData.some((m) => m.hadNegativeBalance === true)
  const negativeBalanceScore = hadNegativeBalance ? 0 : 5

  return {
    availability: 'AVAILABLE',
    score: minBalanceScore + frequencyScore + negativeBalanceScore,
    maxPoints: 15,
    detail: `Minimum balance observed: ${Math.round(overallMinBalance)}; low-balance days ${Math.round(lowBalanceFrequencyPercent)}% of observed days.`,
    evidence: { overallMinBalance, lowBalanceFrequencyPercent: Math.round(lowBalanceFrequencyPercent), hadNegativeBalance },
  }
}

// --- Expense Behaviour — /10 (F14) --------------------------------------

export function expenseBehaviourScore(months: MonthlyFinancialAggregateInput[]): ComponentScoreResult {
  const totalIncome = sum(months.map((m) => m.normalizedIncome))
  if (totalIncome <= 0) return unavailable(10, 'NOT_REPORTED', 'No normalized income is available to calculate an expense ratio.')

  const totalExpenses = sum(months.map((m) => m.essentialExpenses + m.discretionaryExpenses + m.financialExpenses))
  const expenseRatioPercent = (totalExpenses / totalIncome) * 100
  // F14's own exact bands, proportionally scaled from its spec'd /4 ceiling to this category's full /10 (the spec gives no second rule for this category).
  const score = expenseRatioPercent < 50 ? 10 : expenseRatioPercent < 65 ? 7 : expenseRatioPercent < 80 ? 5 : expenseRatioPercent < 95 ? 2 : 0

  return {
    availability: 'AVAILABLE',
    score,
    maxPoints: 10,
    detail: `Expenses are ${Math.round(expenseRatioPercent)}% of normalized income.`,
    evidence: { expenseRatioPercent: Math.round(expenseRatioPercent) },
  }
}

// --- Borrowing Dependency — /10 (F15-F16) -------------------------------

export function borrowingDependencyScore(months: MonthlyFinancialAggregateInput[]): ComponentScoreResult {
  const totalInflow = sum(months.map((m) => m.totalInflow))
  if (totalInflow <= 0) return unavailable(10, 'INSUFFICIENT_DATA', 'No inflow is available to calculate borrowing dependency.')

  const totalLoanInflows = sum(months.map((m) => m.loanInflows))
  const dependencyPercent = (totalLoanInflows / totalInflow) * 100
  // F15's own qualitative bands (low/moderate/elevated/high), points newly allocated.
  const score = dependencyPercent < 5 ? 10 : dependencyPercent < 15 ? 7 : dependencyPercent < 25 ? 4 : dependencyPercent < 40 ? 1 : 0

  return {
    availability: 'AVAILABLE',
    score,
    maxPoints: 10,
    detail: `Loan inflows are ${Math.round(dependencyPercent)}% of total inflow.`,
    evidence: { dependencyPercent: Math.round(dependencyPercent) },
  }
}

// --- Credit Payment Behaviour — /5 (F17) --------------------------------

export function creditPaymentBehaviourScore(months: MonthlyFinancialAggregateInput[]): ComponentScoreResult {
  const totalIncome = sum(months.map((m) => m.normalizedIncome))
  const totalCreditPayments = sum(months.map((m) => m.creditCardPayments))

  if (totalCreditPayments === 0) {
    return { availability: 'AVAILABLE', score: 5, maxPoints: 5, detail: 'No credit-card/CRED payment activity was identified.', evidence: { intensityPercent: 0 } }
  }
  if (totalIncome <= 0) return unavailable(5, 'NOT_REPORTED', 'No normalized income is available to calculate credit payment intensity.')

  const intensityPercent = (totalCreditPayments / totalIncome) * 100
  const score = intensityPercent < 10 ? 5 : intensityPercent < 20 ? 3 : intensityPercent < 30 ? 1 : 0

  return { availability: 'AVAILABLE', score, maxPoints: 5, detail: `Credit payments are ${Math.round(intensityPercent)}% of normalized income.`, evidence: { intensityPercent: Math.round(intensityPercent) } }
}

// --- Transaction / Account Behaviour — /5 (F18 + ATM/Cash) --------------

export function transactionAccountBehaviourScore(transactions: NormalizedTransactionInput[], months: MonthlyFinancialAggregateInput[]): ComponentScoreResult {
  if (months.length === 0) return unavailable(5, 'INSUFFICIENT_DATA', 'No monthly data is available.')

  // New BBS threshold (spec: "descriptive, not inherently negative" — no number given): >60 transactions/month average counts as high velocity.
  const avgTransactionsPerMonth = transactions.length / months.length
  const highVelocity = avgTransactionsPerMonth > 60

  const totalIncome = sum(months.map((m) => m.normalizedIncome))
  const totalCashWithdrawals = sum(months.map((m) => m.cashWithdrawals))
  // New BBS threshold: cash withdrawals exceeding 40% of normalized income creates a CASH_VISIBILITY_GAP (final use of cash can't be determined from the statement alone).
  const cashWithdrawalPercent = totalIncome > 0 ? (totalCashWithdrawals / totalIncome) * 100 : 0
  const cashVisibilityGap = totalIncome > 0 && cashWithdrawalPercent > 40

  let score = 5
  if (highVelocity) score -= 2
  if (cashVisibilityGap) score -= 3
  score = Math.max(0, score)

  return {
    availability: 'AVAILABLE',
    score,
    maxPoints: 5,
    detail: `${Math.round(avgTransactionsPerMonth)} transactions/month on average${cashVisibilityGap ? '; high cash withdrawal share' : ''}.`,
    evidence: { avgTransactionsPerMonth: Math.round(avgTransactionsPerMonth), highVelocity, cashVisibilityGap, cashWithdrawalPercent: Math.round(cashWithdrawalPercent) },
  }
}

// --- Financial Stress Signals (the /5 component — distinct from the separate 0-100 indicator below) ---

export interface StressInputs {
  months: MonthlyFinancialAggregateInput[]
  confirmedBounceCount: number
  activeLenderCount: number | null
  dsrPercent: number | null
  borrowingDependencyPercent: number | null
  creditPaymentIntensityPercent: number | null
}

export function stressSignalsScore(inputs: StressInputs): ComponentScoreResult {
  const { months } = inputs
  if (months.length === 0) return unavailable(5, 'INSUFFICIENT_DATA', 'No monthly data is available.')

  const deficitMonths = months.filter((m) => m.netCashFlow < 0).length
  const lowBalanceDays = sum(months.map((m) => m.lowBalanceDays ?? 0))
  const hadNegativeBalance = months.some((m) => m.hadNegativeBalance === true)

  // Rule 21: "Do not simply count flags" — a weighted composite, not a bare tally.
  // Four of the eight sub-signals below are genuinely optional (bureau-
  // derived or cross-module figures) — a null here means "not evaluated,"
  // never "confirmed safe." Each is only ever ADDED as a risk signal when
  // present (never assumed absent-and-therefore-fine); `unavailableSignals`
  // surfaces how many of the four went unevaluated so a CCR/reviewer can
  // tell a clean "0 signals present" result apart from a thin, partially-
  // evaluated one at a glance, rather than treating them as equivalent.
  let signalWeight = 0
  let unavailableSignals = 0
  if (deficitMonths > 2) signalWeight += 1
  if (lowBalanceDays > 10) signalWeight += 1
  if (inputs.dsrPercent === null) unavailableSignals += 1
  else if (inputs.dsrPercent > 40) signalWeight += 1
  if (inputs.borrowingDependencyPercent === null) unavailableSignals += 1
  else if (inputs.borrowingDependencyPercent > 25) signalWeight += 1
  if (inputs.activeLenderCount === null) unavailableSignals += 1
  else if (inputs.activeLenderCount > 6) signalWeight += 1
  if (inputs.creditPaymentIntensityPercent === null) unavailableSignals += 1
  else if (inputs.creditPaymentIntensityPercent > 20) signalWeight += 1
  if (inputs.confirmedBounceCount > 0) signalWeight += 2
  if (hadNegativeBalance) signalWeight += 1

  const score = Math.max(0, 5 - signalWeight)
  return {
    availability: 'AVAILABLE',
    score,
    maxPoints: 5,
    detail: `${signalWeight} weighted stress signal(s) present${unavailableSignals > 0 ? ` (${unavailableSignals} of 4 cross-signals not evaluated — this score reflects only what is available)` : ''}.`,
    evidence: { signalWeight, deficitMonths, confirmedBounceCount: inputs.confirmedBounceCount, unavailableSignals },
  }
}

/** Rule 14/22: the separate 0-100 "BBS Financial Stress Indicator" — never combined with the health-score components above. */
export function financialStressIndicator(inputs: StressInputs): { value: number; band: FinancialStressBand } {
  const { months } = inputs
  const deficitRatio = months.length > 0 ? months.filter((m) => m.netCashFlow < 0).length / months.length : 0
  const totalObservedDays = sum(months.map((m) => m.observedDays))
  const lowBalanceDayRatio = totalObservedDays > 0 ? sum(months.map((m) => m.lowBalanceDays ?? 0)) / totalObservedDays : 0
  const dsrPenalty = (inputs.dsrPercent ?? 0) > 50 ? 1 : (inputs.dsrPercent ?? 0) > 30 ? 0.5 : 0
  const borrowingPenalty = Math.min(1, (inputs.borrowingDependencyPercent ?? 0) / 40)
  const lenderPenalty = (inputs.activeLenderCount ?? 0) > 6 ? 1 : (inputs.activeLenderCount ?? 0) > 3 ? 0.5 : 0
  const creditPenalty = Math.min(1, (inputs.creditPaymentIntensityPercent ?? 0) / 30)
  const bouncePenalty = inputs.confirmedBounceCount > 0 ? 1 : 0
  const negativeBalancePenalty = months.some((m) => m.hadNegativeBalance === true) ? 1 : 0

  const value = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        20 * deficitRatio + 15 * lowBalanceDayRatio + 20 * dsrPenalty + 10 * borrowingPenalty + 10 * lenderPenalty + 10 * creditPenalty + 10 * bouncePenalty + 5 * negativeBalancePenalty,
      ),
    ),
  )

  const band: FinancialStressBand = value <= 20 ? 'LOW' : value <= 40 ? 'MODERATE' : value <= 60 ? 'ELEVATED' : value <= 80 ? 'HIGH' : 'CRITICAL'
  return { value, band }
}
