import { mapInProfileResponseXml } from '@/modules/bureau/providers/experian-response.mapper'
import {
  aaStatementToCsv,
  creditJsonToInProfileXml,
  crossCheckIdentity,
  nameTokens,
  orderAaTransactions,
  parseAaStatement,
  parseCreditReport,
  type AaStatement,
  type AaTransaction,
  type CreditIdentity,
} from './source-documents'

// Synthetic fixtures only — no real person's data.
function creditJson(over: { pan?: string; dob?: number; mobile?: number; first?: string; last?: string; accounts?: unknown } = {}) {
  const holder = { Income_TAX_PAN: over.pan ?? 'ABCPD1234E', Surname_Non_Normalized: `${over.first ?? 'ASHA'} ${over.last ?? 'DEVI'}`, Gender_Code: 2, Date_of_birth: over.dob ?? 19900515 }
  const account = {
    Account_Type: '10',
    Subscriber_Name: 'TEST BANK',
    Open_Date: '20230101',
    Account_Status: '11',
    Current_Balance: '1000',
    Amount_Past_Due: '0',
    CAIS_Holder_Details: holder,
    CAIS_Holder_Address_Details: { ZIP_Postal_Code_non_normalized: 560001 },
    CAIS_Account_History: [{ Year: '2026', Month: '08', Days_Past_Due: '0', Asset_Classification: '?' }],
  }
  return {
    INProfileResponse: {
      Header: { ReportDate: 20260801 },
      CreditProfileHeader: { ReportDate: 20260801, ReportTime: 120000 },
      SCORE: { BureauScore: 742 },
      Match_result: { Exact_match: 'Y' },
      Current_Application: {
        Current_Application_Details: {
          Current_Applicant_Details: { IncomeTaxPan: over.pan ?? 'ABCPD1234E', MobilePhoneNumber: over.mobile ?? 9000011111, First_Name: over.first ?? 'ASHA', Last_Name: over.last ?? 'DEVI' },
        },
      },
      CAIS_Account: { CAIS_Summary: { Credit_Account: { CreditAccountActive: 1 }, Total_Outstanding_Balance: { Outstanding_Balance_All: 1000 } }, CAIS_Account_DETAILS: over.accounts ?? [account] },
    },
  }
}

function aaJson(over: { pan?: string | null; dob?: string; mobile?: string; name?: string; txns?: Record<string, string>[] } = {}) {
  return {
    data: [
      {
        fipid: 'TEST-FIP',
        dataDetail: {
          jsonData: {
            Account: {
              maskedAccNumber: 'XXXXXX1234',
              Profile: { Holders: { Holder: { name: over.name ?? 'ASHA DEVI', dob: over.dob ?? '1990-05-15', mobile: over.mobile ?? '9000011111', pan: over.pan === undefined ? null : over.pan, email: 'asha@example.test' } } },
              Summary: { ifscCode: 'SBIN0001234', type: 'SAVINGS', branch: 'MAIN' },
              Transactions: {
                startDate: '2026-01-01',
                endDate: '2026-01-31',
                Transaction: over.txns ?? [
                  { type: 'CREDIT', amount: '50000.00', currentBalance: '60000.00', transactionTimestamp: '2026-01-05T10:00:00', valueDate: '2026-01-05T12:00:00', narration: 'SALARY, ACME' },
                  { type: 'DEBIT', amount: '10000.00', currentBalance: '50000.00', transactionTimestamp: '2026-01-10T10:00:00', valueDate: '2026-01-10T12:00:00', narration: 'EMI' },
                ],
              },
            },
          },
        },
      },
    ],
  }
}

const tx = (date: string, valueDate: string, kind: 'CREDIT' | 'DEBIT', amount: number, balance: number): AaTransaction => ({
  date,
  valueDate,
  narration: 'n',
  debit: kind === 'DEBIT' ? amount : null,
  credit: kind === 'CREDIT' ? amount : null,
  balance,
})

describe('parseCreditReport', () => {
  it('reads identity from the applicant block and tradelines', () => {
    const c = parseCreditReport(creditJson())
    expect(c).toMatchObject({ pan: 'ABCPD1234E', fullName: 'ASHA DEVI', mobile: '9000011111', dob: '1990-05-15', genderCode: 2, pinCode: '560001', bureauScore: 742, exactMatch: true, accountCount: 1 })
    expect(c.conflicts).toEqual([])
  })

  it('accepts a lone tradeline object, and a report with no tradelines, without inventing a DOB', () => {
    const lone = creditJson()
    const only = (lone.INProfileResponse.CAIS_Account.CAIS_Account_DETAILS as unknown[])[0]
    ;(lone.INProfileResponse.CAIS_Account as Record<string, unknown>).CAIS_Account_DETAILS = only
    expect(parseCreditReport(lone).accountCount).toBe(1)

    const none = parseCreditReport(creditJson({ accounts: [] }))
    expect(none).toMatchObject({ accountCount: 0, dob: null, pan: 'ABCPD1234E' })
  })

  it("leaves a field unset and records a conflict when the report's own tradelines disagree", () => {
    const base = creditJson()
    const a1 = (base.INProfileResponse.CAIS_Account.CAIS_Account_DETAILS as Record<string, unknown>[])[0]
    const a2 = { ...a1, CAIS_Holder_Details: { ...(a1.CAIS_Holder_Details as object), Date_of_birth: 19910101 } }
    base.INProfileResponse.CAIS_Account.CAIS_Account_DETAILS = [a1, a2]
    const c = parseCreditReport(base)
    expect(c.dob).toBeNull()
    expect(c.conflicts.map((x) => x.field)).toContain('dateOfBirth')
  })

  it('rejects a document that is not an INProfileResponse', () => {
    expect(() => parseCreditReport({ foo: 1 })).toThrow(/INProfileResponse/)
  })
})

describe('creditJsonToInProfileXml', () => {
  it('produces XML the existing Experian mapper accepts, preserving score and tradelines', () => {
    const mapped = mapInProfileResponseXml(creditJsonToInProfileXml(creditJson()), { firstName: 'A', surname: 'B', mobilePhone: '9000011111' })
    expect(mapped.creditScore).toBe(742)
    expect(mapped.accounts).toHaveLength(1)
  })

  it('escapes XML metacharacters in values', () => {
    const j = creditJson()
    ;(j.INProfileResponse.CAIS_Account.CAIS_Account_DETAILS as Record<string, unknown>[])[0].Subscriber_Name = 'A & B <BANK>'
    expect(creditJsonToInProfileXml(j)).toContain('A &amp; B &lt;BANK&gt;')
  })
})

describe('parseAaStatement / aaStatementToCsv', () => {
  it('parses holder, account and signed transactions', () => {
    const s = parseAaStatement(aaJson())
    expect(s.holder).toMatchObject({ name: 'ASHA DEVI', mobile: '9000011111', dob: '1990-05-15', email: 'asha@example.test' })
    expect(s.account).toMatchObject({ ifsc: 'SBIN0001234', maskedAccNumber: 'XXXXXX1234' })
    expect(s.transactions.map((t) => [t.credit, t.debit])).toEqual([[50000, null], [null, 10000]])
  })

  it('renders a CSV with a metadata preamble the statement parser understands, quoting narrations that contain commas', () => {
    const { csv } = aaStatementToCsv(parseAaStatement(aaJson()))
    expect(csv).toContain('Account Holder Name: ASHA DEVI')
    expect(csv).toContain('IFSC Code: SBIN0001234')
    expect(csv).toContain('Date,Narration,Debit,Credit,Balance')
    expect(csv).toContain('05/01/2026,"SALARY, ACME",,50000.00,60000.00')
  })

  it('refuses an empty statement and a transaction with no amount', () => {
    expect(() => aaStatementToCsv(parseAaStatement(aaJson({ txns: [] })))).toThrow(/no transactions/)
    expect(() => aaStatementToCsv(parseAaStatement(aaJson({ txns: [{ type: 'DEBIT', amount: '', currentBalance: '1', transactionTimestamp: '2026-01-01T00:00:00', valueDate: '2026-01-01T00:00:00', narration: 'x' }] })))).toThrow(/missing its amount/)
  })
})

describe('orderAaTransactions', () => {
  it('keeps a ledger that is already in date order, untouched', () => {
    const rows = [tx('2026-01-01', '2026-01-01', 'CREDIT', 100, 100), tx('2026-01-02', '2026-01-02', 'DEBIT', 40, 60)]
    expect(orderAaTransactions(rows)).toMatchObject({ ordering: 'as-supplied', dateBasis: 'transactionTimestamp', balanceContinuityBreaks: 0 })
  })

  it('uses the value date when transaction timestamps wobble but the ledger (by balance) follows value date', () => {
    // timestamps go 01-02 then 01-01, but balances only chain in the supplied order, which is value-date ordered.
    const rows = [tx('2026-01-02', '2026-01-01', 'CREDIT', 100, 100), tx('2026-01-01', '2026-01-02', 'DEBIT', 40, 60)]
    expect(orderAaTransactions(rows)).toMatchObject({ ordering: 'as-supplied', dateBasis: 'valueDate', balanceContinuityBreaks: 0 })
  })

  it('reverses a newest-first statement because its balances only chain that way', () => {
    const rows = [tx('2026-01-03', '2026-01-03', 'DEBIT', 10, 50), tx('2026-01-02', '2026-01-02', 'DEBIT', 40, 60), tx('2026-01-01', '2026-01-01', 'CREDIT', 100, 100)]
    const result = orderAaTransactions(rows)
    expect(result.ordering).toBe('reversed')
    expect(result.balanceContinuityBreaks).toBe(0)
    expect(result.transactions.map((t) => t.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03'])
  })

  it('reports (rather than hides) a genuine break in running balance', () => {
    const rows = [tx('2026-01-01', '2026-01-01', 'CREDIT', 100, 100), tx('2026-01-02', '2026-01-02', 'DEBIT', 40, 999)]
    expect(orderAaTransactions(rows).balanceContinuityBreaks).toBe(1)
  })

  it('rejects a statement whose dates cannot be ordered', () => {
    expect(() => orderAaTransactions([tx('', '', 'CREDIT', 1, 1)])).toThrow(/date order/)
  })
})

describe('nameTokens', () => {
  it('drops a relative introduced by S/O, W/O etc., so a father\'s name never counts toward matching', () => {
    expect(nameTokens('SHUBHAM RANA S/O DILBAG SINGH RANA')).toEqual(['SHUBHAM', 'RANA'])
    expect(nameTokens('Asha  Devi')).toEqual(['ASHA', 'DEVI'])
  })
})

describe('crossCheckIdentity', () => {
  const identity = (over: Partial<CreditIdentity> = {}): CreditIdentity => ({ ...parseCreditReport(creditJson()), ...over })
  const stmt = (over: Parameters<typeof aaJson>[0] = {}): AaStatement => parseAaStatement(aaJson(over))

  it('accepts a pair that agrees on mobile, DOB and name, even with no PAN on the statement', () => {
    const r = crossCheckIdentity(identity(), stmt())
    expect(r.sameIdentity).toBe(true)
    expect(r.blockers).toEqual([])
  })

  it('treats a masked statement PAN as a match on its visible suffix, and a different suffix as a mismatch', () => {
    expect(crossCheckIdentity(identity(), stmt({ pan: '****1234E' })).checks.find((c) => c.field === 'pan')?.result).toBe('MATCH')
    const bad = crossCheckIdentity(identity(), stmt({ pan: '****9999Z' }))
    expect(bad.sameIdentity).toBe(false)
    expect(bad.blockers).toEqual(['pan differs between the credit report and the bank statement'])
  })

  it('ignores a non-PAN placeholder such as FORM60 instead of calling it a mismatch', () => {
    expect(crossCheckIdentity(identity(), stmt({ pan: 'FORM60' })).checks.find((c) => c.field === 'pan')?.result).toBe('ONE_SIDE_ONLY')
  })

  it('blocks two full PANs that differ even when mobile and name agree', () => {
    expect(crossCheckIdentity(identity(), stmt({ pan: 'ZZZPZ9999Z' })).sameIdentity).toBe(false)
  })

  it('blocks a different person who happens to share the mobile number', () => {
    const r = crossCheckIdentity(identity(), stmt({ name: 'BARASHA BORAH' }))
    expect(r.sameIdentity).toBe(false)
    expect(r.blockers[0]).toMatch(/^name differs/)
  })

  it('blocks a different mobile number', () => {
    expect(crossCheckIdentity(identity(), stmt({ mobile: '9888800000' })).sameIdentity).toBe(false)
  })

  it('records a DOB disagreement as a soft conflict, not a blocker', () => {
    const r = crossCheckIdentity(identity(), stmt({ dob: '1990-01-01' }))
    expect(r.sameIdentity).toBe(true)
    expect(r.softConflicts).toEqual([{ field: 'dateOfBirth', detail: expect.stringMatching(/left unset/) }])
  })

  it('does not treat a name-only agreement as proof of identity', () => {
    const r = crossCheckIdentity(identity({ mobile: null, pan: null }), stmt({ mobile: '9000011111' }))
    expect(r.sameIdentity).toBe(false)
  })
})
