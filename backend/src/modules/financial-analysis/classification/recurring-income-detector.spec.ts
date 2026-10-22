import { detectRecurringIncome } from './recurring-income-detector'
import { testConfig, txn } from './test-helpers'
import type { CreditAccountCorrelationInput } from '../financial-analysis.types'

function monthlyDate(month: number): Date {
  return new Date(Date.UTC(2026, month, 1))
}

function creditAccount(overrides: Partial<CreditAccountCorrelationInput> = {}): CreditAccountCorrelationInput {
  return { lender: 'XYZ FINANCE', monthlyEmiAmount: 10000, lifecycleStatus: 'ACTIVE', openedOn: new Date(Date.UTC(2025, 6, 1)), ...overrides }
}

describe('detectRecurringIncome', () => {
  it('never infers recurring income from fewer than the configured minimum months (D08) — 2 months does not qualify', () => {
    const transactions = [
      txn({ narration: 'SALARY CREDIT ABC CORP REF001', amount: 50000, transactionDate: monthlyDate(0), category: 'INCOME', subcategory: 'Salary' }),
      txn({ narration: 'SALARY CREDIT ABC CORP REF002', amount: 50000, transactionDate: monthlyDate(1), category: 'INCOME', subcategory: 'Salary' }),
    ]
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(0)
  })

  // --- A: recurring salary -> income ---
  it('A: qualifies a 3-month clustered salary pattern and upgrades evidenceLevel to DERIVED when keyword-corroborated', () => {
    const transactions = [
      txn({ narration: 'SALARY CREDIT ABC CORP REF001', amount: 50000, transactionDate: monthlyDate(0), category: 'INCOME', subcategory: 'Salary' }),
      txn({ narration: 'SALARY CREDIT ABC CORP REF002', amount: 50000, transactionDate: monthlyDate(1), category: 'INCOME', subcategory: 'Salary' }),
      txn({ narration: 'SALARY CREDIT ABC CORP REF003', amount: 51000, transactionDate: monthlyDate(2), category: 'INCOME', subcategory: 'Salary' }),
    ]
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({ monthsPresent: 3, subcategory: 'Salary', evidenceLevel: 'DERIVED' })
    expect(result.transactions.every((t) => t.category === 'INCOME')).toBe(true)
  })

  // --- B: recurring loan -> borrowing (already pre-filtered before this detector ever runs) ---
  it('B: never reclassifies a loan disbursement, transfer, refund, or cash deposit as income, even if it recurs monthly (Rule 17)', () => {
    const transactions = ['BORROWING', 'TRANSFERS', 'CASH', 'OTHER'].flatMap((category) =>
      [0, 1, 2].map((m) =>
        txn({
          narration: `RECURRING NONINCOME ${category}`,
          amount: 20000,
          transactionDate: monthlyDate(m),
          category: category as 'BORROWING' | 'TRANSFERS' | 'CASH' | 'OTHER',
        }),
      ),
    )
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(0)
    expect(result.transactions.every((t) => t.category !== 'INCOME')).toBe(true)
  })

  // --- C: recurring bureau-correlated credit -> borrowing ---
  it('C: CRITICAL — a recurring credit with no income keyword, whose counterparty matches a real bureau-reported lender, is reclassified toward BORROWING, never income', () => {
    const transactions = [
      txn({ narration: 'NEFT CR XYZ FINANCE LTD 001', amount: 40000, transactionDate: monthlyDate(0), category: 'UNCLASSIFIED' }),
      txn({ narration: 'NEFT CR XYZ FINANCE LTD 002', amount: 40500, transactionDate: monthlyDate(1), category: 'UNCLASSIFIED' }),
      txn({ narration: 'NEFT CR XYZ FINANCE LTD 003', amount: 39500, transactionDate: monthlyDate(2), category: 'UNCLASSIFIED' }),
    ]
    const result = detectRecurringIncome(transactions, testConfig(), [creditAccount({ lender: 'XYZ FINANCE' })])
    expect(result.sources).toHaveLength(0)
    expect(result.transactions.every((t) => t.category === 'BORROWING')).toBe(true)
    expect(result.transactions.every((t) => t.category !== 'INCOME')).toBe(true)
  })

  // --- D: recurring unknown credit -> stays unknown/unclassified, never promoted to income ---
  it('D: CRITICAL — a purely pattern-based recurring credit with no income keyword and no bureau match is left UNCLASSIFIED, never promoted to income merely because it recurs', () => {
    const transactions = [
      txn({ narration: 'NEFT CR FROM XYZ ENTERPRISES 001', amount: 40000, transactionDate: monthlyDate(0), category: 'UNCLASSIFIED' }),
      txn({ narration: 'NEFT CR FROM XYZ ENTERPRISES 002', amount: 40500, transactionDate: monthlyDate(1), category: 'UNCLASSIFIED' }),
      txn({ narration: 'NEFT CR FROM XYZ ENTERPRISES 003', amount: 39500, transactionDate: monthlyDate(2), category: 'UNCLASSIFIED' }),
    ]
    const result = detectRecurringIncome(transactions, testConfig(), [])
    expect(result.sources).toHaveLength(0)
    expect(result.transactions.every((t) => t.category === 'UNCLASSIFIED')).toBe(true)
    expect(result.transactions.every((t) => t.category !== 'INCOME')).toBe(true)
  })

  // --- E: recurring refund -> not income (OTHER is a NEVER_INCOME_CATEGORIES member, pre-filtered) ---
  it('E: a recurring refund is never promoted to income', () => {
    const transactions = [0, 1, 2].map((m) => txn({ narration: 'REFUND ORDER 123', amount: 2000, transactionDate: monthlyDate(m), category: 'OTHER', subcategory: 'Refund' }))
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(0)
    expect(result.transactions.every((t) => t.category !== 'INCOME')).toBe(true)
  })

  // --- F: self-transfer -> not income (TRANSFERS is a NEVER_INCOME_CATEGORIES member, pre-filtered) ---
  it('F: a recurring self-transfer is never promoted to income', () => {
    const transactions = [0, 1, 2].map((m) => txn({ narration: 'OWN ACCOUNT TRANSFER', amount: 15000, transactionDate: monthlyDate(m), category: 'TRANSFERS', subcategory: 'Self transfer' }))
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(0)
    expect(result.transactions.every((t) => t.category !== 'INCOME')).toBe(true)
  })

  // --- G: investment redemption -> not recurring income (OTHER is pre-filtered) ---
  it('G: a recurring investment redemption is never promoted to income', () => {
    const transactions = [0, 1, 2].map((m) => txn({ narration: 'MF REDEMPTION PAYOUT', amount: 30000, transactionDate: monthlyDate(m), category: 'OTHER', subcategory: 'Investment redemption' }))
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(0)
    expect(result.transactions.every((t) => t.category !== 'INCOME')).toBe(true)
  })

  // --- Month-name fingerprint regression: the exact real-customer scenario ---
  it('REGRESSION: "Salary for the Month of Nov/Dec/Jan/Feb" (real narration pattern) clusters into ONE recurring income source, not four', () => {
    const transactions = [
      txn({
        narration: 'NEFT/AUBLH0000000/GOLDEN LEGAND LEASING AND FI/AU SMALL FINANCE BAN/Salary for the Month of Nov 2025',
        amount: 110613,
        transactionDate: new Date(Date.UTC(2025, 10, 8)),
        category: 'INCOME',
        subcategory: 'Salary',
      }),
      txn({
        narration: 'NEFT/AUBLH0000001/GOLDEN LEGAND LEASING AND FI/AU SMALL FINANCE BAN/Salary for the Month of Dec 2025',
        amount: 110613,
        transactionDate: new Date(Date.UTC(2026, 0, 7)),
        category: 'INCOME',
        subcategory: 'Salary',
      }),
      txn({
        narration: 'NEFT/AUBLH0000002/GOLDEN LEGAND LEASING AND FI/AU SMALL FINANCE BAN/Salary for the Month of Jan 2026',
        amount: 110613,
        transactionDate: new Date(Date.UTC(2026, 1, 3)),
        category: 'INCOME',
        subcategory: 'Salary',
      }),
      txn({
        narration: 'NEFT/AUBLH0000003/GOLDEN LEGAND LEASING AND FI/AU SMALL FINANCE BAN/Salary for the Month of Feb 2026',
        amount: 110613,
        transactionDate: new Date(Date.UTC(2026, 2, 9)),
        category: 'INCOME',
        subcategory: 'Salary',
      }),
    ]
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({ monthsPresent: 4, transactionCount: 4, subcategory: 'Salary', averageAmount: 110613 })
  })

  // --- Aerem regression: pre-transition employer paid via plain NEFT, no income keyword anywhere ---
  it("CRITICAL: a recurring NEFT credit from a business-named employer with no 'salary' keyword is promoted at INFERRED confidence, labeled 'probable' not confirmed", () => {
    const narrationDetail = { referenceNumber: 'ICIN1', counterpartyRaw: 'AEREM SOLUTIONS PRIVATE LIMI', purpose: null, counterpartyBank: 'ICICI BANK LIMITED' }
    const transactions = [0, 1, 2].map((m) =>
      txn({ narration: `NEFT/ICIN${m}/AEREM SOLUTIONS PRIVATE LIMI/ICICI BANK LIMITED/B${m}`, amount: 87242, transactionDate: monthlyDate(m), category: 'TRANSFERS', subcategory: 'P2P transfer', narrationDetail }),
    )
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({ monthsPresent: 3, subcategory: 'Probable employer income (unconfirmed)', evidenceLevel: 'INFERRED' })
    expect(result.transactions.every((t) => t.category === 'INCOME')).toBe(true)
  })

  it("a recurring P2P transfer to a PERSONAL name (family support) is never promoted to income, even though it clears the same recurrence bar", () => {
    const narrationDetail = { referenceNumber: 'U1', counterpartyRaw: 'YOGITA ANUPKUMAR SUTH', purpose: null, counterpartyBank: 'HDFC Bank' }
    const transactions = [0, 1, 2].map((m) =>
      txn({ narration: `UPI/P2A/50000000${m}/YOGITA ANUPKUMAR SUTH/NA/HDFC Bank`, amount: 15000, transactionDate: monthlyDate(m), category: 'TRANSFERS', subcategory: 'P2P transfer', narrationDetail }),
    )
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(0)
    expect(result.transactions.every((t) => t.category !== 'INCOME')).toBe(true)
  })

  it('a one-off business-named NEFT credit (no recurrence) is never promoted to income merely because the counterparty looks like a business', () => {
    const narrationDetail = { referenceNumber: 'N1', counterpartyRaw: 'ONE TIME VENDOR SOLUTIONS LTD', purpose: null, counterpartyBank: 'HDFC BANK' }
    const transactions = [txn({ narration: 'NEFT/N1/ONE TIME VENDOR SOLUTIONS LTD/HDFC BANK/B1', amount: 500000, transactionDate: monthlyDate(0), category: 'TRANSFERS', subcategory: 'P2P transfer', narrationDetail })]
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(0)
    expect(result.transactions.every((t) => t.category !== 'INCOME')).toBe(true)
  })

  it('a recurring business-named NEFT credit that matches a real bureau-reported lender is still reclassified toward BORROWING, never income (bureau match takes precedence)', () => {
    const narrationDetail = { referenceNumber: 'N1', counterpartyRaw: 'XYZ FINANCE PVT LTD', purpose: null, counterpartyBank: 'HDFC BANK' }
    const transactions = [0, 1, 2].map((m) =>
      txn({ narration: `NEFT/N${m}/XYZ FINANCE PVT LTD/HDFC BANK/B${m}`, amount: 40000, transactionDate: monthlyDate(m), category: 'TRANSFERS', subcategory: 'P2P transfer', narrationDetail }),
    )
    const result = detectRecurringIncome(transactions, testConfig(), [creditAccount({ lender: 'XYZ FINANCE' })])
    expect(result.sources).toHaveLength(0)
    expect(result.transactions.every((t) => t.category === 'BORROWING')).toBe(true)
  })

  it("CRITICAL: a real employer's IMPS-era and NEFT-era salary credits combine into ONE continuous recurring-income source (same employer, different rail truncation), not two separate under-threshold sources", () => {
    const impsDetail = { referenceNumber: '1', counterpartyRaw: 'GOLDENLE', purpose: 'Salaryfo', counterpartyBank: 'AUSMALLF' }
    const neftDetail = { referenceNumber: '2', counterpartyRaw: 'GOLDEN LEGAND LEASING AND FI', purpose: null, counterpartyBank: 'AU SMALL FINANCE BAN' }
    const transactions = [
      // IMPS era: 3 months (would alone fall short of continuous 7-month tenure)
      txn({ narration: 'IMPS/P2A/1/GOLDENLE/AUSMALLF/Salaryfo/123', amount: 110613, transactionDate: monthlyDate(0), category: 'INCOME', subcategory: 'Salary', narrationDetail: impsDetail }),
      txn({ narration: 'IMPS/P2A/2/GOLDENLE/AUSMALLF/Salaryfo/123', amount: 110613, transactionDate: monthlyDate(1), category: 'INCOME', subcategory: 'Salary', narrationDetail: impsDetail }),
      txn({ narration: 'IMPS/P2A/3/GOLDENLE/AUSMALLF/Salaryfo/123', amount: 110613, transactionDate: monthlyDate(2), category: 'INCOME', subcategory: 'Salary', narrationDetail: impsDetail }),
      // NEFT era: 4 more months, same employer, different truncation
      txn({ narration: 'NEFT/A1/GOLDEN LEGAND LEASING AND FI/AU SMALL FINANCE BAN/B1', amount: 110613, transactionDate: monthlyDate(3), category: 'INCOME', subcategory: 'Salary', narrationDetail: neftDetail }),
      txn({ narration: 'NEFT/A2/GOLDEN LEGAND LEASING AND FI/AU SMALL FINANCE BAN/B2', amount: 110613, transactionDate: monthlyDate(4), category: 'INCOME', subcategory: 'Salary', narrationDetail: neftDetail }),
      txn({ narration: 'NEFT/A3/GOLDEN LEGAND LEASING AND FI/AU SMALL FINANCE BAN/B3', amount: 110613, transactionDate: monthlyDate(5), category: 'INCOME', subcategory: 'Salary', narrationDetail: neftDetail }),
      txn({ narration: 'NEFT/A4/GOLDEN LEGAND LEASING AND FI/AU SMALL FINANCE BAN/B4', amount: 110613, transactionDate: monthlyDate(6), category: 'INCOME', subcategory: 'Salary', narrationDetail: neftDetail }),
    ]
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({ monthsPresent: 7, transactionCount: 7, averageAmount: 110613 })
  })

  it('CRITICAL: averageAmount is the MEDIAN of the cluster, not a mean — a single lower transition-month payment never drags the reported "current" income away from the steady-state figure', () => {
    const detail = { referenceNumber: '1', counterpartyRaw: 'GOLDENLE', purpose: 'Salaryfo', counterpartyBank: 'AUSMALLF' }
    const transactions = [
      txn({ narration: 'IMPS/P2A/1/GOLDENLE/AUSMALLF/Salaryfo/123', amount: 99715, transactionDate: monthlyDate(0), category: 'INCOME', subcategory: 'Salary', narrationDetail: detail }), // transition month, lower
      ...[1, 2, 3, 4, 5, 6, 7].map((m) =>
        txn({ narration: `IMPS/P2A/${m}/GOLDENLE/AUSMALLF/Salaryfo/123`, amount: 110613, transactionDate: monthlyDate(m), category: 'INCOME', subcategory: 'Salary', narrationDetail: detail }),
      ),
    ]
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(1)
    // mean would be 109,251; median of [99715, 110613×7] is 110613.
    expect(result.sources[0].averageAmount).toBe(110613)
  })

  it('does not merge two genuinely different employers (no truncation relationship) into one source even with identical amounts', () => {
    const aeremDetail = { referenceNumber: '1', counterpartyRaw: 'AEREM SOLUTIONS PVT LTD', purpose: null, counterpartyBank: 'ICICI BANK' }
    const unrelatedDetail = { referenceNumber: '2', counterpartyRaw: 'GOLDEN LEGAND LEASING AND FI', purpose: null, counterpartyBank: 'AU SMALL FINANCE BAN' }
    const transactions = [
      ...[0, 1, 2].map((m) => txn({ narration: `NEFT/A${m}/AEREM SOLUTIONS PVT LTD/ICICI BANK/B${m}`, amount: 90000, transactionDate: monthlyDate(m), category: 'INCOME', subcategory: 'Salary', narrationDetail: aeremDetail })),
      ...[3, 4, 5].map((m) => txn({ narration: `NEFT/A${m}/GOLDEN LEGAND LEASING AND FI/AU SMALL FINANCE BAN/B${m}`, amount: 90000, transactionDate: monthlyDate(m), category: 'INCOME', subcategory: 'Salary', narrationDetail: unrelatedDetail })),
    ]
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(2)
    expect(result.sources.every((s) => s.monthsPresent === 3)).toBe(true)
  })

  it('does not merge two different amount tiers of the same narration into one recurring source when outside tolerance', () => {
    const transactions = [
      txn({ narration: 'FREELANCE PAYMENT CLIENT A', amount: 10000, transactionDate: monthlyDate(0), category: 'INCOME', subcategory: 'Business income' }),
      txn({ narration: 'FREELANCE PAYMENT CLIENT A', amount: 10500, transactionDate: monthlyDate(1), category: 'INCOME', subcategory: 'Business income' }),
      txn({ narration: 'FREELANCE PAYMENT CLIENT A', amount: 11000, transactionDate: monthlyDate(2), category: 'INCOME', subcategory: 'Business income' }),
      // A one-off, much larger amount under the same narration — should not join the above cluster.
      txn({ narration: 'FREELANCE PAYMENT CLIENT A', amount: 95000, transactionDate: monthlyDate(3), category: 'INCOME', subcategory: 'Business income' }),
    ]
    const result = detectRecurringIncome(transactions, testConfig())
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].transactionCount).toBe(3)
  })
})
