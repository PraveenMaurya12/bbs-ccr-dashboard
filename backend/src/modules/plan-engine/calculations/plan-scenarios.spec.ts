import type { PlanEngineConfig, PlanInput } from '../plan-engine.types'
import { composePlan } from './compose-plan'
import { evaluatePlanGate } from './rules'
import { getTemplate } from '../templates/registry'

/**
 * v3.0 §29/§24.4 T-CASE-01 — the Praveenkumar case validation, reusing the
 * same BLOCKED/COMPLIANCE_HOLD facts already established in this session's
 * Cohort Engine and Pathway Engine scenario specs. The spec's own §29.3
 * expects `plan_id: null`/`plan_status: "BLOCKED"` — this codebase's own
 * established convention (shared with Cohort/Pathway Engine) instead
 * always persists a real, thinner, versioned plan rather than a bare null
 * object (see this module's own parity matrix for why that deviation is
 * kept). This spec verifies the closest honest equivalent: a real plan is
 * composed, but it proposes NO debt-resolution strategy, starts at
 * CCR_REVIEW (never DRAFT, since a BLOCKED case has nothing ready for a
 * CCR to draft), and its rule results show the compliance signal audited
 * (PL007 FIRED) without ever fabricating a confident recommendation.
 */
function config(): PlanEngineConfig {
  return {
    reviewCadenceDays: [30, 60, 90],
    templateRegistryVersion: 'BBS_PLAN_V3.0',
    ruleVersion: 'BBS_PLAN_V3.0',
    ttlDaysByPathway: { OPTIMISE: 90, STABILISE: 30, CONSOLIDATE: 45, RESTRUCTURE: 45, RESOLVE: 60, RECOVER: 180 },
    placeholderTtlDays: 30,
  }
}

function praveenkumarInput(): PlanInput {
  return {
    leadId: 'lead-praveenkumar',
    bbsLeadId: 'BBS-CASE-PRAVEENKUMAR',
    customerName: 'Praveenkumar Motriya',
    cohort: 'COMPLIANCE_HOLD',
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
    secondaryFlags: [
      { key: 'FCF_UNRECONCILED', label: 'FCF unreconciled', reason: 'Income reconciliation not yet resolved' },
      { key: 'OTHER_ACCOUNTS_LIKELY', label: 'Other accounts likely', reason: 'Self-transfer income share above threshold' },
    ],
    cohortMissingData: [],
    cohortCustomerExplanation: 'We are completing final verification. No action required from you at this time.',
    riskFlags: ['COMPLIANCE_HOLD', 'FCF_UNRECONCILED', 'OTHER_ACCOUNTS_LIKELY'],
    missingDataCount: 0,
    alignmentState: null,
    resolutionCapacity: null,
    masterProfileConfidence: 'LOW',
    bureauDsrPercent: null,
    bankDsrPercent: null,
    masterDsrPercent: null,
  }
}

describe('T-CASE-01: Praveenkumar case validation (v3.0 §29)', () => {
  it('PL001 gate: a BLOCKED/COMPLIANCE_HOLD Pathway Decision yields PLACEHOLDER, never GENERATE', () => {
    const gate = evaluatePlanGate({ pathwayDecisionAvailable: true, pathwayStatus: 'BLOCKED', primaryPathway: null, blockingReason: 'COMPLIANCE_HOLD', ttlLiveStatus: 'NOT_APPLICABLE' })
    expect(gate.outcome).toBe('PLACEHOLDER')
    expect(gate.reason).toBe('COMPLIANCE_HOLD')
  })

  it('CRITICAL: no primary pathway -> routes to the generic pending-resolution template (never a fabricated restructure/consolidate plan)', () => {
    const input = praveenkumarInput()
    const template = getTemplate(input.cohort, input.pathway, input.pathwayVariant)
    expect(template.templateId).toBe('PENDING_RESOLUTION')
    expect(template.debtStrategy).toMatch(/none proposed/i)
    expect(template.initialLifecycleStatus).toBe('CCR_REVIEW')
  })

  it('the composed plan proposes no debt strategy, starts CCR_REVIEW, and its PL007 audit rule confirms the compliance hold was detected (never silently dropped)', () => {
    const input = praveenkumarInput()
    const template = getTemplate(input.cohort, input.pathway, input.pathwayVariant)
    const composition = composePlan(input, template, config())

    expect(composition.lifecycleStatus).toBe('CCR_REVIEW')
    expect(composition.debtStrategy.narrative).toMatch(/none proposed/i)
    const pl007 = composition.ruleResults.find((r) => r.ruleId === 'PL007')
    expect(pl007?.evaluation).toBe('FIRED')
  })

  it('customer-facing text never leaks compliance/investigation vocabulary (PL015)', () => {
    const input = praveenkumarInput()
    const template = getTemplate(input.cohort, input.pathway, input.pathwayVariant)
    const composition = composePlan(input, template, config())
    const pl015 = composition.ruleResults.find((r) => r.ruleId === 'PL015')
    expect(pl015?.evaluation).toBe('NOT_FIRED')
    expect(composition.customerExplanation.toLowerCase()).not.toMatch(/compliance|investigation|fraud/)
  })
})
