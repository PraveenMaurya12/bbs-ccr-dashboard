import { assessOverallConfidence, buildCohortAttributeVector, computeResolutionCapacity } from './resolution-and-cohort'
import type { DsrComparisonResult, MonthlyFact, StressProfileResult } from '../master-profile.types'

function dsr(overrides: Partial<DsrComparisonResult> = {}): DsrComparisonResult {
  return {
    bureauDsr: { availability: 'AVAILABLE', percent: 16 },
    bankDsr: { availability: 'AVAILABLE', percent: 16 },
    masterDsr: { availability: 'AVAILABLE', percent: 16, confirmedMonthlyObligations: 8000 },
    debtCoverage: { availability: 'AVAILABLE', ratio: 3 },
    ...overrides,
  }
}

function stress(overrides: Partial<StressProfileResult> = {}): StressProfileResult {
  return { level: 'Stable', drivers: [], confidence: 'HIGH', ...overrides }
}

function month(overrides: Partial<MonthlyFact> = {}): MonthlyFact {
  return {
    periodMonth: new Date('2026-01-01'),
    totalInflow: 60000,
    totalOutflow: 40000,
    netCashFlow: 20000,
    normalizedIncome: 50000,
    essentialExpenses: 15000,
    financialExpenses: 8000,
    discretionaryExpenses: 5000,
    mandatoryDebtPayments: 8000,
    creditCardPayments: 0,
    loanInflows: 0,
    transferInflows: 0,
    transferOutflows: 0,
    cashWithdrawals: 0,
    cashDeposits: 0,
    closingBalance: 50000,
    minBalance: 30000,
    lowBalanceDays: 0,
    observedDays: 30,
    hadNegativeBalance: false,
    transactionCount: 20,
    isExceptionalMonth: false,
    exceptionalMonthReason: null,
    ...overrides,
  }
}

describe('computeResolutionCapacity (BBS Master Profile Module v3.0 §16)', () => {
  it('STRONG when surplus exceeds 30% of income and FCF is reconciled', () => {
    // income 110613, obligations 22766, essential 15000, buffer 5% of income (5531) -> surplus 67316 (60.9%)
    const result = computeResolutionCapacity(110613, 22766, 15000, 0, true)
    expect(result.level).toBe('STRONG')
  })

  it('MARGINAL (not STRONG) when FCF is unreconciled — caps the band regardless of a large theoretical surplus, exactly the real Praveenkumar case', () => {
    // Reproduces the reference report's own numbers: income 110613, fixed obligations 22766,
    // essential (incl. inferred family) 35000, 5% stress buffer 5531 -> theoretical surplus 47316 (42.8% of income).
    const result = computeResolutionCapacity(110613, 22766, 15000, 20000, false)
    expect(result.theoreticalSurplus).toBe(47316)
    expect(result.level).toBe('MARGINAL')
  })

  it('MODERATE when surplus is 15-30% of income and FCF is reconciled', () => {
    const result = computeResolutionCapacity(100000, 30000, 35000, 0, true) // 100000 is in the 50K-1L tier -> 7% buffer (7000); surplus=100000-30000-35000-7000=28000 (28% of income)
    expect(result.level).toBe('MODERATE')
  })

  it('NONE when the surplus is zero or negative, regardless of FCF reconciliation', () => {
    const result = computeResolutionCapacity(40000, 20000, 20000, 0, true)
    expect(result.level).toBe('NONE')
  })

  it('UNKNOWN when there is insufficient data to compute a surplus at all', () => {
    expect(computeResolutionCapacity(null, 1000, 1000, 0, true).level).toBe('UNKNOWN')
    expect(computeResolutionCapacity(50000, null, 1000, 0, true).level).toBe('UNKNOWN')
  })

  it('uses the correct stress-buffer band for each income tier (§16.2)', () => {
    const high = computeResolutionCapacity(150000, 0, 0, 0, true) // >1L -> 5%
    expect(high.stressBufferPercent).toBeCloseTo(0.05)
    const mid = computeResolutionCapacity(75000, 0, 0, 0, true) // 50K-1L -> 7%
    expect(mid.stressBufferPercent).toBeCloseTo(0.07)
    const low = computeResolutionCapacity(30000, 0, 0, 0, true) // <50K -> 10%
    expect(low.stressBufferPercent).toBeCloseTo(0.1)
  })
})

describe('buildCohortAttributeVector', () => {
  const debtFacts = { creditScore: 780, currentMaxDpd: 0, maxHistoricalDpd: 0, writtenOffCount: 0, settledCount: 0, totalOutstanding: 150000, unsecuredPercent: 20, substantialRecentConcentration: false, borrowingClusterDetected: false, numbersOfLenders: 2 }

  it('bands credit score correctly per v3.0 §21.2 (750+ excellent)', () => {
    const vector = buildCohortAttributeVector(debtFacts, [month()], dsr(), stress(), 'ALIGNED_HEALTHY', 'STRONG', 'HIGH')
    expect(vector.creditScoreBand).toBe('EXCELLENT')
  })

  it('reports NO_SCORE (never a fabricated band) when credit score is null', () => {
    const vector = buildCohortAttributeVector({ ...debtFacts, creditScore: null }, [month()], dsr(), stress(), 'ALIGNED_HEALTHY', 'STRONG', 'HIGH')
    expect(vector.creditScoreBand).toBe('NO_SCORE')
  })

  it('passes alignmentState/resolutionCapacity/dataConfidence through verbatim — never re-derived here', () => {
    const vector = buildCohortAttributeVector(debtFacts, [month()], dsr(), stress(), 'CREDIT_STRESSED_FINANCIAL_STRONG', 'MODERATE', 'MEDIUM')
    expect(vector.creditBankAlignment).toBe('CREDIT_STRESSED_FINANCIAL_STRONG')
    expect(vector.resolutionCapacity).toBe('MODERATE')
    expect(vector.dataConfidence).toBe('MEDIUM')
  })

  it('passes a null alignmentState through verbatim (v3.0 removed the 6th "data conflict" state — insufficient evidence is now honestly null)', () => {
    const vector = buildCohortAttributeVector(debtFacts, [month()], dsr(), stress(), null, 'UNKNOWN', 'LOW')
    expect(vector.creditBankAlignment).toBeNull()
  })

  it('maps the Master Stress Profile level (not a raw passthrough) into financialStressLevel', () => {
    const vector = buildCohortAttributeVector(debtFacts, [month()], dsr(), stress({ level: 'Critical' }), 'BOTH_STRESSED', 'MARGINAL', 'MEDIUM')
    expect(vector.financialStressLevel).toBe('CRITICAL')
  })

  it('reports UNKNOWN liquidity band (never a fabricated one) when no month reports a balance', () => {
    const vector = buildCohortAttributeVector(debtFacts, [month({ minBalance: null })], dsr(), stress(), 'ALIGNED_HEALTHY', 'STRONG', 'HIGH')
    expect(vector.liquidityBand).toBe('UNKNOWN')
  })

  it('CRITICAL: a high average minimum balance is HIGH liquidity, not LOW (direction must match every other banded figure in this file)', () => {
    const high = buildCohortAttributeVector(debtFacts, [month({ minBalance: 50000 })], dsr(), stress(), 'ALIGNED_HEALTHY', 'STRONG', 'HIGH')
    const low = buildCohortAttributeVector(debtFacts, [month({ minBalance: 1000 })], dsr(), stress(), 'ALIGNED_HEALTHY', 'STRONG', 'HIGH')
    expect(high.liquidityBand).toBe('HIGH')
    expect(low.liquidityBand).toBe('LOW')
  })

  it('v3.0 §21.2: total_debt_band is relative to annualized normalized income, not an absolute rupee amount', () => {
    // 150000 outstanding / (50000*12=600000 annual income) = 0.25x -> LOW
    const lowMultiple = buildCohortAttributeVector(debtFacts, [month({ normalizedIncome: 50000 })], dsr(), stress(), 'ALIGNED_HEALTHY', 'STRONG', 'HIGH')
    expect(lowMultiple.totalDebtBand).toBe('LOW')
    // Same 150000 outstanding / (5000*12=60000 annual income) = 2.5x -> MODERATE
    const highMultiple = buildCohortAttributeVector(debtFacts, [month({ normalizedIncome: 5000 })], dsr(), stress(), 'ALIGNED_HEALTHY', 'STRONG', 'HIGH')
    expect(highMultiple.totalDebtBand).toBe('MODERATE')
  })
})

describe('assessOverallConfidence', () => {
  it('LOW when alignment itself could not be classified (null, not a 6th "data conflict" state)', () => {
    expect(assessOverallConfidence(null, stress(), dsr())).toBe('LOW')
  })

  it('HIGH when both the stress synthesis and Master DSR independently have strong evidence', () => {
    expect(assessOverallConfidence('ALIGNED_HEALTHY', stress({ confidence: 'HIGH' }), dsr())).toBe('HIGH')
  })

  it('MEDIUM otherwise', () => {
    expect(assessOverallConfidence('ALIGNED_HEALTHY', stress({ confidence: 'MEDIUM' }), dsr())).toBe('MEDIUM')
  })
})
