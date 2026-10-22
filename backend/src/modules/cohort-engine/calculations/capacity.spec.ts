import { applyEventDrivenCapacityDowngrade, calculateCapacity, calculateStabilisationCoverage } from './capacity'
import { testConfig as config } from './test-helpers'

describe('calculateCapacity', () => {
  it('reports DISTRESSED when surplus is negative (fcf reconciled)', () => {
    const result = calculateCapacity(30000, 20000, 15000, true, config())
    expect(result.sustainableSurplus).toBe(-5000)
    expect(result.capacityBand).toBe('DISTRESSED')
  })

  it('reports STRESSED at exactly 0% ratio (boundary, never fabricated as DISTRESSED)', () => {
    const result = calculateCapacity(50000, 30000, 20000, true, config())
    expect(result.capacityRatio).toBe(0)
    expect(result.capacityBand).toBe('STRESSED')
  })

  it('reports TIGHT at exactly the stressed/tight boundary (10%)', () => {
    const result = calculateCapacity(50000, 30000, 15000, true, config())
    expect(result.capacityRatio).toBeCloseTo(0.1)
    expect(result.capacityBand).toBe('TIGHT')
  })

  it('reports COMFORTABLE at exactly 20%', () => {
    const result = calculateCapacity(50000, 25000, 15000, true, config())
    expect(result.capacityRatio).toBeCloseTo(0.2)
    expect(result.capacityBand).toBe('COMFORTABLE')
  })

  it('never substitutes a missing input with 0 — reports UNKNOWN band and null surplus/ratio instead', () => {
    const result = calculateCapacity(null, 20000, 15000, true, config())
    expect(result.sustainableSurplus).toBeNull()
    expect(result.capacityRatio).toBeNull()
    expect(result.capacityBand).toBe('UNKNOWN')
  })

  it('never uses gross business turnover — only the given verified monthly income figure (caller\'s responsibility to pass normalized income)', () => {
    const result = calculateCapacity(50000, 10000, 10000, true, config())
    expect(result.sustainableSurplus).toBe(30000)
  })

  it('v3.0 §5.2 R013: caps a would-be COMFORTABLE band at STRESSED when FCF is unreconciled', () => {
    const result = calculateCapacity(50000, 25000, 15000, false, config()) // would be COMFORTABLE if reconciled
    expect(result.capacityBand).toBe('STRESSED')
    expect(result.sustainableSurplus).toBe(10000) // the theoretical surplus is still reported
  })

  it('v3.0 §5.2 R013: never upgrades a genuinely negative surplus — stays DISTRESSED even when FCF is unreconciled', () => {
    const result = calculateCapacity(30000, 20000, 15000, false, config())
    expect(result.capacityBand).toBe('DISTRESSED')
  })

  it('reports UNKNOWN when fcf_reconciled itself is not knowable (e.g. a legacy pre-v3.0 Master Profile row)', () => {
    const result = calculateCapacity(50000, 25000, 15000, null, config())
    expect(result.capacityBand).toBe('UNKNOWN')
  })
})

describe('applyEventDrivenCapacityDowngrade', () => {
  it('downgrades exactly one level for a downward income transition', () => {
    expect(applyEventDrivenCapacityDowngrade('COMFORTABLE', true, false)).toBe('TIGHT')
    expect(applyEventDrivenCapacityDowngrade('TIGHT', true, false)).toBe('STRESSED')
  })

  it('downgrades exactly one level for a chronic medical shock', () => {
    expect(applyEventDrivenCapacityDowngrade('COMFORTABLE', false, true)).toBe('TIGHT')
  })

  it('stacks both downgrades when both conditions apply', () => {
    expect(applyEventDrivenCapacityDowngrade('COMFORTABLE', true, true)).toBe('STRESSED')
  })

  it('never downgrades below DISTRESSED', () => {
    expect(applyEventDrivenCapacityDowngrade('DISTRESSED', true, true)).toBe('DISTRESSED')
  })

  it('never touches an UNKNOWN band', () => {
    expect(applyEventDrivenCapacityDowngrade('UNKNOWN', true, true)).toBe('UNKNOWN')
  })

  it('leaves the band unchanged when neither condition applies', () => {
    expect(applyEventDrivenCapacityDowngrade('COMFORTABLE', false, false)).toBe('COMFORTABLE')
  })
})

describe('calculateStabilisationCoverage', () => {
  it('reports NOT_APPLICABLE when no approved support amount exists (no BBS Plan Engine yet)', () => {
    const result = calculateStabilisationCoverage(20000, null, config())
    expect(result.availability).toBe('NOT_APPLICABLE')
    expect(result.coverage).toBeNull()
  })

  it('reports STRONG at exactly the 1.25 boundary', () => {
    const result = calculateStabilisationCoverage(5000, 12000, config()) // (5000*3)/12000 = 1.25
    expect(result.coverage).toBeCloseTo(1.25)
    expect(result.band).toBe('STRONG')
  })

  it('reports CCR_REVIEW at exactly 1.00', () => {
    const result = calculateStabilisationCoverage(5000, 15000, config()) // (5000*3)/15000 = 1.0
    expect(result.coverage).toBeCloseTo(1.0)
    expect(result.band).toBe('CCR_REVIEW')
  })

  it('reports NOT_ELIGIBLE_STANDARD_OFFER below 1.00', () => {
    const result = calculateStabilisationCoverage(1000, 15000, config())
    expect(result.band).toBe('NOT_ELIGIBLE_STANDARD_OFFER')
  })
})
