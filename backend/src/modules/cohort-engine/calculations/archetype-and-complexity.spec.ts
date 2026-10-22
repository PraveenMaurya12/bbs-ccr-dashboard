import { debtComplexityBand, deriveArchetype } from './archetype-and-complexity'

describe('debtComplexityBand', () => {
  it('reports LOW for a single lender, low debt, single product', () => {
    expect(debtComplexityBand(1, 'LOW', 1)).toBe('LOW')
  })

  it('reports VERY_HIGH for many lenders, very high debt, diverse products', () => {
    expect(debtComplexityBand(8, 'VERY_HIGH', 4)).toBe('VERY_HIGH')
  })

  it('never crashes on an UNKNOWN totalDebtBand or null productTypesCount', () => {
    expect(() => debtComplexityBand(3, 'UNKNOWN', null)).not.toThrow()
  })
})

describe('deriveArchetype', () => {
  it('v3.0 §5.5: labels DEBT_SPIRAL whenever a debt-cycle signal is present, regardless of other conditions', () => {
    expect(deriveArchetype(true, false, false)).toBe('DEBT_SPIRAL')
    expect(deriveArchetype(true, true, true)).toBe('DEBT_SPIRAL')
  })

  it('v3.0 §5.5: labels CIRCUMSTANTIAL for an adverse circumstance with no debt-cycle signal', () => {
    expect(deriveArchetype(false, true, false)).toBe('CIRCUMSTANTIAL')
  })

  it('v3.0 §5.5: Debt Spiral takes precedence over Circumstantial when both conditions are true', () => {
    expect(deriveArchetype(true, true, false)).toBe('DEBT_SPIRAL')
  })

  it('v3.0 §5.5: labels HABITUAL_AVOIDER for an escalating DPD trend with no debt-cycle signal and no adverse circumstance — now genuinely derivable, unlike the v2.0-era proxy this replaces', () => {
    expect(deriveArchetype(false, false, true)).toBe('HABITUAL_AVOIDER')
  })

  it('defaults to UNCLASSIFIED when no clean pattern match exists', () => {
    expect(deriveArchetype(false, false, false)).toBe('UNCLASSIFIED')
  })
})
