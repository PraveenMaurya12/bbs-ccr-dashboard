import { detectLargeTransactions } from './large-transaction-detector'
import { testConfig, txn } from './test-helpers'

describe('detectLargeTransactions', () => {
  it('flags a transaction exceeding the configured minimum when no income baseline exists', () => {
    const result = detectLargeTransactions([txn({ amount: 30000 }), txn({ amount: 1000 })], testConfig({ largeTransactionMinimumRupees: 25000 }))
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(30000)
    expect(result[0].whyItMatters).toContain('configured minimum')
  })

  it('uses the income-based threshold when it exceeds the configured minimum', () => {
    const transactions = [
      txn({ amount: 200000, category: 'INCOME', subcategory: 'Salary', transactionDate: new Date(Date.UTC(2026, 0, 1)) }),
      txn({ amount: 200000, category: 'INCOME', subcategory: 'Salary', transactionDate: new Date(Date.UTC(2026, 1, 1)) }),
      // 0.5 x 200000 = 100000, well above the 25000 minimum.
      txn({ amount: 120000, category: 'EXPENSE', subcategory: 'Shopping', transactionDate: new Date(Date.UTC(2026, 2, 1)) }),
    ]
    const result = detectLargeTransactions(transactions, testConfig({ largeTransactionMinimumRupees: 25000, largeTransactionIncomeMultiplier: 0.5 }))
    expect(result.some((r) => r.amount === 120000)).toBe(true)
    expect(result.find((r) => r.amount === 120000)?.whyItMatters).toContain('median monthly income')
  })

  it('does not flag a transaction below both thresholds', () => {
    const result = detectLargeTransactions([txn({ amount: 5000 })], testConfig({ largeTransactionMinimumRupees: 25000 }))
    expect(result).toHaveLength(0)
  })

  it('sorts flagged transactions descending by amount', () => {
    const result = detectLargeTransactions(
      [txn({ amount: 30000 }), txn({ amount: 90000 })],
      testConfig({ largeTransactionMinimumRupees: 25000 }),
    )
    expect(result.map((r) => r.amount)).toEqual([90000, 30000])
  })
})
