import { disambiguateC1, qualifiesForOptimiseOutsideC1, resolvePathwayPrecedence } from './precedence'
import { evaluateAllRulesForTest } from './rules.spec-helpers'
import { cleanPathwayInput } from './test-helpers'

describe('resolvePathwayPrecedence (§7 — 14-row precedence table)', () => {
  it('Priority 1: L4 = BLOCKED (any reason) -> null, inherits blocks', () => {
    const input = cleanPathwayInput({ l4: { primaryState: 'BLOCKED', primaryCohort: 'COMPLIANCE_HOLD', primaryReasonCode: 'COMPLIANCE_HOLD', secondaryFlags: [{ key: 'DATA_REFRESH_REQUIRED', label: 'x', reason: 'y' }] } })
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input))
    expect(result.primaryPathway).toBeNull()
    expect(result.pathwayStatus).toBe('BLOCKED')
    expect(result.blockingReason).toBe('COMPLIANCE_HOLD')
    expect(result.inheritedBlocks).toEqual(expect.arrayContaining(['COMPLIANCE_HOLD', 'DATA_REFRESH_REQUIRED']))
    expect(result.matchedPriority).toBe(1)
  })

  it('Priority 2: L4 = X1 -> null / INSUFFICIENT_DATA', () => {
    const input = cleanPathwayInput({ l4: { primaryState: 'X1', primaryCohort: 'X1' } })
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input))
    expect(result.primaryPathway).toBeNull()
    expect(result.pathwayStatus).toBe('INSUFFICIENT_DATA')
    expect(result.matchedPriority).toBe(2)
  })

  it('Priority 3: L4 = X2 -> null / OUT_OF_SCOPE', () => {
    const input = cleanPathwayInput({ l4: { primaryState: 'X2', primaryCohort: 'X2' } })
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input))
    expect(result.pathwayStatus).toBe('OUT_OF_SCOPE')
    expect(result.matchedPriority).toBe(3)
  })

  it('Priority 4: L4 = C6 -> null / SPECIALIST_REVIEW', () => {
    const input = cleanPathwayInput({ l4: { primaryState: 'C6', primaryCohort: 'C6' } })
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input))
    expect(result.pathwayStatus).toBe('SPECIALIST_REVIEW')
    expect(result.matchedPriority).toBe(4)
  })

  it('Priority 7: FCF unreconciled >30% -> null / FCF_UNRECONCILED even when L4 assigns a real cohort', () => {
    const input = cleanPathwayInput({ l3: { fcfReconciled: false } })
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input))
    expect(result.primaryPathway).toBeNull()
    expect(result.pathwayStatus).toBe('BLOCKED')
    expect(result.blockingReason).toBe('FCF_UNRECONCILED')
    expect(result.matchedPriority).toBe(7)
  })

  it('Priority 8: L4 = C4 -> RESOLVE', () => {
    const input = cleanPathwayInput({ l4: { primaryState: 'C4', primaryCohort: 'C4', capacityBand: 'DISTRESSED' } })
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input))
    expect(result.primaryPathway).toBe('RESOLVE')
    expect(result.pathwayStatus).toBe('READY')
    expect(result.matchedPriority).toBe(8)
  })

  it('Priority 9: L4 = C3 -> RESTRUCTURE', () => {
    const input = cleanPathwayInput() // baseline is already C3/STRESSED
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input))
    expect(result.primaryPathway).toBe('RESTRUCTURE')
    expect(result.matchedPriority).toBe(9)
  })

  it('Priority 10: L4 = C2 -> CONSOLIDATE', () => {
    const input = cleanPathwayInput({ l4: { primaryState: 'C2', primaryCohort: 'C2', capacityBand: 'TIGHT' } })
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input))
    expect(result.primaryPathway).toBe('CONSOLIDATE')
    expect(result.matchedPriority).toBe(10)
  })

  it('Priority 11: L4 = C5 -> STABILISE', () => {
    const input = cleanPathwayInput({ l4: { primaryState: 'C5', primaryCohort: 'C5', debtCycleSignal: true } })
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input))
    expect(result.primaryPathway).toBe('STABILISE')
    expect(result.matchedPriority).toBe(11)
  })

  it('Priority 13: L4 = C7 -> RECOVER by default', () => {
    const input = cleanPathwayInput({ l4: { primaryState: 'C7', primaryCohort: 'C7', capacityBand: 'STRESSED' } })
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input))
    expect(result.primaryPathway).toBe('RECOVER')
    expect(result.matchedPriority).toBe(13)
  })

  it('Priority 14: no precedence row matches -> null / MANUAL_REVIEW (defensive fallback — primaryState passes the earlier BLOCKED/X1/X2/C6 checks but primaryCohort matches none of the 6 direct-mapping rows, a combination the type system otherwise prevents)', () => {
    const input = cleanPathwayInput({ l4: { primaryState: 'C1', primaryCohort: 'UNEXPECTED_VALUE' as never } })
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input))
    expect(result.pathwayStatus).toBe('MANUAL_REVIEW')
    expect(result.matchedPriority).toBe(14)
  })
})

describe('disambiguateC1 (§9.3 — complete C1 disambiguation matrix)', () => {
  it('overdue present -> STABILISE regardless of capacity/debt-cycle/archetype', () => {
    expect(disambiguateC1(cleanPathwayInput({ l4: { currentOverdue: 5000, capacityBand: 'COMFORTABLE' } }))).toBe('STABILISE')
  })
  it('no overdue, capacity Stressed -> STABILISE', () => {
    expect(disambiguateC1(cleanPathwayInput({ l4: { currentOverdue: 0, capacityBand: 'STRESSED' } }))).toBe('STABILISE')
  })
  it('no overdue, capacity Distressed -> STABILISE', () => {
    expect(disambiguateC1(cleanPathwayInput({ l4: { currentOverdue: 0, capacityBand: 'DISTRESSED' } }))).toBe('STABILISE')
  })
  it('no overdue, Tight, debt-cycle -> STABILISE', () => {
    expect(disambiguateC1(cleanPathwayInput({ l4: { currentOverdue: 0, capacityBand: 'TIGHT', debtCycleSignal: true } }))).toBe('STABILISE')
  })
  it('no overdue, Tight, no debt-cycle, Circumstantial -> OPTIMISE', () => {
    expect(disambiguateC1(cleanPathwayInput({ l4: { currentOverdue: 0, capacityBand: 'TIGHT', debtCycleSignal: false, archetype: 'CIRCUMSTANTIAL' } }))).toBe('OPTIMISE')
  })
  it('no overdue, Tight, no debt-cycle, Debt Spiral -> STABILISE', () => {
    expect(disambiguateC1(cleanPathwayInput({ l4: { currentOverdue: 0, capacityBand: 'TIGHT', debtCycleSignal: false, archetype: 'DEBT_SPIRAL' } }))).toBe('STABILISE')
  })
  it('no overdue, Tight, no debt-cycle, Habitual Avoider -> OPTIMISE (with monitoring)', () => {
    expect(disambiguateC1(cleanPathwayInput({ l4: { currentOverdue: 0, capacityBand: 'TIGHT', debtCycleSignal: false, archetype: 'HABITUAL_AVOIDER' } }))).toBe('OPTIMISE')
  })
  it('no overdue, Comfortable -> OPTIMISE', () => {
    expect(disambiguateC1(cleanPathwayInput({ l4: { currentOverdue: 0, capacityBand: 'COMFORTABLE' } }))).toBe('OPTIMISE')
  })
  it('no overdue, Unknown capacity -> null (FCF_UNRECONCILED, handled by caller)', () => {
    expect(disambiguateC1(cleanPathwayInput({ l4: { currentOverdue: 0, capacityBand: 'UNKNOWN' } }))).toBeNull()
  })
})

describe('qualifiesForOptimiseOutsideC1 (§9.4 — strict, all-8 condition set for C7)', () => {
  const qualifyingOverrides = { l4: { primaryCohort: 'C7' as const, capacityBand: 'COMFORTABLE' as const, currentOverdue: 0, legalStatusActive: false, debtCycleSignal: false, complianceHold: false }, l3: { fcfReconciled: true, masterDsrPercent: 30, p1Count: 0 } }

  it('all 8 conditions met -> true', () => {
    expect(qualifiesForOptimiseOutsideC1(cleanPathwayInput(qualifyingOverrides))).toBe(true)
  })
  it('any single condition failing -> false (e.g. overdue present)', () => {
    expect(qualifiesForOptimiseOutsideC1(cleanPathwayInput({ ...qualifyingOverrides, l4: { ...qualifyingOverrides.l4, currentOverdue: 100 } }))).toBe(false)
  })
  it('DSR above 40% -> false', () => {
    expect(qualifiesForOptimiseOutsideC1(cleanPathwayInput({ ...qualifyingOverrides, l3: { ...qualifyingOverrides.l3, masterDsrPercent: 45 } }))).toBe(false)
  })
  it('C7 with a qualifying profile resolves to OPTIMISE via full precedence', () => {
    const input = cleanPathwayInput(qualifyingOverrides)
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input))
    expect(result.primaryPathway).toBe('OPTIMISE')
    expect(result.matchedPriority).toBe(13)
  })
})
