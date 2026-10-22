import { buildCohortInput, deriveDpdTrend } from './normalize-input'
import { testConfig } from './test-helpers'
import type { NormalizeInputParams } from './normalize-input'

function baseParams(overrides: Partial<NormalizeInputParams> = {}): NormalizeInputParams {
  return {
    leadId: 'BBS-LD-100001',
    helpCategory: 'loan_settlement',
    situation: 'Lost job, struggling with EMIs.',
    leadPanAvailable: true,
    customerPanAvailable: false,
    consentGranted: true,
    consentVersion: 'v1',
    debtAnalysis: {
      complete: true,
      creditScore: 700,
      scoreBand: 'good',
      totalOverdue: 0,
      currentMaxDpd: 0,
      maxHistoricalDpd: 0,
      writtenOffCount: 0,
      settledCount: 0,
      suitFiledCount: 0,
      arcAssignedCount: 0,
      willfulDefault: false,
      monthlyDelinquencyTrend: [],
      enquiries30d: 1,
      recentEnquiries: 1,
      totalOutstanding: 50000,
      unsecuredPercent: 20,
      activeAccounts: 1,
      numbersOfLenders: 1,
      totalActiveDebt: 50000,
      clusterDetected: false,
      newAccountsPerYear: 1,
      distinctAccountTypeCount: 1,
    },
    financialAnalysis: {
      complete: true,
      averageNormalizedIncome: 50000,
      averageEssentialExpenses: 20000,
      averageMandatoryDebtPayments: 8000,
      borrowingDependencyPatternDetected: false,
      otherAccountsLikely: false,
      otherAccountsIncomeSharePercent: null,
      incomeTransitionDetected: false,
      incomeTransitionDeltaPercent: null,
      incomeTransitionMonthsSinceTransition: null,
      medicalShockMonthCount: 0,
      medicalShockChronic: false,
      medicalShockMaxIncomeSharePercent: null,
    },
    masterProfile: {
      stale: false,
      alignmentState: 'ALIGNED_HEALTHY',
      overallConfidence: 'HIGH',
      resolutionCapacity: 'STRONG',
      liquidityBand: 'LOW',
      incomeStability: 'STABLE',
      recentBorrowingLevel: 'NONE',
      repaymentObserved: true,
      totalDebtBand: 'LOW',
      readinessOutcome: 'READY',
      complianceHold: false,
      complianceReason: null,
      complianceMatchedEntity: null,
      complianceSince: null,
      complianceSlaHours: null,
      complianceEscalationHours: null,
      postStatementDetected: false,
      postStatementAccountCount: 0,
      postStatementTotalAmount: 0,
      postStatementRepaymentUnverified: false,
      missingInformationP1Count: 0,
      missingInformationP2Count: 0,
      dataQualityBand: 'HIGH',
      dataQualityExceptionCount: 0,
      dataQualityFlags: [],
    },
    ...overrides,
  }
}

describe('buildCohortInput', () => {
  it('maps a fully-available upstream chain into every CohortInput group', () => {
    const input = buildCohortInput(baseParams(), testConfig())
    expect(input.credit.score).toBe(700)
    expect(input.debt.totalDebt).toBe(50000)
    expect(input.financial.sustainableSurplus).toBe(22000) // 50000 - 20000 - 8000
    expect(input.reconciliation.unresolvedMismatch).toBe(false)
    expect(input.readiness.debtAnalysisComplete).toBe(true)
  })

  it('CRITICAL: never defaults a missing Debt Analysis to zero/false — honest nulls propagate throughout', () => {
    const input = buildCohortInput(baseParams({ debtAnalysis: null }), testConfig())
    expect(input.credit.score).toBeNull()
    expect(input.credit.currentOverdue).toBeNull()
    expect(input.credit.historicalMaxDpd).toBeNull()
    expect(input.credit.writeoffStatus).toBeNull()
    expect(input.readiness.debtAnalysisComplete).toBe(false)
    expect(input.debt.activeOverdueRatio).toBeNull()
  })

  it('CRITICAL: never defaults missing Financial Analysis to zero — sustainableSurplus/capacityRatio stay null', () => {
    const input = buildCohortInput(baseParams({ financialAnalysis: null }), testConfig())
    expect(input.financial.verifiedIncomeAvailable).toBe(false)
    expect(input.financial.sustainableSurplus).toBeNull()
    expect(input.financial.capacityRatio).toBeNull()
  })

  it('derives legalOrSpecialistTrigger from suit-filed/ARC/wilful-default, never from ownership disputes (no data source)', () => {
    const input = buildCohortInput(baseParams({ debtAnalysis: { ...baseParams().debtAnalysis!, suitFiledCount: 1 } }), testConfig())
    expect(input.credit.legalOrSpecialistTrigger).toBe(true)
  })

  it('reports panAvailable true if EITHER the lead or the customer record has a PAN reference', () => {
    const input = buildCohortInput(baseParams({ leadPanAvailable: false, customerPanAvailable: true }), testConfig())
    expect(input.lead.panAvailable).toBe(true)
  })

  it('reads borrowingToRepay from Financial Analysis\'s own BORROWING_DEPENDENCY_PATTERN signal, never fabricating it', () => {
    const input = buildCohortInput(baseParams({ financialAnalysis: { ...baseParams().financialAnalysis!, borrowingDependencyPatternDetected: true } }), testConfig())
    expect(input.behaviour.borrowingToRepay).toBe(true)
  })

  it('flags unresolvedMismatch when Master Profile itself could not classify alignment (v3.0 §12.1 removed the old named DATA_CONFLICT_VALIDATION_REQUIRED state — insufficient evidence is now honestly null)', () => {
    const input = buildCohortInput(baseParams({ masterProfile: { ...baseParams().masterProfile!, alignmentState: null } }), testConfig())
    expect(input.reconciliation.unresolvedMismatch).toBe(true)
  })

  it('does NOT flag unresolvedMismatch when no Master Profile exists at all — that is a separate upstream-readiness concern', () => {
    const input = buildCohortInput(baseParams({ masterProfile: undefined }), testConfig())
    expect(input.reconciliation.unresolvedMismatch).toBe(false)
  })
})

describe('deriveDpdTrend', () => {
  it('reports UNKNOWN (never fabricated as STABLE) with fewer than 2 data points', () => {
    expect(deriveDpdTrend([])).toBe('UNKNOWN')
    expect(deriveDpdTrend([{ month: '2026-01', accountsWithDelinquency: 1 }])).toBe('UNKNOWN')
  })

  it('reports ESCALATING when the trailing count increased', () => {
    expect(
      deriveDpdTrend([
        { month: '2026-01', accountsWithDelinquency: 1 },
        { month: '2026-02', accountsWithDelinquency: 2 },
        { month: '2026-03', accountsWithDelinquency: 3 },
      ]),
    ).toBe('ESCALATING')
  })

  it('reports IMPROVING when the trailing count decreased', () => {
    expect(
      deriveDpdTrend([
        { month: '2026-01', accountsWithDelinquency: 3 },
        { month: '2026-02', accountsWithDelinquency: 1 },
      ]),
    ).toBe('IMPROVING')
  })

  it('reports STABLE when the trailing count is unchanged', () => {
    expect(
      deriveDpdTrend([
        { month: '2026-01', accountsWithDelinquency: 2 },
        { month: '2026-02', accountsWithDelinquency: 2 },
      ]),
    ).toBe('STABLE')
  })
})
