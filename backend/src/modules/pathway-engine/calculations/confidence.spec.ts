import { applyDqBandCap, computeMethodAConfidence, resolvePathwayConfidence } from './confidence'
import { cleanPathwayInput, testConfig } from './test-helpers'

describe('computeMethodAConfidence (§4.2 Method A — MIN of 4 dimensions)', () => {
  it('returns the minimum across all 4 inputs (2 L3 dimensions + L4 confidence used twice)', () => {
    expect(computeMethodAConfidence('HIGH', 'HIGH', 'MEDIUM')).toBe('MEDIUM')
    expect(computeMethodAConfidence('HIGH', 'LOW', 'HIGH')).toBe('LOW')
    expect(computeMethodAConfidence('HIGH', 'HIGH', 'HIGH')).toBe('HIGH')
  })
  it('returns UNRESOLVED when any input is missing', () => {
    expect(computeMethodAConfidence(null, 'HIGH', 'HIGH')).toBe('UNRESOLVED')
    expect(computeMethodAConfidence('HIGH', 'HIGH', null)).toBe('UNRESOLVED')
  })
})

describe('applyDqBandCap (§4.3 — pathway confidence cannot exceed the L3 DQ band ceiling)', () => {
  const config = testConfig()
  it('caps HIGH confidence down to MEDIUM under a MODERATE DQ band', () => {
    expect(applyDqBandCap('HIGH', 'MODERATE', config)).toBe('MEDIUM')
  })
  it('caps down to LOW under a LOW_MODERATE or LOW DQ band', () => {
    expect(applyDqBandCap('HIGH', 'LOW_MODERATE', config)).toBe('LOW')
    expect(applyDqBandCap('MEDIUM', 'LOW', config)).toBe('LOW')
  })
  it('never raises a confidence already below the cap', () => {
    expect(applyDqBandCap('LOW', 'HIGH', config)).toBe('LOW')
  })
  it('passes through unchanged when DQ band is unavailable', () => {
    expect(applyDqBandCap('HIGH', null, config)).toBe('HIGH')
  })
})

describe('resolvePathwayConfidence (Method A + DQ-band cap combined)', () => {
  it('always uses MIN_OF_DIMENSIONS (Method B is PROPOSED, never computed)', () => {
    const { confidenceMethod } = resolvePathwayConfidence(cleanPathwayInput(), testConfig())
    expect(confidenceMethod).toBe('MIN_OF_DIMENSIONS')
  })
  it('a clean HIGH/HIGH/HIGH/HIGH-DQ lead resolves to HIGH', () => {
    const { confidence } = resolvePathwayConfidence(cleanPathwayInput({ l3: { incomeCashFlowConfidence: 'HIGH', alignmentCapacityConfidence: 'HIGH', dataQualityBand: 'HIGH' }, l4: { confidence: 'HIGH' } }), testConfig())
    expect(confidence).toBe('HIGH')
  })
})
