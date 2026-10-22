import { detectDateAlignment } from './date-alignment'

describe('detectDateAlignment', () => {
  it('reports aligned when the bank statement period ends close to the credit report date', () => {
    const result = detectDateAlignment(new Date('2026-09-30'), new Date('2025-04-01'), new Date('2026-09-15'))
    expect(result.aligned).toBe(true)
    expect(result.warning).toBeNull()
  })

  it('CRITICAL: flags a materially stale bank statement period rather than silently treating it as current', () => {
    const result = detectDateAlignment(new Date('2026-09-30'), new Date('2025-04-01'), new Date('2026-03-31'))
    expect(result.aligned).toBe(false)
    expect(result.warning).toContain('not aligned')
  })

  it('reports all three dates verbatim for display', () => {
    const result = detectDateAlignment(new Date('2026-09-30'), new Date('2025-04-01'), new Date('2026-03-31'))
    expect(result.creditReportDate).toBe(new Date('2026-09-30').toISOString())
    expect(result.bankStatementPeriodStart).toBe(new Date('2025-04-01').toISOString())
    expect(result.bankStatementPeriodEnd).toBe(new Date('2026-03-31').toISOString())
  })

  it('reports aligned with null dates when the bank statement period end is unknown', () => {
    const result = detectDateAlignment(new Date('2026-09-30'), null, null)
    expect(result.aligned).toBe(true)
    expect(result.bankStatementPeriodEnd).toBeNull()
  })
})
