import { testConfig, txn } from '../classification/test-helpers'
import { month } from '../scoring/test-helpers'
import type { ComponentScoreResult } from '../scoring/financial-health-scoring'
import type { P2PCounterpartySummary } from '../classification/p2p-detector'
import {
  buildDataQualityScore,
  buildExtendedRiskFlags,
  buildMissingInformationRegister,
  checkBalanceReconciliation,
  computeDsrBreakdown,
  computeFcfReconciliation,
  computeScoreCashflowDivergence,
  findLargeRecurringTransfers,
} from './extended-metrics'

const counterparty = (overrides: Partial<P2PCounterpartySummary>): P2PCounterpartySummary => ({
  counterparty: 'Some Counterparty',
  occurrences: 5,
  recurring: true,
  trend: 'stable',
  totalInflow: 0,
  totalOutflow: 0,
  ...overrides,
})

const availableLiquidity = (lowBalanceFrequencyPercent: number): ComponentScoreResult => ({
  availability: 'AVAILABLE',
  score: 10,
  maxPoints: 15,
  detail: '',
  evidence: { lowBalanceFrequencyPercent },
})

describe('checkBalanceReconciliation', () => {
  it('is NOT_REPORTED (never a fabricated verdict) when either endpoint balance is missing', () => {
    const result = checkBalanceReconciliation(null, 10000, [month()], 100)
    expect(result.availability).toBe('NOT_REPORTED')
    expect(result.reconciled).toBeNull()
  })

  it('reconciles when opening + credits - debits matches the reported closing balance within tolerance', () => {
    const months = [month({ totalInflow: 50000, totalOutflow: 30000 })]
    const result = checkBalanceReconciliation(10000, 30000, months, 100)
    expect(result.reconciled).toBe(true)
    expect(result.gapRupees).toBe(0)
  })

  it('fails reconciliation when the statement shows a material, unexplained balance gap', () => {
    const months = [month({ totalInflow: 50000, totalOutflow: 30000 })]
    const result = checkBalanceReconciliation(10000, 50000, months, 100)
    expect(result.reconciled).toBe(false)
    expect(result.gapRupees).toBe(20000)
  })
})

describe('computeFcfReconciliation', () => {
  it('is INSUFFICIENT_DATA with no months', () => {
    expect(computeFcfReconciliation([], 30).availability).toBe('INSUFFICIENT_DATA')
  })

  it('reports a near-zero gap as reconciled when actual net flow matches the theoretical formula', () => {
    // theoreticalFcf = normalizedIncome(50000) - essential(15000) - mandatoryDebt(10000) = 25000
    // netCashFlow = totalInflow(50000) - totalOutflow(30000) = 20000 -> small gap
    const result = computeFcfReconciliation([month()], 30)
    expect(result.availability).toBe('AVAILABLE')
    expect(result.totalTheoreticalFcf).toBe(25000)
    expect(result.totalActualNetCashFlow).toBe(20000)
    expect(result.gapRupees).toBe(-5000)
  })

  it("the six attribution buckets sum back to the gap exactly (the function's own algebraic identity)", () => {
    const months = [
      month({ normalizedIncome: 60000, essentialExpenses: 20000, mandatoryDebtPayments: 8000, creditCardPayments: 12000, transferOutflows: 15000, cashWithdrawals: 6000, discretionaryExpenses: 9000, financialExpenses: 22000, totalInflow: 90000, totalOutflow: 85000, netCashFlow: 5000 }),
      month({ normalizedIncome: 40000, essentialExpenses: 12000, mandatoryDebtPayments: 5000, creditCardPayments: 3000, transferOutflows: 4000, cashWithdrawals: 2000, discretionaryExpenses: 6000, financialExpenses: 9000, totalInflow: 55000, totalOutflow: 40000, netCashFlow: 15000 }),
    ]
    const result = computeFcfReconciliation(months, 30)
    const a = result.attribution!
    const reconstructed = a.nonIncomeInflowsOffset - (a.creditCardPayments + a.transferOutflows + a.cashWithdrawals + a.discretionaryExpenses + a.otherFinancialAndUnclassifiedOutflows)
    expect(Math.abs(reconstructed - result.gapRupees!)).toBeLessThanOrEqual(1)
  })

  it('flags FCF_UNRECONCILED-eligible (unreconciled: true) when the gap exceeds the configured percent threshold', () => {
    const months = [month({ normalizedIncome: 100000, essentialExpenses: 10000, mandatoryDebtPayments: 10000, totalInflow: 100000, totalOutflow: 5000, netCashFlow: 95000 })]
    // theoreticalFcf = 80000, actual = 95000, gap = 15000, gap% = 18.75% -> below 15 threshold triggers
    const result = computeFcfReconciliation(months, 15)
    expect(result.unreconciled).toBe(true)
  })

  it('does not flag unreconciled when actual closely tracks theoretical', () => {
    const result = computeFcfReconciliation([month()], 30)
    expect(result.unreconciled).toBe(false)
  })
})

describe('computeDsrBreakdown', () => {
  it('is NOT_REPORTED with no income', () => {
    expect(computeDsrBreakdown([month({ normalizedIncome: 0 })]).availability).toBe('NOT_REPORTED')
  })

  it('computes fixed/total/with-discretionary DSR in ascending order', () => {
    const months = [month({ normalizedIncome: 100000, mandatoryDebtPayments: 20000, creditCardPayments: 10000, discretionaryExpenses: 15000 })]
    const result = computeDsrBreakdown(months)
    expect(result.dsrFixedPercent).toBe(20)
    expect(result.dsrTotalPercent).toBe(30)
    expect(result.dsrWithDiscretionaryPercent).toBe(45)
  })
})

describe('computeScoreCashflowDivergence', () => {
  it('is INSUFFICIENT_DATA when the health score itself is unavailable', () => {
    const result = computeScoreCashflowDivergence(null, [month()], availableLiquidity(5), false, [])
    expect(result.availability).toBe('INSUFFICIENT_DATA')
  })

  it('flags divergence for a high score masking real cash-flow stress (>=3 deficit months)', () => {
    const months = [month({ netCashFlow: -1000 }), month({ netCashFlow: -1000 }), month({ netCashFlow: -1000 }), month({ netCashFlow: 5000 })]
    const result = computeScoreCashflowDivergence(65, months, availableLiquidity(5), false, [])
    expect(result.divergent).toBe(true)
  })

  it('flags divergence for a moderate score with 5+ attention-or-worse risk flags', () => {
    const flags = Array.from({ length: 5 }, () => ({ key: 'X', severity: 'ATTENTION' as const, detail: '', evidence: {}, relatedMonth: null, relatedTransactionIndex: null }))
    const result = computeScoreCashflowDivergence(45, [month()], availableLiquidity(5), false, flags)
    expect(result.divergent).toBe(true)
  })

  it('does not flag divergence for a clean, low-stress statement', () => {
    const result = computeScoreCashflowDivergence(85, [month(), month()], availableLiquidity(2), false, [])
    expect(result.divergent).toBe(false)
  })

  it('CRITICAL (spec §15.3): always surfaces the PROPOSED/calibration caveat, divergent or not — these thresholds must never be presented as settled production logic', () => {
    const divergentResult = computeScoreCashflowDivergence(65, [month({ netCashFlow: -1000 }), month({ netCashFlow: -1000 }), month({ netCashFlow: -1000 })], availableLiquidity(5), false, [])
    const cleanResult = computeScoreCashflowDivergence(85, [month(), month()], availableLiquidity(2), false, [])
    expect(divergentResult.thresholdsRequireCalibration).toBe(true)
    expect(divergentResult.detail).toMatch(/PROPOSED.*not yet validated/i)
    expect(cleanResult.thresholdsRequireCalibration).toBe(true)
    expect(cleanResult.detail).toMatch(/PROPOSED.*not yet validated/i)
  })
})

describe('buildDataQualityScore', () => {
  const baseInputs = {
    monthsCovered: 12,
    idealMonthsCovered: 12,
    reconciliation: { availability: 'AVAILABLE' as const, reconciled: true, openingBalance: 1000, closingBalance: 2000, expectedClosingBalance: 2000, gapRupees: 0, toleranceRupees: 100, detail: '' },
    transactions: [txn({ confidence: 0.95, category: 'INCOME' }), txn({ confidence: 0.95, category: 'EXPENSE' })],
    statementHeaderFieldsPresent: 4,
    statementHeaderFieldsTotal: 4,
    otherAccountsLikely: false,
    fcfUnreconciled: false,
    businessPersonalMixed: false,
    config: testConfig(),
  }

  it('awards a high raw score with no caps applied for a clean statement', () => {
    const result = buildDataQualityScore(baseInputs)
    expect(result.appliedCaps).toHaveLength(0)
    expect(result.finalScore).toBe(result.rawScore)
    expect(result.finalScore).toBeGreaterThan(80)
  })

  it('caps the final score when the unclassified share exceeds the threshold', () => {
    const mostlyUnclassified = Array.from({ length: 10 }, () => txn({ confidence: 0.9, category: 'UNCLASSIFIED' }))
    const result = buildDataQualityScore({ ...baseInputs, transactions: mostlyUnclassified })
    expect(result.appliedCaps.some((c) => c.capPoints === testConfig().dataQualityUnclassifiedCapPoints)).toBe(true)
    expect(result.finalScore).toBeLessThanOrEqual(testConfig().dataQualityUnclassifiedCapPoints)
  })

  it('applies the lowest of multiple simultaneous caps (min, not an average)', () => {
    const result = buildDataQualityScore({
      ...baseInputs,
      otherAccountsLikely: true,
      fcfUnreconciled: true,
      reconciliation: { ...baseInputs.reconciliation, reconciled: false, gapRupees: 5000 },
    })
    const minCap = Math.min(testConfig().dataQualityOtherAccountsCapPoints, testConfig().dataQualityFcfUnreconciledCapPoints, testConfig().dataQualityReconciliationFailedCapPoints)
    expect(result.finalScore).toBeLessThanOrEqual(minCap)
  })

  it('gives half credit (never a fabricated pass/fail) when reconciliation could not be evaluated at all', () => {
    const result = buildDataQualityScore({ ...baseInputs, reconciliation: { availability: 'NOT_REPORTED', reconciled: null, openingBalance: null, closingBalance: null, expectedClosingBalance: null, gapRupees: null, toleranceRupees: 100, detail: '' } })
    expect(result.components.reconciliationStatus.score).toBe(8)
  })

  it('CRITICAL (v4.0 spec §12.2, 5th named cap — previously missing): caps the final score when BUSINESS_PERSONAL_MIXED is flagged', () => {
    const result = buildDataQualityScore({ ...baseInputs, businessPersonalMixed: true })
    expect(result.appliedCaps.some((c) => c.capPoints === testConfig().dataQualityBusinessPersonalMixedCapPoints)).toBe(true)
    expect(result.finalScore).toBeLessThanOrEqual(testConfig().dataQualityBusinessPersonalMixedCapPoints)
  })
})

describe('buildMissingInformationRegister', () => {
  const baseInputs = { hasAnyBalanceData: true, hasAccountHolderName: false, hasIfscOrAccountType: false, otherStatementsOnFileCount: 0, familyNetworkEntryCount: 0, businessPersonalMixed: false }

  it('always lists the structural identity/narration/multi-account gaps', () => {
    const items = buildMissingInformationRegister(baseInputs)
    const categories = items.map((i) => i.category)
    expect(categories).toContain('Customer identity')
    expect(categories).toContain('Multi-account aggregation')
  })

  it('adds a running-balance gap item only when no month reports a balance at all', () => {
    expect(buildMissingInformationRegister({ ...baseInputs, hasAnyBalanceData: false }).map((i) => i.category)).toContain('Running balance')
    expect(buildMissingInformationRegister(baseInputs).map((i) => i.category)).not.toContain('Running balance')
  })

  it('reports Customer identity as PARTIAL once any identity field was actually captured', () => {
    const items = buildMissingInformationRegister({ ...baseInputs, hasAccountHolderName: true })
    expect(items.find((i) => i.category === 'Customer identity')?.status).toBe('PARTIAL')
  })

  it('reports Family network as PARTIAL only when at least one entry was actually found', () => {
    expect(buildMissingInformationRegister({ ...baseInputs, familyNetworkEntryCount: 2 }).find((i) => i.category === 'Family / household transfer network')?.status).toBe('PARTIAL')
    expect(buildMissingInformationRegister(baseInputs).find((i) => i.category === 'Family / household transfer network')?.status).toBe('NOT_CAPTURED')
  })
})

const availableIncomeStability = (largestMonthSharePercent: number): ComponentScoreResult => ({
  availability: 'AVAILABLE',
  score: 10,
  maxPoints: 15,
  detail: '',
  evidence: { largestMonthSharePercent, band: 'Stable' },
})

const baseReconciliation = { availability: 'AVAILABLE' as const, reconciled: true, openingBalance: 1000, closingBalance: 2000, expectedClosingBalance: 2000, gapRupees: 0, toleranceRupees: 100, detail: '' }
const baseFcf = { availability: 'AVAILABLE' as const, totalTheoreticalFcf: 20000, totalActualNetCashFlow: 20000, gapRupees: 0, gapPercent: 0, unreconciled: false, attribution: null, detail: '' }
const noIncomeTransition = { detected: false, transitionMonth: null, previousAverage: null, currentAverage: null, deltaPercent: null }
const noMedicalEvents = { monthlyEntries: [], shockMonths: [], chronic: false }
const noRelatedParty = { detected: false, matchedName: null }

function riskFlagInputs(overrides: Partial<Parameters<typeof buildExtendedRiskFlags>[0]> = {}): Parameters<typeof buildExtendedRiskFlags>[0] {
  return {
    months: [month()],
    incomeStability: availableIncomeStability(50),
    reconciliation: baseReconciliation,
    fcfReconciliation: baseFcf,
    config: testConfig(),
    normalizedTransactions: [],
    p2pCounterparties: [],
    roundTripPairCount: 0,
    familyNetworkEntryCount: 0,
    businessPersonalMixed: false,
    incomeTransition: noIncomeTransition,
    medicalEvents: noMedicalEvents,
    relatedPartyEmployer: noRelatedParty,
    bonusCount: 0,
    ...overrides,
  }
}

describe('buildExtendedRiskFlags', () => {
  it('flags MERCHANT_AMBIGUOUS for a generic-keyword EXPENSE match, never for a named-merchant match', () => {
    const ambiguous = txn({ narration: 'LOCAL KIRANA STORE', direction: 'DEBIT', category: 'EXPENSE', subcategory: 'Groceries' })
    const named = txn({ narration: 'BIGBASKET ORDER', direction: 'DEBIT', category: 'EXPENSE', subcategory: 'Groceries' })
    const flags = buildExtendedRiskFlags(riskFlagInputs({ normalizedTransactions: [ambiguous, named] }))
    const flag = flags.find((f) => f.key === 'MERCHANT_AMBIGUOUS')
    expect(flag?.evidence.ambiguousMerchantCount).toBe(1)
  })

  it('flags RECONCILIATION_FAILED only when the reconciliation check actually failed', () => {
    const flags = buildExtendedRiskFlags(riskFlagInputs({ reconciliation: { ...baseReconciliation, reconciled: false, gapRupees: 9000 } }))
    expect(flags.some((f) => f.key === 'RECONCILIATION_FAILED')).toBe(true)
  })

  it('flags SINGLE_SOURCE_DEPENDENCY above the configured concentration threshold', () => {
    const flags = buildExtendedRiskFlags(riskFlagInputs({ incomeStability: availableIncomeStability(95) }))
    expect(flags.some((f) => f.key === 'SINGLE_SOURCE_DEPENDENCY')).toBe(true)
  })

  it('flags NO_CURRENT_DEFICIT (POSITIVE) when every month in the window is a surplus month', () => {
    const flags = buildExtendedRiskFlags(riskFlagInputs({ months: [month({ netCashFlow: 1000 }), month({ netCashFlow: 2000 })] }))
    const noDeficit = flags.find((f) => f.key === 'NO_CURRENT_DEFICIT')
    expect(noDeficit?.severity).toBe('POSITIVE')
  })

  it('flags LARGE_RECURRING_TRANSFER for a recurring counterparty clearing all three configured thresholds', () => {
    const flags = buildExtendedRiskFlags(riskFlagInputs({ p2pCounterparties: [{ counterparty: 'ravi kumar', occurrences: 4, recurring: true, trend: 'stable', totalInflow: 0, totalOutflow: 120000 }] }))
    expect(flags.some((f) => f.key === 'LARGE_RECURRING_TRANSFER')).toBe(true)
  })

  it('does not flag LARGE_RECURRING_TRANSFER when volume is below the configured floor', () => {
    const flags = buildExtendedRiskFlags(riskFlagInputs({ p2pCounterparties: [{ counterparty: 'ravi kumar', occurrences: 4, recurring: true, trend: 'stable', totalInflow: 0, totalOutflow: 8000 }] }))
    expect(flags.some((f) => f.key === 'LARGE_RECURRING_TRANSFER')).toBe(false)
  })

  it('flags ROUND_TRIP using the real detector-supplied pair count', () => {
    const flags = buildExtendedRiskFlags(riskFlagInputs({ roundTripPairCount: 2 }))
    const roundTrip = flags.find((f) => f.key === 'ROUND_TRIP')
    expect(roundTrip?.evidence.roundTripPairCount).toBe(2)
  })

  it('flags OTHER_ACCOUNTS_LIKELY (as an explicitly caveated proxy) when self-transfer credit volume exceeds the income-share threshold', () => {
    const flags = buildExtendedRiskFlags(riskFlagInputs({ months: [month({ normalizedIncome: 50000 })], normalizedTransactions: [txn({ subcategory: 'Self transfer', direction: 'CREDIT', amount: 10000 })] }))
    expect(flags.some((f) => f.key === 'OTHER_ACCOUNTS_LIKELY')).toBe(true)
  })

  it('names the other bank in OTHER_ACCOUNTS_LIKELY evidence when counterparty-bank narration detail was parsed', () => {
    const flags = buildExtendedRiskFlags(
      riskFlagInputs({
        months: [month({ normalizedIncome: 50000 })],
        normalizedTransactions: [txn({ subcategory: 'Self transfer', direction: 'CREDIT', amount: 10000, narrationDetail: { referenceNumber: null, counterpartyRaw: null, purpose: null, counterpartyBank: 'Kotak Mahindra Bank' } })],
      }),
    )
    const flag = flags.find((f) => f.key === 'OTHER_ACCOUNTS_LIKELY')
    expect(flag?.evidence.otherBanks).toBe('Kotak Mahindra Bank')
  })

  it('flags TRANSFER_FAMILY, BUSINESS_PERSONAL_MIXED, INCOME_TRANSITION, BONUS, MEDICAL_SHOCK, CHRONIC_MEDICAL, RELATED_PARTY_EMPLOYER, UNCLASSIFIED_TRANSACTIONS from their respective detector outputs', () => {
    const flags = buildExtendedRiskFlags(
      riskFlagInputs({
        familyNetworkEntryCount: 1,
        businessPersonalMixed: true,
        incomeTransition: { detected: true, transitionMonth: new Date(Date.UTC(2025, 7, 1)), previousAverage: 80000, currentAverage: 110000, deltaPercent: 37.5 },
        bonusCount: 1,
        medicalEvents: { monthlyEntries: [{ periodMonth: new Date(Date.UTC(2025, 11, 1)), total: 57000, distinctMerchantCount: 2, incomeSharePercent: 51.6, shock: true, acute: true }, { periodMonth: new Date(Date.UTC(2025, 9, 1)), total: 500, distinctMerchantCount: 1, incomeSharePercent: 1, shock: false, acute: false }, { periodMonth: new Date(Date.UTC(2025, 8, 1)), total: 500, distinctMerchantCount: 1, incomeSharePercent: 1, shock: false, acute: false }], shockMonths: [{ periodMonth: new Date(Date.UTC(2025, 11, 1)), total: 57000, distinctMerchantCount: 2, incomeSharePercent: 51.6, shock: true, acute: true }], chronic: true },
        relatedPartyEmployer: { detected: true, matchedName: 'Golden Legand Leasing' },
        normalizedTransactions: Array.from({ length: 2 }, () => txn({ category: 'UNCLASSIFIED' })).concat(Array.from({ length: 8 }, () => txn({ category: 'INCOME' }))),
      }),
    )
    const keys = flags.map((f) => f.key)
    expect(keys).toEqual(
      expect.arrayContaining(['TRANSFER_FAMILY', 'BUSINESS_PERSONAL_MIXED', 'INCOME_TRANSITION', 'BONUS', 'MEDICAL_SHOCK', 'CHRONIC_MEDICAL', 'RELATED_PARTY_EMPLOYER', 'UNCLASSIFIED_TRANSACTIONS']),
    )
    expect(flags.find((f) => f.key === 'MEDICAL_SHOCK')?.severity).toBe('ELEVATED')
  })
})

describe('findLargeRecurringTransfers', () => {
  it('bands a counterparty at or above the high-volume threshold as LRT_HIGH', () => {
    const [result] = findLargeRecurringTransfers(
      [counterparty({ counterparty: 'National Cooperative', occurrences: 10, totalInflow: 0, totalOutflow: 275000 })],
      testConfig(),
    )
    expect(result.band).toBe('LRT_HIGH')
    expect(result.totalVolume).toBe(275000)
  })

  it('bands a counterparty below the high-volume threshold as LRT_MEDIUM', () => {
    const [result] = findLargeRecurringTransfers(
      [counterparty({ counterparty: 'Yogita Anupkumar Suth', occurrences: 5, totalInflow: 150000, totalOutflow: 0 })],
      testConfig(),
    )
    expect(result.band).toBe('LRT_MEDIUM')
  })

  it('excludes a non-recurring or below-threshold counterparty entirely', () => {
    const results = findLargeRecurringTransfers([counterparty({ recurring: false, totalOutflow: 500000 })], testConfig())
    expect(results).toEqual([])
  })
})
