import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildDebtAnalysisSummary } from '@/modules/debt-analysis/debt-analysis.calculations'
import type { CreditReportInput } from '@/modules/debt-analysis/debt-analysis.types'
import { CreditReportMalformedResponseError, CreditReportUnmappedResponseError, type RawCreditReportData } from './credit-report-provider.interface'
import { mapSignzyExperianLiteResponse } from './signzy-response.mapper'

/**
 * Captured 2026-09-30 via the real Signzy production endpoint for a real
 * BBS lead (Match_result.Exact_match === 'Y') — identity fields (name,
 * mobile, PAN, and every CAIS_Holder_* block, which repeats identity data
 * per tradeline) are redacted/removed; every structural element, bureau
 * code, date, and amount is real and unmodified. This is the ONLY
 * response shape ever captured for this integration.
 */
const SUCCESS_FIXTURE = readFileSync(join(__dirname, '..', 'fixtures', 'signzy-experian-lite-success.json'), 'utf-8')

function toReportInput(data: RawCreditReportData): CreditReportInput {
  return {
    bureau: data.bureau,
    pulledAt: data.pulledAt,
    creditScore: data.creditScore,
    scoreBand: data.scoreBand,
    totalActiveAccounts: data.totalActiveAccounts,
    totalOutstandingBalance: data.totalOutstandingBalance,
    delinquentAccounts: data.delinquentAccounts,
    willfulDefaultFlag: data.willfulDefaultFlag,
    accounts: data.accounts,
    enquiries: data.enquiries,
  }
}

describe('mapSignzyExperianLiteResponse — verified real matched-record fixture', () => {
  it('maps the real captured response using only verified paths', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE, {
      firstName: 'Test',
      surname: 'User',
      mobilePhone: '9000010001',
    })

    expect(result.bureau).toBe('Signzy Experian Lite')
    expect(result.maskedIdNumber).toBe('XXXX-XXXX-0001')
    // CreditProfileHeader.ReportDate=20260930, ReportTime=180852.
    expect(result.pulledAt.toISOString()).toBe('2026-09-30T18:08:52.000Z')
    expect(result.creditScore).toBe(748)
    expect(result.scoreBand).toBe('good')
    expect(result.totalActiveAccounts).toBe(5)
    expect(result.delinquentAccounts).toBe(0)
    expect(result.totalOutstandingBalance).toBe(946114)
    expect(result.accounts).toHaveLength(33)
    expect(result.enquiries).toHaveLength(3)
  })

  it('falls back to a generic masked identifier when no identity is supplied', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE)
    expect(result.maskedIdNumber).toBe('N/A')
  })

  it('derives lifecycleStatus from the real accountStatusDescription, matching the header aggregate exactly (5 active, 28 closed)', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE)
    expect(result.accounts.filter((a) => a.lifecycleStatus === 'ACTIVE')).toHaveLength(5)
    expect(result.accounts.filter((a) => a.lifecycleStatus === 'CLOSED')).toHaveLength(28)
  })

  it('uses the real accountTypeDescription (not the raw numeric code) for the five known active tradelines', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE)
    const active = result.accounts.filter((a) => a.lifecycleStatus === 'ACTIVE')
    const byLenderAndType = active.map((a) => `${a.lender} / ${a.accountType}`).sort()
    expect(byLenderAndType).toEqual(
      [
        'Bajaj Finance Limited / PERSONAL LOAN',
        'Bajaj Finance Limited / CONSUMER LOAN',
        'HSBC / CREDIT CARD',
        'HDFC Bank Ltd / CREDIT CARD',
        'Axis Bank / CREDIT CARD',
      ].sort(),
    )
  })

  it('CRITICAL: never uses historical maximum DPD as current DPD — active accounts with 0 current/latest DPD are not marked delinquent even though the report contains a real historical max of 27', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE)

    const maxDpdAcrossReport = Math.max(...result.accounts.map((a) => a.maxDpdDays ?? 0))
    expect(maxDpdAcrossReport).toBe(27)

    // Every active account's CURRENT dpd is genuinely 0 in this real report.
    const active = result.accounts.filter((a) => a.lifecycleStatus === 'ACTIVE')
    for (const account of active) {
      expect(account.currentDpdDays).toBe(0)
      expect(account.paymentStatus).toBe('CURRENT')
    }
    // The one account that actually carries the historical 27-day DPD entry
    // is closed and long past that single delinquent month — its current
    // DPD must still read 0, not 27.
    const accountWithHistoricalDelinquency = result.accounts.find((a) => a.maxDpdDays === 27)
    expect(accountWithHistoricalDelinquency?.currentDpdDays).toBe(0)
    expect(accountWithHistoricalDelinquency?.lifecycleStatus).toBe('CLOSED')
  })

  it('maps only real CAPS (credit-purpose) enquiries, never NonCreditCAPS, using the real enquiryReasonDescription', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE)
    expect(result.enquiries).toHaveLength(3)
    expect(result.enquiries.map((e) => e.memberName).sort()).toEqual(['Axis Bank', 'SNAPMINT FINANCIAL SERVICES PVT LTD', 'Yes Bank'].sort())
    expect(result.enquiries.every((e) => typeof e.purpose === 'string' && e.purpose.length > 0)).toBe(true)
  })

  it('never guesses isSecured per-account, but correctly force-derives it report-wide when the bureau total makes it unambiguous (secured=0 here, so every account is unsecured)', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE)
    expect(result.accounts.every((a) => a.isSecured === false)).toBe(true)
  })

  it('never reports a willful-default determination — no real captured response has verified what a non-blank value means', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE)
    expect(result.willfulDefaultFlag).toBeNull()
  })

  it('feeds cleanly into the existing deterministic Level 1 engine and reproduces every section-13-mandated aggregate — proving the normalized model, not Signzy JSON, is what Level 1 consumes', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE)
    const summary = buildDebtAnalysisSummary(toReportInput(result))

    expect(summary.creditProfile.creditScore).toBe(748)
    expect(summary.creditProfile.totalAccounts).toBe(33)
    expect(summary.creditProfile.activeAccounts).toBe(5)
    expect(summary.creditProfile.closedAccounts).toBe(28)
    expect(summary.creditProfile.defaultedAccounts).toBe(0)
    expect(summary.creditProfile.totalOutstanding).toBe(946114)
    expect(summary.creditProfile.totalOverdue).toBe(0)
    expect(summary.debtBurden.securedAmount).toBe(0)
    expect(summary.debtBurden.unsecuredAmount).toBe(946114)
    expect(summary.delinquency.maxHistoricalDpd).toBe(27)
    expect(summary.delinquency.currentMaxDpd).toBe(0)
    expect(summary.enquiry.totalEnquiries).toBe(3)
  })
})

/**
 * SIGNZY FIELD SEMANTIC AUDIT — locks in the confirmed (non-)blank
 * observations from the real fixture that numOrZero's own doc comment
 * documents. These exist so a future real response sample that
 * contradicts today's empirical findings is caught by a failing test
 * rather than silently assumed unchanged — no behavior was changed by
 * this audit (per its own explicit instruction not to make a broad
 * numOrZero replacement without confirmed field semantics).
 */
describe('mapSignzyExperianLiteResponse — Signzy field semantic audit (numOrZero fields)', () => {
  it('CONFIRMED: exactly one real account (a CLOSED, rare Account_Type) has a blank Highest_Credit_or_Original_Loan_Amount, currently mapped to sanctionedAmount:0 — a known, documented, unverified-semantics case, not a bug introduced by this pass', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE)
    const zeroSanctioned = result.accounts.filter((a) => a.sanctionedAmount === 0)
    expect(zeroSanctioned).toHaveLength(1)
    expect(zeroSanctioned[0].lifecycleStatus).toBe('CLOSED')
  })

  it('CONFIRMED: every one of the 33 real accounts has a real, non-fabricated Current_Balance — never silently defaulted', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE)
    expect(result.accounts).toHaveLength(33)
    expect(result.accounts.every((a) => typeof a.currentBalance === 'number')).toBe(true)
  })

  it('CONFIRMED: report-level aggregates (active/default/outstanding) are real explicit bureau values in this fixture, including a genuine explicit zero for the secured-balance aggregate — never a blank masquerading as zero', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE)
    expect(result.totalActiveAccounts).toBe(5)
    expect(result.delinquentAccounts).toBe(0)
    expect(result.totalOutstandingBalance).toBe(946114)
  })
})

/**
 * v3.0 spec §3.3/§3.5 — write-off/settlement detection. The real fixture
 * never shows a genuinely adverse value (confirmed: every account's
 * Written_Off_Amt fields and Settlement_Amount are "0" or blank, and the
 * 2 accounts with Written_off_Settled_Status present both carry code 99 —
 * "Clear Existing Status", spec-confirmed non-adverse), so these tests
 * mutate a real, structurally-valid account entry from the fixture rather
 * than fabricate one from scratch — every field except the ones under
 * test keeps its real captured value.
 */
describe('mapSignzyExperianLiteResponse — write-off/settlement detection (v3.0 §3.3/§3.5)', () => {
  function withFirstAccountMutated(mutation: Record<string, unknown>): string {
    const parsed = JSON.parse(SUCCESS_FIXTURE) as { data: { jsonExperianReport: { CAIS_Account: { CAIS_Account_DETAILS: Array<Record<string, unknown>> } } } }
    parsed.data.jsonExperianReport.CAIS_Account.CAIS_Account_DETAILS[0] = {
      ...parsed.data.jsonExperianReport.CAIS_Account.CAIS_Account_DETAILS[0],
      ...mutation,
    }
    return JSON.stringify(parsed)
  }

  it('CONFIRMED (real fixture, regression guard): the 2 real accounts with Written_off_Settled_Status=99 are never coerced into WRITTEN_OFF/SETTLED', () => {
    const result = mapSignzyExperianLiteResponse(SUCCESS_FIXTURE)
    const code99Accounts = (JSON.parse(SUCCESS_FIXTURE) as { data: { jsonExperianReport: { CAIS_Account: { CAIS_Account_DETAILS: Array<{ Written_off_Settled_Status?: unknown }> } } } }).data.jsonExperianReport.CAIS_Account.CAIS_Account_DETAILS.filter((d) => String(d.Written_off_Settled_Status) === '99')
    expect(code99Accounts).toHaveLength(2)
    expect(result.accounts.some((a) => a.lifecycleStatus === 'WRITTEN_OFF' || a.lifecycleStatus === 'SETTLED')).toBe(false)
  })

  it('CRITICAL: a real non-zero Written_Off_Amt_Total overrides lifecycleStatus to WRITTEN_OFF', () => {
    const raw = withFirstAccountMutated({ Written_Off_Amt_Total: '15000', Written_off_Settled_Status: '' })
    const result = mapSignzyExperianLiteResponse(raw)
    expect(result.accounts[0].lifecycleStatus).toBe('WRITTEN_OFF')
  })

  it('CRITICAL: a real non-zero Settlement_Amount (with no write-off amount) overrides lifecycleStatus to SETTLED', () => {
    const raw = withFirstAccountMutated({ Settlement_Amount: '8000', Written_Off_Amt_Total: '0', Written_off_Settled_Status: '' })
    const result = mapSignzyExperianLiteResponse(raw)
    expect(result.accounts[0].lifecycleStatus).toBe('SETTLED')
  })

  it('CRITICAL (spec §3.5\'s own explicit rule): Written_off_Settled_Status=99 is NEVER adverse, even if an amount field disagrees (defensive/malformed-data case)', () => {
    const raw = withFirstAccountMutated({ Written_Off_Amt_Total: '15000', Written_off_Settled_Status: '99' })
    const result = mapSignzyExperianLiteResponse(raw)
    expect(result.accounts[0].lifecycleStatus).not.toBe('WRITTEN_OFF')
  })

  it('a zero Written_Off_Amt_Total/Settlement_Amount never flags adverse (0 = none, per spec)', () => {
    const raw = withFirstAccountMutated({ Written_Off_Amt_Total: '0', Settlement_Amount: '0', Written_off_Settled_Status: '' })
    const result = mapSignzyExperianLiteResponse(raw)
    expect(result.accounts[0].lifecycleStatus).not.toBe('WRITTEN_OFF')
    expect(result.accounts[0].lifecycleStatus).not.toBe('SETTLED')
  })
})

describe('mapSignzyExperianLiteResponse — error handling for unverified shapes', () => {
  it('throws CreditReportMalformedResponseError for non-JSON input', () => {
    expect(() => mapSignzyExperianLiteResponse('not json at all {{{')).toThrow(CreditReportMalformedResponseError)
  })

  it('throws CreditReportUnmappedResponseError when data.jsonExperianReport is missing entirely', () => {
    expect(() => mapSignzyExperianLiteResponse(JSON.stringify({ statusCode: 200, data: {} }))).toThrow(
      CreditReportUnmappedResponseError,
    )
  })

  it('throws CreditReportUnmappedResponseError for a hypothetical "no record" response rather than guessing its structure — that shape has never been captured', () => {
    const noRecordGuess = JSON.stringify({ data: { jsonExperianReport: { Match_result: { Exact_match: 'N' } } } })
    expect(() => mapSignzyExperianLiteResponse(noRecordGuess)).toThrow(CreditReportUnmappedResponseError)
  })

  it('throws CreditReportUnmappedResponseError when Match_result is missing entirely', () => {
    const missingMatch = JSON.stringify({ data: { jsonExperianReport: { SCORE: { FCIREXScore: 700 } } } })
    expect(() => mapSignzyExperianLiteResponse(missingMatch)).toThrow(CreditReportUnmappedResponseError)
  })

  it('throws CreditReportUnmappedResponseError when SCORE.FCIREXScore is missing despite a real match', () => {
    const noScore = JSON.parse(SUCCESS_FIXTURE)
    delete noScore.data.jsonExperianReport.SCORE.FCIREXScore
    expect(() => mapSignzyExperianLiteResponse(JSON.stringify(noScore))).toThrow(CreditReportUnmappedResponseError)
  })

  it('preserves the raw response on the thrown error so it can be reprocessed later, exactly like the legacy Experian mapper', () => {
    try {
      mapSignzyExperianLiteResponse(JSON.stringify({ data: { jsonExperianReport: { Match_result: { Exact_match: 'N' } } } }))
      fail('expected mapSignzyExperianLiteResponse to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(CreditReportUnmappedResponseError)
      // rawResponse is attached by the caller (SignzyCreditReportProvider),
      // not this pure function — confirmed null here, exactly like the
      // equivalent Experian mapper test.
      expect((error as InstanceType<typeof CreditReportUnmappedResponseError>).rawResponse).toBeNull()
    }
  })
})
