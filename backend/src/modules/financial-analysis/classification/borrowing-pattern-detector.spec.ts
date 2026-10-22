import { detectBorrowingDependencyPattern } from './borrowing-pattern-detector'
import { testConfig, txn } from './test-helpers'

describe('detectBorrowingDependencyPattern', () => {
  it('detects loan credit -> large subsequent spending -> low balance as a pattern (investigation signal only)', () => {
    const result = detectBorrowingDependencyPattern(
      [
        txn({ category: 'BORROWING', direction: 'CREDIT', amount: 100000, transactionDate: new Date(Date.UTC(2026, 0, 1)) }),
        txn({ direction: 'DEBIT', amount: 60000, transactionDate: new Date(Date.UTC(2026, 0, 3)), balance: 40000 }),
        txn({ direction: 'DEBIT', amount: 38000, transactionDate: new Date(Date.UTC(2026, 0, 20)), balance: 500 }),
      ],
      testConfig({ lowBalanceThresholdRupees: 1000 }),
    )
    expect(result).toBe(true)
  })

  it('does not detect the pattern when spending after the loan stays well below half its value', () => {
    const result = detectBorrowingDependencyPattern(
      [
        txn({ category: 'BORROWING', direction: 'CREDIT', amount: 100000, transactionDate: new Date(Date.UTC(2026, 0, 1)) }),
        txn({ direction: 'DEBIT', amount: 5000, transactionDate: new Date(Date.UTC(2026, 0, 3)), balance: 95000 }),
      ],
      testConfig(),
    )
    expect(result).toBe(false)
  })

  it('does not detect the pattern when spending is high but balance never drops low afterward', () => {
    const result = detectBorrowingDependencyPattern(
      [
        txn({ category: 'BORROWING', direction: 'CREDIT', amount: 100000, transactionDate: new Date(Date.UTC(2026, 0, 1)) }),
        txn({ direction: 'DEBIT', amount: 70000, transactionDate: new Date(Date.UTC(2026, 0, 3)), balance: 30000 }),
      ],
      testConfig({ lowBalanceThresholdRupees: 1000 }),
    )
    expect(result).toBe(false)
  })

  it('returns false (never fabricates a pattern) when there are no loan inflows at all', () => {
    expect(detectBorrowingDependencyPattern([txn({ category: 'EXPENSE', direction: 'DEBIT' })], testConfig())).toBe(false)
  })
})
