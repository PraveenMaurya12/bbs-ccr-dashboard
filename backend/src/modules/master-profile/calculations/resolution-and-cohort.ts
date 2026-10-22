import type { CohortAttributeVector, CreditFinancialAlignmentState, DebtAnalysisFacts, DsrComparisonResult, MasterConfidenceLevel, MonthlyFact, ResolutionCapacityLevel, StressProfileResult } from '../master-profile.types'

const STRESS_LEVEL_TO_BAND: Record<StressProfileResult['level'], CohortAttributeVector['financialStressLevel']> = {
  Stable: 'LOW',
  Attention: 'MODERATE',
  'High Attention': 'HIGH',
  Critical: 'CRITICAL',
}

function sum(values: number[]): number {
  return values.reduce((t, v) => t + v, 0)
}

/**
 * BBS Master Profile Module v3.0 §16 — the exact resolution-capacity
 * formula and §16.5's 6-band table. An operational resolution-planning
 * readiness label — explicitly NOT a loan-approval decision (§16's own
 * heading).
 *
 * Formula (§16.1/§16.4): sustainable surplus = normalized income − fixed
 * obligations (this module's own Master DSR confirmed-obligations figure)
 * − essential expenses (L2's own `essentialExpenses`, PLUS any inferred
 * family-support flows per §9.2/§16.3's own explicit inclusion rule) − a
 * stress buffer banded by income (§16.2: >₹1L->5%, ₹50K-₹1L->7%, <₹50K->10%).
 *
 * §16.4's own worked example states the formula can show a healthy
 * theoretical surplus while `fcfReconciled === false` means the ACTUAL
 * surplus is near zero — §16.5's own band table therefore caps the result
 * at MARGINAL whenever FCF is unreconciled, regardless of how large the
 * theoretical surplus is. This is the single most load-bearing rule in this
 * function, and is exactly what the reference Praveenkumar case exercises
 * (theoretical surplus ₹47,316, i.e. >30% of income, but FCF_UNRECONCILED
 * caps it at MARGINAL rather than STRONG).
 */
export function computeResolutionCapacity(
  normalizedMonthlyIncome: number | null,
  confirmedMonthlyObligations: number | null,
  monthlyEssentialExpenses: number,
  familyNetworkMonthlyEstimate: number,
  fcfReconciled: boolean | null,
): { level: ResolutionCapacityLevel; theoreticalSurplus: number | null; stressBufferPercent: number; factors: string[] } {
  const factors: string[] = []

  if (normalizedMonthlyIncome === null || normalizedMonthlyIncome <= 0 || confirmedMonthlyObligations === null) {
    return { level: 'UNKNOWN', theoreticalSurplus: null, stressBufferPercent: 0, factors: ['Insufficient data to compute a sustainable surplus.'] }
  }

  const stressBufferPercent = normalizedMonthlyIncome > 100000 ? 0.05 : normalizedMonthlyIncome >= 50000 ? 0.07 : 0.1
  const stressBuffer = normalizedMonthlyIncome * stressBufferPercent
  const essentialIncludingFamily = monthlyEssentialExpenses + familyNetworkMonthlyEstimate
  const theoreticalSurplus = normalizedMonthlyIncome - confirmedMonthlyObligations - essentialIncludingFamily - stressBuffer
  const surplusPercent = (theoreticalSurplus / normalizedMonthlyIncome) * 100

  factors.push(`Theoretical sustainable surplus: Rs. ${Math.round(theoreticalSurplus)}/month (${Math.round(surplusPercent)}% of normalized income).`)
  if (fcfReconciled === false) factors.push('FCF is unreconciled — actual surplus cannot be confirmed, capping capacity at Marginal regardless of the theoretical figure.')

  let level: ResolutionCapacityLevel
  if (theoreticalSurplus <= 0) {
    level = 'NONE'
  } else if (fcfReconciled === false) {
    level = 'MARGINAL'
  } else if (fcfReconciled === null) {
    level = 'UNKNOWN'
  } else if (surplusPercent > 30) {
    level = 'STRONG'
  } else if (surplusPercent > 15) {
    level = 'MODERATE'
  } else if (surplusPercent > 5) {
    level = 'TIGHT'
  } else {
    level = 'MARGINAL'
  }

  return { level, theoreticalSurplus: Math.round(theoreticalSurplus), stressBufferPercent, factors }
}

function bandCreditScore(creditScore: number | null): CohortAttributeVector['creditScoreBand'] {
  if (creditScore === null) return 'NO_SCORE'
  // v3.0 §21.2's exact bands (800-900 excellent / 750-799 good / 700-749
  // fair / 650-699 below_avg / <650 poor) collapsed onto this vector's
  // existing 4-value union (no separate "below_avg" value exists here —
  // folded into POOR, the closest existing band, rather than widening the
  // union for one extra tier this vector doesn't otherwise use elsewhere).
  if (creditScore >= 750) return 'EXCELLENT'
  if (creditScore >= 700) return 'GOOD'
  if (creditScore >= 650) return 'FAIR'
  return 'POOR'
}

/**
 * v3.0 §21.2's total_debt_band is explicitly relative to income ("<1x
 * income = low; 1-3x = medium; 3-5x = high; >5x = very_high"), not an
 * absolute rupee banding — a real, deliberate departure from this
 * function's own prior absolute-threshold implementation. Uses ANNUAL
 * normalized income (the standard debt-to-income framing), since the
 * spec's own worked numbers don't resolve cleanly against a MONTHLY
 * multiple either (see docs/master-profile-vnext-parity-matrix.md for the
 * exact reconciliation attempt against the Praveenkumar reference, which
 * this literal reading of the formula does not numerically reproduce —
 * documented as an open discrepancy rather than forced).
 */
function bandDebt(totalOutstanding: number, annualNormalizedIncome: number | null): CohortAttributeVector['totalDebtBand'] {
  if (annualNormalizedIncome === null || annualNormalizedIncome <= 0) return 'UNKNOWN'
  const multiple = totalOutstanding / annualNormalizedIncome
  if (multiple < 1) return 'LOW'
  if (multiple < 3) return 'MODERATE'
  if (multiple < 5) return 'HIGH'
  return 'VERY_HIGH'
}

function bandIncome(normalizedMonthlyIncome: number): CohortAttributeVector['normalizedIncomeBand'] {
  if (normalizedMonthlyIncome <= 0) return 'UNKNOWN'
  if (normalizedMonthlyIncome < 25000) return 'LOW'
  if (normalizedMonthlyIncome < 75000) return 'MODERATE'
  return 'HIGH'
}

function bandRatio(percent: number | null, lowMax: number, moderateMax: number, highMax: number): CohortAttributeVector['debtServiceBand'] {
  if (percent === null) return 'UNKNOWN'
  if (percent < lowMax) return 'LOW'
  if (percent < moderateMax) return 'MODERATE'
  if (percent < highMax) return 'HIGH'
  return 'VERY_HIGH'
}

/**
 * BBS Master Profile Module v3.0 §21 — the deterministic attribute vector
 * for the Cohort Engine. Every value is a band/enum derived from figures
 * already computed elsewhere in this module — the Cohort Engine itself
 * owns classification, never this module (§19/§24's own "L3 cannot assign
 * a cohort" principle).
 */
export function buildCohortAttributeVector(
  debt: Pick<DebtAnalysisFacts, 'creditScore' | 'currentMaxDpd' | 'maxHistoricalDpd' | 'writtenOffCount' | 'settledCount' | 'totalOutstanding' | 'unsecuredPercent' | 'substantialRecentConcentration' | 'borrowingClusterDetected' | 'numbersOfLenders'>,
  months: MonthlyFact[],
  dsrComparison: DsrComparisonResult,
  stressProfile: StressProfileResult,
  alignmentState: CreditFinancialAlignmentState | null,
  resolutionCapacity: ResolutionCapacityLevel,
  overallConfidence: MasterConfidenceLevel,
): CohortAttributeVector {
  const totalIncome = sum(months.map((m) => m.normalizedIncome))
  const avgMonthlyIncome = months.length > 0 ? totalIncome / months.length : 0
  const totalNetFlow = sum(months.map((m) => m.netCashFlow))
  const retentionPercent = totalIncome > 0 ? (totalNetFlow / totalIncome) * 100 : null
  const minBalances = months.filter((m) => m.minBalance !== null).map((m) => m.minBalance!)
  const avgMinBalance = minBalances.length > 0 ? sum(minBalances) / minBalances.length : null
  const totalLoanInflows = sum(months.map((m) => m.loanInflows))
  const totalInflow = sum(months.map((m) => m.totalInflow))
  const borrowingDependencyPercent = totalInflow > 0 ? (totalLoanInflows / totalInflow) * 100 : null
  const totalCreditCardPayments = sum(months.map((m) => m.creditCardPayments))
  const cardIntensityPercent = totalIncome > 0 ? (totalCreditCardPayments / totalIncome) * 100 : null
  const matchedOrPartial = dsrComparison.masterDsr.availability === 'AVAILABLE'
  const annualNormalizedIncome = avgMonthlyIncome > 0 ? avgMonthlyIncome * 12 : null

  return {
    creditScoreBand: bandCreditScore(debt.creditScore),
    currentDelinquency: debt.currentMaxDpd !== null ? debt.currentMaxDpd > 0 : null,
    historicalDelinquency: debt.maxHistoricalDpd !== null ? debt.maxHistoricalDpd > 0 : null,
    writeoffStatus: debt.writtenOffCount > 0,
    settlementStatus: debt.settledCount > 0,
    totalDebtBand: bandDebt(debt.totalOutstanding, annualNormalizedIncome),
    unsecuredDebtRatio: debt.unsecuredPercent,
    recentBorrowingLevel: debt.substantialRecentConcentration ? 'ELEVATED' : debt.borrowingClusterDetected ? 'MODERATE' : 'NONE',

    normalizedIncomeBand: bandIncome(avgMonthlyIncome),
    incomeStability: months.length < 2 ? 'UNKNOWN' : avgMonthlyIncome > 0 ? 'STABLE' : 'VOLATILE',
    freeCashflowBand: bandRatio(retentionPercent, 5, 10, 20),
    debtServiceBand: bandRatio(dsrComparison.masterDsr.percent, 20, 30, 40),
    liquidityBand: avgMinBalance === null ? 'UNKNOWN' : avgMinBalance >= 25000 ? 'HIGH' : avgMinBalance >= 5000 ? 'MODERATE' : 'LOW',

    borrowingDependency: borrowingDependencyPercent === null ? 'UNKNOWN' : borrowingDependencyPercent < 15 ? 'LOW' : borrowingDependencyPercent < 25 ? 'MODERATE' : 'HIGH',
    lenderCount: debt.numbersOfLenders,
    cardUtilisation: bandRatio(cardIntensityPercent, 10, 20, 30),

    creditBankAlignment: alignmentState,
    repaymentObserved: matchedOrPartial ? true : null,
    financialStressLevel: STRESS_LEVEL_TO_BAND[stressProfile.level],

    resolutionCapacity,
    dataConfidence: overallConfidence,
  }
}

/**
 * BBS Master Profile Module v3.0 §4.2 — profile-level confidence. HIGH when
 * both modules strongly agree, MEDIUM when one strong source is supported
 * only by pattern evidence, LOW when alignment itself could not be
 * classified (the evidence was too thin — see classifyAlignment's own doc
 * comment on why that is now `null` rather than a 6th named state).
 */
export function assessOverallConfidence(alignmentState: CreditFinancialAlignmentState | null, stressProfile: StressProfileResult, dsrComparison: DsrComparisonResult): MasterConfidenceLevel {
  if (alignmentState === null) return 'LOW'
  if (stressProfile.confidence === 'HIGH' && dsrComparison.masterDsr.availability === 'AVAILABLE') return 'HIGH'
  return 'MEDIUM'
}
