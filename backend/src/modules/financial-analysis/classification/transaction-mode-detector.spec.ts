import { detectTransactionMode, detectTransactionModes } from './transaction-mode-detector'
import { txn } from './test-helpers'

describe('detectTransactionMode', () => {
  it.each([
    ['UPI/123456789/ravi@okaxis/Payment', 'UPI'],
    ['IMPS/P2A/123456/Ravi Kumar', 'IMPS'],
    ['NEFT CR FROM ACME CORP', 'NEFT'],
    ['RTGS DR TO SUPPLIER XYZ', 'RTGS'],
    ['ACH-DR BAJAJ FINANCE EMI', 'ACH-DR'],
    ['ACH-CR SALARY CREDIT', 'ACH-CR'],
    ['ECS RETURN CHARGES', 'ECS'],
    ['CDM CASH DEPOSIT MACHINE', 'CDM'],
    ['CASH DEPOSIT BRANCH', 'CASH DEP'],
    ['ATM WDL 400123', 'ATM-CASH'],
    ['POS PURCHASE AMAZON', 'POS'],
    ['CHQ PAID 000123', 'CHQ'],
  ])('detects %s as %s', (narration, expectedMode) => {
    expect(detectTransactionMode(narration)).toBe(expectedMode)
  })

  it('returns null (never a guessed mode) for a narration with no recognizable rail prefix', () => {
    expect(detectTransactionMode('INTEREST CREDIT FOR THE QUARTER')).toBeNull()
  })
})

describe('detectTransactionModes', () => {
  it('populates transactionType for every transaction without altering category/subcategory', () => {
    const result = detectTransactionModes([txn({ narration: 'UPI/123/ravi@okaxis', category: 'TRANSFERS', subcategory: 'P2P transfer' })])
    expect(result[0].transactionType).toBe('UPI')
    expect(result[0].category).toBe('TRANSFERS')
    expect(result[0].subcategory).toBe('P2P transfer')
  })

  it('never overwrites an already-populated transactionType', () => {
    const result = detectTransactionModes([txn({ narration: 'UPI/123', transactionType: 'ALREADY_SET' })])
    expect(result[0].transactionType).toBe('ALREADY_SET')
  })
})
