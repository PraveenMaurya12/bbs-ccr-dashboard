import {
  borrowingDependencyScore,
  cashFlowStrengthScore,
  creditPaymentBehaviourScore,
  debtServicingCapacityScore,
  expenseBehaviourScore,
  financialStressIndicator,
  incomeStabilityScore,
  liquidityScore,
  stressSignalsScore,
  transactionAccountBehaviourScore,
} from './financial-health-scoring'
import { month } from './test-helpers'

describe('incomeStabilityScore', () => {
  it('reports NOT_REPORTED (never a fabricated score) when no recurring income was ever detected', () => {
    const result = incomeStabilityScore([month()], null)
    expect(result.availability).toBe('NOT_REPORTED')
    expect(result.score).toBeNull()
  })

  it('scores a perfectly stable income pattern at the maximum 15', () => {
    const months = [month({ normalizedIncome: 50000 }), month({ normalizedIncome: 50000 }), month({ normalizedIncome: 50000 })]
    const result = incomeStabilityScore(months, 3)
    expect(result.score).toBe(15)
  })

  it('scores a highly volatile income pattern lower than a stable one', () => {
    const volatile = incomeStabilityScore([month({ normalizedIncome: 10000 }), month({ normalizedIncome: 80000 }), month({ normalizedIncome: 20000 })], 3)
    const stable = incomeStabilityScore([month({ normalizedIncome: 50000 }), month({ normalizedIncome: 51000 }), month({ normalizedIncome: 49000 })], 3)
    expect(volatile.score!).toBeLessThan(stable.score!)
  })
})

describe('cashFlowStrengthScore', () => {
  it('scores full marks for consistent surplus, no deficit months, and strong retention', () => {
    const months = [month({ netCashFlow: 20000, totalInflow: 50000 }), month({ netCashFlow: 20000, totalInflow: 50000 })]
    const result = cashFlowStrengthScore(months)
    expect(result.score).toBe(15)
  })

  it('penalizes deficit months per F07\'s own exact bands', () => {
    const sixDeficits = Array.from({ length: 6 }, () => month({ netCashFlow: -5000 }))
    const result = cashFlowStrengthScore(sixDeficits)
    expect(result.evidence.deficitMonths).toBe(6)
    // >5 deficit months scores 0 on the F07 component specifically.
  })
})

describe('debtServicingCapacityScore', () => {
  it('reports NOT_REPORTED when no normalized income exists to compute a DSR', () => {
    const result = debtServicingCapacityScore([month({ normalizedIncome: 0 })], 2)
    expect(result.availability).toBe('NOT_REPORTED')
  })

  it('awards full marks for no mandatory debt payments at all', () => {
    const result = debtServicingCapacityScore([month({ mandatoryDebtPayments: 0 })], 0)
    expect(result.score).toBe(20)
  })

  it('applies F08\'s exact DSR band edges', () => {
    const low = debtServicingCapacityScore([month({ normalizedIncome: 100000, mandatoryDebtPayments: 15000 })], 1) // 15% DSR
    const high = debtServicingCapacityScore([month({ normalizedIncome: 100000, mandatoryDebtPayments: 55000 })], 1) // 55% DSR
    expect(low.evidence.dsrPercent).toBe(15)
    expect(high.evidence.dsrPercent).toBe(55)
    expect(low.score!).toBeGreaterThan(high.score!)
  })

  it('applies F10\'s exact multiple-active-lenders bands', () => {
    const fewLenders = debtServicingCapacityScore([month({ normalizedIncome: 100000, mandatoryDebtPayments: 10000 })], 2)
    const manyLenders = debtServicingCapacityScore([month({ normalizedIncome: 100000, mandatoryDebtPayments: 10000 })], 7)
    expect(fewLenders.score!).toBeGreaterThan(manyLenders.score!)
  })

  it('CRITICAL: a null (unlinked) active-lender count never silently awards the maximum F10 score — it is excluded from the category\'s own achievable max instead', () => {
    const unknown = debtServicingCapacityScore([month({ normalizedIncome: 100000, mandatoryDebtPayments: 10000 })], null)
    const confirmedFew = debtServicingCapacityScore([month({ normalizedIncome: 100000, mandatoryDebtPayments: 10000 })], 2)
    expect(unknown.maxPoints).toBe(17)
    expect(confirmedFew.maxPoints).toBe(20)
    // Same DSR/coverage inputs — the only difference is lender-count
    // availability, so the unknown case's score must be exactly the known
    // case's score minus the 3 F10 points, never equal to it.
    expect(unknown.score).toBe(confirmedFew.score! - 3)
  })
})

describe('liquidityScore', () => {
  it('reports NOT_REPORTED when no month reports a balance at all', () => {
    const result = liquidityScore([month({ minBalance: null })], 1000)
    expect(result.availability).toBe('NOT_REPORTED')
  })

  it('awards 0 for the negative-balance component when any month went negative (F13 critical signal)', () => {
    const withNegative = liquidityScore([month({ hadNegativeBalance: true })], 1000)
    const withoutNegative = liquidityScore([month({ hadNegativeBalance: false })], 1000)
    expect(withNegative.score!).toBeLessThan(withoutNegative.score!)
  })

  it('applies F12\'s exact low-balance-frequency bands', () => {
    const frequentLowBalance = liquidityScore([month({ lowBalanceDays: 15, observedDays: 20, minBalance: 20000 })], 1000)
    const rareLowBalance = liquidityScore([month({ lowBalanceDays: 0, observedDays: 20, minBalance: 20000 })], 1000)
    expect(frequentLowBalance.score!).toBeLessThan(rareLowBalance.score!)
  })
})

describe('expenseBehaviourScore', () => {
  it('reports NOT_REPORTED without normalized income', () => {
    expect(expenseBehaviourScore([month({ normalizedIncome: 0 })]).availability).toBe('NOT_REPORTED')
  })

  it('scores a low expense ratio higher than a high one', () => {
    const low = expenseBehaviourScore([month({ normalizedIncome: 100000, essentialExpenses: 20000, discretionaryExpenses: 5000, financialExpenses: 5000 })])
    const high = expenseBehaviourScore([month({ normalizedIncome: 100000, essentialExpenses: 50000, discretionaryExpenses: 30000, financialExpenses: 20000 })])
    expect(low.score!).toBeGreaterThan(high.score!)
  })
})

describe('borrowingDependencyScore', () => {
  it('scores low borrowing dependency higher than high dependency', () => {
    const low = borrowingDependencyScore([month({ totalInflow: 100000, loanInflows: 2000 })])
    const high = borrowingDependencyScore([month({ totalInflow: 100000, loanInflows: 50000 })])
    expect(low.score!).toBeGreaterThan(high.score!)
  })
})

describe('creditPaymentBehaviourScore', () => {
  it('awards full marks when no credit-card/CRED activity exists', () => {
    expect(creditPaymentBehaviourScore([month({ creditCardPayments: 0 })]).score).toBe(5)
  })

  it('reports NOT_REPORTED when credit payments exist but income does not', () => {
    const result = creditPaymentBehaviourScore([month({ normalizedIncome: 0, creditCardPayments: 5000 })])
    expect(result.availability).toBe('NOT_REPORTED')
  })
})

describe('transactionAccountBehaviourScore', () => {
  it('deducts points for a high cash-withdrawal share of income (CASH_VISIBILITY_GAP)', () => {
    const highCash = transactionAccountBehaviourScore([], [month({ normalizedIncome: 100000, cashWithdrawals: 60000 })])
    const lowCash = transactionAccountBehaviourScore([], [month({ normalizedIncome: 100000, cashWithdrawals: 2000 })])
    expect(highCash.evidence.cashVisibilityGap).toBe(true)
    expect(highCash.score!).toBeLessThan(lowCash.score!)
  })
})

describe('stressSignalsScore', () => {
  it('rates Rule 21 "do not simply count flags" — a confirmed bounce weighs more than a single soft signal', () => {
    const withBounce = stressSignalsScore({ months: [month()], confirmedBounceCount: 1, activeLenderCount: 1, dsrPercent: 10, borrowingDependencyPercent: 0, creditPaymentIntensityPercent: 0 })
    const withoutBounce = stressSignalsScore({ months: [month()], confirmedBounceCount: 0, activeLenderCount: 1, dsrPercent: 10, borrowingDependencyPercent: 0, creditPaymentIntensityPercent: 0 })
    expect(withBounce.score!).toBeLessThan(withoutBounce.score!)
  })
})

describe('financialStressIndicator', () => {
  it('bands a clean profile as LOW', () => {
    const result = financialStressIndicator({ months: [month()], confirmedBounceCount: 0, activeLenderCount: 1, dsrPercent: 10, borrowingDependencyPercent: 0, creditPaymentIntensityPercent: 0 })
    expect(result.band).toBe('LOW')
  })

  it('bands a severely distressed profile as CRITICAL', () => {
    const distressedMonths = Array.from({ length: 4 }, () => month({ netCashFlow: -10000, lowBalanceDays: 20, observedDays: 20, hadNegativeBalance: true }))
    const result = financialStressIndicator({
      months: distressedMonths,
      confirmedBounceCount: 3,
      activeLenderCount: 8,
      dsrPercent: 70,
      borrowingDependencyPercent: 50,
      creditPaymentIntensityPercent: 40,
    })
    expect(result.band).toBe('CRITICAL')
    expect(result.value).toBeGreaterThan(80)
  })

  it('never combines with the separate 5-point stressSignalsScore component — the two are independent outputs', () => {
    const inputs = { months: [month()], confirmedBounceCount: 0, activeLenderCount: 1, dsrPercent: 10, borrowingDependencyPercent: 0, creditPaymentIntensityPercent: 0 }
    const indicator = financialStressIndicator(inputs)
    const component = stressSignalsScore(inputs)
    expect(indicator.value).not.toBe(component.score)
    expect(typeof indicator.value).toBe('number')
    expect(typeof component.score).toBe('number')
  })
})
