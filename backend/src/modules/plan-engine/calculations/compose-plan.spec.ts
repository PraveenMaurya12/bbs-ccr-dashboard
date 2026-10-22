import type { PlanEngineConfig, PlanInput } from '../plan-engine.types'
import { c1StabilisationTemplate } from '../templates/c1-stabilisation.template'
import { x1DataCompletionTemplate } from '../templates/x1-data-completion.template'
import { composePlan } from './compose-plan'

function basePlanInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    leadId: 'lead-1',
    bbsLeadId: 'BBS-LD-100001',
    customerName: 'Test Customer',
    cohort: 'C1',
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
    cohortMissingData: [],
    cohortCustomerExplanation: 'You are on a stabilisation track.',
    riskFlags: [],
    missingDataCount: 0,
    alignmentState: 'ALIGNED_HEALTHY',
    resolutionCapacity: 'STRONG',
    masterProfileConfidence: 'HIGH',
    bureauDsrPercent: 20,
    bankDsrPercent: 18,
    masterDsrPercent: 19,
    ...overrides,
  }
}

function config(): PlanEngineConfig {
  return {
    reviewCadenceDays: [30, 60, 90],
    templateRegistryVersion: 'BBS_PLAN_V3.0',
    ruleVersion: 'BBS_PLAN_V3.0',
    ttlDaysByPathway: { OPTIMISE: 90, STABILISE: 30, CONSOLIDATE: 45, RESTRUCTURE: 45, RESOLVE: 60, RECOVER: 180 },
    placeholderTtlDays: 30,
  }
}

describe('composePlan', () => {
  it('reuses the Cohort Engine’s own financial capacity fields verbatim, never recalculating them', () => {
    const composition = composePlan(basePlanInput(), c1StabilisationTemplate, config())
    expect(composition.financialCapacity).toMatchObject({ capacityBand: 'COMFORTABLE', capacityRatio: 0.3, sustainableCashFlow: 15000, stabilisationCoverage: 1.3 })
  })

  it('CRITICAL (v3.0 PL004): computes a real, forward-looking per-pathway financial target, not a verbatim current-value passthrough', () => {
    const composition = composePlan(basePlanInput(), c1StabilisationTemplate, config())
    const targets = composition.financialTargets as Record<string, unknown>
    expect(targets.shortTermPlanTarget).toMatchObject({ value: 15000, dataAvailability: 'PARTIAL' })
    // §12.4's Protected Buffer Rule only applies to CONSOLIDATE/RESTRUCTURE/STABILISE_90D — standard STABILISE never gets a feasibility verdict.
    expect(composition.feasibility).toBe('NOT_APPLICABLE')
    expect(composition.planTtlDays).toBe(30)
  })

  it('stamps the configured review cadence into monitoringTriggers/reviewSchedule as data, never a scheduled job', () => {
    const composition = composePlan(basePlanInput(), c1StabilisationTemplate, config())
    expect(composition.monitoringTriggers.scheduledDaysFromNow).toEqual([30, 60, 90])
    expect(composition.reviewSchedule.nextReviewDueInDays).toBe(30)
  })

  it('carries the template’s own risks/disclosures/successCriteria through verbatim', () => {
    const composition = composePlan(basePlanInput(), c1StabilisationTemplate, config())
    expect(composition.risks).toEqual(c1StabilisationTemplate.risks)
    expect(composition.disclosures).toEqual(c1StabilisationTemplate.disclosures)
    expect(composition.successCriteria).toEqual(c1StabilisationTemplate.successCriteria)
  })

  it('sets lifecycleStatus from the template’s own initialLifecycleStatus', () => {
    const composition = composePlan(basePlanInput(), c1StabilisationTemplate, config())
    expect(composition.lifecycleStatus).toBe('DRAFT')
  })

  it('every TEMPLATE-authored condition starts UNKNOWN/UNVERIFIED — never fabricated as already MET', () => {
    const composition = composePlan(basePlanInput(), c1StabilisationTemplate, config())
    const templateConditionIds = new Set(c1StabilisationTemplate.conditions.map((c) => c.conditionId))
    for (const c of composition.conditions.filter((c) => templateConditionIds.has(c.conditionId))) {
      expect(c.state).toBe('UNKNOWN')
      expect(c.verificationStatus).toBe('UNVERIFIED')
    }
  })

  it('CRITICAL (v3.0 §13.4): injects the standard-conditions set, self-verified only where Plan Engine can honestly confirm it, NOT_APPLICABLE for live product/lender conditions', () => {
    const composition = composePlan(basePlanInput(), c1StabilisationTemplate, config())
    const consentCondition = composition.conditions.find((c) => c.conditionId === 'std-consent-valid')
    const productCondition = composition.conditions.find((c) => c.conditionId === 'std-product-available')
    expect(consentCondition?.state).toBe('MET')
    expect(productCondition?.state).toBe('NOT_APPLICABLE')
  })

  it('CRITICAL: surfaces each cohortMissingData item as a concrete, trackable action — not just restated as prose (X1 path)', () => {
    const input = basePlanInput({
      cohort: 'X1',
      pathway: null,
      cohortMissingData: [{ field: 'verifiedIncome', why: 'Not reported', document: 'Salary slip', owner: 'Customer', nextAction: 'Request salary slip' }],
    })
    const composition = composePlan(input, x1DataCompletionTemplate, config())
    const missingDataAction = composition.actions.find((a) => a.actionId === 'missing-data-1')
    expect(missingDataAction).toBeDefined()
    expect(missingDataAction!.ownerType).toBe('CUSTOMER')
    expect(missingDataAction!.description).toMatch(/Request salary slip/)
    expect(composition.missingData).toHaveLength(1)
  })

  it('never fabricates missingData as present when the input has none', () => {
    const composition = composePlan(basePlanInput({ cohortMissingData: [] }), c1StabilisationTemplate, config())
    expect(composition.missingData).toBeNull()
  })

  it('specialistReviewRequired is true whenever the input itself flags it, even for a non-C6 template', () => {
    const composition = composePlan(basePlanInput({ specialistReviewRequired: true }), c1StabilisationTemplate, config())
    expect(composition.specialistReviewRequired).toBe(true)
  })

  it('customerExplanation never leaks the internal archetype label', () => {
    const composition = composePlan(basePlanInput({ archetype: 'DEBT_SPIRAL' }), c1StabilisationTemplate, config())
    expect(composition.customerExplanation).not.toMatch(/DEBT_SPIRAL/)
  })
})
