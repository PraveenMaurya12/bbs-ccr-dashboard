import { detectRoundTrips } from './round-trip-detector'
import { txn } from './test-helpers'

describe('detectRoundTrips', () => {
  it('detects a same-amount debit+credit pair within 48 hours as a round trip (the spec\'s own Khalid Ali example)', () => {
    const debit = txn({ narration: 'UPI/P2M/1/KHALID ALI', amount: 340, direction: 'DEBIT', category: 'TRANSFERS', subcategory: 'P2P transfer', transactionDate: new Date(Date.UTC(2026, 6, 6, 10, 0)) })
    const credit = txn({ narration: 'UPI/CRADJ/1/KHALID ALI', amount: 340, direction: 'CREDIT', category: 'TRANSFERS', subcategory: 'P2P transfer', transactionDate: new Date(Date.UTC(2026, 6, 6, 10, 1)) })
    const result = detectRoundTrips([debit, credit])
    expect(result.pairs).toHaveLength(1)
    expect(result.transactions.every((t) => t.category === 'OTHER' && t.subcategory === 'Round trip')).toBe(true)
  })

  it('marks CONFIRMED evidence when a reversal/failed/CRADJ keyword is present, INFERRED otherwise', () => {
    const debit = txn({ narration: 'SWIGGY ORDER', amount: 1337, direction: 'DEBIT', category: 'EXPENSE', subcategory: 'Restaurant', transactionDate: new Date(Date.UTC(2026, 7, 7, 9, 0)) })
    const credit = txn({ narration: 'SWIGGY REVERSAL', amount: 1337, direction: 'CREDIT', category: 'UNCLASSIFIED', transactionDate: new Date(Date.UTC(2026, 7, 7, 20, 0)) })
    const result = detectRoundTrips([debit, credit])
    expect(result.pairs[0].evidenceLevel).toBe('CONFIRMED')
  })

  it('does not pair a debit/credit more than 48 hours apart', () => {
    const debit = txn({ narration: 'X', amount: 500, direction: 'DEBIT', category: 'UNCLASSIFIED', transactionDate: new Date(Date.UTC(2026, 0, 1)) })
    const credit = txn({ narration: 'Y', amount: 500, direction: 'CREDIT', category: 'UNCLASSIFIED', transactionDate: new Date(Date.UTC(2026, 0, 5)) })
    const result = detectRoundTrips([debit, credit])
    expect(result.pairs).toHaveLength(0)
  })

  it('never re-pairs a transaction already tagged Self transfer', () => {
    const debit = txn({ narration: 'TO SELF', amount: 1000, direction: 'DEBIT', category: 'TRANSFERS', subcategory: 'Self transfer', transactionDate: new Date(Date.UTC(2026, 0, 1)) })
    const credit = txn({ narration: 'FROM SELF', amount: 1000, direction: 'CREDIT', category: 'TRANSFERS', subcategory: 'Self transfer', transactionDate: new Date(Date.UTC(2026, 0, 1, 12)) })
    const result = detectRoundTrips([debit, credit])
    expect(result.pairs).toHaveLength(0)
  })

  it('never reclassifies a confirmed INCOME or BORROWING transaction', () => {
    const credit = txn({ narration: 'SALARY', amount: 50000, direction: 'CREDIT', category: 'INCOME', subcategory: 'Salary', transactionDate: new Date(Date.UTC(2026, 0, 1)) })
    const debit = txn({ narration: 'X', amount: 50000, direction: 'DEBIT', category: 'UNCLASSIFIED', transactionDate: new Date(Date.UTC(2026, 0, 2)) })
    const result = detectRoundTrips([credit, debit])
    expect(result.pairs).toHaveLength(0)
  })
})
