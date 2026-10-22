import type { BureauIdentity } from '../identity'

/** One normalized tradeline — mirrors CreditAccount's own new fields exactly (see prisma/schema.prisma). */
export interface RawCreditAccount {
  accountType: string
  lender: string
  openedOn: Date
  sanctionedAmount: number
  currentBalance: number
  paymentStatus: string
  overdueAmount: number
  currentDpdDays: number | null
  maxDpdDays: number | null
  monthlyEmiAmount: number | null
  creditLimit: number | null
  isSecured: boolean | null
  lifecycleStatus: string | null
  /** The bureau's own account-closure date, when reported — null for a still-open account or when the raw response simply doesn't carry one. */
  closedOn: Date | null
  paymentHistoryGrid: Array<{ month: string; dpdBucket: '0' | '30' | '60' | '90+' }> | null
}

export interface RawCreditEnquiry {
  enquiryDate: Date
  purpose: string
  memberName: string
}

/** The normalized shape every CreditReportProvider implementation must produce, regardless of the bureau behind it. */
export interface RawCreditReportData {
  bureau: string
  maskedIdNumber: string
  pulledAt: Date
  // null for a verified real case: the bureau reports no record found for
  // this identity (INProfileResponse.SCORE.BureauScore = -1) — never a
  // fabricated placeholder number.
  creditScore: number | null
  scoreBand: string
  totalActiveAccounts: number
  totalOutstandingBalance: number
  delinquentAccounts: number
  willfulDefaultFlag: boolean | null
  accounts: RawCreditAccount[]
  enquiries: RawCreditEnquiry[]
}

export interface FetchReportResult {
  data: RawCreditReportData
  /**
   * The real inner-payload response text, when one was actually received
   * (null for a provider — like the mock — with no real wire response).
   * Persisted verbatim so a future mapper fix can reprocess it without
   * ever calling the bureau again — see BureauReportService's one-call
   * business rule.
   */
  rawResponse: string | null
}

export interface CreditReportProvider {
  readonly providerName: string
  fetchReport(identity: BureauIdentity): Promise<FetchReportResult>
}

export const CREDIT_REPORT_PROVIDER = Symbol('CREDIT_REPORT_PROVIDER')

/** Base class for every error this integration can raise — lets BureauReportService catch-and-classify without string-matching messages. */
export abstract class CreditReportProviderError extends Error {
  abstract readonly code: string
}

export class CreditReportTimeoutError extends CreditReportProviderError {
  readonly code = 'BUREAU_TIMEOUT'
}

export class CreditReportTransportError extends CreditReportProviderError {
  readonly code = 'BUREAU_TRANSPORT_ERROR'
}

export class CreditReportSoapFaultError extends CreditReportProviderError {
  readonly code = 'BUREAU_SOAP_FAULT'
}

export class CreditReportMalformedResponseError extends CreditReportProviderError {
  readonly code = 'BUREAU_MALFORMED_RESPONSE'
}

/**
 * Thrown when the SOAP transport succeeded and returned what looks like a
 * real payload, but mapping it into `RawCreditReportData` requires field
 * names this codebase has never been given a verified sample for (see
 * ExperianCreditReportProvider's doc comment). Deliberately distinct from
 * CreditReportMalformedResponseError: the response wasn't garbage, we just
 * don't have an approved mapping for it yet.
 *
 * Carries the raw response text that triggered it — this is a REAL,
 * received response (unlike a transport failure, which has none), and per
 * the one-call-per-lead business rule it must be preserved so a developer
 * can fix the mapper and reprocess this exact response later, without
 * ever calling Experian again for this lead.
 */
export class CreditReportUnmappedResponseError extends CreditReportProviderError {
  readonly code = 'BUREAU_UNMAPPED_RESPONSE'
  rawResponse: string | null = null
}
