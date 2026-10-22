import { extractStatementMetadata } from './statement-metadata-extractor'

describe('extractStatementMetadata', () => {
  it('extracts bank name from an IFSC code in the pre-header metadata (reliable statement-level evidence, not a hardcoded customer/bank)', () => {
    const rows = [
      ['Name :- TEST CUSTOMER'],
      ['Currency :- INR'],
      ['IFSC Code :- UTIB0004806'],
      ['Tran Date', 'CHQNO', 'PARTICULARS', 'DR', 'CR', 'BAL', 'SOL'],
      ['01-04-2025', '-', 'SOME NARRATION', '', '30.00', '19569.55', '4806'],
    ]
    const metadata = extractStatementMetadata(rows, 3, 4)
    expect(metadata.bankName).toBe('Axis Bank')
  })

  it('also extracts account holder name and IFSC code from the same labeled header lines (never from a transaction row)', () => {
    const rows = [
      ['Name :- TEST CUSTOMER'],
      ['Currency :- INR'],
      ['IFSC Code :- UTIB0004806'],
      ['A/C Type :- Savings'],
      ['Tran Date', 'CHQNO', 'PARTICULARS', 'DR', 'CR', 'BAL', 'SOL'],
      ['01-04-2025', '-', 'SOME NARRATION', '', '30.00', '19569.55', '4806'],
    ]
    const metadata = extractStatementMetadata(rows, 4, 5)
    expect(metadata.accountHolderName).toBe('TEST CUSTOMER')
    expect(metadata.ifscCode).toBe('UTIB0004806')
    expect(metadata.accountType).toBe('Savings')
  })

  it('never reads an account holder name from a transaction row narration', () => {
    const rows = [
      ['Tran Date', 'PARTICULARS', 'DR', 'CR', 'BAL'],
      ['01-04-2025', 'UPI/P2A/.../PRAVEENKUMAR MOTILAL/NA/Kotak Mahindra Bank', '', '30.00', '100.00'],
    ]
    const metadata = extractStatementMetadata(rows, 0, 1)
    expect(metadata.accountHolderName).toBeNull()
  })

  it('extracts a different bank from a different IFSC prefix — proves the lookup is generic, not hardcoded to one bank', () => {
    const rows = [['IFSC Code :- HDFC0001234'], ['Tran Date', 'PARTICULARS', 'DR', 'CR', 'BAL'], ['01-04-2025', 'X', '', '30.00', '100.00']]
    const metadata = extractStatementMetadata(rows, 1, 2)
    expect(metadata.bankName).toBe('HDFC Bank')
  })

  it('falls back to a known full bank name in pre-header/footer text when no IFSC line is present', () => {
    const rows = [
      ['Some Other Bank Statement Export'],
      ['Tran Date', 'PARTICULARS', 'DR', 'CR', 'BAL'],
      ['01-04-2025', 'X', '', '30.00', '100.00'],
      ['REGISTERED OFFICE - AXIS BANK LTD'],
    ]
    const metadata = extractStatementMetadata(rows, 1, 2)
    expect(metadata.bankName).toBe('Axis Bank')
  })

  it('NEVER infers bank identity from a transaction row narration/counterparty — only pre-header/footer text is scanned', () => {
    const rows = [
      ['Tran Date', 'PARTICULARS', 'DR', 'CR', 'BAL'],
      ['01-04-2025', 'UPI/P2A/.../Paid v/HDFC BANK LTD', '', '30.00', '100.00'],
    ]
    // The ONLY mention of "HDFC Bank" is inside a transaction's own
    // narration (a counterparty's bank on a P2P transfer) — this must
    // never be read as "this statement belongs to HDFC Bank".
    const metadata = extractStatementMetadata(rows, 0, 1)
    expect(metadata.bankName).toBeNull()
  })

  it('returns null bank name when neither an IFSC line nor a known bank name is present, rather than guessing', () => {
    const rows = [['Statement Export'], ['Tran Date', 'PARTICULARS', 'DR', 'CR', 'BAL'], ['01-04-2025', 'X', '', '30.00', '100.00']]
    const metadata = extractStatementMetadata(rows, 1, 2)
    expect(metadata.bankName).toBeNull()
  })

  it('extracts and masks the account number — last 4 digits only, full number never returned', () => {
    const rows = [
      ['Statement of Account No - 924010040915717 for the period (From : 01-04-2025  To : 31-03-2026)'],
      ['Tran Date', 'PARTICULARS', 'DR', 'CR', 'BAL'],
      ['01-04-2025', 'X', '', '30.00', '100.00'],
    ]
    const metadata = extractStatementMetadata(rows, 1, 2)
    expect(metadata.accountNumberMasked).toBe('XXXXXXXXXXX5717')
    expect(metadata.accountNumberMasked).not.toContain('924010040915717')
    // L. No full account number leakage anywhere in the returned object.
    expect(JSON.stringify(metadata)).not.toContain('924010040915717')
  })

  it('extracts the explicit statement period from a "period (From : ... To : ...)" header line', () => {
    const rows = [
      ['Statement of Account No - 924010040915717 for the period (From : 01-04-2025  To : 31-03-2026)'],
      ['Tran Date', 'PARTICULARS', 'DR', 'CR', 'BAL'],
      ['01-04-2025', 'X', '', '30.00', '100.00'],
    ]
    const metadata = extractStatementMetadata(rows, 1, 2)
    expect(metadata.statementPeriodStart).toEqual(new Date(Date.UTC(2025, 3, 1)))
    expect(metadata.statementPeriodEnd).toEqual(new Date(Date.UTC(2026, 2, 31)))
  })

  it('returns null period fields when no explicit period line exists (caller falls back to actual transaction date range, never assumes 12 months)', () => {
    const rows = [['Tran Date', 'PARTICULARS', 'DR', 'CR', 'BAL'], ['01-04-2025', 'X', '', '30.00', '100.00']]
    const metadata = extractStatementMetadata(rows, 0, 1)
    expect(metadata.statementPeriodStart).toBeNull()
    expect(metadata.statementPeriodEnd).toBeNull()
  })

  it('returns all-null metadata when no header row was ever found (headerIndex -1)', () => {
    const metadata = extractStatementMetadata([['not a statement']], -1, -1)
    expect(metadata).toEqual({
      bankName: null,
      accountNumberMasked: null,
      statementPeriodStart: null,
      statementPeriodEnd: null,
      accountHolderName: null,
      ifscCode: null,
      accountType: null,
    })
  })
})
