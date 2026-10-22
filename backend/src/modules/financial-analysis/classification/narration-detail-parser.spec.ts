import { parseAllNarrationDetails, parseNarrationDetail } from './narration-detail-parser'
import { txn } from './test-helpers'

describe('parseNarrationDetail', () => {
  it('parses a UPI/P2M narration (the spec\'s own example)', () => {
    const result = parseNarrationDetail('UPI/P2M/545701768124/R CITY MALL/Paid v/BANK OF BARODA')
    expect(result).toEqual({ referenceNumber: '545701768124', counterpartyRaw: 'R CITY MALL', purpose: 'Paid v', counterpartyBank: 'BANK OF BARODA' })
  })

  it('parses a UPI/P2A narration with an NA purpose as null (never "NA" surfaced as if it were real data)', () => {
    const result = parseNarrationDetail('UPI/P2A/512116984809/PRAVEENKUMAR MOTILAL/NA/Kotak Mahindra Bank')
    expect(result.referenceNumber).toBe('512116984809')
    expect(result.counterpartyRaw).toBe('PRAVEENKUMAR MOTILAL')
    expect(result.purpose).toBeNull()
    expect(result.counterpartyBank).toBe('Kotak Mahindra Bank')
  })

  it('parses an IMPS/P2A narration', () => {
    const result = parseNarrationDetail('IMPS/P2A/510519628956/PERFIOSS/IDFCBank/BankAcco/9100000000919751001')
    expect(result.referenceNumber).toBe('510519628956')
    expect(result.counterpartyRaw).toBe('PERFIOSS')
    expect(result.counterpartyBank).toBe('IDFCBank')
    expect(result.purpose).toBe('BankAcco')
  })

  it('CRITICAL: captures a real IMPS salary credit\'s truncated account_ref as purpose', () => {
    const result = parseNarrationDetail('IMPS/P2A/521919414523/GOLDENLE/AUSMALLF/Salaryfo/9186557660239765000')
    expect(result.counterpartyRaw).toBe('GOLDENLE')
    expect(result.counterpartyBank).toBe('AUSMALLF')
    expect(result.purpose).toBe('Salaryfo')
  })

  it('still parses an IMPS narration with no account_ref field at all (purpose stays null)', () => {
    const result = parseNarrationDetail('IMPS/P2A/510519628956/PERFIOSS/IDFCBank')
    expect(result.counterpartyRaw).toBe('PERFIOSS')
    expect(result.counterpartyBank).toBe('IDFCBank')
    expect(result.purpose).toBeNull()
  })

  it('parses a NEFT narration', () => {
    const result = parseNarrationDetail('NEFT/ICIN412158875251/AEREM SOLUTIONS PRIVATE LIMITED/ICICI BANK')
    expect(result.referenceNumber).toBe('ICIN412158875251')
    expect(result.counterpartyRaw).toBe('AEREM SOLUTIONS PRIVATE LIMITED')
    expect(result.counterpartyBank).toBe('ICICI BANK')
  })

  it('parses an ACH-DR narration (lender + mandate reference, no counterparty bank)', () => {
    const result = parseNarrationDetail('ACH-DR-INCRED FINANCIAL SER-INCREDXOgEpcpjhlYacA-')
    expect(result.counterpartyRaw).toBe('INCRED FINANCIAL SER')
    expect(result.referenceNumber).toBe('INCREDXOgEpcpjhlYacA')
    expect(result.counterpartyBank).toBeNull()
  })

  it('parses an SB (interest) narration as account number + description', () => {
    const result = parseNarrationDetail('SB:924010040915717:Int.Pd:01-04-2025 to 30-06-2025')
    expect(result.referenceNumber).toBe('924010040915717')
    expect(result.purpose).toBe('Int.Pd:01-04-2025 to 30-06-2025')
  })

  it('returns all-null (never a guessed parse) for a narration matching no recognized structural shape', () => {
    expect(parseNarrationDetail('ATM WDL 400123')).toEqual({ referenceNumber: null, counterpartyRaw: null, purpose: null, counterpartyBank: null })
  })
})

describe('parseAllNarrationDetails', () => {
  it('populates narrationDetail for every transaction without altering category/subcategory', () => {
    const result = parseAllNarrationDetails([txn({ narration: 'UPI/P2M/123/MERCHANT/Paid/HDFC BANK', category: 'EXPENSE', subcategory: 'Shopping' })])
    expect(result[0].narrationDetail?.referenceNumber).toBe('123')
    expect(result[0].category).toBe('EXPENSE')
    expect(result[0].subcategory).toBe('Shopping')
  })

  it('never overwrites an already-populated narrationDetail', () => {
    const preset = { referenceNumber: 'X', counterpartyRaw: null, purpose: null, counterpartyBank: null }
    const result = parseAllNarrationDetails([txn({ narration: 'UPI/P2M/123/MERCHANT/Paid/HDFC BANK', narrationDetail: preset })])
    expect(result[0].narrationDetail).toBe(preset)
  })
})
