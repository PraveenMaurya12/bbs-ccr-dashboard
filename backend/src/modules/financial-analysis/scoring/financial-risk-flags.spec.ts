import { buildFinancialRiskFlags, type BuildRiskFlagsInput } from './financial-risk-flags'
import { month } from './test-helpers'
import { txn } from '../classification/test-helpers'

function baseInput(overrides: Partial<BuildRiskFlagsInput> = {}): BuildRiskFlagsInput {
  return {
    transactions: [],
    months: [month()],
    incomeStability: { availability: 'AVAILABLE', score: 15, maxPoints: 15, detail: '', evidence: { band: 'Very stable' } },
    cashFlowStrength: { availability: 'AVAILABLE', score: 15, maxPoints: 15, detail: '', evidence: { retentionPercent: 25 } },
    debtServicing: { availability: 'AVAILABLE', score: 20, maxPoints: 20, detail: '', evidence: { dsrPercent: 10, activeLenderCount: 1 } },
    liquidity: { availability: 'AVAILABLE', score: 15, maxPoints: 15, detail: '', evidence: { lowBalanceFrequencyPercent: 0, hadNegativeBalance: false } },
    expenseBehaviour: { availability: 'AVAILABLE', score: 10, maxPoints: 10, detail: '', evidence: { expenseRatioPercent: 40 } },
    borrowingDependency: { availability: 'AVAILABLE', score: 10, maxPoints: 10, detail: '', evidence: { dependencyPercent: 0 } },
    creditPaymentBehaviour: { availability: 'AVAILABLE', score: 5, maxPoints: 5, detail: '', evidence: { intensityPercent: 0 } },
    transactionBehaviour: { availability: 'AVAILABLE', score: 5, maxPoints: 5, detail: '', evidence: { avgTransactionsPerMonth: 10, highVelocity: false, cashVisibilityGap: false, cashWithdrawalPercent: 0 } },
    bounceSummary: { confirmedCount: 0, possibleCount: 0, unknownCount: 0, confirmedLast30Days: 0, confirmedLast90Days: 0, confirmedLast180Days: 0 },
    recurringP2pCounterpartyCount: 0,
    unclassifiedP2pCount: 0,
    largeTransactionCount: 0,
    borrowingDependencyPatternDetected: false,
    ...overrides,
  }
}

describe('buildFinancialRiskFlags', () => {
  it('produces no negative flags at all for a clean, healthy profile', () => {
    const flags = buildFinancialRiskFlags(baseInput())
    expect(flags.every((f) => f.severity === 'POSITIVE' || f.severity === 'INFORMATIONAL')).toBe(true)
  })

  it('flags CRITICAL for a confirmed bounce, never merged with a possible one', () => {
    const flags = buildFinancialRiskFlags(baseInput({ bounceSummary: { confirmedCount: 2, possibleCount: 1, unknownCount: 0, confirmedLast30Days: 1, confirmedLast90Days: 2, confirmedLast180Days: 2 } }))
    const confirmed = flags.find((f) => f.key === 'CONFIRMED_ECS_BOUNCE')
    const possible = flags.find((f) => f.key === 'POSSIBLE_ECS_BOUNCE')
    expect(confirmed?.severity).toBe('CRITICAL')
    expect(possible?.severity).toBe('ATTENTION')
    expect(confirmed?.evidence.confirmedCount).toBe(2)
  })

  it('flags NEGATIVE_BALANCE as CRITICAL whenever liquidity reports one', () => {
    const flags = buildFinancialRiskFlags(baseInput({ liquidity: { availability: 'AVAILABLE', score: 10, maxPoints: 15, detail: '', evidence: { lowBalanceFrequencyPercent: 0, hadNegativeBalance: true } } }))
    expect(flags.find((f) => f.key === 'NEGATIVE_BALANCE')?.severity).toBe('CRITICAL')
  })

  it('flags HIGH_DEBT_SERVICE only above the 50% DSR threshold, MODERATE_DEBT_SERVICE between 30-50%', () => {
    const high = buildFinancialRiskFlags(baseInput({ debtServicing: { availability: 'AVAILABLE', score: 0, maxPoints: 20, detail: '', evidence: { dsrPercent: 60, activeLenderCount: 1 } } }))
    const moderate = buildFinancialRiskFlags(baseInput({ debtServicing: { availability: 'AVAILABLE', score: 4, maxPoints: 20, detail: '', evidence: { dsrPercent: 35, activeLenderCount: 1 } } }))
    expect(high.find((f) => f.key === 'HIGH_DEBT_SERVICE')).toBeDefined()
    expect(moderate.find((f) => f.key === 'MODERATE_DEBT_SERVICE')).toBeDefined()
    expect(moderate.find((f) => f.key === 'HIGH_DEBT_SERVICE')).toBeUndefined()
  })

  it('never fabricates a flag from an unavailable (NOT_REPORTED) component', () => {
    const flags = buildFinancialRiskFlags(baseInput({ debtServicing: { availability: 'NOT_REPORTED', score: null, maxPoints: 20, detail: '', evidence: {} } }))
    expect(flags.some((f) => f.key === 'HIGH_DEBT_SERVICE' || f.key === 'MODERATE_DEBT_SERVICE')).toBe(false)
  })

  it('flags BORROWING_DEPENDENCY_PATTERN as an investigation signal only — detail never states a conclusion', () => {
    const flags = buildFinancialRiskFlags(baseInput({ borrowingDependencyPatternDetected: true }))
    const flag = flags.find((f) => f.key === 'BORROWING_DEPENDENCY_PATTERN')
    expect(flag).toBeDefined()
    expect(flag!.detail.toLowerCase()).not.toContain('debt trap')
  })

  it('flags RECURRING_DEFICIT at 3+ deficit months', () => {
    const flags = buildFinancialRiskFlags(baseInput({ months: [month({ netCashFlow: -1 }), month({ netCashFlow: -1 }), month({ netCashFlow: -1 })] }))
    expect(flags.find((f) => f.key === 'RECURRING_DEFICIT')).toBeDefined()
  })

  it('flags SELF_TRANSFER/P2P_TRANSFER descriptively (never negative severity)', () => {
    const flags = buildFinancialRiskFlags(
      baseInput({ transactions: [txn({ subcategory: 'Self transfer' })], recurringP2pCounterpartyCount: 2 }),
    )
    expect(flags.find((f) => f.key === 'SELF_TRANSFER')?.severity).toBe('INFORMATIONAL')
    expect(flags.find((f) => f.key === 'P2P_TRANSFER')?.severity).toBe('INFORMATIONAL')
  })
})
