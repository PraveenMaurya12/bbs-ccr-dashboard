import { month } from '../scoring/test-helpers'
import type { ComponentScoreResult } from '../scoring/financial-health-scoring'
import type { CcrBriefInputs, CohortSignalPackageInputs } from './handoff-contracts'
import { buildCcrBrief, buildCohortSignalPackage } from './handoff-contracts'
import type { IncomeProfile } from './income-profile'
import type { TransferProfile, EventProfile } from './extended-metrics'

const unavailable = (maxPoints: number): ComponentScoreResult => ({ availability: 'NOT_REPORTED', score: null, maxPoints, detail: '', evidence: {} })

const availableIncomeStability = (): ComponentScoreResult => ({ availability: 'AVAILABLE', score: 13, maxPoints: 20, detail: '', evidence: { band: 'Highly Stable' } })

const incomeProfile = (overrides: Partial<IncomeProfile> = {}): IncomeProfile => ({
  availability: 'AVAILABLE',
  employmentType: 'SALARIED',
  tenureMonths: 7,
  confidenceLevel: 'MEDIUM',
  confidenceDowngradeReason: '7 months of tenure — confidence downgraded one level from HIGH.',
  currentMonthlyAmount: 110613,
  ...overrides,
})

const transferProfile = (overrides: Partial<TransferProfile> = {}): TransferProfile => ({
  selfTransfers: { count: 0, volumeDebit: 0, volumeCredit: 0, net: 0 },
  roundTrips: { count: 0, volume: 0 },
  familyNetwork: [],
  largeRecurringTransfers: [],
  businessCounterparties: [],
  unclassifiedP2pCount: 0,
  ...overrides,
})

const eventProfile = (overrides: Partial<EventProfile> = {}): EventProfile => ({
  incomeTransition: { detected: false, transitionMonth: null, previousAverage: null, currentAverage: null, deltaPercent: null },
  bonuses: [],
  medicalEvents: { monthlyEntries: [], shockMonths: [], chronic: false },
  relatedPartyEmployer: { detected: false, matchedName: null },
  otherAccountsLikely: false,
  ...overrides,
})

const baseReconciliation = { availability: 'AVAILABLE' as const, reconciled: true, openingBalance: 10000, closingBalance: 12000, expectedClosingBalance: 12000, gapRupees: 0, toleranceRupees: 50, detail: '' }
const baseDataQuality = { rawScore: 84, finalScore: 75, appliedCaps: [], components: {} as never, band: 'Moderate' as const, detail: '' }
const baseFcfReconciliation = { availability: 'AVAILABLE' as const, totalTheoreticalFcf: 72847, totalActualNetCashFlow: 205, gapRupees: 72642, gapPercent: 99.7, unreconciled: true, attribution: null, detail: '' }
const baseDsrBreakdown = { availability: 'AVAILABLE' as const, dsrFixedPercent: 20.6, dsrTotalPercent: 47.7, dsrWithDiscretionaryPercent: 52, detail: '' }

function ccrBriefInputs(overrides: Partial<CcrBriefInputs> = {}): CcrBriefInputs {
  return {
    caseId: 'BBS-20261007-001',
    statementPeriodStart: new Date('2025-04-01'),
    statementPeriodEnd: new Date('2026-03-31'),
    banks: ['Axis Bank'],
    accountsMasked: ['XXXX5717'],
    monthsCovered: 12,
    transactionCount: 1000,
    reconciliation: baseReconciliation,
    totalScore: 39,
    scoreBand: 'Stressed',
    components: {},
    dataQuality: baseDataQuality,
    months: [month()],
    incomeStability: availableIncomeStability(),
    debtServicing: unavailable(20),
    dsrBreakdown: baseDsrBreakdown,
    activeLenderCount: 4,
    fcfReconciliation: baseFcfReconciliation,
    liquidity: { availability: 'AVAILABLE', score: 5, maxPoints: 15, detail: '', evidence: { overallMinBalance: 26.53, lowBalanceFrequencyPercent: 20 } },
    transactionBehaviour: { availability: 'AVAILABLE', score: 2, maxPoints: 5, detail: '', evidence: { cashVisibilityGap: false } },
    transferProfile: transferProfile(),
    eventProfile: eventProfile(),
    riskFlags: [],
    missingInformationRegister: [],
    incomeProfile: incomeProfile(),
    ...overrides,
  }
}

function cohortSignalPackageInputs(overrides: Partial<CohortSignalPackageInputs> = {}): CohortSignalPackageInputs {
  return {
    months: [month()],
    recurringIncomeSourceCount: 1,
    incomeStability: availableIncomeStability(),
    dsrBreakdown: baseDsrBreakdown,
    activeLenderCount: 4,
    fcfReconciliation: baseFcfReconciliation,
    borrowingDependency: unavailable(10),
    liquidity: { availability: 'AVAILABLE', score: 5, maxPoints: 15, detail: '', evidence: { lowBalanceFrequencyPercent: 20 } },
    confirmedBounceCount: 0,
    possibleBounceCount: 8,
    transactionBehaviour: { availability: 'AVAILABLE', score: 2, maxPoints: 5, detail: '', evidence: { cashVisibilityGap: false } },
    riskFlags: [],
    transferProfile: transferProfile(),
    eventProfile: eventProfile(),
    businessPersonalMixed: false,
    unclassifiedSharePercent: 12,
    totalScore: 39,
    scoreBand: 'Stressed',
    dataQuality: baseDataQuality,
    missingInformationRegister: [],
    incomeProfile: incomeProfile(),
    ...overrides,
  }
}

describe('buildCcrBrief', () => {
  it('CRITICAL: carries the real income tenure/confidence through instead of a placeholder string', () => {
    const brief = buildCcrBrief(ccrBriefInputs({ incomeProfile: incomeProfile({ tenureMonths: 7, confidenceLevel: 'MEDIUM' }) }))
    expect(brief.incomeProfile.confidenceLevel).toBe('MEDIUM')
    expect(brief.incomeProfile.tenureMonths).toBe(7)
  })

  it("CRITICAL: normalizedMonthlyIncome reflects the current income source's own amount, never a whole-statement-window average diluted by pre-transition zero-income months", () => {
    // Real-world shape: 4 months with no recognized income (pre-employment),
    // then a stable ₹1,10,613/month salary for the remaining 8 months.
    // sum/12 would silently report ~₹72,834 — a materially wrong "current
    // income" figure for a customer who is CURRENTLY earning ₹1,10,613/month.
    const months = [
      month({ normalizedIncome: 0 }),
      month({ normalizedIncome: 0 }),
      month({ normalizedIncome: 0 }),
      month({ normalizedIncome: 0 }),
      month({ normalizedIncome: 99715 }),
      ...Array.from({ length: 7 }, () => month({ normalizedIncome: 110613 })),
    ]
    const brief = buildCcrBrief(ccrBriefInputs({ months, incomeProfile: incomeProfile({ currentMonthlyAmount: 110613 }) }))
    expect(brief.incomeProfile.normalizedMonthlyIncome).toBe(110613)
    expect(brief.incomeProfile.normalizedMonthlyIncome).not.toBe(72834)
  })

  it('generates a suggested discovery question per missing-information-register item', () => {
    const brief = buildCcrBrief(
      ccrBriefInputs({ missingInformationRegister: [{ category: 'Purpose of Finnable ₹5L loan', status: 'NOT_CAPTURED', description: 'Loan purpose was not stated in the narration.', reason: 'Not visible from a bank statement alone.' }] }),
    )
    expect(brief.suggestedDiscoveryQuestions).toEqual(expect.arrayContaining([expect.stringContaining('Loan purpose was not stated in the narration.')]))
  })

  it('generates a named question for a family network entry, never asserting the relationship as fact', () => {
    const brief = buildCcrBrief(
      ccrBriefInputs({
        transferProfile: transferProfile({
          familyNetwork: [{ counterparty: 'YOGITA ANUPKUMAR SUTH', netFlow: 50000, direction: 'BIDIRECTIONAL', confidence: 'HIGH', signals: { recurring: true, personalNamePattern: true, bidirectional: true, surnameMatch: false }, signalCount: 3 }],
        }),
      }),
    )
    const question = brief.suggestedDiscoveryQuestions.find((q) => q.includes('YOGITA ANUPKUMAR SUTH'))
    expect(question).toBeDefined()
    expect(question).toContain('inferred, not confirmed')
  })

  it('generates a named question for a large recurring transfer counterparty', () => {
    const brief = buildCcrBrief(
      ccrBriefInputs({ transferProfile: transferProfile({ largeRecurringTransfers: [{ counterparty: 'JAMBHAD KISHAN ANUPKUMAR', occurrences: 15, totalVolume: 275000, averagePerTransfer: 18333, band: 'LRT_HIGH' }] }) }),
    )
    expect(brief.suggestedDiscoveryQuestions).toEqual(expect.arrayContaining([expect.stringContaining('₹275000 transferred to JAMBHAD KISHAN ANUPKUMAR')]))
    expect(brief.borrowingAndTransfers.lrtCounterparties[0]).toContain('LRT_HIGH')
  })

  it('generates a cash-withdrawal question naming the peak-withdrawal month only when CASH_VISIBILITY_GAP evidence is present', () => {
    const withGap = buildCcrBrief(
      ccrBriefInputs({
        transactionBehaviour: { availability: 'AVAILABLE', score: 0, maxPoints: 5, detail: '', evidence: { cashVisibilityGap: true } },
        months: [month({ periodMonth: new Date(Date.UTC(2025, 8, 1)), cashWithdrawals: 60000 }), month({ periodMonth: new Date(Date.UTC(2025, 9, 1)), cashWithdrawals: 1000 })],
      }),
    )
    expect(withGap.suggestedDiscoveryQuestions).toEqual(expect.arrayContaining([expect.stringContaining('₹60000 cash withdrawn in 2025-09')]))

    const withoutGap = buildCcrBrief(ccrBriefInputs())
    expect(withoutGap.suggestedDiscoveryQuestions.some((q) => q.includes('cash withdrawn'))).toBe(false)
  })

  it('CRITICAL (v4.0 spec §10.5): generates all 5 fixed cash-usage discovery questions, not just the first', () => {
    const result = buildCcrBrief(
      ccrBriefInputs({
        transactionBehaviour: { availability: 'AVAILABLE', score: 0, maxPoints: 5, detail: '', evidence: { cashVisibilityGap: true } },
        months: [month({ periodMonth: new Date(Date.UTC(2025, 8, 1)), cashWithdrawals: 60000 })],
      }),
    )
    expect(result.suggestedDiscoveryQuestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('cash withdrawn'),
        'Was this a one-time expense or a recurring pattern?',
        'Were there any purchases made in cash?',
        'Was this for medical, education, or business expenses?',
        'Do you have receipts or records for these cash expenses?',
      ]),
    )
  })

  it('generates a medical-shock question naming the worst month and amount', () => {
    const brief = buildCcrBrief(
      ccrBriefInputs({
        eventProfile: eventProfile({ medicalEvents: { monthlyEntries: [], shockMonths: [{ periodMonth: new Date(Date.UTC(2025, 11, 1)), total: 57000, distinctMerchantCount: 4, incomeSharePercent: 51.6, shock: true, acute: true }], chronic: false } }),
      }),
    )
    expect(brief.suggestedDiscoveryQuestions).toEqual(expect.arrayContaining([expect.stringContaining('₹57000 medical expense in 2025-12')]))
  })

  it('generates a related-party-employer question naming the matched employer', () => {
    const brief = buildCcrBrief(ccrBriefInputs({ eventProfile: eventProfile({ relatedPartyEmployer: { detected: true, matchedName: 'Golden Legand Leasing & Finance Ltd' } }) }))
    expect(brief.suggestedDiscoveryQuestions).toEqual(expect.arrayContaining([expect.stringContaining('Golden Legand Leasing & Finance Ltd')]))
  })
})

describe('buildCohortSignalPackage', () => {
  it('CRITICAL: carries the real income tenure through instead of a hardcoded null', () => {
    const pkg = buildCohortSignalPackage(cohortSignalPackageInputs({ incomeProfile: incomeProfile({ tenureMonths: 7 }) }))
    expect(pkg.income_tenure_months).toBe(7)
  })

  it('carries the real income confidence level through instead of a placeholder string', () => {
    const pkg = buildCohortSignalPackage(cohortSignalPackageInputs({ incomeProfile: incomeProfile({ confidenceLevel: 'MEDIUM' }) }))
    expect(pkg.income_confidence).toBe('MEDIUM')
  })

  it('CRITICAL: normalized_monthly_income reflects the current income source, never a whole-window average diluted by pre-transition zero-income months', () => {
    const months = [month({ normalizedIncome: 0 }), month({ normalizedIncome: 0 }), ...Array.from({ length: 10 }, () => month({ normalizedIncome: 110613 }))]
    const pkg = buildCohortSignalPackage(cohortSignalPackageInputs({ months, incomeProfile: incomeProfile({ currentMonthlyAmount: 110613 }) }))
    expect(pkg.normalized_monthly_income).toBe(110613)
  })
})
