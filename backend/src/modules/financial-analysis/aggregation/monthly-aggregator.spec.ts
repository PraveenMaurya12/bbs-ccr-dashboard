import { aggregateMonthly } from './monthly-aggregator'
import { testConfig, txn } from '../classification/test-helpers'

function d(month: number, day: number): Date {
  return new Date(Date.UTC(2026, month, day))
}

describe('aggregateMonthly', () => {
  it('returns one row per calendar month present, sorted chronologically', () => {
    const transactions = [
      txn({ transactionDate: d(1, 5), category: 'INCOME', amount: 10000 }),
      txn({ transactionDate: d(0, 5), category: 'INCOME', amount: 9000 }),
    ]
    const result = aggregateMonthly(transactions, testConfig())
    expect(result).toHaveLength(2)
    expect(result[0].periodMonth).toEqual(new Date(Date.UTC(2026, 0, 1)))
    expect(result[1].periodMonth).toEqual(new Date(Date.UTC(2026, 1, 1)))
  })

  it('never counts self-transfers or loan proceeds as normalized income (D03, D04)', () => {
    const transactions = [
      txn({ transactionDate: d(0, 1), category: 'INCOME', subcategory: 'Salary', amount: 50000, direction: 'CREDIT' }),
      txn({ transactionDate: d(0, 2), category: 'TRANSFERS', subcategory: 'Self transfer', amount: 20000, direction: 'CREDIT' }),
      txn({ transactionDate: d(0, 3), category: 'BORROWING', subcategory: 'Personal loan', amount: 100000, direction: 'CREDIT' }),
    ]
    const [month] = aggregateMonthly(transactions, testConfig())
    expect(month.normalizedIncome).toBe(50000)
    expect(month.totalInflow).toBe(170000)
    expect(month.loanInflows).toBe(100000)
  })

  it('excludes credit-card payments from mandatoryDebtPayments (D05 / F17 double-count prevention)', () => {
    const transactions = [
      txn({ transactionDate: d(0, 1), category: 'EXPENSE', subcategory: 'EMI', amount: 15000, direction: 'DEBIT' }),
      txn({ transactionDate: d(0, 2), category: 'EXPENSE', subcategory: 'Credit-card payment', amount: 8000, direction: 'DEBIT' }),
    ]
    const [month] = aggregateMonthly(transactions, testConfig())
    expect(month.mandatoryDebtPayments).toBe(15000)
    expect(month.creditCardPayments).toBe(8000)
  })

  it('never converts a month with no reported balance into a fabricated 0 — stays null throughout', () => {
    const transactions = [txn({ transactionDate: d(0, 1), balance: null })]
    const [month] = aggregateMonthly(transactions, testConfig())
    expect(month.closingBalance).toBeNull()
    expect(month.minBalance).toBeNull()
    expect(month.lowBalanceDays).toBeNull()
    expect(month.hadNegativeBalance).toBeNull()
  })

  it('computes minBalance/closingBalance/lowBalanceDays/hadNegativeBalance from real reported balances', () => {
    const transactions = [
      txn({ transactionDate: d(0, 1), balance: 500, direction: 'DEBIT' }),
      txn({ transactionDate: d(0, 15), balance: -200, direction: 'DEBIT' }),
      txn({ transactionDate: d(0, 28), balance: 20000, direction: 'CREDIT' }),
    ]
    const config = testConfig({ lowBalanceThresholdRupees: 1000 })
    const [month] = aggregateMonthly(transactions, config)
    expect(month.minBalance).toBe(-200)
    expect(month.closingBalance).toBe(20000)
    expect(month.lowBalanceDays).toBe(2) // the 500 and -200 balance days are both below the 1000 threshold
    expect(month.hadNegativeBalance).toBe(true)
  })

  it('flags an exceptional month from a detected loan inflow, and never lets it skew normalizedIncome', () => {
    const transactions = [
      txn({ transactionDate: d(0, 1), category: 'BORROWING', subcategory: 'Personal loan', amount: 200000, direction: 'CREDIT' }),
    ]
    const [month] = aggregateMonthly(transactions, testConfig())
    expect(month.isExceptionalMonth).toBe(true)
    expect(month.exceptionalMonthReason).toContain('loan')
    expect(month.normalizedIncome).toBe(0)
  })

  it('flags a month whose inflow is a large multiple of the trailing median as exceptional', () => {
    const transactions = [
      txn({ transactionDate: d(0, 1), category: 'INCOME', amount: 50000, direction: 'CREDIT' }),
      txn({ transactionDate: d(1, 1), category: 'INCOME', amount: 50000, direction: 'CREDIT' }),
      txn({ transactionDate: d(2, 1), category: 'INCOME', amount: 50000, direction: 'CREDIT' }),
      // A one-off much larger inflow in month 4.
      txn({ transactionDate: d(3, 1), category: 'OTHER', subcategory: 'Asset sale', amount: 400000, direction: 'CREDIT' }),
    ]
    // Pin the large-transaction threshold well above every amount used here, so this test
    // isolates the median-inflow exceptional-month path from the separate large-transaction one.
    const result = aggregateMonthly(
      transactions,
      testConfig({ exceptionalMonthInflowMultiplier: 1.5, largeTransactionMinimumRupees: 10_000_000, largeTransactionIncomeMultiplier: 1000 }),
    )
    expect(result[3].isExceptionalMonth).toBe(true)
    expect(result[0].isExceptionalMonth).toBe(false)
  })
})
