import { assessValidationRequired, detectPossibleCauses, detectStrengthsConcernsOpportunities } from './signals'
import type { DebtAnalysisFacts, DsrComparisonResult, MonthlyFact, ReconciliationRowResult } from '../master-profile.types'

function debtFacts(overrides: Partial<DebtAnalysisFacts> = {}): Pick<DebtAnalysisFacts, 'currentMaxDpd' | 'writtenOffCount' | 'settledCount' | 'suitFiledCount' | 'unsecuredPercent' | 'numbersOfLenders' | 'recentEnquiries' | 'substantialRecentConcentration' | 'borrowingClusterDetected'> {
  return { currentMaxDpd: 0, writtenOffCount: 0, settledCount: 0, suitFiledCount: 0, unsecuredPercent: 20, numbersOfLenders: 2, recentEnquiries: 0, substantialRecentConcentration: false, borrowingClusterDetected: false, ...overrides }
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

function dsr(overrides: Partial<DsrComparisonResult> = {}): DsrComparisonResult {
  return {
    bureauDsr: { availability: 'AVAILABLE', percent: 16 },
    bankDsr: { availability: 'AVAILABLE', percent: 16 },
    masterDsr: { availability: 'AVAILABLE', percent: 16, confirmedMonthlyObligations: 8000 },
    debtCoverage: { availability: 'AVAILABLE', ratio: 3 },
    ...overrides,
  }
}

function row(overrides: Partial<ReconciliationRowResult> = {}): ReconciliationRowResult {
  return { lender: 'HDFC', product: 'Personal Loan', reportedOutstanding: 50000, reportedEmi: 8000, observedPayment: 8000, observedFrequencyMonths: null, matchStatus: 'MATCHED', confidence: 0.9, explanation: 'matched', ...overrides }
}

describe('detectStrengthsConcernsOpportunities', () => {
  it('flags NO_CURRENT_OVERDUE and REGULAR_EMI_PAYMENT (both HIGH confidence) when a clean profile has a matched reconciliation row', () => {
    const result = detectStrengthsConcernsOpportunities(debtFacts(), [month()], dsr(), [row()])
    expect(result.strengths.map((s) => s.key)).toEqual(expect.arrayContaining(['NO_CURRENT_OVERDUE', 'REGULAR_EMI_PAYMENT']))
  })

  it('v3.0 §18.1: a single unpaired MEDIUM-confidence strength (CONSISTENT_REPAYMENT) does NOT qualify alone — only HIGH-confidence items, or MEDIUM items paired two at a time', () => {
    const result = detectStrengthsConcernsOpportunities(debtFacts(), [month()], dsr(), [row()])
    expect(result.strengths.some((s) => s.key === 'CONSISTENT_REPAYMENT')).toBe(false)
  })

  it('v3.0 §18.1: strengths are capped at 5', () => {
    const result = detectStrengthsConcernsOpportunities(debtFacts(), [month()], dsr(), [row()])
    expect(result.strengths.length).toBeLessThanOrEqual(5)
  })

  it('flags HIGH_DSR, HIGH_UNSECURED_DEBT, MULTIPLE_LENDERS as concerns when evidence crosses the new BBS thresholds', () => {
    const result = detectStrengthsConcernsOpportunities(debtFacts({ unsecuredPercent: 70, numbersOfLenders: 6 }), [month()], dsr({ masterDsr: { availability: 'AVAILABLE', percent: 45, confirmedMonthlyObligations: 20000 } }), [])
    expect(result.concerns.map((c) => c.key)).toEqual(expect.arrayContaining(['HIGH_UNSECURED_DEBT', 'HIGH_DSR', 'MULTIPLE_LENDERS']))
  })

  it('flags RECURRING_DEFICIT when 3+ months show a cash-flow deficit', () => {
    const months = [month({ netCashFlow: -1000 }), month({ netCashFlow: -2000 }), month({ netCashFlow: -500 })]
    const result = detectStrengthsConcernsOpportunities(debtFacts(), months, dsr(), [])
    expect(result.concerns.map((c) => c.key)).toContain('RECURRING_DEFICIT')
  })

  it('never fabricates a strength/concern when the underlying threshold is not crossed', () => {
    const result = detectStrengthsConcernsOpportunities(debtFacts(), [month()], dsr(), [])
    expect(result.concerns.map((c) => c.key)).not.toContain('HIGH_DSR')
    expect(result.concerns.map((c) => c.key)).not.toContain('MULTIPLE_LENDERS')
  })

  it('CRITICAL: a current-DPD concern is keyed CURRENT_DELINQUENCY, never HISTORICAL_DELINQUENCY (current/historical DPD must never be conflated, including in the machine-readable key)', () => {
    const result = detectStrengthsConcernsOpportunities(debtFacts({ currentMaxDpd: 15 }), [month()], dsr(), [])
    expect(result.concerns.map((c) => c.key)).toContain('CURRENT_DELINQUENCY')
    expect(result.concerns.map((c) => c.key)).not.toContain('HISTORICAL_DELINQUENCY')
  })
})

describe('detectPossibleCauses', () => {
  it('labels recent borrowing as OBSERVED when Debt Analysis itself detected a concentration/cluster', () => {
    const result = detectPossibleCauses({ substantialRecentConcentration: true, borrowingClusterDetected: false, numbersOfLenders: 2 }, [month()])
    const cause = result.find((c) => c.key === 'RECENT_BORROWING')
    expect(cause?.causeConfidence).toBe('OBSERVED')
  })

  it('CRITICAL: never labels a possible cause as fact — every cause carries a causeConfidence tag', () => {
    const result = detectPossibleCauses({ substantialRecentConcentration: true, borrowingClusterDetected: false, numbersOfLenders: 6 }, [month({ loanInflows: 20000, totalInflow: 60000 })])
    expect(result.every((c) => ['OBSERVED', 'SUPPORTED', 'POSSIBLE', 'UNKNOWN'].includes(c.causeConfidence))).toBe(true)
  })

  it('flags TEMPORARY_LIQUIDITY_GAP only when at least 2 months show extended low-balance periods', () => {
    const result = detectPossibleCauses({ substantialRecentConcentration: false, borrowingClusterDetected: false, numbersOfLenders: 1 }, [month({ lowBalanceDays: 15 }), month({ lowBalanceDays: 12 })])
    expect(result.map((c) => c.key)).toContain('TEMPORARY_LIQUIDITY_GAP')
  })
})

describe('assessValidationRequired', () => {
  it('always flags an UNMATCHED_PAYMENT row as an explicit validation item', () => {
    const result = assessValidationRequired(dsr(), [row({ matchStatus: 'UNMATCHED_PAYMENT', reportedEmi: null })])
    expect(result.some((i) => i.item.toLowerCase().includes('unexplained'))).toBe(true)
  })

  it('every item carries a non-empty why explanation', () => {
    const result = assessValidationRequired(dsr(), [])
    expect(result.every((i) => i.why.length > 0)).toBe(true)
  })
})
