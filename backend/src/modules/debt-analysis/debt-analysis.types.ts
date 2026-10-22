/**
 * Plain, Prisma-independent shapes for the pure calculation functions in
 * debt-analysis.calculations.ts — Decimal columns arrive as `number` (the
 * service layer converts via `.toNumber()` at the boundary) so the
 * calculations can be unit-tested with plain object literals, no Prisma
 * client/Decimal import required.
 */
export interface CreditAccountInput {
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
  /** The bureau's own closure date — null for a still-open account, or for any account persisted before this column existed (see CreditAccount.closedOn's own schema doc comment). */
  closedOn: Date | null
  paymentHistoryGrid: PaymentHistoryEntry[] | null
}

export interface PaymentHistoryEntry {
  month: string // "YYYY-MM"
  dpdBucket: '0' | '30' | '60' | '90+'
}

export interface CreditEnquiryInput {
  enquiryDate: Date
  purpose: string
  memberName: string
}

export interface CreditReportInput {
  bureau: string
  pulledAt: Date
  /** null for a verified real "no bureau record found for this identity" response — never a fabricated placeholder. */
  creditScore: number | null
  scoreBand: string
  totalActiveAccounts: number
  totalOutstandingBalance: number
  delinquentAccounts: number
  willfulDefaultFlag: boolean | null
  accounts: CreditAccountInput[]
  enquiries: CreditEnquiryInput[]
}

/**
 * Data-availability states added for the BBS Debt Analysis Module rebuild
 * (see BBS_Debt_Analysis_Module.pdf, Rule 18 and the Data Integrity Rules).
 * Used ONLY by fields introduced in that rebuild — every field that existed
 * before it keeps its original `available: boolean` convention unchanged,
 * so nothing already consuming this module breaks.
 * - AVAILABLE: the underlying data needed was actually present.
 * - NOT_REPORTED: the data could exist but neither the bureau nor BBS's own
 *   records reported it for this lead (e.g. no income on file).
 * - NOT_APPLICABLE: this metric cannot exist for this integration today
 *   (e.g. bank-statement cross-check with no ingestion pipeline).
 * - INSUFFICIENT_DATA: some data exists but not enough to calculate a
 *   meaningful result (e.g. trajectory needs 2+ report snapshots; BBS only
 *   ever stores one per lead).
 */
export type DataAvailability = 'AVAILABLE' | 'NOT_REPORTED' | 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA'

export type Severity = 'High' | 'Medium' | 'Low'

/**
 * `evidence` carries the actual real number(s) the flag's condition was
 * evaluated against (not a re-derivation of `detail`'s formatted string —
 * the same source values, structured for a consumer that needs to reason
 * about them programmatically, e.g. the CCR Call Brief). `source` is
 * always 'deterministic': every risk signal in this codebase comes from
 * this file's own threshold checks, never from Gemini or any other
 * inferred process.
 */
export interface RiskFlag {
  key: string
  label: string
  severity: Severity
  detail: string
  evidence: Record<string, number | string | boolean | null>
  source: 'deterministic'
}
