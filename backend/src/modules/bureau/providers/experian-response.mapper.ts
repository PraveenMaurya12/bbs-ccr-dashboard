import { XMLParser } from 'fast-xml-parser'

import type { BureauIdentity } from '../identity'
import {
  CreditReportMalformedResponseError,
  CreditReportUnmappedResponseError,
  type RawCreditAccount,
  type RawCreditEnquiry,
  type RawCreditReportData,
} from './credit-report-provider.interface'

/** Tag names that repeat per-tradeline/per-month/per-enquiry — always arrays even when a real response happens to contain exactly one, so mapping code below never has to branch on object-vs-array. */
const ALWAYS_ARRAY_TAGS = new Set(['CAIS_Account_DETAILS', 'CAIS_Account_History', 'CAPS_Application_Details'])

/**
 * Dedicated parser for the actual field-mapping step (distinct from the
 * generic structure-discovery parser in experian-credit-report.provider.ts)
 * — `parseTagValue: false` keeps every field a raw string, so mapping code
 * below converts exactly the fields it needs on its own terms, rather than
 * trusting fast-xml-parser's generic numeric-coercion heuristics (which
 * would silently mangle a value like ReportNumber or MobilePhoneNumber if
 * a future mapping ever needed it as an exact string). Same raised
 * entity-expansion cap as the other parsers in this module — confirmed
 * necessary against a real, large Experian response (see
 * experian-soap-client.ts's own comment).
 */
const mappingParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  isArray: (name) => ALWAYS_ARRAY_TAGS.has(name),
  processEntities: { enabled: true, maxTotalExpansions: 200_000, maxExpandedLength: 5_000_000 },
})

/**
 * The only INProfileResponse top-level sections a real, captured Experian
 * response has ever been verified to contain (see
 * fixtures/in-profile-response.no-record-found.xml, captured 2026-09-30
 * via the dev-only capture test against the live production endpoint for
 * a deliberately-fake test identity that has no bureau record). If a real
 * response ever contains anything else — most importantly a tradeline
 * list or enquiry list, whatever their real tag name turns out to be —
 * this mapper refuses to guess at it and throws
 * CreditReportUnmappedResponseError instead of silently dropping data.
 */
const KNOWN_NO_RECORD_FOUND_KEYS = new Set([
  'Header',
  'UserMessage',
  'CreditProfileHeader',
  'Current_Application',
  'Match_result',
  'SCORE',
])

/**
 * The additional top-level sections a real, captured "matched identity"
 * Experian response has been verified to contain (see
 * fixtures/in-profile-response.matched-record.xml, captured 2026-09-30 via
 * the real public lead-submission flow). `CAPS` holds genuine credit-purpose
 * enquiries; `NonCreditCAPS` holds identity/eligibility-verification pulls
 * that are NOT credit enquiries — a distinction the response itself makes,
 * not one invented by this mapper (see mapMatchedRecord's enquiries below,
 * which deliberately reads only `CAPS`).
 */
const KNOWN_MATCHED_RECORD_KEYS = new Set([
  ...KNOWN_NO_RECORD_FOUND_KEYS,
  'CAIS_Account',
  'TotalCAPS_Summary',
  'CAPS',
  'NonCreditCAPS',
])

/** Mirrors src/features/leads/utils/leadDisplay.ts's `creditScoreTier` thresholds exactly, so a stored `scoreBand` never disagrees with what the frontend gauge would independently compute from the same score. */
/** Exported for reuse by other bureau-response mappers (e.g. signzy-response.mapper.ts) that also need to band a real numeric score — the thresholds themselves are not Experian-specific. */
export function scoreBandForScore(score: number): string {
  if (score >= 700) return 'good'
  if (score >= 550) return 'fair'
  return 'poor'
}

function parseAmount(value: string | undefined): number {
  if (!value) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function parseAmountOrNull(value: string | undefined): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseIntOrNull(value: string | undefined): number | null {
  if (value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/**
 * Standard 30/60/90-day-past-due bucketing for a monthly payment-history
 * grid — this is a generic day-count bucketing convention, not a bureau-
 * proprietary code being decoded, so implementing it directly (rather than
 * needing a verified Experian reference) is safe. Matches the bucket
 * vocabulary `repaymentBehavior` in debt-analysis.calculations.ts already
 * consumes ('0' | '30' | '60' | '90+').
 */
function dpdBucket(dpd: number): '0' | '30' | '60' | '90+' {
  if (dpd < 30) return '0'
  if (dpd < 60) return '30'
  if (dpd < 90) return '60'
  return '90+'
}

interface ParsedCaisAccountHistory {
  Year?: string
  Month?: string
  Days_Past_Due?: string
}

interface ParsedCaisAccountDetails {
  Subscriber_Name?: string
  Account_Type?: string
  Open_Date?: string
  Credit_Limit_Amount?: string
  Highest_Credit_or_Original_Loan_Amount?: string
  Scheduled_Monthly_Payment_Amount?: string
  Current_Balance?: string
  Amount_Past_Due?: string
  Date_Closed?: string
  CAIS_Account_History?: ParsedCaisAccountHistory[]
  // v3.0 spec §3.3/§3.5 — confirmed present in the real captured fixture
  // (in-profile-response.matched-record.xml: 2 of 33 accounts carry
  // Written_off_Settled_Status="99" i.e. "Clear Existing Status";
  // Settlement_Amount/Written_Off_Amt_* are "0" when present on the rest).
  // No real example of a genuinely adverse value has been captured yet,
  // but the safe values (blank/0/99) are spec-confirmed, not guessed.
  Written_off_Settled_Status?: string
  Settlement_Amount?: string
  Written_Off_Amt_Principal?: string
  Written_Off_Amt_Total?: string
}

interface ParsedCaisAccount {
  CAIS_Summary?: {
    Credit_Account?: {
      CreditAccountActive?: string
      CreditAccountDefault?: string
    }
    Total_Outstanding_Balance?: {
      Outstanding_Balance_All?: string
    }
  }
  CAIS_Account_DETAILS?: ParsedCaisAccountDetails[]
}

interface ParsedCapsApplicationDetails {
  Subscriber_Name?: string
  Date_of_Request?: string
  Enquiry_Reason?: string
}

interface ParsedCaps {
  CAPS_Application_Details?: ParsedCapsApplicationDetails[]
}

/**
 * Builds one normalized tradeline from a real `CAIS_Account_DETAILS` entry.
 *
 * Fields deliberately NOT decoded/derived (left at their safe default)
 * because no real captured response has ever shown a non-blank value to
 * verify a code table against — guessing bureau-proprietary code semantics
 * is exactly what this integration refuses to do elsewhere (see
 * `accountType` below, which stores Experian's raw `Account_Type` code
 * rather than an invented label for the same reason):
 * - `accountType`: raw Experian code, not decoded to a label.
 * - `isSecured`: `Type_of_Collateral`/`Value_of_Collateral` are blank or
 *   ambiguous ("00"/"0") in every captured account — not enough to
 *   distinguish secured from unsecured with confidence.
 * - `lifecycleStatus`: ACTIVE/CLOSED are derived from whether `Date_Closed`
 *   is present (verified against this response's own
 *   `CreditAccountActive`/`CreditAccountClosed` aggregate counts, which
 *   matched exactly), then OVERRIDDEN to WRITTEN_OFF/SETTLED when the
 *   bureau's own `Written_Off_Amt_*`/`Settlement_Amount` fields confirm it
 *   (spec §3.3's own explicit "0 = none" rule — not a guess), with
 *   `Written_off_Settled_Status === 99` ("Clear Existing Status", spec
 *   §3.5) defensively forced to never count as adverse. Verified against
 *   the real captured fixture (fixtures/in-profile-response.matched-
 *   record.xml): 2 of 33 accounts carry code 99; every other account's
 *   amount fields are "0" when present — the real data never shows a
 *   genuinely adverse value yet, but the safe/zero/99 cases are
 *   spec-confirmed, not assumed. RESTRUCTURED/SUIT_FILED/ARC_ASSIGNED
 *   remain unmapped — `SuitFiledWillfulDefaultWrittenOffStatus`/
 *   `SuitFiled_WillfulDefault` give no code table and are blank on every
 *   account in the real fixture, so guessing their semantics would violate
 *   this file's own established discipline (see `accountType`/`isSecured`
 *   above for the same reasoning).
 */
function buildAccount(details: ParsedCaisAccountDetails): RawCreditAccount {
  const history = [...(details.CAIS_Account_History ?? [])]
    .filter((h) => h.Year && h.Month)
    .sort((a, b) => `${a.Year}${a.Month}`.localeCompare(`${b.Year}${b.Month}`))

  const latest = history.length > 0 ? history[history.length - 1] : undefined
  const currentDpdDays = latest ? parseIntOrNull(latest.Days_Past_Due) : null
  const dpdValues = history.map((h) => parseIntOrNull(h.Days_Past_Due)).filter((v): v is number => v !== null)
  const maxDpdDays = dpdValues.length > 0 ? Math.max(...dpdValues) : null

  const paymentHistoryGrid =
    history.length > 0
      ? history.map((h) => ({ month: `${h.Year}-${h.Month}`, dpdBucket: dpdBucket(parseIntOrNull(h.Days_Past_Due) ?? 0) }))
      : null

  const isClosed = Boolean(details.Date_Closed && details.Date_Closed.trim() !== '')
  // Same YYYYMMDD field used for the isClosed check above, now also parsed
  // into a real date — previously only its presence/absence was read.
  const closedOn = isClosed ? parseExperianDateTime(details.Date_Closed, undefined) : null

  // v3.0 spec §3.3/§3.5 — real adverse-status detection (see buildAccount's
  // own doc comment above for why this is safe, not a guess).
  const woSettledCode = parseIntOrNull(details.Written_off_Settled_Status)
  const isConfirmedClear = woSettledCode === 99 // spec §3.5: "Clear Existing Status" — NEVER adverse, even if an amount field disagrees.
  const writtenOffAmount = Math.max(parseAmount(details.Written_Off_Amt_Principal), parseAmount(details.Written_Off_Amt_Total))
  const settlementAmount = parseAmount(details.Settlement_Amount)
  const isWrittenOff = !isConfirmedClear && writtenOffAmount > 0
  const isSettled = !isConfirmedClear && !isWrittenOff && settlementAmount > 0
  const lifecycleStatus = isWrittenOff ? 'WRITTEN_OFF' : isSettled ? 'SETTLED' : isClosed ? 'CLOSED' : 'ACTIVE'

  return {
    accountType: details.Account_Type || 'UNKNOWN',
    lender: details.Subscriber_Name?.trim() || 'Unknown lender',
    openedOn: parseExperianDateTime(details.Open_Date, undefined) ?? new Date(0),
    sanctionedAmount: parseAmount(details.Highest_Credit_or_Original_Loan_Amount),
    currentBalance: parseAmount(details.Current_Balance),
    paymentStatus: currentDpdDays !== null && currentDpdDays > 0 ? 'DELINQUENT' : 'CURRENT',
    overdueAmount: parseAmount(details.Amount_Past_Due),
    currentDpdDays,
    maxDpdDays,
    monthlyEmiAmount: parseAmountOrNull(details.Scheduled_Monthly_Payment_Amount),
    creditLimit: parseAmountOrNull(details.Credit_Limit_Amount),
    isSecured: null,
    lifecycleStatus,
    closedOn,
    paymentHistoryGrid,
  }
}

/**
 * Builds one enquiry from a real `CAPS.CAPS_Application_Details` entry.
 * Deliberately reads only `CAPS` (genuine credit-purpose enquiries), never
 * `NonCreditCAPS` (identity/eligibility-verification pulls) — the response
 * itself separates these into two differently-named sections with their
 * own recency summaries, so treating only `CAPS` as "credit enquiries" is
 * the structure's own distinction, not an invented filter.
 */
function buildEnquiry(detail: ParsedCapsApplicationDetails): RawCreditEnquiry {
  return {
    enquiryDate: parseExperianDateTime(detail.Date_of_Request, undefined) ?? new Date(0),
    // Raw Experian `Enquiry_Reason` code, not decoded to a label — same
    // reasoning as `accountType` above.
    purpose: detail.Enquiry_Reason || 'UNKNOWN',
    memberName: detail.Subscriber_Name?.trim() || 'Unknown lender',
  }
}

/**
 * Maps the "matched identity, real bureau record" shape — verified against
 * one real captured response (Exact_match: 'Y', a real positive
 * BureauScore, and the CAIS_Account/CAPS/NonCreditCAPS sections present).
 */
function mapMatchedRecord(root: Record<string, unknown>, bureauScore: number): RawCreditReportData {
  const header = root.CreditProfileHeader as ParsedCreditProfileHeader | undefined
  const pulledAt = parseExperianDateTime(header?.ReportDate, header?.ReportTime) ?? new Date()

  const caisAccount = root.CAIS_Account as ParsedCaisAccount | undefined
  const accountDetails = caisAccount?.CAIS_Account_DETAILS ?? []
  const accounts = accountDetails.map(buildAccount)

  const caps = root.CAPS as ParsedCaps | undefined
  const enquiries = (caps?.CAPS_Application_Details ?? []).map(buildEnquiry)

  const summaryCreditAccount = caisAccount?.CAIS_Summary?.Credit_Account
  const summaryOutstanding = caisAccount?.CAIS_Summary?.Total_Outstanding_Balance
  // Bureau-reported aggregates, used directly rather than re-derived from
  // the tradeline list — these are the bureau's own summary counts, and
  // matched this response's own per-account Date_Closed-derived
  // active/closed split exactly when verified.
  const totalActiveAccounts = parseIntOrNull(summaryCreditAccount?.CreditAccountActive) ?? accounts.filter((a) => a.lifecycleStatus === 'ACTIVE').length
  const totalOutstandingBalance = parseAmount(summaryOutstanding?.Outstanding_Balance_All)
  const delinquentAccounts = accounts.filter((a) => a.overdueAmount > 0).length

  return {
    bureau: 'Experian',
    // Overwritten by the caller (mapInProfileResponseXml) with a masked
    // identifier built from the mobile number used to identify this lead —
    // deliberately NOT the real, unmasked PAN Experian's own historical
    // CAIS_Holder_ID_Details records return for this identity (as reported
    // by past lenders); this integration never queries or stores a raw PAN
    // at all (see PublicContactService.hashPan).
    maskedIdNumber: 'N/A',
    pulledAt,
    creditScore: bureauScore,
    scoreBand: scoreBandForScore(bureauScore),
    totalActiveAccounts,
    totalOutstandingBalance,
    delinquentAccounts,
    // No real captured response has shown a non-blank
    // `SuitFiled_WillfulDefault` value to verify what it means — left
    // unreported rather than guessed (see buildAccount's own doc comment).
    willfulDefaultFlag: null,
    accounts,
    enquiries,
  }
}

/** Experian's `ReportDate`/`ReportTime` are separate `YYYYMMDD`/`HHMMSS` strings — verified from the same captured response. */
export function parseExperianDateTime(dateStr: string | undefined, timeStr: string | undefined): Date | null {
  if (!dateStr || dateStr.length !== 8 || !/^\d{8}$/.test(dateStr)) return null
  const year = Number(dateStr.slice(0, 4))
  const month = Number(dateStr.slice(4, 6))
  const day = Number(dateStr.slice(6, 8))

  let hour = 0
  let minute = 0
  let second = 0
  if (timeStr && /^\d{6}$/.test(timeStr)) {
    hour = Number(timeStr.slice(0, 2))
    minute = Number(timeStr.slice(2, 4))
    second = Number(timeStr.slice(4, 6))
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return Number.isNaN(date.getTime()) ? null : date
}

interface ParsedMatchResult {
  Exact_match?: string
}

interface ParsedScore {
  BureauScore?: string
  BureauScoreConfidLevel?: string
}

interface ParsedCreditProfileHeader {
  ReportDate?: string
  ReportTime?: string
}

/**
 * Maps a real Experian `INProfileResponse` XML payload into
 * `RawCreditReportData`.
 *
 * Two real response shapes have been captured and verified so far:
 * 1. "No bureau record found for this identity" — a genuine, common,
 *    actionable bureau answer (many applicants are "thin file" / have no
 *    credit history yet), mapped to a COMPLETED report with
 *    `creditScore: null` and `scoreBand: 'not_found'`.
 * 2. "Matched identity, real bureau record" — a real tradeline/enquiry
 *    history, mapped via `mapMatchedRecord` above.
 *
 * Any other response shape has NOT been captured or verified yet. Rather
 * than guess field names for it, this function throws
 * `CreditReportUnmappedResponseError` so the raw response is preserved for
 * a future mapper fix (see BureauReportService.reprocessStoredResponse).
 *
 * `identity` is optional and only used to build a masked identifier (never
 * a raw PAN/Aadhaar — this integration never sends or stores real PAN, see
 * PublicContactService.hashPan) for a matched record; omitted for the
 * "no record found" case, which has nothing real to mask.
 */
export function mapInProfileResponseXml(innerPayload: string, identity?: BureauIdentity): RawCreditReportData {
  let parsed: Record<string, unknown>
  try {
    parsed = mappingParser.parse(innerPayload) as Record<string, unknown>
  } catch (error) {
    throw new CreditReportMalformedResponseError(
      `Experian inner payload was not valid XML: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const root = parsed.INProfileResponse as Record<string, unknown> | undefined
  if (!root || typeof root !== 'object') {
    throw new CreditReportUnmappedResponseError(
      `Experian response root was not INProfileResponse. Top-level element(s) found: ${Object.keys(parsed).join(', ') || '(none)'}.`,
    )
  }

  const matchResult = root.Match_result as ParsedMatchResult | undefined
  const score = root.SCORE as ParsedScore | undefined
  const bureauScoreRaw = score?.BureauScore

  const noRecordExtraKeys = Object.keys(root).filter((key) => !KNOWN_NO_RECORD_FOUND_KEYS.has(key))
  const isVerifiedNoRecordFoundShape =
    noRecordExtraKeys.length === 0 && matchResult?.Exact_match === 'N' && bureauScoreRaw === '-1'

  if (isVerifiedNoRecordFoundShape) {
    const header = root.CreditProfileHeader as ParsedCreditProfileHeader | undefined
    const pulledAt = parseExperianDateTime(header?.ReportDate, header?.ReportTime) ?? new Date()

    return {
      bureau: 'Experian',
      // No real masked ID exists to show — this response never matched any
      // bureau record, so there is genuinely nothing to mask, unlike a
      // real matched report's masked identifier.
      maskedIdNumber: 'N/A — no bureau record found',
      pulledAt,
      creditScore: null,
      scoreBand: 'not_found',
      totalActiveAccounts: 0,
      totalOutstandingBalance: 0,
      delinquentAccounts: 0,
      willfulDefaultFlag: null,
      accounts: [],
      enquiries: [],
    }
  }

  const matchedExtraKeys = Object.keys(root).filter((key) => !KNOWN_MATCHED_RECORD_KEYS.has(key))
  const parsedScore = parseIntOrNull(bureauScoreRaw)
  const isVerifiedMatchedRecordShape =
    matchedExtraKeys.length === 0 && matchResult?.Exact_match === 'Y' && parsedScore !== null && parsedScore > 0

  if (isVerifiedMatchedRecordShape) {
    const maskedIdNumber = identity ? `XXXX-XXXX-${identity.mobilePhone.slice(-4)}` : 'N/A'
    return { ...mapMatchedRecord(root, parsedScore!), maskedIdNumber }
  }

  throw new CreditReportUnmappedResponseError(
    'Experian returned a response shape beyond the two verified cases this integration maps ' +
      '("no bureau record found" and "matched identity with real tradeline/enquiry data"). ' +
      `Extra top-level keys beyond the no-record shape: ${noRecordExtraKeys.join(', ') || '(none)'}. ` +
      `Extra top-level keys beyond the matched-record shape: ${matchedExtraKeys.join(', ') || '(none)'}. ` +
      `Match_result.Exact_match: ${matchResult?.Exact_match ?? '(missing)'}. ` +
      `SCORE.BureauScore: ${bureauScoreRaw ?? '(missing)'}.`,
  )
}
