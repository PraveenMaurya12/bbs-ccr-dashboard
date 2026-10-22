import { detectBounceEvidence, summarizeBounces } from './bounce-detector'
import { txn } from './test-helpers'

describe('detectBounceEvidence', () => {
  it('tags an explicit return narration as CONFIRMED_BOUNCE', () => {
    const [result] = detectBounceEvidence([txn({ narration: 'ECS RETURN CHARGES INSUFFICIENT FUNDS' })])
    // Even though the narration also contains "CHARGES", an explicit
    // "RETURN" evidence narration must win over the fee-only pattern.
    expect(result.bounceEvidence).toBe('CONFIRMED_BOUNCE')
  })

  it('CRITICAL: a fee-only narration never gets promoted to CONFIRMED_BOUNCE (D06)', () => {
    const [result] = detectBounceEvidence([txn({ narration: 'ECS CHARGES DEBITED' })])
    expect(result.bounceEvidence).toBe('POSSIBLE_BOUNCE')
    expect(result.bounceEvidence).not.toBe('CONFIRMED_BOUNCE')
  })

  it('tags a generic reversal with no further evidence as UNKNOWN — never inferred as a bounce', () => {
    const [result] = detectBounceEvidence([txn({ narration: 'TRANSACTION REVERSAL' })])
    expect(result.bounceEvidence).toBe('UNKNOWN')
  })

  it('leaves an ordinary unrelated transaction with no bounce evidence at all (null, not UNKNOWN)', () => {
    const [result] = detectBounceEvidence([txn({ narration: 'SALARY CREDIT ABC CORP' })])
    expect(result.bounceEvidence).toBeNull()
  })
})

describe('summarizeBounces', () => {
  it('counts confirmed bounces within 30/90/180-day windows relative to the reference date', () => {
    const referenceDate = new Date(Date.UTC(2026, 5, 1))
    const transactions = detectBounceEvidence([
      txn({ narration: 'NACH RETURN', transactionDate: new Date(Date.UTC(2026, 4, 20)) }), // 12 days ago
      txn({ narration: 'CHEQUE RETURN', transactionDate: new Date(Date.UTC(2026, 2, 1)) }), // ~92 days ago
      txn({ narration: 'ECS CHARGES', transactionDate: new Date(Date.UTC(2026, 4, 20)) }),
    ])
    const summary = summarizeBounces(transactions, referenceDate)
    expect(summary.confirmedCount).toBe(2)
    expect(summary.possibleCount).toBe(1)
    expect(summary.confirmedLast30Days).toBe(1)
    expect(summary.confirmedLast90Days).toBe(1)
    expect(summary.confirmedLast180Days).toBe(2)
  })

  it('never treats one isolated POSSIBLE_BOUNCE as a confirmed/recurring signal', () => {
    const transactions = detectBounceEvidence([txn({ narration: 'RETURN CHARGES' })])
    const summary = summarizeBounces(transactions, new Date())
    expect(summary.confirmedCount).toBe(0)
    expect(summary.possibleCount).toBe(1)
  })
})
