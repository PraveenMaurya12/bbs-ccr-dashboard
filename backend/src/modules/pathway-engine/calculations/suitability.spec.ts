import { evaluateSuitability } from './suitability'
import { cleanPathwayInput } from './test-helpers'

describe('evaluateSuitability (§5.2 per-pathway suitability conditions)', () => {
  it('OPTIMISE: all conditions MET for a clean, Comfortable-capacity, no-overdue lead', () => {
    const input = cleanPathwayInput({ l4: { capacityBand: 'COMFORTABLE', currentOverdue: 0, legalStatusActive: false, debtCycleSignal: false, complianceHold: false }, l3: { fcfReconciled: true, masterDsrPercent: 20, p1Count: 0 } })
    const result = evaluateSuitability('OPTIMISE', input)
    expect(result.conditions.every((c) => c.status === 'MET')).toBe(true)
    expect(result.suitabilityScore).toBe(1)
  })

  it('OPTIMISE: fails when overdue is present', () => {
    const input = cleanPathwayInput({ l4: { capacityBand: 'COMFORTABLE', currentOverdue: 5000 } })
    const result = evaluateSuitability('OPTIMISE', input)
    expect(result.conditions.find((c) => c.condition === 'No current overdue')?.status).toBe('FAILED')
  })

  it('CONSOLIDATE: "Approved product available" is always UNKNOWN (no live integration) and excluded from the score denominator', () => {
    const input = cleanPathwayInput({ l4: { capacityBand: 'TIGHT', activeAccounts: 3, debtCycleSignal: false }, l3: { fcfReconciled: true, masterDsrPercent: 30, p1Count: 0 } })
    const result = evaluateSuitability('CONSOLIDATE', input)
    const productCondition = result.conditions.find((c) => c.condition === 'Approved product available')
    expect(productCondition?.status).toBe('UNKNOWN')
    expect(result.totalCount).toBe(result.conditions.length - 1) // UNKNOWN excluded
  })

  it('RESTRUCTURE: Master DSR > 40% is MET when DSR is high', () => {
    const input = cleanPathwayInput({ l4: { capacityBand: 'STRESSED' }, l3: { masterDsrPercent: 55, p1Count: 0 } })
    const result = evaluateSuitability('RESTRUCTURE', input)
    expect(result.conditions.find((c) => c.condition === 'Master DSR > 40%')?.status).toBe('MET')
  })

  it('RESOLVE: Capacity = Distressed is MET only for a Distressed band', () => {
    const met = evaluateSuitability('RESOLVE', cleanPathwayInput({ l4: { capacityBand: 'DISTRESSED' } }))
    const failed = evaluateSuitability('RESOLVE', cleanPathwayInput({ l4: { capacityBand: 'STRESSED' } }))
    expect(met.conditions.find((c) => c.condition === 'Capacity = Distressed')?.status).toBe('MET')
    expect(failed.conditions.find((c) => c.condition === 'Capacity = Distressed')?.status).toBe('FAILED')
  })

  it('RECOVER: "Agreed repayment/resolution active" reads L4 lifecycleState directly', () => {
    const active = evaluateSuitability('RECOVER', cleanPathwayInput({ l4: { lifecycleState: 'ACTIVE' } }))
    const unknown = evaluateSuitability('RECOVER', cleanPathwayInput({ l4: { lifecycleState: null } }))
    expect(active.conditions.find((c) => c.condition === 'Agreed repayment/resolution active')?.status).toBe('MET')
    expect(unknown.conditions.find((c) => c.condition === 'Agreed repayment/resolution active')?.status).toBe('UNKNOWN')
  })

  it('STABILISE: "Distress signal OR overdue" is MET by EITHER a debt-cycle signal or an overdue amount alone', () => {
    const viaOverdue = evaluateSuitability('STABILISE', cleanPathwayInput({ l4: { capacityBand: 'TIGHT', currentOverdue: 1000, debtCycleSignal: false } }))
    const viaDebtCycle = evaluateSuitability('STABILISE', cleanPathwayInput({ l4: { capacityBand: 'TIGHT', currentOverdue: 0, debtCycleSignal: true } }))
    const neither = evaluateSuitability('STABILISE', cleanPathwayInput({ l4: { capacityBand: 'TIGHT', currentOverdue: 0, debtCycleSignal: false } }))
    expect(viaOverdue.conditions.find((c) => c.condition === 'Distress signal OR overdue')?.status).toBe('MET')
    expect(viaDebtCycle.conditions.find((c) => c.condition === 'Distress signal OR overdue')?.status).toBe('MET')
    expect(neither.conditions.find((c) => c.condition === 'Distress signal OR overdue')?.status).toBe('FAILED')
  })
})
