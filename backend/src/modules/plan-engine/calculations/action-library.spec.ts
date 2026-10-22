import type { PlanInput } from '../plan-engine.types'
import { ACTION_LIBRARY, generateConditionalActions } from './action-library'

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

describe('ACTION_LIBRARY (v3.0 §10.1-10.2)', () => {
  it('every canonical action has a stable, non-empty actionId matching its own key, a valid ownerType/phase, and a positive SLA', () => {
    for (const [key, action] of Object.entries(ACTION_LIBRARY)) {
      expect(action.actionId).toBe(key)
      expect(['CUSTOMER', 'BBS', 'CREDITOR']).toContain(action.ownerType)
      expect(['IMMEDIATE', 'DAY_30', 'DAY_60', 'DAY_90']).toContain(action.phase)
      expect(action.slaDays).toBeGreaterThan(0)
    }
  })
})

describe('generateConditionalActions (PL005, v3.0 §10.3)', () => {
  it('no conditional actions when no flags/pathway apply', () => {
    expect(generateConditionalActions(baseInput())).toEqual([])
  })

  it('missingDataCount > 0 injects CA-001/CA-004/CA-005', () => {
    const actions = generateConditionalActions(baseInput({ missingDataCount: 1 }))
    const ids = actions.map((a) => a.actionId)
    expect(ids).toEqual(expect.arrayContaining(['CA-001', 'CA-004', 'CA-005']))
  })

  it('FCF_UNRECONCILED injects CCR-003', () => {
    const actions = generateConditionalActions(baseInput({ riskFlags: ['FCF_UNRECONCILED'] }))
    expect(actions.map((a) => a.actionId)).toContain('CCR-003')
  })

  it('OTHER_ACCOUNTS_LIKELY injects CA-003', () => {
    const actions = generateConditionalActions(baseInput({ riskFlags: ['OTHER_ACCOUNTS_LIKELY'] }))
    expect(actions.map((a) => a.actionId)).toContain('CA-003')
  })

  it('CONSOLIDATE injects BBS-001/BBS-004/LND-001/CA-009/CA-011', () => {
    const actions = generateConditionalActions(baseInput({ pathway: 'CONSOLIDATE' }))
    const ids = actions.map((a) => a.actionId)
    expect(ids).toEqual(expect.arrayContaining(['BBS-001', 'BBS-004', 'LND-001', 'CA-009', 'CA-011']))
  })

  it('RESTRUCTURE injects BBS-002/LND-002/CA-009/CA-011', () => {
    const actions = generateConditionalActions(baseInput({ pathway: 'RESTRUCTURE' }))
    const ids = actions.map((a) => a.actionId)
    expect(ids).toEqual(expect.arrayContaining(['BBS-002', 'LND-002', 'CA-009', 'CA-011']))
  })

  it('RESOLVE injects BBS-002/BBS-003/LND-003/LND-004/CA-011', () => {
    const actions = generateConditionalActions(baseInput({ pathway: 'RESOLVE' }))
    const ids = actions.map((a) => a.actionId)
    expect(ids).toEqual(expect.arrayContaining(['BBS-002', 'BBS-003', 'LND-003', 'LND-004', 'CA-011']))
  })

  it('90-day variant injects BBS-005/CA-012 (never reachable in practice today, but built honestly)', () => {
    const actions = generateConditionalActions(baseInput({ pathwayVariant: 'NINETY_DAY' }))
    expect(actions.map((a) => a.actionId)).toEqual(expect.arrayContaining(['BBS-005', 'CA-012']))
  })

  it('COMPLIANCE_HOLD injects COMP-001/COMP-002', () => {
    const actions = generateConditionalActions(baseInput({ riskFlags: ['COMPLIANCE_HOLD'] }))
    expect(actions.map((a) => a.actionId)).toEqual(expect.arrayContaining(['COMP-001', 'COMP-002']))
  })

  it('CRITICAL: dedupes by actionId — overlapping triggers never duplicate the same canonical action', () => {
    const actions = generateConditionalActions(baseInput({ pathway: 'RESTRUCTURE', riskFlags: ['COMPLIANCE_HOLD'] }))
    const ids = actions.map((a) => a.actionId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
