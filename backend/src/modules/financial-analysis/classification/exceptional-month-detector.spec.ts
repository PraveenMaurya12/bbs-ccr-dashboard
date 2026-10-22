import { isExceptionalMonth } from './exceptional-month-detector'

describe('isExceptionalMonth', () => {
  it('flags a month whose inflow exceeds the configured multiplier of the trailing median', () => {
    const result = isExceptionalMonth(160000, 100000, false, false, 1.5)
    expect(result.isExceptional).toBe(true)
    expect(result.reason).toContain('trailing median')
  })

  it('does not flag a month at or below the multiplier', () => {
    expect(isExceptionalMonth(150000, 100000, false, false, 1.5).isExceptional).toBe(false)
    expect(isExceptionalMonth(90000, 100000, false, false, 1.5).isExceptional).toBe(false)
  })

  it('flags any month with a detected loan inflow, regardless of the inflow multiplier', () => {
    const result = isExceptionalMonth(50000, 100000, true, false, 1.5)
    expect(result.isExceptional).toBe(true)
    expect(result.reason).toContain('loan')
  })

  it('flags any month with a large one-time transaction', () => {
    const result = isExceptionalMonth(50000, 100000, false, true, 1.5)
    expect(result.isExceptional).toBe(true)
  })

  it('never fabricates an exceptional flag when no trailing median is available yet (e.g. the first month)', () => {
    expect(isExceptionalMonth(500000, null, false, false, 1.5).isExceptional).toBe(false)
  })
})
