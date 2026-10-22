import { detectSelfTransfer } from './self-transfer-detector'
import { txn } from './test-helpers'

describe('detectSelfTransfer', () => {
  it('marks an explicit "self"/"own a/c" narration as CONFIRMED self transfer', () => {
    const [result] = detectSelfTransfer([txn({ narration: 'TRANSFER TO OWN A/C 1234', category: 'UNCLASSIFIED' })])
    expect(result).toMatchObject({ category: 'TRANSFERS', subcategory: 'Self transfer', evidenceLevel: 'CONFIRMED' })
  })

  it('matches the account holder\'s own name when provided, as a CONFIRMED signal', () => {
    const [result] = detectSelfTransfer(
      [txn({ narration: 'NEFT TO RAVI KUMAR SHARMA SAVINGS', category: 'UNCLASSIFIED' })],
      'Ravi Kumar',
    )
    expect(result).toMatchObject({ subcategory: 'Self transfer', evidenceLevel: 'CONFIRMED' })
  })

  it('never force-labels absent any evidence (D03) — an ordinary unrelated transfer stays as-is', () => {
    const [result] = detectSelfTransfer([txn({ narration: 'NEFT TO VENDOR XYZ', category: 'UNCLASSIFIED' })])
    expect(result.subcategory).not.toBe('Self transfer')
  })

  it('never overrides an already-confident classification (EMI/Salary/BNPL) even if a loose pattern would otherwise match', () => {
    const [result] = detectSelfTransfer([
      txn({ narration: 'SELF EMPLOYED BUSINESS SALARY CREDIT', category: 'INCOME', subcategory: 'Salary', direction: 'CREDIT' }),
    ])
    expect(result.category).toBe('INCOME')
    expect(result.subcategory).toBe('Salary')
  })

  it('detects a same-amount debit/credit pair within 3 days as an INFERRED (not CONFIRMED) self-transfer secondary signal', () => {
    const results = detectSelfTransfer([
      txn({ narration: 'NEFT OUT TO OTHER BANK', category: 'UNCLASSIFIED', direction: 'DEBIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 1)) }),
      txn({ narration: 'NEFT IN FROM OTHER BANK', category: 'UNCLASSIFIED', direction: 'CREDIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 2)) }),
    ])
    expect(results.every((r) => r.subcategory === 'Self transfer' && r.evidenceLevel === 'INFERRED')).toBe(true)
  })

  it('does not pair a debit/credit more than 3 days apart or outside the amount tolerance', () => {
    const results = detectSelfTransfer([
      txn({ narration: 'NEFT OUT', category: 'UNCLASSIFIED', direction: 'DEBIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 1)) }),
      txn({ narration: 'NEFT IN', category: 'UNCLASSIFIED', direction: 'CREDIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 10)) }),
    ])
    expect(results.every((r) => r.subcategory !== 'Self transfer')).toBe(true)
  })

  it('exact match: an exact same-amount, same-day pair is matched', () => {
    const results = detectSelfTransfer([
      txn({ narration: 'NEFT OUT', category: 'UNCLASSIFIED', direction: 'DEBIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 1)), sourceRowRef: 1 }),
      txn({ narration: 'NEFT IN', category: 'UNCLASSIFIED', direction: 'CREDIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 1)), sourceRowRef: 2 }),
    ])
    expect(results.every((r) => r.subcategory === 'Self transfer')).toBe(true)
  })

  it('CRITICAL: two possible matches — the closest amount wins, not the first one in array order', () => {
    const debit = txn({ narration: 'NEFT OUT', category: 'UNCLASSIFIED', direction: 'DEBIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 1)), sourceRowRef: 1 })
    // Listed FIRST but a worse (further) amount match than the second credit.
    const worseCredit = txn({ narration: 'NEFT IN A', category: 'UNCLASSIFIED', direction: 'CREDIT', amount: 20150, transactionDate: new Date(Date.UTC(2026, 3, 1)), sourceRowRef: 2 })
    const betterCredit = txn({ narration: 'NEFT IN B', category: 'UNCLASSIFIED', direction: 'CREDIT', amount: 20010, transactionDate: new Date(Date.UTC(2026, 3, 1)), sourceRowRef: 3 })
    const results = detectSelfTransfer([debit, worseCredit, betterCredit])

    const resultByRef = new Map(results.map((r) => [r.sourceRowRef, r]))
    expect(resultByRef.get(1)!.subcategory).toBe('Self transfer')
    expect(resultByRef.get(3)!.subcategory).toBe('Self transfer') // betterCredit (closest amount) is matched
    expect(resultByRef.get(2)!.subcategory).not.toBe('Self transfer') // worseCredit is left unmatched
  })

  it('CRITICAL: same amount, different timestamps — the closest timestamp wins when amounts tie', () => {
    const debit = txn({ narration: 'NEFT OUT', category: 'UNCLASSIFIED', direction: 'DEBIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 2)), sourceRowRef: 1 })
    const fartherCredit = txn({ narration: 'NEFT IN A', category: 'UNCLASSIFIED', direction: 'CREDIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 1)), sourceRowRef: 2 })
    const closerCredit = txn({ narration: 'NEFT IN B', category: 'UNCLASSIFIED', direction: 'CREDIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 2)), sourceRowRef: 3 })
    const results = detectSelfTransfer([debit, fartherCredit, closerCredit])

    const resultByRef = new Map(results.map((r) => [r.sourceRowRef, r]))
    expect(resultByRef.get(3)!.subcategory).toBe('Self transfer') // closerCredit (same day) wins
    expect(resultByRef.get(2)!.subcategory).not.toBe('Self transfer')
  })

  it('no valid match: a lone debit with no eligible credit anywhere is left unmatched', () => {
    const results = detectSelfTransfer([txn({ narration: 'NEFT OUT', category: 'UNCLASSIFIED', direction: 'DEBIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 1)) })])
    expect(results.every((r) => r.subcategory !== 'Self transfer')).toBe(true)
  })

  it('multiple transactions on the same day: each debit pairs with its own best credit, never double-claiming one credit for two debits', () => {
    const debitA = txn({ narration: 'NEFT OUT A', category: 'UNCLASSIFIED', direction: 'DEBIT', amount: 10000, transactionDate: new Date(Date.UTC(2026, 3, 1)), sourceRowRef: 1 })
    const debitB = txn({ narration: 'NEFT OUT B', category: 'UNCLASSIFIED', direction: 'DEBIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 1)), sourceRowRef: 2 })
    const creditA = txn({ narration: 'NEFT IN A', category: 'UNCLASSIFIED', direction: 'CREDIT', amount: 10000, transactionDate: new Date(Date.UTC(2026, 3, 1)), sourceRowRef: 3 })
    const creditB = txn({ narration: 'NEFT IN B', category: 'UNCLASSIFIED', direction: 'CREDIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 1)), sourceRowRef: 4 })
    const results = detectSelfTransfer([debitA, debitB, creditA, creditB])
    expect(results.every((r) => r.subcategory === 'Self transfer')).toBe(true)
  })

  it('never promotes an uncertain pair-matched transfer to a higher evidence tier (CONFIRMED) — stays INFERRED even with the improved matching', () => {
    const results = detectSelfTransfer([
      txn({ narration: 'NEFT OUT', category: 'UNCLASSIFIED', direction: 'DEBIT', amount: 20000, transactionDate: new Date(Date.UTC(2026, 3, 1)) }),
      txn({ narration: 'NEFT IN', category: 'UNCLASSIFIED', direction: 'CREDIT', amount: 20010, transactionDate: new Date(Date.UTC(2026, 3, 1)) }),
    ])
    expect(results.every((r) => r.evidenceLevel === 'INFERRED')).toBe(true)
  })
})
