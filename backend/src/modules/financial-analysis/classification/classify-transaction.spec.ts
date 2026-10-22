import { classifyAllTransactions, classifyTransaction, isAmbiguousMerchantMatch } from './classify-transaction'
import { txn } from './test-helpers'

describe('classifyTransaction', () => {
  it.each([
    ['SALARY CREDIT ABC CORP', 'CREDIT', 'INCOME', 'Salary'],
    // CRITICAL: a real Axis Bank IMPS narration truncates "Salary for the
    // Month of Nov" to "Salaryfo" in its account_ref field — \bsalary\b
    // alone never matches this (no word boundary between "salary"/"fo").
    ['IMPS/P2A/521919414523/GOLDENLE/AUSMALLF/Salaryfo/9186557660239765000', 'CREDIT', 'INCOME', 'Salary'],
    ['PENSION CREDIT', 'CREDIT', 'INCOME', 'Pension'],
    ['INTEREST CREDIT SAVINGS', 'CREDIT', 'INCOME', 'Interest'],
    ['PERSONAL LOAN DISBURSEMENT XYZ BANK', 'CREDIT', 'BORROWING', 'Personal loan'],
    ['SIMPL BNPL CREDIT', 'CREDIT', 'BORROWING', 'BNPL'],
    ['EMI AUTO DEBIT HDFC', 'DEBIT', 'EXPENSE', 'EMI'],
    ['CRED CLUB CARD PAYMENT', 'DEBIT', 'EXPENSE', 'Credit-card payment'],
    ['SWIGGY ORDER', 'DEBIT', 'EXPENSE', 'Restaurant'],
    ['NETFLIX SUBSCRIPTION', 'DEBIT', 'EXPENSE', 'Subscription'],
    ['RENT PAYMENT MARCH', 'DEBIT', 'EXPENSE', 'Rent'],
    ['ATM WDL 2000', 'DEBIT', 'CASH', 'ATM withdrawal'],
    ['CASH DEPOSIT BRANCH', 'CREDIT', 'CASH', 'Cash deposit'],
    ['REFUND AMAZON ORDER', 'CREDIT', 'OTHER', 'Refund'],
    ['UPI/9000010001/transfer', 'DEBIT', 'TRANSFERS', 'P2P transfer'],
    // CRITICAL: a real IDFC First Bank EMI collected via its own UPI merchant
    // VPA — P2M (person-to-MERCHANT), never P2A, is what distinguishes this
    // from an ordinary P2P transfer that happens to mention a bank name.
    ['UPI/P2M/515156288330/WWW IDFCBANK COM     /UPIInt/HDFC BANK LTD', 'DEBIT', 'EXPENSE', 'EMI'],
    // CRITICAL: real loan disbursements from named NBFC lenders, otherwise
    // swallowed by the generic transfer-rail catch-all as a P2P transfer.
    ['IMPS/P2A/510521791188/INCREDFI/IDFCBank/LXMUM552/9182919473209751001', 'CREDIT', 'BORROWING', 'Finance-company loan'],
    ['NEFT/IDFBH25261034558/FINNABLE CREDIT PRIVATE LIMI/IDFC FIRST BANK LTD//ATTN/', 'CREDIT', 'BORROWING', 'Finance-company loan'],
  ] as const)('classifies "%s" (%s) as %s / %s', (narration, direction, category, subcategory) => {
    const result = classifyTransaction(txn({ narration, direction }))
    expect(result.category).toBe(category)
    expect(result.subcategory).toBe(subcategory)
  })

  it('the Salaryfo/Salaryfor truncation tolerance never matches an unrelated word starting with "salary"', () => {
    const result = classifyTransaction(txn({ narration: 'SALARYFOREVER PROMO SCHEME', direction: 'CREDIT' }))
    expect(result.subcategory).not.toBe('Salary')
  })

  it("CRITICAL: a P2A transfer to a person whose bank happens to be IDFC is never classified as a lender EMI (only P2M to a lender's own VPA is)", () => {
    const result = classifyTransaction(txn({ narration: 'UPI/P2A/512116984809/RAHUL KUMAR MISHRA/NA/IDFC First Bank', direction: 'DEBIT' }))
    expect(result.subcategory).not.toBe('EMI')
  })

  it('a P2M payment to an unrelated merchant that happens to contain "bank" in its name is not misclassified as a lender EMI', () => {
    const result = classifyTransaction(txn({ narration: 'UPI/P2M/512116984809/CITY BANK BAKERY/Paid/HDFC BANK', direction: 'DEBIT' }))
    expect(result.subcategory).not.toBe('EMI')
  })

  it('never force-assigns a category for a narration matching no rule (D07) — stays UNCLASSIFIED', () => {
    const result = classifyTransaction(txn({ narration: 'XYZ123456789 REF NO 998877' }))
    expect(result.category).toBe('UNCLASSIFIED')
    expect(result.subcategory).toBeNull()
  })

  it('classifies a gig-platform payout (platform name + payout keyword) as Gig income', () => {
    const result = classifyTransaction(txn({ narration: 'SWIGGY DELIVERY PARTNER PAYOUT WK42', direction: 'CREDIT' }))
    expect(result.category).toBe('INCOME')
    expect(result.subcategory).toBe('Gig income')
  })

  it('never misclassifies an ordinary platform refund credit as gig income (requires a payout-ish keyword, not just the platform name)', () => {
    const result = classifyTransaction(txn({ narration: 'UBER REFUND TRIP 12345', direction: 'CREDIT' }))
    expect(result.subcategory).not.toBe('Gig income')
    expect(result.subcategory).toBe('Refund')
  })
})

describe('isAmbiguousMerchantMatch', () => {
  it('flags a generic-keyword merchant match as ambiguous', () => {
    const t = classifyTransaction(txn({ narration: 'LOCAL KIRANA STORE PAYMENT', direction: 'DEBIT' }))
    expect(isAmbiguousMerchantMatch(t)).toBe(true)
  })

  it('does not flag a specific named-merchant match as ambiguous', () => {
    const t = classifyTransaction(txn({ narration: 'BIGBASKET ORDER', direction: 'DEBIT' }))
    expect(isAmbiguousMerchantMatch(t)).toBe(false)
  })

  it('never flags a transaction whose category/subcategory was changed by a later detector (e.g. self-transfer)', () => {
    const t = txn({ narration: 'LOCAL SHOP PAYMENT', direction: 'DEBIT', category: 'TRANSFERS', subcategory: 'Self transfer' })
    expect(isAmbiguousMerchantMatch(t)).toBe(false)
  })

  it('respects direction — a DEBIT narration never gets an income-only subcategory', () => {
    // "salary" appearing in a DEBIT narration (e.g. an employer's own payroll funding transfer out) must not be classified as personal income.
    const result = classifyTransaction(txn({ narration: 'SALARY PAYOUT BATCH', direction: 'DEBIT' }))
    expect(result.category).not.toBe('INCOME')
  })

  it('checks "insurance premium" before the broader "insurance" rule, so it lands in Financial not Essential', () => {
    const result = classifyTransaction(txn({ narration: 'LIC INSURANCE PREMIUM PAYMENT', direction: 'DEBIT' }))
    expect(result.subcategory).toBe('Insurance premium')
  })

  it('classifyAllTransactions maps every transaction independently, preserving order', () => {
    const results = classifyAllTransactions([
      txn({ narration: 'SALARY CREDIT', direction: 'CREDIT' }),
      txn({ narration: 'ATM WDL', direction: 'DEBIT' }),
    ])
    expect(results.map((r) => r.category)).toEqual(['INCOME', 'CASH'])
  })
})
