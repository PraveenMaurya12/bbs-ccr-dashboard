import type { BureauIdentity } from '../identity'
import {
  CreditReportMalformedResponseError,
  CreditReportUnmappedResponseError,
  type RawCreditAccount,
  type RawCreditEnquiry,
  type RawCreditReportData,
} from './credit-report-provider.interface'
import { scoreBandForScore } from './experian-response.mapper'

/**
 * Maps a real Signzy Experian Lite JSON response into `RawCreditReportData`.
 *
 * Every path read below is verified against one real captured response —
 * see fixtures/signzy-experian-lite-success.json (identity fields
 * redacted; every structural/financial value is real and unmodified),
 * captured 2026-09-30 via the real Signzy production endpoint for a real
 * BBS lead. ONLY the `Match_result.Exact_match === 'Y'` (matched-identity)
 * shape has ever been captured — Signzy's "no record found" response (or
 * any other shape) has never been seen, so this function deliberately
 * raises `CreditReportUnmappedResponseError` for anything else, preserving
 * the raw response for a developer to extend this mapper once a real
 * sample of that shape exists (see BureauReportService.reprocessStoredResponse).
 */

// --- Safe value normalization -------------------------------------------------
// Signzy's JSON mixes real numbers (Account_Type, Open_Date, Current_Balance),
// numeric strings with meaningful leading zeros (Terms_Duration), and the
// bureau's own "no data" markers (""/"?"/"????????"/"N") for the same kind
// of field depending on the account. These helpers exist specifically so
// none of those markers is ever silently coerced into a real 0/date/string.

function numOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * SIGNZY FIELD SEMANTIC AUDIT (targeted hardening pass) — every call site
 * of this function, field by field, against the one real captured
 * response (fixtures/signzy-experian-lite-success.json, 33 real accounts)
 * since no official Signzy/Experian field-semantics documentation exists
 * anywhere in this repo. Per that pass's own explicit instruction: no
 * broad replacement was made, and no field below was changed without
 * direct evidence — a field whose blank-case meaning can't be confirmed
 * one way or the other is left exactly as-is and marked SEMANTICALLY
 * UNVERIFIED rather than guessed at.
 *
 * - `Highest_Credit_or_Original_Loan_Amount` (per-account sanctionedAmount):
 *   CONFIRMED BLANK IN REAL DATA — exactly 1 of 33 real accounts (a
 *   CLOSED account of Account_Type 31, a type that occurs only once in
 *   this fixture) has this field blank. Whether blank means "genuinely
 *   not reported," "not applicable for this product type," or something
 *   else is SEMANTICALLY UNVERIFIED (no Experian Account_Type code table
 *   exists in this repo to interpret type 31). Left unchanged: a loud
 *   REQUIRES_REVIEW failure here would currently reject a real, valid,
 *   production report over one CLOSED account's one field — a worse
 *   outcome than the current (also imperfect) 0-default, given the
 *   account is closed and so doesn't feed any ACTIVE-account capacity
 *   calculation today.
 * - `Current_Balance`, `Amount_Past_Due` (per-account): NEVER observed
 *   blank across all 33 real accounts, including closed ones — e.g.
 *   Amount_Past_Due's real sample values are explicit "0"s (Signzy's own
 *   clear "no overdue" signal), not blanks. Blank-case semantics remain
 *   formally SEMANTICALLY UNVERIFIED (one fixture is not exhaustive
 *   proof), but empirical production risk is low.
 * - `CreditAccountActive`, `CreditAccountDefault`,
 *   `Outstanding_Balance_Secured`, `Outstanding_Balance_UnSecured`,
 *   `Outstanding_Balance_All` (report-level aggregates): NEVER observed
 *   blank in the one real fixture — all five are populated, including a
 *   real explicit "0" for Outstanding_Balance_Secured (confirming
 *   explicit zero is a real, legitimate bureau value here, not a stand-in
 *   for blank). SEMANTICALLY UNVERIFIED for a hypothetical blank case,
 *   same reasoning as above.
 *
 * See signzy-response.mapper.spec.ts's own "SIGNZY FIELD SEMANTIC AUDIT"
 * block for the fixture-level tests that lock in these confirmed
 * (non-)blank observations, so a future real response sample that
 * contradicts them is caught rather than silently assumed unchanged.
 */
function numOrZero(value: unknown): number {
  return numOrNull(value) ?? 0
}

function strOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return null
}

/** `value` is a real Date-bearing field only when it is an 8-digit YYYYMMDD number/string — Signzy uses "" for "not reported", never a fabricated date. */
function parseDateOnly(value: unknown): Date | null {
  const str = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^\d{8}$/.test(str)) return null
  const year = Number(str.slice(0, 4))
  const month = Number(str.slice(4, 6))
  const day = Number(str.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day))
  return Number.isNaN(date.getTime()) ? null : date
}

function parseDateTime(dateValue: unknown, timeValue: unknown): Date | null {
  const dateStr = typeof dateValue === 'number' ? String(dateValue) : typeof dateValue === 'string' ? dateValue.trim() : ''
  if (!/^\d{8}$/.test(dateStr)) return null
  const rawTime = typeof timeValue === 'number' ? String(timeValue).padStart(6, '0') : typeof timeValue === 'string' ? timeValue.trim() : ''

  const year = Number(dateStr.slice(0, 4))
  const month = Number(dateStr.slice(4, 6))
  const day = Number(dateStr.slice(6, 8))
  let hour = 0
  let minute = 0
  let second = 0
  if (/^\d{6}$/.test(rawTime)) {
    hour = Number(rawTime.slice(0, 2))
    minute = Number(rawTime.slice(2, 4))
    second = Number(rawTime.slice(4, 6))
  }
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Standard 30/60/90-day-past-due bucketing (generic day-count bucketing,
 * not a Signzy/Experian-proprietary code) — matches the bucket vocabulary
 * `repaymentBehavior` in debt-analysis.calculations.ts already consumes.
 */
function dpdBucket(dpd: number): '0' | '30' | '60' | '90+' {
  if (dpd < 30) return '0'
  if (dpd < 60) return '30'
  if (dpd < 90) return '60'
  return '90+'
}

/**
 * Whether every account in this report can be classified secured/unsecured
 * is only ever a FORCED deduction, never a guess: if the bureau's own
 * report-level total says one side of the split is exactly zero, then
 * (since individual amounts can't be negative) every account must fall on
 * the other side. When both totals are non-zero, there is genuinely no
 * verified per-account signal to attribute the split (no Type_of_Collateral
 * value has ever been captured with real per-account data) — this
 * deliberately returns null rather than guess a distribution.
 */
function inferIsSecuredForAllAccounts(securedTotal: number, unsecuredTotal: number): boolean | null {
  if (securedTotal === 0 && unsecuredTotal > 0) return false
  if (unsecuredTotal === 0 && securedTotal > 0) return true
  return null
}

interface ParsedHistoryEntry {
  Year?: number | string
  Month?: number | string
  Days_Past_Due?: number | string
}

interface ParsedAccountDetails {
  Subscriber_Name?: string
  Account_Type?: number | string
  accountTypeDescription?: string
  Open_Date?: number | string
  Credit_Limit_Amount?: number | string
  Highest_Credit_or_Original_Loan_Amount?: number | string
  Scheduled_Monthly_Payment_Amount?: number | string
  Account_Status?: number | string
  accountStatusDescription?: string
  Current_Balance?: number | string
  Amount_Past_Due?: number | string
  Date_Closed?: number | string
  CAIS_Account_History?: ParsedHistoryEntry[]
  // v3.0 spec §3.3/§3.5 — confirmed present with real values in the one
  // captured fixture (2 of 33 accounts carry wo="99"/"Clear Existing
  // Status"; Settlement_Amount/Written_Off_Amt_* are "0" when present on
  // the rest). No real example of a genuinely adverse (non-zero/non-99)
  // value has been captured yet, but the SAFE values (blank/0/99) are
  // spec-confirmed, not guessed — see buildAccount's own reasoning below.
  Written_off_Settled_Status?: number | string
  Settlement_Amount?: number | string
  Written_Off_Amt_Principal?: number | string
  Written_Off_Amt_Total?: number | string
}

/**
 * Builds one normalized tradeline from a real `CAIS_Account_DETAILS` entry.
 *
 * `accountType` uses Signzy's own `accountTypeDescription` (a real,
 * bureau-provided human-readable label like "PERSONAL LOAN"/"CREDIT CARD")
 * rather than decoding the raw `Account_Type` numeric code — unlike the
 * legacy Experian XML integration (which never received such a
 * description field and so had to leave the code undecoded), this is a
 * genuine improvement made possible by real, verified data, not a guess.
 *
 * `lifecycleStatus` uses `accountStatusDescription` directly ("ACTIVE"/
 * "CLOSED") — verified against this response's own header aggregate
 * (CreditAccountActive/CreditAccountClosed matched exactly: 5 accounts
 * say "ACTIVE", 28 say "CLOSED"). Any other value normalizes to null
 * rather than a guess. This is then OVERRIDDEN to 'WRITTEN_OFF'/'SETTLED'
 * when the bureau's own amount fields confirm it (spec §3.3's own explicit
 * rule: `Settlement_Amount`/`Written_Off_Amt_*` — "0 = no settlement/
 * write-off" — never a guessed code, an explicit documented bureau
 * convention), with `Written_off_Settled_Status === 99` ("Clear Existing
 * Status") defensively forced to never count as adverse even if an amount
 * field were ever non-zero alongside it (spec §3.5's own explicit rule).
 * SUIT_FILED/RESTRUCTURED/ARC_ASSIGNED remain unmapped — the bureau's own
 * `SuitFiledWillfulDefaultWrittenOffStatus`/`SuitFiled_WillfulDefault`
 * fields give no code table and have shown no non-blank example yet, so
 * guessing their semantics would violate this file's own established
 * discipline.
 *
 * CRITICAL: `currentDpdDays` is the LATEST month's `CAIS_Account_History`
 * entry, never the historical maximum — this fixture's real data has a
 * maxDpdDays of 27 (one account, one month, 2022-12) while every account's
 * *current* DPD is 0, and conflating the two would incorrectly label an
 * on-time borrower as currently delinquent.
 *
 * `closedOn` parses `Date_Closed` (same YYYYMMDD format as `Open_Date` —
 * confirmed present on every CLOSED account in this fixture, blank on every
 * ACTIVE one). This field was never captured before — only the derived
 * `lifecycleStatus` boolean was — so any account persisted before this
 * column existed has `closedOn: null` until its lead's report is
 * reprocessed, same as a genuinely still-open account; the Account Timeline
 * surfaces that ambiguity honestly rather than guessing.
 */
function buildAccount(details: ParsedAccountDetails, isSecured: boolean | null): RawCreditAccount {
  const history = [...(details.CAIS_Account_History ?? [])]
    .filter((h) => h.Year !== undefined && h.Year !== '' && h.Month !== undefined && h.Month !== '')
    .map((h) => ({
      month: `${h.Year}-${String(h.Month).padStart(2, '0')}`,
      dpd: numOrNull(h.Days_Past_Due),
    }))
    .sort((a, b) => a.month.localeCompare(b.month))

  const latest = history.length > 0 ? history[history.length - 1] : undefined
  const currentDpdDays = latest ? latest.dpd : null
  const dpdValues = history.map((h) => h.dpd).filter((v): v is number => v !== null)
  const maxDpdDays = dpdValues.length > 0 ? Math.max(...dpdValues) : null

  const paymentHistoryGrid =
    history.length > 0 ? history.map((h) => ({ month: h.month, dpdBucket: dpdBucket(h.dpd ?? 0) })) : null

  const openedOn = parseDateOnly(details.Open_Date)
  if (!openedOn) {
    // Every account in the one verified real response has a real Open_Date
    // — rather than fabricate a placeholder date for a genuinely missing
    // one, refuse the whole report so it can be reviewed instead.
    throw new CreditReportUnmappedResponseError(
      `Signzy account "${strOrNull(details.Subscriber_Name) ?? '(unknown lender)'}" had no parseable Open_Date.`,
    )
  }

  const baseLifecycleStatus =
    details.accountStatusDescription === 'ACTIVE'
      ? 'ACTIVE'
      : details.accountStatusDescription === 'CLOSED'
        ? 'CLOSED'
        : null

  // v3.0 spec §3.3/§3.5 — real adverse-status detection (see buildAccount's
  // own doc comment above for why this is safe, not a guess).
  const woSettledCode = numOrNull(details.Written_off_Settled_Status)
  const isConfirmedClear = woSettledCode === 99 // spec §3.5: "Clear Existing Status" — NEVER adverse, even if an amount field disagrees.
  const writtenOffAmount = Math.max(numOrZero(details.Written_Off_Amt_Principal), numOrZero(details.Written_Off_Amt_Total))
  const settlementAmount = numOrZero(details.Settlement_Amount)
  const isWrittenOff = !isConfirmedClear && writtenOffAmount > 0
  const isSettled = !isConfirmedClear && !isWrittenOff && settlementAmount > 0

  const lifecycleStatus = isWrittenOff ? 'WRITTEN_OFF' : isSettled ? 'SETTLED' : baseLifecycleStatus

  return {
    accountType: strOrNull(details.accountTypeDescription) ?? (details.Account_Type !== undefined ? String(details.Account_Type) : 'UNKNOWN'),
    lender: strOrNull(details.Subscriber_Name) ?? 'Unknown lender',
    openedOn,
    sanctionedAmount: numOrZero(details.Highest_Credit_or_Original_Loan_Amount),
    currentBalance: numOrZero(details.Current_Balance),
    // Arithmetic classification from the account's own real current DPD —
    // not a decode of any bureau-proprietary status code.
    paymentStatus: currentDpdDays !== null && currentDpdDays > 0 ? 'DELINQUENT' : 'CURRENT',
    overdueAmount: numOrZero(details.Amount_Past_Due),
    currentDpdDays,
    maxDpdDays,
    monthlyEmiAmount: numOrNull(details.Scheduled_Monthly_Payment_Amount),
    creditLimit: numOrNull(details.Credit_Limit_Amount),
    isSecured,
    lifecycleStatus,
    closedOn: parseDateOnly(details.Date_Closed),
    paymentHistoryGrid,
  }
}

interface ParsedCapsApplicationDetails {
  Subscriber_Name?: string
  Date_of_Request?: number | string
  Enquiry_Reason?: number | string
  enquiryReasonDescription?: string
}

/**
 * Builds one enquiry from a real `CAPS.CAPS_Application_Details` entry —
 * deliberately reads only `CAPS` (genuine credit-purpose enquiries), never
 * `NonCreditCAPS` (identity/eligibility-verification pulls), matching the
 * response's own structural distinction (see this file's module doc
 * comment and the equivalent decision already made for the legacy
 * Experian XML mapper). `purpose` uses the real `enquiryReasonDescription`
 * label rather than decoding the raw `Enquiry_Reason` code.
 */
function buildEnquiry(detail: ParsedCapsApplicationDetails): RawCreditEnquiry {
  const enquiryDate = parseDateOnly(detail.Date_of_Request)
  if (!enquiryDate) {
    throw new CreditReportUnmappedResponseError(
      `Signzy CAPS enquiry from "${strOrNull(detail.Subscriber_Name) ?? '(unknown lender)'}" had no parseable Date_of_Request.`,
    )
  }
  return {
    enquiryDate,
    purpose: strOrNull(detail.enquiryReasonDescription) ?? (detail.Enquiry_Reason !== undefined ? String(detail.Enquiry_Reason) : 'UNKNOWN'),
    memberName: strOrNull(detail.Subscriber_Name) ?? 'Unknown lender',
  }
}

export function mapSignzyExperianLiteResponse(rawJson: string, identity?: BureauIdentity): RawCreditReportData {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch (error) {
    throw new CreditReportMalformedResponseError(
      `Signzy response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const report = (parsed as { data?: { jsonExperianReport?: unknown } } | null)?.data?.jsonExperianReport as
    | Record<string, unknown>
    | undefined
  if (!report || typeof report !== 'object') {
    throw new CreditReportUnmappedResponseError(
      'Signzy response did not contain a data.jsonExperianReport object at the expected path.',
    )
  }

  const matchResult = report.Match_result as { Exact_match?: string } | undefined
  const exactMatch = matchResult?.Exact_match
  if (exactMatch !== 'Y') {
    // The only response shape ever captured and verified for this
    // integration has Exact_match === 'Y'. Any other value (a genuine
    // "no record" response, or anything else) has never been seen — refuse
    // to guess its structure rather than silently misclassify it.
    throw new CreditReportUnmappedResponseError(
      `Signzy jsonExperianReport.Match_result.Exact_match was "${exactMatch ?? '(missing)'}" — only the "Y" ` +
        '(matched identity) shape has been verified for this integration.',
    )
  }

  const scoreNode = report.SCORE as { FCIREXScore?: number | string } | undefined
  const creditScore = numOrNull(scoreNode?.FCIREXScore)
  if (creditScore === null) {
    throw new CreditReportUnmappedResponseError(
      'Signzy jsonExperianReport had Match_result.Exact_match "Y" but SCORE.FCIREXScore was missing or unparseable.',
    )
  }

  const header = report.CreditProfileHeader as { ReportDate?: number | string; ReportTime?: number | string } | undefined
  const pulledAt = parseDateTime(header?.ReportDate, header?.ReportTime) ?? new Date()

  const caisAccount = report.CAIS_Account as
    | {
        CAIS_Summary?: {
          Credit_Account?: { CreditAccountActive?: number | string; CreditAccountDefault?: number | string }
          Total_Outstanding_Balance?: { Outstanding_Balance_Secured?: number | string; Outstanding_Balance_UnSecured?: number | string; Outstanding_Balance_All?: number | string }
        }
        CAIS_Account_DETAILS?: unknown[]
      }
    | undefined

  const creditAccountSummary = caisAccount?.CAIS_Summary?.Credit_Account
  const outstandingSummary = caisAccount?.CAIS_Summary?.Total_Outstanding_Balance

  const securedTotal = numOrZero(outstandingSummary?.Outstanding_Balance_Secured)
  const unsecuredTotal = numOrZero(outstandingSummary?.Outstanding_Balance_UnSecured)
  const isSecuredForAllAccounts = inferIsSecuredForAllAccounts(securedTotal, unsecuredTotal)

  const accountDetails = Array.isArray(caisAccount?.CAIS_Account_DETAILS) ? caisAccount!.CAIS_Account_DETAILS! : []
  const accounts = accountDetails.map((d) => buildAccount(d as ParsedAccountDetails, isSecuredForAllAccounts))

  const capsNode = report.CAPS as { CAPS_Application_Details?: unknown[] } | undefined
  const capsDetails = Array.isArray(capsNode?.CAPS_Application_Details) ? capsNode!.CAPS_Application_Details! : []
  const enquiries = capsDetails.map((d) => buildEnquiry(d as ParsedCapsApplicationDetails))

  return {
    bureau: 'Signzy Experian Lite',
    maskedIdNumber: identity ? `XXXX-XXXX-${identity.mobilePhone.slice(-4)}` : 'N/A',
    pulledAt,
    creditScore,
    scoreBand: scoreBandForScore(creditScore),
    totalActiveAccounts: numOrZero(creditAccountSummary?.CreditAccountActive),
    totalOutstandingBalance: numOrZero(outstandingSummary?.Outstanding_Balance_All),
    delinquentAccounts: numOrZero(creditAccountSummary?.CreditAccountDefault),
    // No real captured response has shown a non-blank willful-default
    // indicator to verify what it means (see buildAccount's own reasoning
    // for isSecured) — left unreported rather than guessed.
    willfulDefaultFlag: null,
    accounts,
    enquiries,
  }
}
