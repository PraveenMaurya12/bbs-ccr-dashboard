import type { PlanInput } from '../plan-engine.types'
import { computeFinancialTargets, evaluateProtectedBufferRule } from './financial-targets'

function baseInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    leadId: 'lead-1',
    bbsLeadId: 'BBS-LD-100001',
    customerName: 'Test Customer',
    cohort: 'C3',
    pathway: 'RESTRUCTURE',
    pathwayVariant: 'STANDARD',
    planEligibility: 'DRAFT',
    archetype: 'UNCLASSIFIED',
    specialistReviewRequired: false,
    manualReviewRequired: false,
    confidence: 'HIGH',
    capacityBand: 'STRESSED',
    capacityRatio: 0.1,
    sustainableCashFlow: 10000,
    stabilisationCoverage: 1.0,
    debtComplexityBand: 'MODERATE',
    secondaryFlags: [],
    cohortMissingData: [],
    cohortCustomerExplanation: null,
    riskFlags: [],
    missingDataCount: 0,
    alignmentState: null,
    resolutionCapacity: null,
    masterProfileConfidence: null,
    bureauDsrPercent: null,
    bankDsrPercent: null,
    masterDsrPercent: null,
    ...overrides,
  }
}

describe('computeFinancialTargets (v3.0 §12.2 PL004)', () => {
  it('no pathway -> no targets computed (blocked/thin plan)', () => {
    const result = computeFinancialTargets(baseInput({ pathway: null }))
    expect(result.feasibility).toBe('NOT_APPLICABLE')
    expect(Object.keys(result.targets)).toContain('note')
  })

  it('OPTIMISE: budget/buffer targets computed as a proxy of sustainableCashFlow, feasibility not evaluated (not in §12.4\'s pathway list)', () => {
    const result = computeFinancialTargets(baseInput({ pathway: 'OPTIMISE', sustainableCashFlow: 20000 }))
    expect(result.targets.budgetTarget.value).toBe(20000)
    expect(result.targets.bufferTarget.value).toBe(1000)
    expect(result.feasibility).toBe('NOT_APPLICABLE')
  })

  it('STABILISE (STANDARD): §12.4\'s Protected Buffer Rule does NOT apply — feasibility stays NOT_APPLICABLE even though the target consumes the full surplus', () => {
    const result = computeFinancialTargets(baseInput({ pathway: 'STABILISE', pathwayVariant: 'STANDARD', sustainableCashFlow: 10000 }))
    expect(result.targets.shortTermPlanTarget.value).toBe(10000)
    expect(result.feasibility).toBe('NOT_APPLICABLE')
  })

  it('STABILISE (NINETY_DAY, unreachable today): overdue-support targets are honestly UNAVAILABLE, never fabricated', () => {
    const result = computeFinancialTargets(baseInput({ pathway: 'STABILISE', pathwayVariant: 'NINETY_DAY' }))
    expect(result.targets.overdueSupport.value).toBeNull()
    expect(result.targets.overdueSupport.dataAvailability).toBe('UNAVAILABLE')
  })

  describe('CONSOLIDATE/RESTRUCTURE compose a real proposedPayment and protectedBuffer', () => {
    it('RESTRUCTURE: proposedPayment = sustainableCashFlow × 0.7, protectedBuffer = sustainableCashFlow × 0.1 — both below the feasible bound given this layer\'s own proportional formulas', () => {
      const result = computeFinancialTargets(baseInput({ pathway: 'RESTRUCTURE', sustainableCashFlow: 10000 }))
      expect(result.proposedPayment).toBe(7000)
      expect(result.protectedBuffer).toBe(1000)
      expect(result.feasibility).toBe('FEASIBLE')
    })

    it('CONSOLIDATE: proposedPayment = sustainableCashFlow × 0.8', () => {
      const result = computeFinancialTargets(baseInput({ pathway: 'CONSOLIDATE', sustainableCashFlow: 10000 }))
      expect(result.proposedPayment).toBe(8000)
      expect(result.feasibility).toBe('FEASIBLE')
    })
  })

  describe('evaluateProtectedBufferRule — v3.0 §12.4\'s own boundary, tested directly (spec T-BND-05/06)', () => {
    // CONSOLIDATE/RESTRUCTURE's own fixed 0.7/0.8 multipliers mean the
    // composed proposedPayment can never mathematically cross the 0.9
    // feasible bound (see this function's own doc comment in
    // financial-targets.ts) — so the exact boundary is verified here,
    // directly against the rule itself, independent of which pathway
    // formula produced the proposed payment.
    it('proposed payment EXACTLY equal to (surplus - buffer) is FEASIBLE', () => {
      const result = evaluateProtectedBufferRule(9000, 10000) // buffer = 1000, bound = 9000
      expect(result.feasibility).toBe('FEASIBLE')
    })

    it('a proposed payment exceeding the bound by even a small margin is NOT_FEASIBLE', () => {
      const result = evaluateProtectedBufferRule(9000.01, 10000)
      expect(result.feasibility).toBe('NOT_FEASIBLE')
    })
  })

  it('RESOLVE: resolution range stays UNAVAILABLE (PROPOSED, requires a real outstanding-debt number not exposed to Plan Engine)', () => {
    const result = computeFinancialTargets(baseInput({ pathway: 'RESOLVE' }))
    expect(result.targets.resolutionRange.value).toBeNull()
    expect(result.targets.resolutionRange.dataAvailability).toBe('UNAVAILABLE')
  })

  it('RECOVER: process-based milestone targets, never a fabricated dollar figure', () => {
    const result = computeFinancialTargets(baseInput({ pathway: 'RECOVER' }))
    expect(result.targets.paymentStreak.dataAvailability).toBe('COMPUTED')
    expect(result.feasibility).toBe('NOT_APPLICABLE')
  })
})
