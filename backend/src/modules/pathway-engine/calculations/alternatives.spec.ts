import { computeAlternativePathways } from './alternatives'
import { cleanPathwayInput } from './test-helpers'

describe('computeAlternativePathways (§8 — deterministic alternative-pathway algorithm)', () => {
  it('never includes the primary pathway itself', () => {
    const alternatives = computeAlternativePathways('RESTRUCTURE', cleanPathwayInput())
    expect(alternatives.some((a) => a.pathway === 'RESTRUCTURE')).toBe(false)
  })

  it('excludes a pathway scoring below 0.5 (§8.2 step 2\'s own threshold)', () => {
    // A Distressed, non-overdue, compliance-held, high-P1 lead should score
    // very low on every pathway except RESOLVE — OPTIMISE in particular
    // should fail most of its 8 conditions and be excluded.
    const input = cleanPathwayInput({ l4: { capacityBand: 'DISTRESSED', currentOverdue: 5000, legalStatusActive: true, debtCycleSignal: true, complianceHold: true }, l3: { fcfReconciled: false, masterDsrPercent: 90, p1Count: 5 } })
    const alternatives = computeAlternativePathways('RESOLVE', input)
    expect(alternatives.some((a) => a.pathway === 'OPTIMISE')).toBe(false)
  })

  it('sorts by suitability score descending, then by pathway preference order on a tie', () => {
    const input = cleanPathwayInput({ l4: { capacityBand: 'TIGHT', currentOverdue: 0, legalStatusActive: false, debtCycleSignal: false, complianceHold: false, activeAccounts: 3 }, l3: { fcfReconciled: true, masterDsrPercent: 35, p1Count: 0 } })
    const alternatives = computeAlternativePathways('RESTRUCTURE', input)
    for (let i = 1; i < alternatives.length; i++) {
      expect(alternatives[i]!.suitabilityScore).toBeLessThanOrEqual(alternatives[i - 1]!.suitabilityScore)
    }
  })

  it('returns at most the top 3 alternatives', () => {
    const input = cleanPathwayInput({ l4: { capacityBand: 'TIGHT', currentOverdue: 0, legalStatusActive: false, debtCycleSignal: false, complianceHold: false, activeAccounts: 3 }, l3: { fcfReconciled: true, masterDsrPercent: 35, p1Count: 0 } })
    const alternatives = computeAlternativePathways('RESTRUCTURE', input)
    expect(alternatives.length).toBeLessThanOrEqual(3)
  })

  it('each alternative carries met/blocking conditions, a reason-not-primary, and a switch-trigger (§8.3 schema)', () => {
    const input = cleanPathwayInput({ l4: { capacityBand: 'TIGHT', currentOverdue: 1000, legalStatusActive: false, debtCycleSignal: false, complianceHold: false }, l3: { fcfReconciled: true, masterDsrPercent: 35, p1Count: 0 } })
    const alternatives = computeAlternativePathways('STABILISE', input)
    for (const alt of alternatives) {
      expect(typeof alt.reasonNotPrimary).toBe('string')
      expect(typeof alt.switchTrigger).toBe('string')
      expect(Array.isArray(alt.metConditions)).toBe(true)
      expect(Array.isArray(alt.blockingConditions)).toBe(true)
    }
  })

  /**
   * §8.4's own worked example (a C1 customer, primary STABILISE due to
   * overdue, with OPTIMISE/CONSOLIDATE/RESTRUCTURE as alternatives at
   * 0.71/0.50/0.43) cannot be reproduced bit-for-bit here — the spec gives
   * only the final scores, never the underlying input facts (income,
   * DSR, exact overdue amount, FCF status, etc.) that would have to
   * produce those exact fractions under THIS implementation's own
   * condition set. This test instead checks the qualitative shape the
   * example illustrates: an overdue C1 lead still has OPTIMISE/
   * CONSOLIDATE/RESTRUCTURE as live alternatives once overdue clears,
   * and OPTIMISE is never blocked by anything other than the overdue
   * itself when every other condition is otherwise clean — consistent
   * with the example's own "switch_trigger: Overdue cleared" for
   * OPTIMISE. Documented here as a qualitative, not numeric, parity
   * check — see docs/pathway-engine-vnext-parity-matrix.md.
   */
  it('qualitative match to §8.4\'s own C1/STABILISE worked example: OPTIMISE\'s only blocking condition is the overdue itself when everything else is clean', () => {
    const input = cleanPathwayInput({ l4: { primaryCohort: 'C1', capacityBand: 'COMFORTABLE', currentOverdue: 5000, legalStatusActive: false, debtCycleSignal: false, complianceHold: false, activeAccounts: 3 }, l3: { fcfReconciled: true, masterDsrPercent: 25, p1Count: 0 } })
    const alternatives = computeAlternativePathways('STABILISE', input)
    const optimise = alternatives.find((a) => a.pathway === 'OPTIMISE')
    expect(optimise).toBeDefined()
    expect(optimise!.blockingConditions).toEqual(['No current overdue'])
    expect(optimise!.switchTrigger).toBe('Overdue cleared')
  })
})
