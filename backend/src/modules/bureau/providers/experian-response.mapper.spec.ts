import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CreditReportUnmappedResponseError } from './credit-report-provider.interface'
import { mapInProfileResponseXml, parseExperianDateTime } from './experian-response.mapper'

const NO_RECORD_FOUND_FIXTURE = readFileSync(
  join(__dirname, '..', 'fixtures', 'in-profile-response.no-record-found.xml'),
  'utf-8',
)

/**
 * Captured 2026-09-30 via the real public lead-submission flow (one real
 * Experian call for a real, deliberately test-only identity) — identity
 * fields (name, mobile, email, PAN, address, account/report/holder
 * identifiers) are replaced with fixed placeholders; every structural
 * element, bureau code, date, and amount is real and unmodified.
 */
const MATCHED_RECORD_FIXTURE = readFileSync(
  join(__dirname, '..', 'fixtures', 'in-profile-response.matched-record.xml'),
  'utf-8',
)

describe('mapInProfileResponseXml — verified "no record found" shape', () => {
  it('maps the real captured (sanitized) no-record-found response to an honest, non-fabricated result', () => {
    const result = mapInProfileResponseXml(NO_RECORD_FOUND_FIXTURE)

    expect(result.bureau).toBe('Experian')
    expect(result.creditScore).toBeNull()
    expect(result.scoreBand).toBe('not_found')
    expect(result.totalActiveAccounts).toBe(0)
    expect(result.totalOutstandingBalance).toBe(0)
    expect(result.delinquentAccounts).toBe(0)
    expect(result.willfulDefaultFlag).toBeNull()
    expect(result.accounts).toEqual([])
    expect(result.enquiries).toEqual([])
    // ReportDate=20260930, ReportTime=113635 in the fixture.
    expect(result.pulledAt.toISOString()).toBe('2026-09-30T11:36:35.000Z')
  })

  // fast-xml-parser is deliberately lenient about malformed markup (it
  // best-effort-parses rather than strictly validating) — the malformed-
  // input path is exercised at the SOAP-envelope level instead, see
  // experian-soap-client.spec.ts's own "not valid XML" test.
  it('throws CreditReportUnmappedResponseError for well-formed-but-unrecognizable input rather than silently succeeding', () => {
    expect(() => mapInProfileResponseXml('not xml {{{')).toThrow(CreditReportUnmappedResponseError)
  })

  it('throws CreditReportUnmappedResponseError when the root element is not INProfileResponse', () => {
    expect(() => mapInProfileResponseXml('<SomethingElse></SomethingElse>')).toThrow(CreditReportUnmappedResponseError)
  })

  it('throws CreditReportUnmappedResponseError when SCORE is missing entirely (unverified shape)', () => {
    const withoutScore = NO_RECORD_FOUND_FIXTURE.replace(/<SCORE>.*?<\/SCORE>/, '')
    expect(() => mapInProfileResponseXml(withoutScore)).toThrow(CreditReportUnmappedResponseError)
  })

  it('throws CreditReportUnmappedResponseError when Match_result is missing entirely (unverified shape)', () => {
    const withoutMatchResult = NO_RECORD_FOUND_FIXTURE.replace(/<Match_result>.*?<\/Match_result>/, '')
    expect(() => mapInProfileResponseXml(withoutMatchResult)).toThrow(CreditReportUnmappedResponseError)
  })

  it('throws CreditReportUnmappedResponseError for a hypothetical "matched" result rather than guessing its structure', () => {
    const matched = NO_RECORD_FOUND_FIXTURE.replace('<Exact_match>N</Exact_match>', '<Exact_match>Y</Exact_match>')
    expect(() => mapInProfileResponseXml(matched)).toThrow(CreditReportUnmappedResponseError)
  })

  it('throws CreditReportUnmappedResponseError for a real positive score rather than guessing a score band', () => {
    const scored = NO_RECORD_FOUND_FIXTURE.replace('<BureauScore>-1</BureauScore>', '<BureauScore>750</BureauScore>')
    expect(() => mapInProfileResponseXml(scored)).toThrow(CreditReportUnmappedResponseError)
  })

  it('throws CreditReportUnmappedResponseError when an unrecognized top-level section is present (e.g. a real tradeline list)', () => {
    const withExtraSection = NO_RECORD_FOUND_FIXTURE.replace(
      '</INProfileResponse>',
      '<CAIS_Account><Some_Field>1</Some_Field></CAIS_Account></INProfileResponse>',
    )
    expect(() => mapInProfileResponseXml(withExtraSection)).toThrow(CreditReportUnmappedResponseError)
  })
})

describe('mapInProfileResponseXml — verified "matched record" shape', () => {
  it('maps the real captured (identity-redacted) matched-record response using only verified paths', () => {
    const result = mapInProfileResponseXml(MATCHED_RECORD_FIXTURE, {
      firstName: 'Test',
      surname: 'User',
      mobilePhone: '9000010001',
    })

    expect(result.bureau).toBe('Experian')
    expect(result.maskedIdNumber).toBe('XXXX-XXXX-0001')
    expect(result.pulledAt.toISOString()).toBe('2026-09-30T14:33:56.000Z')
    expect(result.creditScore).toBe(748)
    expect(result.scoreBand).toBe('good')
    expect(result.totalActiveAccounts).toBe(5)
    expect(result.totalOutstandingBalance).toBe(946114)
    expect(result.delinquentAccounts).toBe(0)
    expect(result.willfulDefaultFlag).toBeNull()
    expect(result.accounts).toHaveLength(33)
    expect(result.accounts.filter((a) => a.lifecycleStatus === 'ACTIVE')).toHaveLength(5)
    expect(result.accounts.filter((a) => a.lifecycleStatus === 'CLOSED')).toHaveLength(28)
    // Only 3 real credit-purpose enquiries (CAPS) — the 15 NonCreditCAPS
    // (identity/eligibility-verification pulls) are deliberately excluded.
    expect(result.enquiries).toHaveLength(3)
  })

  it('derives lifecycleStatus from Date_Closed presence, not a guessed Account_Status code', () => {
    const result = mapInProfileResponseXml(MATCHED_RECORD_FIXTURE)
    for (const account of result.accounts) {
      expect(['ACTIVE', 'CLOSED']).toContain(account.lifecycleStatus)
    }
  })

  it('never marks an account isSecured (no verified collateral-field signal exists yet)', () => {
    const result = mapInProfileResponseXml(MATCHED_RECORD_FIXTURE)
    expect(result.accounts.every((a) => a.isSecured === null)).toBe(true)
  })

  it('builds a masked identifier from the query mobile number, never the real PAN Experian returns in tradeline history', () => {
    const result = mapInProfileResponseXml(MATCHED_RECORD_FIXTURE, {
      firstName: 'Test',
      surname: 'User',
      mobilePhone: '9123456789',
    })
    expect(result.maskedIdNumber).toBe('XXXX-XXXX-6789')
  })

  it('falls back to a generic masked identifier when no identity is supplied (e.g. some future reprocessing path)', () => {
    const result = mapInProfileResponseXml(MATCHED_RECORD_FIXTURE)
    expect(result.maskedIdNumber).toBe('N/A')
  })

  it('produces a non-empty paymentHistoryGrid with only real "0"/"30"/"60"/"90+" buckets for accounts with history', () => {
    const result = mapInProfileResponseXml(MATCHED_RECORD_FIXTURE)
    const withHistory = result.accounts.filter((a) => a.paymentHistoryGrid !== null)
    expect(withHistory.length).toBeGreaterThan(0)
    for (const account of withHistory) {
      for (const entry of account.paymentHistoryGrid!) {
        expect(['0', '30', '60', '90+']).toContain(entry.dpdBucket)
        expect(entry.month).toMatch(/^\d{4}-\d{2}$/)
      }
    }
  })

  it('CONFIRMED (real fixture, regression guard): the 2 real accounts with Written_off_Settled_Status=99 are never coerced into WRITTEN_OFF/SETTLED — still exactly 5 ACTIVE/28 CLOSED, nothing adverse', () => {
    const result = mapInProfileResponseXml(MATCHED_RECORD_FIXTURE)
    const code99Count = (MATCHED_RECORD_FIXTURE.match(/<Written_off_Settled_Status>99<\/Written_off_Settled_Status>/g) ?? []).length
    expect(code99Count).toBe(2)
    expect(result.accounts.some((a) => a.lifecycleStatus === 'WRITTEN_OFF' || a.lifecycleStatus === 'SETTLED')).toBe(false)
  })
})

/**
 * v3.0 spec §3.3/§3.5 — write-off/settlement detection. The real fixture
 * never shows a genuinely adverse value (confirmed above), so these tests
 * mutate the real XML's first `Written_Off_Amt_Total`/`Settlement_Amount`/
 * `Written_off_Settled_Status` occurrence (document order = first account)
 * rather than fabricate a payload from scratch — every other field keeps
 * its real captured value.
 */
describe('mapInProfileResponseXml — write-off/settlement detection (v3.0 §3.3/§3.5)', () => {
  function withFirstAccountField(tag: string, value: string): string {
    const pattern = new RegExp(`<${tag}>[^<]*</${tag}>`)
    expect(MATCHED_RECORD_FIXTURE).toMatch(pattern) // fails loudly if the fixture's own structure ever changes under this test
    return MATCHED_RECORD_FIXTURE.replace(pattern, `<${tag}>${value}</${tag}>`)
  }

  it('CRITICAL: a real non-zero Written_Off_Amt_Total overrides lifecycleStatus to WRITTEN_OFF', () => {
    let xml = withFirstAccountField('Written_Off_Amt_Total', '15000')
    xml = xml.replace(/<Written_off_Settled_Status>[^<]*<\/Written_off_Settled_Status>/, '<Written_off_Settled_Status></Written_off_Settled_Status>')
    const result = mapInProfileResponseXml(xml)
    expect(result.accounts[0].lifecycleStatus).toBe('WRITTEN_OFF')
  })

  it('CRITICAL: a real non-zero Settlement_Amount (with no write-off amount) overrides lifecycleStatus to SETTLED', () => {
    let xml = withFirstAccountField('Settlement_Amount', '8000')
    xml = xml.replace(/<Written_off_Settled_Status>[^<]*<\/Written_off_Settled_Status>/, '<Written_off_Settled_Status></Written_off_Settled_Status>')
    const result = mapInProfileResponseXml(xml)
    expect(result.accounts[0].lifecycleStatus).toBe('SETTLED')
  })

  it('CRITICAL (spec §3.5\'s own explicit rule): Written_off_Settled_Status=99 is NEVER adverse, even if an amount field disagrees (defensive/malformed-data case)', () => {
    let xml = withFirstAccountField('Written_Off_Amt_Total', '15000')
    xml = xml.replace(/<Written_off_Settled_Status>[^<]*<\/Written_off_Settled_Status>/, '<Written_off_Settled_Status>99</Written_off_Settled_Status>')
    const result = mapInProfileResponseXml(xml)
    expect(result.accounts[0].lifecycleStatus).not.toBe('WRITTEN_OFF')
  })

  it('a zero Written_Off_Amt_Total/Settlement_Amount never flags adverse (0 = none, per spec)', () => {
    const xml = withFirstAccountField('Written_Off_Amt_Total', '0')
    const result = mapInProfileResponseXml(xml)
    expect(result.accounts[0].lifecycleStatus).not.toBe('WRITTEN_OFF')
    expect(result.accounts[0].lifecycleStatus).not.toBe('SETTLED')
  })
})

describe('parseExperianDateTime', () => {
  it('parses a valid YYYYMMDD date with an HHMMSS time', () => {
    const date = parseExperianDateTime('20260930', '113635')
    expect(date?.toISOString()).toBe('2026-09-30T11:36:35.000Z')
  })

  it('defaults to midnight when the time component is missing', () => {
    const date = parseExperianDateTime('20260930', undefined)
    expect(date?.toISOString()).toBe('2026-09-30T00:00:00.000Z')
  })

  it('returns null for a missing or malformed date rather than fabricating one', () => {
    expect(parseExperianDateTime(undefined, '113635')).toBeNull()
    expect(parseExperianDateTime('2026-09-30', '113635')).toBeNull()
    expect(parseExperianDateTime('', '113635')).toBeNull()
  })
})
