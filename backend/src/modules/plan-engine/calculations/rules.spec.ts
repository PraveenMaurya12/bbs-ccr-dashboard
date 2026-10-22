import type { PlanEngineConfig, PlanInput } from '../plan-engine.types'
import { checkCustomerSafeLanguage, evaluateAllRules, evaluateCcrReviewTrigger, evaluatePlanGate, mergeCcrReviewReasons } from './rules'

function config(): PlanEngineConfig {
  return {
    reviewCadenceDays: [30, 60, 90],
    templateRegistryVersion: 'BBS_PLAN_V3.0',
    ruleVersion: 'BBS_PLAN_V3.0',
    ttlDaysByPathway: { OPTIMISE: 90, STABILISE: 30, CONSOLIDATE: 45, RESTRUCTURE: 45, RESOLVE: 60, RECOVER: 180 },
    placeholderTtlDays: 30,
  }
}

function baseInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    leadId: 'lead-1',
    bbsLeadId: 'BBS-LD-100001',
    customerName: 'Test Customer',
    cohort: 'C1',
    pathway: 'OPTIMISE',
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

describe('evaluatePlanGate (PL001, v3.0 §4.2)', () => {
  it('READY + non-null primary_pathway -> GENERATE', () => {
    const result = evaluatePlanGate({ pathwayDecisionAvailable: true, pathwayStatus: 'READY', primaryPathway: 'OPTIMISE', blockingReason: null, ttlLiveStatus: 'ACTIVE' })
    expect(result.outcome).toBe('GENERATE')
  })

  it.each(['BLOCKED', 'SPECIALIST_REVIEW', 'MANUAL_REVIEW', 'INSUFFICIENT_DATA', 'NO_SUITABLE_PATHWAY'])('%s -> PLACEHOLDER', (status) => {
    const result = evaluatePlanGate({ pathwayDecisionAvailable: true, pathwayStatus: status, primaryPathway: null, blockingReason: 'COMPLIANCE_HOLD', ttlLiveStatus: 'NOT_APPLICABLE' })
    expect(result.outcome).toBe('PLACEHOLDER')
  })

  it.each(['OUT_OF_SCOPE', 'CUSTOMER_DECLINED'])('%s -> TERMINAL', (status) => {
    const result = evaluatePlanGate({ pathwayDecisionAvailable: true, pathwayStatus: status, primaryPathway: null, blockingReason: status, ttlLiveStatus: 'NOT_APPLICABLE' })
    expect(result.outcome).toBe('TERMINAL')
  })

  it('EXPIRED/EXPIRED_UNACCEPTED pathwayStatus -> ERROR (request L5 regeneration)', () => {
    const result = evaluatePlanGate({ pathwayDecisionAvailable: true, pathwayStatus: 'EXPIRED', primaryPathway: null, blockingReason: null, ttlLiveStatus: 'NOT_APPLICABLE' })
    expect(result.outcome).toBe('ERROR')
  })

  it('CRITICAL: a live-expired TTL refuses generation even if pathwayStatus itself still reads READY', () => {
    const result = evaluatePlanGate({ pathwayDecisionAvailable: true, pathwayStatus: 'READY', primaryPathway: 'OPTIMISE', blockingReason: null, ttlLiveStatus: 'EXPIRED' })
    expect(result.outcome).toBe('ERROR')
  })

  it('no Pathway Decision available -> ERROR', () => {
    const result = evaluatePlanGate({ pathwayDecisionAvailable: false, pathwayStatus: null, primaryPathway: null, blockingReason: null, ttlLiveStatus: null })
    expect(result.outcome).toBe('ERROR')
  })

  it('an invalid/unknown pathwayStatus -> ERROR, never silently generated', () => {
    const result = evaluatePlanGate({ pathwayDecisionAvailable: true, pathwayStatus: 'SOMETHING_UNEXPECTED', primaryPathway: null, blockingReason: null, ttlLiveStatus: 'NOT_APPLICABLE' })
    expect(result.outcome).toBe('ERROR')
  })
})

describe('evaluateAllRules — audit-only PL007-PL010/PL013 (v3.0 §7)', () => {
  it('PL007 fires only when COMPLIANCE_HOLD is in riskFlags', () => {
    const fired = evaluateAllRules(baseInput({ riskFlags: ['COMPLIANCE_HOLD'] }), config()).find((r) => r.ruleId === 'PL007')
    const notFired = evaluateAllRules(baseInput({ riskFlags: [] }), config()).find((r) => r.ruleId === 'PL007')
    expect(fired?.evaluation).toBe('FIRED')
    expect(notFired?.evaluation).toBe('NOT_FIRED')
  })

  it('PL008 boundary: missingDataCount 0 -> NOT_FIRED, 1 -> FIRED', () => {
    const zero = evaluateAllRules(baseInput({ missingDataCount: 0 }), config()).find((r) => r.ruleId === 'PL008')
    const one = evaluateAllRules(baseInput({ missingDataCount: 1 }), config()).find((r) => r.ruleId === 'PL008')
    expect(zero?.evaluation).toBe('NOT_FIRED')
    expect(one?.evaluation).toBe('FIRED')
  })

  it('PL009 fires only on LOW confidence', () => {
    const low = evaluateAllRules(baseInput({ confidence: 'LOW' }), config()).find((r) => r.ruleId === 'PL009')
    const high = evaluateAllRules(baseInput({ confidence: 'HIGH' }), config()).find((r) => r.ruleId === 'PL009')
    expect(low?.evaluation).toBe('FIRED')
    expect(high?.evaluation).toBe('NOT_FIRED')
  })

  it('PL013 stamps the correct per-pathway TTL, and is NOT_EVALUATED for a null pathway', () => {
    const restructure = evaluateAllRules(baseInput({ pathway: 'RESTRUCTURE' }), config()).find((r) => r.ruleId === 'PL013')
    const blocked = evaluateAllRules(baseInput({ pathway: null }), config()).find((r) => r.ruleId === 'PL013')
    expect(restructure?.evidence.planTtlDays).toBe(45)
    expect(blocked?.evaluation).toBe('NOT_EVALUATED')
  })
})

describe('evaluateCcrReviewTrigger + mergeCcrReviewReasons (PL014, v3.0 §7.2)', () => {
  it('fires for CONSOLIDATE/RESTRUCTURE/RESOLVE pathways', () => {
    for (const pathway of ['CONSOLIDATE', 'RESTRUCTURE', 'RESOLVE'] as const) {
      expect(evaluateCcrReviewTrigger(baseInput({ pathway })).evaluation).toBe('FIRED')
    }
  })

  it('does NOT fire for a clean OPTIMISE case with no other trigger present', () => {
    expect(evaluateCcrReviewTrigger(baseInput({ pathway: 'OPTIMISE' })).evaluation).toBe('NOT_FIRED')
  })

  it('fires for LOW confidence, a compliance hold, or outstanding missing data, independent of pathway', () => {
    expect(evaluateCcrReviewTrigger(baseInput({ confidence: 'LOW' })).evaluation).toBe('FIRED')
    expect(evaluateCcrReviewTrigger(baseInput({ riskFlags: ['COMPLIANCE_HOLD'] })).evaluation).toBe('FIRED')
    expect(evaluateCcrReviewTrigger(baseInput({ missingDataCount: 2 })).evaluation).toBe('FIRED')
  })

  it('mergeCcrReviewReasons upgrades a NOT_FIRED base result to FIRED when a condition has failed or a payment commitment is required', () => {
    const base = evaluateCcrReviewTrigger(baseInput({ pathway: 'OPTIMISE' }))
    expect(base.evaluation).toBe('NOT_FIRED')
    const merged = mergeCcrReviewReasons(base, { anyConditionFailed: true, requiresPaymentCommitment: false })
    expect(merged.evaluation).toBe('FIRED')
  })
})

describe('checkCustomerSafeLanguage (PL015, v3.0 §21.4/§14.3)', () => {
  it('fires on a clean, compliance-safe sentence: NOT_FIRED', () => {
    expect(checkCustomerSafeLanguage('Explore revising your current repayment structure.').evaluation).toBe('NOT_FIRED')
  })

  it.each(['This is a compliance issue.', 'An investigation is ongoing.', 'We are concerned about fraud.', 'Your consolidation approved.', 'A guaranteed outcome.'])('CRITICAL: FIRED on forbidden term in %s', (text) => {
    expect(checkCustomerSafeLanguage(text).evaluation).toBe('FIRED')
  })
})
