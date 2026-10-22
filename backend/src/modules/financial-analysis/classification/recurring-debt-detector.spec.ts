import { detectRecurringDebtPayments } from './recurring-debt-detector'
import { testConfig, txn } from './test-helpers'

function debtTxn(overrides: Parameters<typeof txn>[0] = {}) {
  return txn({ direction: 'DEBIT', category: 'EXPENSE', subcategory: 'EMI', ...overrides })
}

describe('detectRecurringDebtPayments', () => {
  it('never infers an EMI from a single transaction (D09) — 1 month does not qualify', () => {
    const result = detectRecurringDebtPayments(
      [debtTxn({ narration: 'HDFC EMI AUTO DEBIT', amount: 15000, transactionDate: new Date(Date.UTC(2026, 0, 5)) })],
      testConfig(),
    )
    expect(result.payments).toHaveLength(0)
  })

  it('qualifies at the configured 2-month floor with a tight ±5% amount and day-of-month cadence', () => {
    const result = detectRecurringDebtPayments(
      [
        debtTxn({ narration: 'HDFC EMI AUTO DEBIT', amount: 15000, transactionDate: new Date(Date.UTC(2026, 0, 5)) }),
        debtTxn({ narration: 'HDFC EMI AUTO DEBIT', amount: 15000, transactionDate: new Date(Date.UTC(2026, 1, 5)) }),
      ],
      testConfig(),
    )
    expect(result.payments).toHaveLength(1)
    expect(result.payments[0]).toMatchObject({ monthsPresent: 2, evidenceLevel: 'DERIVED' })
    expect(result.payments[0].lender).toBeTruthy()
  })

  it('rejects a cluster whose day-of-month spread is too wide to be a real mechanical auto-debit', () => {
    const result = detectRecurringDebtPayments(
      [
        debtTxn({ narration: 'HDFC EMI AUTO DEBIT', amount: 15000, transactionDate: new Date(Date.UTC(2026, 0, 2)) }),
        debtTxn({ narration: 'HDFC EMI AUTO DEBIT', amount: 15000, transactionDate: new Date(Date.UTC(2026, 1, 25)) }),
      ],
      testConfig(),
    )
    expect(result.payments).toHaveLength(0)
  })

  it('marks a purely pattern-discovered debt payment (previously UNCLASSIFIED) as INFERRED', () => {
    const result = detectRecurringDebtPayments(
      [
        txn({ narration: 'NACH BAJAJFIN LTD', direction: 'DEBIT', category: 'UNCLASSIFIED', amount: 8000, transactionDate: new Date(Date.UTC(2026, 0, 10)) }),
        txn({ narration: 'NACH BAJAJFIN LTD', direction: 'DEBIT', category: 'UNCLASSIFIED', amount: 8000, transactionDate: new Date(Date.UTC(2026, 1, 10)) }),
      ],
      testConfig(),
    )
    expect(result.payments[0].evidenceLevel).toBe('INFERRED')
    expect(result.transactions.every((t) => t.category === 'EXPENSE')).toBe(true)
  })

  it('ignores a one-off discretionary/essential expense entirely (not a debt-payment candidate)', () => {
    const result = detectRecurringDebtPayments(
      [
        txn({ narration: 'SWIGGY ORDER', direction: 'DEBIT', category: 'EXPENSE', subcategory: 'Restaurant', amount: 500, transactionDate: new Date(Date.UTC(2026, 0, 10)) }),
        txn({ narration: 'SWIGGY ORDER', direction: 'DEBIT', category: 'EXPENSE', subcategory: 'Restaurant', amount: 500, transactionDate: new Date(Date.UTC(2026, 1, 10)) }),
      ],
      testConfig(),
    )
    expect(result.payments).toHaveLength(0)
  })

  it("CRITICAL: detects a real ACH-DR auto-debit as recurring debt despite a different mandate reference every month", () => {
    const achDebit = (narration: string, month: number) =>
      txn({
        narration,
        direction: 'DEBIT',
        category: 'UNCLASSIFIED',
        amount: 6209,
        transactionDate: new Date(Date.UTC(2026, month, 5)),
        narrationDetail: { referenceNumber: 'mandate-ref', counterpartyRaw: 'INCRED FINANCIAL SER', purpose: null, counterpartyBank: null },
      })
    const result = detectRecurringDebtPayments(
      [
        achDebit('ACH-DR-INCRED FINANCIAL SER-INCREDXOgEpcpjhlYacA-', 0),
        achDebit('ACH-DR-INCRED FINANCIAL SER-INCREDNdvRlK6BgyFp8N-', 1),
        achDebit('ACH-DR-INCRED FINANCIAL SER-INCREDf2CqUQjX4F3xA6-', 2),
      ],
      testConfig(),
    )
    expect(result.payments).toHaveLength(1)
    expect(result.payments[0].monthsPresent).toBe(3)
    expect(result.transactions.every((t) => t.category === 'EXPENSE')).toBe(true)
  })
})
