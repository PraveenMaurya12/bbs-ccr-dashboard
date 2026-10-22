import { buildPlanInput } from './normalize-input'
import type { NormalizeInputParams } from './normalize-input'

function baseParams(overrides: Partial<NormalizeInputParams> = {}): NormalizeInputParams {
  return {
    leadId: 'lead-1',
    bbsLeadId: 'BBS-LD-100001',
    customerName: 'Test Customer',
    cohortDecision: {
      primaryCohort: 'C1',
      pathway: 'STABILISE',
      pathwayVariant: 'STANDARD',
      planEligibility: 'DRAFT',
      archetype: 'UNCLASSIFIED',
      specialistReviewRequired: false,
      manualReviewRequired: false,
      confidence: 'HIGH',
      capacityBand: 'COMFORTABLE',
      capacityRatio: 0.3,
      sustainableCashFlow: 15000,
      stabilisationCoverage: 1.3,
      debtComplexityBand: 'LOW',
      secondaryFlags: [],
      missingData: [],
      customerExplanation: 'You are on a stabilisation track.',
    },
    pathwayRiskFlags: [],
    masterProfile: {
      alignmentState: 'ALIGNED_HEALTHY',
      resolutionCapacity: 'STRONG',
      overallConfidence: 'HIGH',
      bureauDsrPercent: 20,
      bankDsrPercent: 18,
      masterDsrPercent: 19,
    },
    ...overrides,
  }
}

describe('buildPlanInput', () => {
  it('maps every Cohort Decision field verbatim, never re-deriving one', () => {
    const input = buildPlanInput(baseParams())
    expect(input.cohort).toBe('C1')
    expect(input.pathway).toBe('STABILISE')
    expect(input.capacityBand).toBe('COMFORTABLE')
    expect(input.sustainableCashFlow).toBe(15000)
    expect(input.cohortCustomerExplanation).toBe('You are on a stabilisation track.')
  })

  it('CRITICAL: carries Pathway Decision\'s own riskFlags through read-only, and counts cohortMissingData honestly', () => {
    const input = buildPlanInput(baseParams({ pathwayRiskFlags: ['FCF_UNRECONCILED', 'COMPLIANCE_HOLD'], cohortDecision: { ...baseParams().cohortDecision, missingData: [{ field: 'x', why: 'y', document: null, owner: 'Customer', nextAction: 'z' }] } }))
    expect(input.riskFlags).toEqual(['FCF_UNRECONCILED', 'COMPLIANCE_HOLD'])
    expect(input.missingDataCount).toBe(1)
  })

  it('maps Master Profile facts verbatim when present', () => {
    const input = buildPlanInput(baseParams())
    expect(input.alignmentState).toBe('ALIGNED_HEALTHY')
    expect(input.bureauDsrPercent).toBe(20)
  })

  it('CRITICAL: never fabricates Master Profile facts when absent — all null, not 0/false', () => {
    const input = buildPlanInput(baseParams({ masterProfile: null }))
    expect(input.alignmentState).toBeNull()
    expect(input.resolutionCapacity).toBeNull()
    expect(input.bureauDsrPercent).toBeNull()
    expect(input.bankDsrPercent).toBeNull()
    expect(input.masterDsrPercent).toBeNull()
  })

  it('honestly propagates a null cohort/pathway (an upstream-gate state) rather than fabricating one', () => {
    const input = buildPlanInput(
      baseParams({
        cohortDecision: {
          primaryCohort: null,
          pathway: null,
          pathwayVariant: null,
          planEligibility: 'INSUFFICIENT_DATA',
          archetype: null,
          specialistReviewRequired: false,
          manualReviewRequired: true,
          confidence: 'LOW',
          capacityBand: null,
          capacityRatio: null,
          sustainableCashFlow: null,
          stabilisationCoverage: null,
          debtComplexityBand: null,
          secondaryFlags: [],
          missingData: [{ field: 'verifiedIncome', why: 'Not reported', document: 'Salary slip', owner: 'Customer', nextAction: 'Request salary slip' }],
          customerExplanation: null,
        },
      }),
    )
    expect(input.cohort).toBeNull()
    expect(input.pathway).toBeNull()
    expect(input.manualReviewRequired).toBe(true)
    expect(input.cohortMissingData).toHaveLength(1)
  })

  it('defaults missing secondaryFlags/missingData to an empty array, never null/undefined', () => {
    const input = buildPlanInput(baseParams({ cohortDecision: { ...baseParams().cohortDecision, secondaryFlags: null as never, missingData: null as never } }))
    expect(input.secondaryFlags).toEqual([])
    expect(input.cohortMissingData).toEqual([])
  })
})
