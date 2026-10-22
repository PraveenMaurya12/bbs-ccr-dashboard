/**
 * Every calculation the Debt Analysis tab needs, as small pure functions —
 * each independently unit-tested (see debt-analysis.calculations.spec.ts).
 * None of this invents data: a field that isn't reported by the bureau for
 * enough accounts to compute something meaningful comes back `null`/empty
 * with an `available: false` flag, which the frontend renders as an honest
 * "Not available" state rather than a fabricated number.
 *
 * A handful of thresholds below (utilization tiers, risk-flag severities,
 * the "recent enquiry" window) are NEW rules established for this feature
 * — there was no pre-existing approved CBM/business rule for any of them
 * anywhere in this codebase before this file. Each is called out inline.
 */
import type { CreditAccountInput, CreditEnquiryInput, CreditReportInput, DataAvailability, RiskFlag } from './debt-analysis.types'

const MS_PER_DAY = 24 * 60 * 60 * 1000
// New convention (no prior definition existed): an enquiry is "recent" if
// within the last 90 days — a common bureau-report convention, not a
// figure pulled from any existing rule in this codebase.
const RECENT_ENQUIRY_WINDOW_DAYS = 90
const RECENT_ACCOUNT_OPENING_WINDOW_DAYS = 180
// Matches the threshold riskFlags() already uses for its 'recent_openings' flag.
const RECENT_ACCOUNT_OPENING_CLUSTER_THRESHOLD = 2

// Shared windows for Rule 5 (Debt Recency) and Rule 11 (Borrowing Frequency)
// — the spec itself defines these same five windows for both rules.
const RECENCY_WINDOWS_DAYS: Array<{ label: string; days: number }> = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: '12mo', days: 365 },
  { label: '24mo', days: 730 },
]

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0)
}

/**
 * Rule 4's own "suggested BBS analytical thresholds" for a single lender's
 * share of total outstanding — explicitly spec-labeled as BBS analytical
 * thresholds, NOT a bureau standard. Never applied to anything but the
 * concentration percentages this file computes.
 */
export function lenderConcentrationLevel(sharePercent: number): 'Low' | 'Moderate' | 'High' | 'Very High' {
  if (sharePercent > 75) return 'Very High'
  if (sharePercent > 50) return 'High'
  if (sharePercent > 25) return 'Moderate'
  return 'Low'
}

/** Rule 6's own "suggested BBS thresholds" for a single card's utilization — same spec-labeled status as lenderConcentrationLevel above. */
export function cardUtilizationLevel(utilizationPercent: number): 'Low' | 'Moderate' | 'Elevated' | 'High' | 'Very High' {
  if (utilizationPercent > 90) return 'Very High'
  if (utilizationPercent > 75) return 'High'
  if (utilizationPercent > 50) return 'Elevated'
  if (utilizationPercent > 30) return 'Moderate'
  return 'Low'
}

// --- Financial summary strip + credit profile summary -----------------------

export function totalOutstanding(accounts: CreditAccountInput[], reportFallback: number): number {
  return accounts.length > 0 ? sum(accounts.map((a) => a.currentBalance)) : reportFallback
}

/** No report-level fallback exists for this one — CreditReport has never stored an aggregate overdue figure. */
export function totalOverdue(accounts: CreditAccountInput[]): number | null {
  return accounts.length > 0 ? sum(accounts.map((a) => a.overdueAmount)) : null
}

export interface ReconciliationResult {
  accountLevelTotal: number
  bureauReportedTotal: number
  differenceAmount: number
  reconciliationRequired: boolean
}

// Rule 1: reconcile the account-level sum against the bureau's own reported
// total; never silently prefer one over the other. A tiny tolerance (new,
// no prior rule) absorbs rounding, not genuine mismatches.
const RECONCILIATION_TOLERANCE = 1

export function reconciliation(accounts: CreditAccountInput[], bureauReportedTotal: number): ReconciliationResult {
  const accountLevelTotal = sum(accounts.map((a) => a.currentBalance))
  const differenceAmount = accountLevelTotal - bureauReportedTotal
  return {
    accountLevelTotal,
    bureauReportedTotal,
    differenceAmount,
    // No tradelines to compare against means there is nothing to reconcile
    // — never flagged purely because the fallback report total is nonzero.
    reconciliationRequired: accounts.length > 0 && Math.abs(differenceAmount) > RECONCILIATION_TOLERANCE,
  }
}

export function totalMonthlyEmi(accounts: CreditAccountInput[]): number | null {
  const withEmi = accounts.filter((a) => a.monthlyEmiAmount !== null)
  return withEmi.length > 0 ? sum(withEmi.map((a) => a.monthlyEmiAmount!)) : null
}

export function totalLenders(accounts: CreditAccountInput[]): number {
  return new Set(accounts.map((a) => a.lender)).size
}

export interface AccountLifecycleCounts {
  /** Always available — CreditReport.totalActiveAccounts is a pre-existing, always-populated field. */
  activeAccounts: number
  /** Always available — CreditReport.delinquentAccounts is a pre-existing, always-populated field. */
  defaultedAccounts: number
  /** null when no tradeline rows exist to classify — never inferred from the report-level totals. */
  closedAccounts: number | null
  /** null for the same reason. */
  totalAccounts: number | null
}

export function accountLifecycleCounts(report: CreditReportInput): AccountLifecycleCounts {
  return {
    activeAccounts: report.totalActiveAccounts,
    defaultedAccounts: report.delinquentAccounts,
    closedAccounts:
      report.accounts.length > 0
        ? report.accounts.filter((a) => a.lifecycleStatus === 'CLOSED').length
        : null,
    totalAccounts: report.accounts.length > 0 ? report.accounts.length : null,
  }
}

// --- Loan & account analysis (doughnut) --------------------------------------

export interface AccountTypeSlice {
  accountType: string
  count: number
  percent: number
}

export function accountTypeDistribution(accounts: CreditAccountInput[]): AccountTypeSlice[] {
  if (accounts.length === 0) return []
  const counts = new Map<string, number>()
  for (const account of accounts) {
    const key = account.accountType || 'Unclassified'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([accountType, count]) => ({
    accountType,
    count,
    percent: Math.round((count / accounts.length) * 100),
  }))
}

// --- Credit utilization -------------------------------------------------------

export interface CardUtilizationDetail {
  lender: string
  creditLimit: number
  currentBalance: number
  utilizationPercent: number
  /** Rule 6's BBS analytical threshold label — see cardUtilizationLevel's own doc comment. */
  level: 'Low' | 'Moderate' | 'Elevated' | 'High' | 'Very High'
  overdueAmount: number
  currentDpdDays: number | null
}

export interface UtilizationResult {
  available: boolean
  utilizationPercent: number | null
  totalCreditLimit: number | null
  currentUtilization: number | null
  availableCreditLimit: number | null
  highUtilizationAccounts: number | null
  totalCreditCards: number
  /** Rule 6: every revolving facility (credit cards and other revolving facilities, per Rule 3), individually — so the portfolio average never hides one high-utilization account. */
  cards: CardUtilizationDetail[]
  highestUtilizedCard: CardUtilizationDetail | null
  unavailableReason: string | null
}

// New threshold (no pre-existing rule): an individual revolving account
// counts as "high utilization" at 75%+ of its own limit.
const HIGH_UTILIZATION_ACCOUNT_THRESHOLD = 0.75

/**
 * CRITICAL fix (found against real seeded data, not a hypothetical): the
 * BBS spec's own §9.1 table is explicit — "Total card limit: Sum valid
 * limits for ACTIVE cards" / "Total card balance: Sum ACTIVE-card
 * balances." This function previously included every account with a
 * positive credit limit regardless of lifecycle status, which silently
 * diluted the portfolio utilization percentage with closed/zero-balance
 * cards that still carry a reported limit (confirmed on a real lead: two
 * closed cards with real credit limits but ₹0 balance pulled the overall
 * figure from the spec-correct 53.9% down to 29%). Confirmed via a
 * dedicated research pass that no downstream module (Master Profile,
 * Cohort Engine, Plan Engine) reads this field, and no existing test
 * locks in the old "all accounts" behavior — this correction only shifts
 * values inside debt-analysis's own consumers (the CCR call brief's
 * narrative fields and the AI insights prompt), never a hard-coded
 * external threshold.
 */
export function creditUtilization(accounts: CreditAccountInput[]): UtilizationResult {
  const revolving = accounts.filter((a) => isActiveAccount(a) && a.creditLimit !== null && a.creditLimit > 0)
  const totalCreditCards = accounts.filter((a) => isActiveAccount(a) && a.accountType.toLowerCase().includes('credit card')).length

  const cards: CardUtilizationDetail[] = revolving
    .map((a) => {
      const utilizationPercent = Math.round((a.currentBalance / a.creditLimit!) * 100)
      return {
        lender: a.lender,
        creditLimit: a.creditLimit!,
        currentBalance: a.currentBalance,
        utilizationPercent,
        level: cardUtilizationLevel(utilizationPercent),
        overdueAmount: a.overdueAmount,
        currentDpdDays: a.currentDpdDays,
      }
    })
    .sort((a, b) => b.utilizationPercent - a.utilizationPercent)
  const highestUtilizedCard = cards[0] ?? null

  if (revolving.length === 0) {
    return {
      available: false,
      utilizationPercent: null,
      totalCreditLimit: null,
      currentUtilization: null,
      availableCreditLimit: null,
      highUtilizationAccounts: null,
      totalCreditCards,
      cards: [],
      highestUtilizedCard: null,
      unavailableReason:
        accounts.length === 0
          ? 'No tradeline data is available for this lead yet.'
          : 'None of the reported ACTIVE tradelines include a revolving credit limit, so utilization cannot be calculated.',
    }
  }

  const totalCreditLimit = sum(revolving.map((a) => a.creditLimit!))
  const currentUtilization = sum(revolving.map((a) => a.currentBalance))
  const utilizationPercent = totalCreditLimit > 0 ? Math.round((currentUtilization / totalCreditLimit) * 100) : null

  return {
    available: true,
    utilizationPercent,
    totalCreditLimit,
    currentUtilization,
    availableCreditLimit: totalCreditLimit - currentUtilization,
    highUtilizationAccounts: revolving.filter(
      (a) => a.currentBalance / a.creditLimit! >= HIGH_UTILIZATION_ACCOUNT_THRESHOLD,
    ).length,
    totalCreditCards,
    cards,
    highestUtilizedCard,
    unavailableReason: null,
  }
}

// --- Debt burden & concentration ----------------------------------------------

export interface LenderConcentrationEntry {
  lender: string
  outstandingAmount: number
  sharePercent: number
}

export interface DebtBurdenResult {
  totalActiveDebt: number
  monthlyEmi: number | null
  numbersOfLenders: number
  top3LendersSharePercent: number | null
  top1LenderSharePercent: number | null
  top2LenderSharePercent: number | null
  /** Rule 4: every lender's share of total outstanding, sorted descending. */
  lenderConcentration: LenderConcentrationEntry[]
  topLenderConcentrationLevel: 'Low' | 'Moderate' | 'High' | 'Very High' | null
  securedUnsecuredAvailable: boolean
  securedAmount: number | null
  unsecuredAmount: number | null
  /** Rule 2: Secured/Unsecured % of TOTAL outstanding (not just the classified portion) — so an unclassified gap is visible rather than hidden by a 100%-summing split. */
  securedPercent: number | null
  unsecuredPercent: number | null
  securedAccountCount: number
  unsecuredAccountCount: number
  /** How many accounts actually carried an isSecured classification, out of the total — surfaced so a partial breakdown is never presented as complete. */
  classifiedAccountCount: number
}

export function debtBurdenAndConcentration(accounts: CreditAccountInput[]): DebtBurdenResult {
  const active = accounts.filter((a) => a.lifecycleStatus === null || a.lifecycleStatus === 'ACTIVE')
  const totalActiveDebt = sum(active.map((a) => a.currentBalance))

  const byLender = new Map<string, number>()
  for (const account of accounts) {
    byLender.set(account.lender, (byLender.get(account.lender) ?? 0) + account.currentBalance)
  }
  const totalOutstandingAllAccounts = sum(accounts.map((a) => a.currentBalance))
  const sortedLenderAmounts = [...byLender.entries()].sort((a, b) => b[1] - a[1])
  const topNSum = (n: number) => sortedLenderAmounts.slice(0, n).reduce((t, [, v]) => t + v, 0)
  const sharePercent = (amount: number) =>
    totalOutstandingAllAccounts > 0 ? Math.round((amount / totalOutstandingAllAccounts) * 100) : null

  const lenderConcentration: LenderConcentrationEntry[] =
    totalOutstandingAllAccounts > 0
      ? sortedLenderAmounts.map(([lender, outstandingAmount]) => ({
          lender,
          outstandingAmount,
          sharePercent: sharePercent(outstandingAmount)!,
        }))
      : []

  const classified = accounts.filter((a) => a.isSecured !== null)
  const securedAccounts = classified.filter((a) => a.isSecured === true)
  const unsecuredAccounts = classified.filter((a) => a.isSecured === false)
  const securedAmount = classified.length > 0 ? sum(securedAccounts.map((a) => a.currentBalance)) : null
  const unsecuredAmount = classified.length > 0 ? sum(unsecuredAccounts.map((a) => a.currentBalance)) : null

  return {
    totalActiveDebt,
    monthlyEmi: totalMonthlyEmi(accounts),
    numbersOfLenders: totalLenders(accounts),
    top3LendersSharePercent: sharePercent(topNSum(3)),
    top1LenderSharePercent: sharePercent(topNSum(1)),
    top2LenderSharePercent: sharePercent(topNSum(2)),
    lenderConcentration,
    topLenderConcentrationLevel: lenderConcentration.length > 0 ? lenderConcentrationLevel(lenderConcentration[0].sharePercent) : null,
    securedUnsecuredAvailable: classified.length > 0,
    securedAmount,
    unsecuredAmount,
    securedPercent: classified.length > 0 ? sharePercent(securedAmount ?? 0) : null,
    unsecuredPercent: classified.length > 0 ? sharePercent(unsecuredAmount ?? 0) : null,
    securedAccountCount: securedAccounts.length,
    unsecuredAccountCount: unsecuredAccounts.length,
    classifiedAccountCount: classified.length,
  }
}

// --- Product composition (Rule 3) ---------------------------------------------

export type ProductCategory = 'Instalment' | 'Revolving' | 'Short-term' | 'Unclassified'

/**
 * Keyword matching against the bureau's own free-text account type
 * description, per Rule 3's exact category definitions — there is no
 * dedicated bureau field for this grouping, so this is pattern matching,
 * never a verified official taxonomy. Anything matching none of these
 * keywords is 'Unclassified' rather than silently defaulted to Instalment.
 */
// "Loan on Credit Card" is a fixed-term instalment product disbursed against
// a card's credit line — it is NOT a revolving balance, even though its
// bureau-reported name contains "credit card". Checked before
// REVOLVING_KEYWORDS so it never gets swept into Revolving by a naive
// substring match on "credit card". A genuine "Secured Credit Card" (bureau
// code 31) has no such prefix and still correctly falls through to
// REVOLVING_KEYWORDS below — its secured/unsecured classification is a
// wholly separate axis driven by CreditAccount.isSecured, not this category.
const LOAN_ON_CREDIT_CARD_KEYWORDS = ['loan on credit card', 'loan against credit card']
const REVOLVING_KEYWORDS = ['credit card', 'revolving']
const SHORT_TERM_KEYWORDS = [
  'bnpl', 'buy now pay later', 'digital lending', 'small consumer',
  'short term', 'short-term', 'short tenure', 'short-tenure',
]
const INSTALMENT_KEYWORDS = [
  'personal loan', 'consumer loan', 'business loan', 'auto loan', 'vehicle loan', 'car loan', 'two wheeler',
  'housing loan', 'home loan', 'education loan', 'term loan', 'loan against property', 'gold loan', 'loan',
]

function classifyProduct(accountType: string): ProductCategory {
  const lower = accountType.toLowerCase()
  if (LOAN_ON_CREDIT_CARD_KEYWORDS.some((k) => lower.includes(k))) return 'Instalment'
  if (REVOLVING_KEYWORDS.some((k) => lower.includes(k))) return 'Revolving'
  if (SHORT_TERM_KEYWORDS.some((k) => lower.includes(k))) return 'Short-term'
  if (INSTALMENT_KEYWORDS.some((k) => lower.includes(k))) return 'Instalment'
  return 'Unclassified'
}

export interface ProductCategorySlice {
  category: ProductCategory
  count: number
  outstandingAmount: number
  sharePercent: number | null
}

export function productCategorization(accounts: CreditAccountInput[]): ProductCategorySlice[] {
  if (accounts.length === 0) return []
  const totalOutstandingAllAccounts = sum(accounts.map((a) => a.currentBalance))
  const byCategory = new Map<ProductCategory, { count: number; amount: number }>()
  for (const account of accounts) {
    const category = classifyProduct(account.accountType)
    const entry = byCategory.get(category) ?? { count: 0, amount: 0 }
    entry.count += 1
    entry.amount += account.currentBalance
    byCategory.set(category, entry)
  }
  return [...byCategory.entries()].map(([category, { count, amount }]) => ({
    category,
    count,
    outstandingAmount: amount,
    sharePercent: totalOutstandingAllAccounts > 0 ? Math.round((amount / totalOutstandingAllAccounts) * 100) : null,
  }))
}

// --- Repayment behavior --------------------------------------------------------

export interface RepaymentBehaviorResult {
  available: boolean
  onTimePercent: number | null
  delayedPercent: number | null
  missedPercent: number | null
  onTimeCount: number
  delayedCount: number
  missedCount: number
  increasingDelayTrend: boolean
}

function allHistoryEntries(accounts: CreditAccountInput[]) {
  return accounts.flatMap((a) => a.paymentHistoryGrid ?? [])
}

export function repaymentBehavior(accounts: CreditAccountInput[]): RepaymentBehaviorResult {
  const entries = allHistoryEntries(accounts)
  if (entries.length === 0) {
    return {
      available: false,
      onTimePercent: null,
      delayedPercent: null,
      missedPercent: null,
      onTimeCount: 0,
      delayedCount: 0,
      missedCount: 0,
      increasingDelayTrend: false,
    }
  }

  const onTimeCount = entries.filter((e) => e.dpdBucket === '0').length
  const delayedCount = entries.filter((e) => e.dpdBucket === '30' || e.dpdBucket === '60').length
  const missedCount = entries.filter((e) => e.dpdBucket === '90+').length
  const total = entries.length

  // Increasing-delay trend: only ever asserted when at least 6 distinct
  // months of aggregated history exist to compare a recent 3-month window
  // against the prior one — never guessed from a shorter window.
  const monthsPresent = [...new Set(entries.map((e) => e.month))].sort()
  let increasingDelayTrend = false
  if (monthsPresent.length >= 6) {
    const recentMonths = new Set(monthsPresent.slice(-3))
    const priorMonths = new Set(monthsPresent.slice(-6, -3))
    const isDelayed = (bucket: string) => bucket === '30' || bucket === '60' || bucket === '90+'
    const recentDelayed = entries.filter((e) => recentMonths.has(e.month) && isDelayed(e.dpdBucket)).length
    const priorDelayed = entries.filter((e) => priorMonths.has(e.month) && isDelayed(e.dpdBucket)).length
    increasingDelayTrend = recentDelayed > priorDelayed
  }

  return {
    available: true,
    onTimePercent: Math.round((onTimeCount / total) * 100),
    delayedPercent: Math.round((delayedCount / total) * 100),
    missedPercent: Math.round((missedCount / total) * 100),
    onTimeCount,
    delayedCount,
    missedCount,
    increasingDelayTrend,
  }
}

// --- Credit history & trend -----------------------------------------------------

export interface CreditHistoryResult {
  lengthOfHistoryYears: number | null
  oldestAccountDate: Date | null
  newestAccountDate: Date | null
  monthlyDelinquencyTrend: Array<{ month: string; accountsWithDelinquency: number }>
}

export function creditHistoryAndTrend(accounts: CreditAccountInput[], now: Date): CreditHistoryResult {
  if (accounts.length === 0) {
    return { lengthOfHistoryYears: null, oldestAccountDate: null, newestAccountDate: null, monthlyDelinquencyTrend: [] }
  }

  const dates = accounts.map((a) => a.openedOn.getTime())
  const oldestAccountDate = new Date(Math.min(...dates))
  const newestAccountDate = new Date(Math.max(...dates))
  const lengthOfHistoryYears = Math.floor((now.getTime() - oldestAccountDate.getTime()) / (MS_PER_DAY * 365))

  // "Accounts with a missed/late payment, that month" — the real derivable
  // signal from a per-account monthly DPD grid, rather than a fabricated
  // generic balance-over-time series (no such monthly balance is stored
  // anywhere).
  const byMonth = new Map<string, Set<string>>()
  for (const account of accounts) {
    for (const entry of account.paymentHistoryGrid ?? []) {
      if (entry.dpdBucket === '0') continue
      if (!byMonth.has(entry.month)) byMonth.set(entry.month, new Set())
      byMonth.get(entry.month)!.add(account.lender + account.openedOn.toISOString())
    }
  }
  const monthlyDelinquencyTrend = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, accts]) => ({ month, accountsWithDelinquency: accts.size }))

  return { lengthOfHistoryYears, oldestAccountDate, newestAccountDate, monthlyDelinquencyTrend }
}

// --- Credit enquiry ---------------------------------------------------------

export interface EnquiryResult {
  available: boolean
  totalEnquiries: number
  recentEnquiries: number | null
}

export function enquirySummary(enquiries: CreditEnquiryInput[], now: Date): EnquiryResult {
  if (enquiries.length === 0) {
    return { available: false, totalEnquiries: 0, recentEnquiries: null }
  }
  const cutoff = now.getTime() - RECENT_ENQUIRY_WINDOW_DAYS * MS_PER_DAY
  return {
    available: true,
    totalEnquiries: enquiries.length,
    recentEnquiries: enquiries.filter((e) => e.enquiryDate.getTime() >= cutoff).length,
  }
}

// --- Enquiry behaviour (Rule 12) -----------------------------------------------

export interface EnquiryWindowsResult {
  windows: Array<{ windowLabel: string; windowDays: number | null; enquiryCount: number }>
  totalEnquiries: number
  /** Enquiries followed by a new account opening within 30 days — a new BBS-established correlation window (Rule 12 asks to correlate without specifying a number). */
  correlatedWithNewAccountCount: number
}

const ENQUIRY_CORRELATION_WINDOW_DAYS = 30
const ENQUIRY_WINDOWS_DAYS: Array<{ label: string; days: number | null }> = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: '12mo', days: 365 },
  { label: 'historical', days: null },
]

export function enquiryWindows(enquiries: CreditEnquiryInput[], accounts: CreditAccountInput[], now: Date): EnquiryWindowsResult {
  const windows = ENQUIRY_WINDOWS_DAYS.map(({ label, days }) => {
    if (days === null) return { windowLabel: label, windowDays: null, enquiryCount: enquiries.length }
    const cutoff = now.getTime() - days * MS_PER_DAY
    return { windowLabel: label, windowDays: days, enquiryCount: enquiries.filter((e) => e.enquiryDate.getTime() >= cutoff).length }
  })

  const correlatedWithNewAccountCount = enquiries.filter((e) =>
    accounts.some((a) => {
      const diffDays = (a.openedOn.getTime() - e.enquiryDate.getTime()) / MS_PER_DAY
      return diffDays >= 0 && diffDays <= ENQUIRY_CORRELATION_WINDOW_DAYS
    }),
  ).length

  return { windows, totalEnquiries: enquiries.length, correlatedWithNewAccountCount }
}

// --- Delinquency & DPD ----------------------------------------------------

export interface DelinquencyResult {
  currentMaxDpd: number | null
  maxHistoricalDpd: number | null
  buckets: { zeroToSixty: number; sixtyOneToNinety: number; ninetyOnePlus: number }
  accountsWithoutDpdData: number
  /** Rule 9: accounts whose historical (max) DPD ever crossed each threshold. */
  accountsWithDpdOver0: number
  accountsWithDpdOver30: number
  accountsWithDpdOver60: number
  accountsWithDpdOver90: number
  /** null when no account reports a monthly payment-history grid at all — distinct from a real 0 (grid present, never late). */
  delinquencyEventsCount: number | null
  mostRecentDelinquencyMonth: string | null
}

export function delinquencyAndDpd(accounts: CreditAccountInput[]): DelinquencyResult {
  const withCurrentDpd = accounts.filter((a) => a.currentDpdDays !== null)
  const withMaxDpd = accounts.filter((a) => a.maxDpdDays !== null)

  const buckets = { zeroToSixty: 0, sixtyOneToNinety: 0, ninetyOnePlus: 0 }
  for (const account of withCurrentDpd) {
    const dpd = account.currentDpdDays!
    if (dpd <= 60) buckets.zeroToSixty++
    else if (dpd <= 90) buckets.sixtyOneToNinety++
    else buckets.ninetyOnePlus++
  }

  const allEntries = allHistoryEntries(accounts)
  const delinquentEntries = allEntries.filter((e) => e.dpdBucket !== '0')
  const mostRecentDelinquencyMonth =
    delinquentEntries.length > 0 ? [...delinquentEntries].sort((a, b) => b.month.localeCompare(a.month))[0].month : null

  return {
    currentMaxDpd: withCurrentDpd.length > 0 ? Math.max(...withCurrentDpd.map((a) => a.currentDpdDays!)) : null,
    maxHistoricalDpd: withMaxDpd.length > 0 ? Math.max(...withMaxDpd.map((a) => a.maxDpdDays!)) : null,
    buckets,
    accountsWithoutDpdData: accounts.length - withCurrentDpd.length,
    accountsWithDpdOver0: withMaxDpd.filter((a) => a.maxDpdDays! > 0).length,
    accountsWithDpdOver30: withMaxDpd.filter((a) => a.maxDpdDays! > 30).length,
    accountsWithDpdOver60: withMaxDpd.filter((a) => a.maxDpdDays! > 60).length,
    accountsWithDpdOver90: withMaxDpd.filter((a) => a.maxDpdDays! > 90).length,
    delinquencyEventsCount: allEntries.length > 0 ? delinquentEntries.length : null,
    mostRecentDelinquencyMonth,
  }
}

// --- Debt recency (Rule 5) ----------------------------------------------------

export interface RecencyWindowResult {
  windowLabel: string
  windowDays: number
  accountCount: number
  outstandingAmount: number
  percentOfTotalOutstanding: number | null
}

export interface DebtRecencyResult {
  windows: RecencyWindowResult[]
  substantialRecentConcentration: boolean
}

// New BBS threshold (the spec asks to "flag substantial concentration"
// without a number): 50%+ of total outstanding opened within 180 days.
const RECENT_DEBT_CONCENTRATION_THRESHOLD_PERCENT = 50

export function debtRecency(accounts: CreditAccountInput[], now: Date): DebtRecencyResult {
  const totalOutstandingAllAccounts = sum(accounts.map((a) => a.currentBalance))
  const windows = RECENCY_WINDOWS_DAYS.map(({ label, days }) => {
    const cutoff = now.getTime() - days * MS_PER_DAY
    const inWindow = accounts.filter((a) => a.openedOn.getTime() >= cutoff)
    const outstandingAmount = sum(inWindow.map((a) => a.currentBalance))
    return {
      windowLabel: label,
      windowDays: days,
      accountCount: inWindow.length,
      outstandingAmount,
      percentOfTotalOutstanding:
        totalOutstandingAllAccounts > 0 ? Math.round((outstandingAmount / totalOutstandingAllAccounts) * 100) : null,
    }
  })

  const window180 = windows.find((w) => w.windowLabel === '180d')!
  return {
    windows,
    substantialRecentConcentration:
      window180.percentOfTotalOutstanding !== null &&
      window180.percentOfTotalOutstanding >= RECENT_DEBT_CONCENTRATION_THRESHOLD_PERCENT,
  }
}

// --- Borrowing frequency (Rule 11) --------------------------------------------

export interface BorrowingFrequencyResult {
  windows: Array<{ windowLabel: string; windowDays: number; newAccountCount: number }>
  /** Reuses the same 180-day / 2-account convention already used by riskFlags()'s 'recent_openings' flag — not a second, different rule. */
  clusterDetected: boolean
}

export function borrowingFrequency(accounts: CreditAccountInput[], now: Date): BorrowingFrequencyResult {
  const windows = RECENCY_WINDOWS_DAYS.map(({ label, days }) => {
    const cutoff = now.getTime() - days * MS_PER_DAY
    return { windowLabel: label, windowDays: days, newAccountCount: accounts.filter((a) => a.openedOn.getTime() >= cutoff).length }
  })
  const window180 = windows.find((w) => w.windowLabel === '180d')!
  return { windows, clusterDetected: window180.newAccountCount >= RECENT_ACCOUNT_OPENING_CLUSTER_THRESHOLD }
}

// --- Account-opening velocity (BBS Debt Analysis Module v3.0, §7) -------------

export interface AccountOpeningVelocityWindow {
  windowLabel: string
  months: number
  accountsOpened: number
}

const ACCOUNT_OPENING_VELOCITY_WINDOWS: Array<{ label: string; months: number }> = [
  { label: '3m', months: 3 },
  { label: '6m', months: 6 },
  { label: '12m', months: 12 },
  { label: '24m', months: 24 },
  { label: '36m', months: 36 },
]
const AVERAGE_DAYS_PER_MONTH = 30.44

/**
 * The spec's own exact 3/6/12/24/36-month windows — distinct from (and
 * additive alongside) the existing 30d/90d/180d/12mo/24mo window set
 * `debtRecency()`/`borrowingFrequency()` already expose, which Cohort
 * Engine and Master Profile already read by those exact labels. Calendar
 * months are approximated as 30.44 days, the same conversion used by
 * `creditAgeMonths` below.
 */
export function accountOpeningVelocity(accounts: CreditAccountInput[], now: Date): AccountOpeningVelocityWindow[] {
  return ACCOUNT_OPENING_VELOCITY_WINDOWS.map(({ label, months }) => {
    const cutoff = now.getTime() - months * AVERAGE_DAYS_PER_MONTH * MS_PER_DAY
    return { windowLabel: label, months, accountsOpened: accounts.filter((a) => a.openedOn.getTime() >= cutoff).length }
  })
}

// --- Account Timeline (BBS Debt Analysis Module v3.0, §14.5/§8.4) -------------

export interface AccountTimelineYearEntry {
  year: number
  opened: number
  closed: number
  netActive: number
}

export interface AccountChurnEvent {
  lender: string
  accountType: string
  openedOn: string
  closedOn: string
  lifetimeDays: number
}

export interface AccountTimelineResult {
  yearly: AccountTimelineYearEntry[]
  /**
   * The year-by-year `closed` counts and `churnEvents` below only reflect
   * accounts with a real `closedOn` date — any CLOSED account persisted
   * before that column existed (never yet reprocessed) is excluded from
   * both rather than silently misplaced into the wrong year or treated as
   * still-open. This ratio tells the caller how much of the real closure
   * history is actually represented: 1.0 means every closed account has a
   * known date; anything less means the timeline understates closures.
   */
  closedAccountsWithKnownDate: number
  closedAccountsTotal: number
  churnEvents: AccountChurnEvent[]
  churnRatePerYear: number | null
  churnPattern: 'HIGH_VELOCITY' | 'MODERATE' | 'LOW' | null
  oldestAccountDate: string | null
  oldestActiveAccountDate: string | null
  creditAgeMonths: number | null
  averageAccountAgeMonths: number | null
}

const CHURN_EVENT_WINDOW_DAYS = 183 // ~6 months, per §8.4's own definition

export function accountTimeline(accounts: CreditAccountInput[], now: Date): AccountTimelineResult {
  if (accounts.length === 0) {
    return {
      yearly: [],
      closedAccountsWithKnownDate: 0,
      closedAccountsTotal: 0,
      churnEvents: [],
      churnRatePerYear: null,
      churnPattern: null,
      oldestAccountDate: null,
      oldestActiveAccountDate: null,
      creditAgeMonths: null,
      averageAccountAgeMonths: null,
    }
  }

  const closedAccountsTotal = accounts.filter((a) => a.lifecycleStatus === 'CLOSED')
  const closedWithDate = closedAccountsTotal.filter((a) => a.closedOn !== null)

  const years = new Set<number>()
  for (const a of accounts) years.add(a.openedOn.getFullYear())
  for (const a of closedWithDate) years.add(a.closedOn!.getFullYear())
  const sortedYears = [...years].sort((a, b) => a - b)

  let runningActive = 0
  const yearly: AccountTimelineYearEntry[] = sortedYears.map((year) => {
    const opened = accounts.filter((a) => a.openedOn.getFullYear() === year).length
    const closed = closedWithDate.filter((a) => a.closedOn!.getFullYear() === year).length
    runningActive += opened - closed
    return { year, opened, closed, netActive: runningActive }
  })

  const churnEvents: AccountChurnEvent[] = closedWithDate
    .filter((a) => a.closedOn!.getTime() - a.openedOn.getTime() <= CHURN_EVENT_WINDOW_DAYS * MS_PER_DAY)
    .map((a) => ({
      lender: a.lender,
      accountType: a.accountType,
      openedOn: a.openedOn.toISOString(),
      closedOn: a.closedOn!.toISOString(),
      lifetimeDays: Math.round((a.closedOn!.getTime() - a.openedOn.getTime()) / MS_PER_DAY),
    }))
    .sort((a, b) => a.lifetimeDays - b.lifetimeDays)

  const oldestAccountDate = new Date(Math.min(...accounts.map((a) => a.openedOn.getTime())))
  const active = accounts.filter(isActiveAccount)
  const oldestActiveAccountDate = active.length > 0 ? new Date(Math.min(...active.map((a) => a.openedOn.getTime()))) : null

  const yearsSinceFirstAccount = (now.getTime() - oldestAccountDate.getTime()) / (MS_PER_DAY * 365)
  const churnRatePerYear = yearsSinceFirstAccount > 0 ? Math.round((accounts.length / yearsSinceFirstAccount) * 10) / 10 : null
  const churnPattern: AccountTimelineResult['churnPattern'] =
    churnRatePerYear === null ? null : churnRatePerYear > 4 ? 'HIGH_VELOCITY' : churnRatePerYear >= 2 ? 'MODERATE' : 'LOW'

  const ageInMonths = (openedOn: Date) => Math.round((now.getTime() - openedOn.getTime()) / MS_PER_DAY / AVERAGE_DAYS_PER_MONTH)

  return {
    yearly,
    closedAccountsWithKnownDate: closedWithDate.length,
    closedAccountsTotal: closedAccountsTotal.length,
    churnEvents,
    churnRatePerYear,
    churnPattern,
    oldestAccountDate: oldestAccountDate.toISOString(),
    oldestActiveAccountDate: oldestActiveAccountDate?.toISOString() ?? null,
    creditAgeMonths: ageInMonths(oldestAccountDate),
    averageAccountAgeMonths: Math.round(accounts.reduce((total, a) => total + ageInMonths(a.openedOn), 0) / accounts.length),
  }
}

// --- Debt age (Rule 13) --------------------------------------------------------

export interface DebtAgeResult {
  oldestActiveAccountDate: Date | null
  newestActiveAccountDate: Date | null
  averageActiveDebtAgeYears: number | null
  ageOfLargestDebtYears: number | null
  largestDebtLender: string | null
}

export function debtAge(accounts: CreditAccountInput[], now: Date): DebtAgeResult {
  const active = accounts.filter((a) => a.lifecycleStatus === null || a.lifecycleStatus === 'ACTIVE')
  if (active.length === 0) {
    return {
      oldestActiveAccountDate: null,
      newestActiveAccountDate: null,
      averageActiveDebtAgeYears: null,
      ageOfLargestDebtYears: null,
      largestDebtLender: null,
    }
  }
  const dates = active.map((a) => a.openedOn.getTime())
  const ageYears = (openedOn: Date) => (now.getTime() - openedOn.getTime()) / (MS_PER_DAY * 365)
  const largestDebtAccount = [...active].sort((a, b) => b.currentBalance - a.currentBalance)[0]

  return {
    oldestActiveAccountDate: new Date(Math.min(...dates)),
    newestActiveAccountDate: new Date(Math.max(...dates)),
    averageActiveDebtAgeYears: Math.round((sum(active.map((a) => ageYears(a.openedOn))) / active.length) * 10) / 10,
    ageOfLargestDebtYears: Math.round(ageYears(largestDebtAccount.openedOn) * 10) / 10,
    largestDebtLender: largestDebtAccount.lender,
  }
}

// --- Small-loan dependency (Rule 16) -------------------------------------------

export interface LoanSizeBucket {
  bucketLabel: string
  minAmount: number
  maxAmount: number | null
  count: number
  sharePercent: number | null
}

export interface LoanSizeBucketsResult {
  buckets: LoanSizeBucket[]
  smallTicketLoanCount: number
  smallTicketSharePercent: number | null
}

// Rule 16's own bucket boundaries, bucketed by original sanctioned amount
// (not current balance, which shrinks over time and no longer reflects loan size).
const LOAN_SIZE_BUCKET_DEFS: Array<{ label: string; min: number; max: number | null }> = [
  { label: '<₹10K', min: 0, max: 10000 },
  { label: '₹10K–₹50K', min: 10000, max: 50000 },
  { label: '₹50K–₹1L', min: 50000, max: 100000 },
  { label: '₹1L–₹5L', min: 100000, max: 500000 },
  { label: '>₹5L', min: 500000, max: null },
]

export function loanSizeBuckets(accounts: CreditAccountInput[]): LoanSizeBucketsResult {
  if (accounts.length === 0) {
    return { buckets: [], smallTicketLoanCount: 0, smallTicketSharePercent: null }
  }
  const buckets = LOAN_SIZE_BUCKET_DEFS.map(({ label, min, max }) => {
    const count = accounts.filter((a) => a.sanctionedAmount >= min && (max === null || a.sanctionedAmount < max)).length
    return { bucketLabel: label, minAmount: min, maxAmount: max, count, sharePercent: Math.round((count / accounts.length) * 100) }
  })
  const smallTicketLoanCount = buckets[0].count + buckets[1].count
  return { buckets, smallTicketLoanCount, smallTicketSharePercent: Math.round((smallTicketLoanCount / accounts.length) * 100) }
}

// --- Multiple lender exposure (Rule 17) ----------------------------------------

export interface LenderExposureResult {
  activeLenders: number
  activeAccounts: number
  productTypesCount: number
}

export function lenderExposure(accounts: CreditAccountInput[]): LenderExposureResult {
  const active = accounts.filter((a) => a.lifecycleStatus === null || a.lifecycleStatus === 'ACTIVE')
  return {
    activeLenders: new Set(active.map((a) => a.lender)).size,
    activeAccounts: active.length,
    productTypesCount: new Set(active.map((a) => a.accountType)).size,
  }
}

// --- Repayment burden & debt-to-income (Rule 7, Rule 18) ----------------------

export interface DebtServiceRatioResult {
  availability: DataAvailability
  monthlyEmi: number | null
  monthlyIncome: number | null
  debtServiceRatioPercent: number | null
}

/** Rule 7: never invent EMI or assume 0 income — both missing EMI and missing income report NOT_REPORTED, never a fabricated ratio. */
export function debtServiceRatio(monthlyEmi: number | null, monthlyIncome: number | null): DebtServiceRatioResult {
  if (monthlyIncome === null) {
    return { availability: 'NOT_REPORTED', monthlyEmi, monthlyIncome: null, debtServiceRatioPercent: null }
  }
  if (monthlyEmi === null) {
    return { availability: 'NOT_REPORTED', monthlyEmi: null, monthlyIncome, debtServiceRatioPercent: null }
  }
  return {
    availability: 'AVAILABLE',
    monthlyEmi,
    monthlyIncome,
    debtServiceRatioPercent: monthlyIncome > 0 ? Math.round((monthlyEmi / monthlyIncome) * 100) : null,
  }
}

export interface DebtToIncomeResult {
  availability: DataAvailability
  totalOutstanding: number | null
  annualIncome: number | null
  dtiPercent: number | null
}

/** Rule 18: DTI activates only when income is available — missing income is never zero. */
export function debtToIncome(totalOutstandingDebt: number, monthlyIncome: number | null): DebtToIncomeResult {
  if (monthlyIncome === null) {
    return { availability: 'NOT_REPORTED', totalOutstanding: null, annualIncome: null, dtiPercent: null }
  }
  const annualIncome = monthlyIncome * 12
  return {
    availability: 'AVAILABLE',
    totalOutstanding: totalOutstandingDebt,
    annualIncome,
    dtiPercent: annualIncome > 0 ? Math.round((totalOutstandingDebt / annualIncome) * 100) : null,
  }
}

// --- Permanently unavailable sections (never guessed, always honest) ----------

export interface UnavailableSection {
  availability: DataAvailability
  reason: string
}

/** Rule 14: CreditReport.leadId is @unique — exactly one report per lead, ever. A trajectory needs 2+ snapshots over time, which this integration structurally cannot retain. */
export function debtTrajectory(): UnavailableSection {
  return {
    availability: 'INSUFFICIENT_DATA',
    reason:
      'BBS stores exactly one credit report per lead — a trajectory requires at least two snapshots over time, which this integration does not retain.',
  }
}

export interface ConsolidationEvent {
  closedLender: string
  closedOn: Date
  closedSanctionedAmount: number
  newAccountLender: string
  newAccountOpenedOn: Date
  newAccountSanctionedAmount: number
  daysBetween: number
}

export interface DebtConsolidationResult {
  available: boolean
  detected: boolean
  events: ConsolidationEvent[]
  closedAccountsWithKnownDate: number
  closedAccountsTotal: number
  unavailableReason: string | null
}

const CONSOLIDATION_WINDOW_DAYS = 90

/**
 * Rule 15: flags an old loan closing while a new, larger loan opens shortly
 * after — a classic consolidation/refinancing signature. Previously this
 * was a permanent INSUFFICIENT_DATA stub reasoning "a closed account's
 * closure date is not reported" — stale relative to this same file's own
 * `accountTimeline()` (calc.ts, Rule 13/§14.5), which already reads
 * `closedOn` from both bureau mappers (experian-response.mapper.ts,
 * signzy-response.mapper.ts both parse `Date_Closed`). This is therefore
 * genuinely computable, not permanently unavailable.
 *
 * The 90-day window and the "new account's sanctioned amount is at least
 * double the closed one's" size test are both new BBS-established
 * conventions (no literal spec number to cite), the same disclosure
 * discipline as `cardUtilizationLevel`/`debtStressLayer`'s own thresholds
 * elsewhere in this file. A plain ">=" size test (tried first against this
 * integration's own real seeded data) produced 28 "events" for one 33-account
 * lead — with a credit history this dense, almost any closed account is
 * smaller than almost any later one by pure chance, so a same-or-larger test
 * is not a meaningful signal. A 2x size jump, matching each closed account
 * to only its single largest qualifying follow-on (not every one that
 * qualifies), is a far more conservative bar for "this specific loan looks
 * like it was replaced/consolidated into a bigger one" versus routine serial
 * borrowing. Uses `sanctionedAmount` (original), never `currentBalance`, for
 * the size comparison — `loanSizeBuckets`'s own established reasoning
 * ("current balance shrinks over time") applies identically here.
 *
 * Only CLOSED accounts with a real `closedOn` date are considered —
 * `closedAccountsWithKnownDate`/`closedAccountsTotal` make any remaining
 * coverage gap visible rather than silently treating an unknown closure
 * date as "this account never closed."
 */
const CONSOLIDATION_SIZE_MULTIPLIER = 2

export function debtConsolidationDetection(accounts: CreditAccountInput[]): DebtConsolidationResult {
  if (accounts.length === 0) {
    return { available: false, detected: false, events: [], closedAccountsWithKnownDate: 0, closedAccountsTotal: 0, unavailableReason: 'No tradeline data is available for this lead yet.' }
  }

  const closedTotal = accounts.filter((a) => a.lifecycleStatus === 'CLOSED').length
  const closedWithDate = accounts.filter((a) => a.lifecycleStatus === 'CLOSED' && a.closedOn !== null)

  const events: ConsolidationEvent[] = []
  for (const closed of closedWithDate) {
    const closedOnMs = closed.closedOn!.getTime()
    const windowEndMs = closedOnMs + CONSOLIDATION_WINDOW_DAYS * MS_PER_DAY
    let best: CreditAccountInput | null = null
    for (const candidate of accounts) {
      if (candidate === closed) continue
      const openedMs = candidate.openedOn.getTime()
      if (openedMs < closedOnMs || openedMs > windowEndMs) continue
      if (candidate.sanctionedAmount < closed.sanctionedAmount * CONSOLIDATION_SIZE_MULTIPLIER) continue
      if (!best || candidate.sanctionedAmount > best.sanctionedAmount) best = candidate
    }
    if (best) {
      events.push({
        closedLender: closed.lender,
        closedOn: closed.closedOn!,
        closedSanctionedAmount: closed.sanctionedAmount,
        newAccountLender: best.lender,
        newAccountOpenedOn: best.openedOn,
        newAccountSanctionedAmount: best.sanctionedAmount,
        daysBetween: Math.round((best.openedOn.getTime() - closedOnMs) / MS_PER_DAY),
      })
    }
  }

  return {
    available: true,
    detected: events.length > 0,
    events,
    closedAccountsWithKnownDate: closedWithDate.length,
    closedAccountsTotal: closedTotal,
    unavailableReason: null,
  }
}

/** Rule 19: BankTransaction exists in the schema but zero code populates it for any lead today. */
export function bankCrossCheck(): UnavailableSection {
  return {
    availability: 'NOT_APPLICABLE',
    reason: 'No bank-statement ingestion pipeline exists yet for any lead.',
  }
}

/** Rule 20: bounce/failed-payment events come only from bank statements, which this integration does not ingest. */
export function bounceAnalysis(): UnavailableSection {
  return {
    availability: 'NOT_APPLICABLE',
    reason: 'Bounce and failed-payment events require bank-statement data, which this integration does not yet ingest for any lead.',
  }
}

/** Neither the Signzy Experian Lite feed nor BBS's own schema captures a per-account interest rate or remaining tenure. */
export function interestRateAndTenure(): UnavailableSection {
  return {
    availability: 'NOT_APPLICABLE',
    reason: 'Interest rate and remaining tenure are not reported by this bureau integration for any account.',
  }
}

/** Signzy reports a descriptive accountStatusDescription ("ACTIVE"/"CLOSED"), never Experian's raw numeric status codes, so a status-99 ambiguity cannot occur in this data shape. */
export function status99Handling(): UnavailableSection {
  return {
    availability: 'NOT_APPLICABLE',
    reason: 'This integration only ever receives a descriptive account status, never Experian\'s raw numeric status codes — a status-99 special case cannot arise here.',
  }
}

// --- Settlement / write-off / restructuring ----------------------------------

export interface SettlementResult {
  settledCount: number
  settledAmount: number
  writtenOffCount: number
  writtenOffAmount: number
  restructuredCount: number
  suitFiledCount: number
  arcAssignedCount: number
  /** null = the bureau report did not include a willful-defaulter determination. */
  willfulDefault: boolean | null
}

export function settlementSummary(accounts: CreditAccountInput[], willfulDefaultFlag: boolean | null): SettlementResult {
  const byStatus = (status: string) => accounts.filter((a) => a.lifecycleStatus === status)
  const settled = byStatus('SETTLED')
  const writtenOff = byStatus('WRITTEN_OFF')

  return {
    settledCount: settled.length,
    settledAmount: sum(settled.map((a) => a.currentBalance)),
    writtenOffCount: writtenOff.length,
    writtenOffAmount: sum(writtenOff.map((a) => a.currentBalance)),
    restructuredCount: byStatus('RESTRUCTURED').length,
    suitFiledCount: byStatus('SUIT_FILED').length,
    arcAssignedCount: byStatus('ARC_ASSIGNED').length,
    willfulDefault: willfulDefaultFlag,
  }
}

// --- Risk indicators & warning flags -------------------------------------------

/**
 * Every flag here is a NEW rule established for this feature — no prior
 * approved CBM/risk-scoring logic exists anywhere in this codebase to
 * reuse. Each flag is only produced when its underlying figure was itself
 * available (never defaulted from missing data), and its `detail` string
 * always names the real number behind it.
 */
export function riskFlags(report: CreditReportInput, now: Date): RiskFlag[] {
  const flags: RiskFlag[] = []
  const accounts = report.accounts
  const overdueAccounts = accounts.filter((a) => a.overdueAmount > 0)

  if (overdueAccounts.length >= 2) {
    flags.push({
      key: 'multiple_overdue',
      label: 'Multiple accounts with overdue',
      severity: 'High',
      detail: `${overdueAccounts.length} tradelines currently carry an overdue balance.`,
      evidence: { overdueAccountCount: overdueAccounts.length },
      source: 'deterministic',
    })
  } else if (overdueAccounts.length === 1) {
    flags.push({
      key: 'multiple_overdue',
      label: 'Multiple accounts with overdue',
      severity: 'Medium',
      detail: '1 tradeline currently carries an overdue balance.',
      evidence: { overdueAccountCount: 1 },
      source: 'deterministic',
    })
  }

  const outstanding = totalOutstanding(accounts, report.totalOutstandingBalance)
  const overdue = totalOverdue(accounts)
  if (overdue !== null && outstanding > 0) {
    const ratio = overdue / outstanding
    const ratioPercent = Math.round(ratio * 100)
    if (ratio > 0.15) {
      flags.push({
        key: 'overdue_ratio',
        label: 'Overdue to outstanding ratio',
        severity: 'High',
        detail: `${ratioPercent}% of total outstanding is overdue.`,
        evidence: { overduePercent: ratioPercent, totalOverdue: overdue, totalOutstanding: outstanding },
        source: 'deterministic',
      })
    } else if (ratio > 0.05) {
      flags.push({
        key: 'overdue_ratio',
        label: 'Overdue to outstanding ratio',
        severity: 'Medium',
        detail: `${ratioPercent}% of total outstanding is overdue.`,
        evidence: { overduePercent: ratioPercent, totalOverdue: overdue, totalOutstanding: outstanding },
        source: 'deterministic',
      })
    }
  }

  const behavior = repaymentBehavior(accounts)
  if (behavior.available && behavior.increasingDelayTrend) {
    flags.push({
      key: 'increasing_dpd_trend',
      label: 'Increasing DPD trend',
      severity: 'Medium',
      detail: 'Late/missed payments in the last 3 reported months exceed the prior 3 months.',
      evidence: { increasingDelayTrend: true },
      source: 'deterministic',
    })
  }

  const enquiries = enquirySummary(report.enquiries, now)
  if (enquiries.available && enquiries.recentEnquiries !== null) {
    if (enquiries.recentEnquiries >= 5) {
      flags.push({
        key: 'enquiry_burst',
        label: 'Recent enquiry bursts',
        severity: 'High',
        detail: `${enquiries.recentEnquiries} enquiries in the last ${RECENT_ENQUIRY_WINDOW_DAYS} days.`,
        evidence: { recentEnquiries: enquiries.recentEnquiries, windowDays: RECENT_ENQUIRY_WINDOW_DAYS },
        source: 'deterministic',
      })
    } else if (enquiries.recentEnquiries >= 3) {
      flags.push({
        key: 'enquiry_burst',
        label: 'Recent enquiry bursts',
        severity: 'Medium',
        detail: `${enquiries.recentEnquiries} enquiries in the last ${RECENT_ENQUIRY_WINDOW_DAYS} days.`,
        evidence: { recentEnquiries: enquiries.recentEnquiries, windowDays: RECENT_ENQUIRY_WINDOW_DAYS },
        source: 'deterministic',
      })
    }
  }

  const utilization = creditUtilization(accounts)
  if (utilization.available && utilization.utilizationPercent !== null) {
    if (utilization.utilizationPercent >= 75) {
      flags.push({
        key: 'high_utilization',
        label: 'High credit utilization',
        severity: 'High',
        detail: `${utilization.utilizationPercent}% of available revolving credit is in use.`,
        evidence: { utilizationPercent: utilization.utilizationPercent },
        source: 'deterministic',
      })
    } else if (utilization.utilizationPercent >= 50) {
      flags.push({
        key: 'high_utilization',
        label: 'High credit utilization',
        severity: 'Medium',
        detail: `${utilization.utilizationPercent}% of available revolving credit is in use.`,
        evidence: { utilizationPercent: utilization.utilizationPercent },
        source: 'deterministic',
      })
    }
  }

  const recentOpenCutoff = now.getTime() - RECENT_ACCOUNT_OPENING_WINDOW_DAYS * MS_PER_DAY
  const recentlyOpened = accounts.filter((a) => a.openedOn.getTime() >= recentOpenCutoff)
  if (recentlyOpened.length >= 2) {
    flags.push({
      key: 'recent_openings',
      label: 'Multiple recent loan openings',
      severity: 'Medium',
      detail: `${recentlyOpened.length} accounts opened in the last ${RECENT_ACCOUNT_OPENING_WINDOW_DAYS} days.`,
      evidence: { recentlyOpenedCount: recentlyOpened.length, windowDays: RECENT_ACCOUNT_OPENING_WINDOW_DAYS },
      source: 'deterministic',
    })
  }

  const settlement = settlementSummary(accounts, report.willfulDefaultFlag)
  if (settlement.writtenOffCount > 0 || settlement.arcAssignedCount > 0) {
    flags.push({
      key: 'writeoff_arc',
      label: 'Write-off / ARC indicators',
      severity: 'High',
      detail: `${settlement.writtenOffCount} written-off, ${settlement.arcAssignedCount} ARC-assigned account(s).`,
      evidence: { writtenOffCount: settlement.writtenOffCount, arcAssignedCount: settlement.arcAssignedCount },
      source: 'deterministic',
    })
  }

  const enquiryBurstFlag = flags.find((f) => f.key === 'enquiry_burst')
  if (enquiryBurstFlag && recentlyOpened.length >= 2) {
    flags.push({
      key: 'debt_cycle_signal',
      label: 'Possible debt-cycle signal',
      severity: 'Medium',
      detail: 'Recent enquiry activity combined with multiple new accounts in a short window.',
      evidence: {
        recentEnquiries: (enquiryBurstFlag.evidence.recentEnquiries as number) ?? null,
        recentlyOpenedCount: recentlyOpened.length,
      },
      source: 'deterministic',
    })
  }

  return flags
}

// --- Debt stress layer (Rule 21, Rule 22) --------------------------------------

export type DebtRiskLevel = 'Stable' | 'Attention' | 'High Attention' | 'Critical'

export interface DebtStressLayerResult {
  level: DebtRiskLevel
  /** Plain-language, evidence-backed sentences — never a bare flag count (per Rule 21: "severity and context matter"). */
  signals: string[]
}

/**
 * A new BBS-established waterfall (Rule 22 gives example conditions per
 * tier, not a formula) — composes the existing riskFlags()/settlementSummary()/
 * delinquencyAndDpd()/creditUtilization()/borrowingFrequency() outputs rather
 * than re-deriving any of them. These labels describe debt conditions, never
 * the person (per Rule 22's own closing note).
 */
export function debtStressLayer(report: CreditReportInput, now: Date): DebtStressLayerResult {
  const { accounts } = report
  const flags = riskFlags(report, now)
  const settlement = settlementSummary(accounts, report.willfulDefaultFlag)
  const delinquency = delinquencyAndDpd(accounts)
  const utilization = creditUtilization(accounts)
  const borrowing = borrowingFrequency(accounts, now)

  const signals: string[] = []
  const severeStatus =
    settlement.writtenOffCount > 0 || settlement.suitFiledCount > 0 || settlement.arcAssignedCount > 0 || settlement.willfulDefault === true
  const severeDpd = (delinquency.currentMaxDpd ?? 0) >= 90

  let level: DebtRiskLevel
  if (severeStatus || severeDpd) {
    level = 'Critical'
    if (severeStatus) signals.push(`${settlement.writtenOffCount} written-off, ${settlement.suitFiledCount} suit-filed, ${settlement.arcAssignedCount} ARC-assigned account(s).`)
    if (severeDpd) signals.push(`Current DPD of ${delinquency.currentMaxDpd} days on at least one account.`)
  } else {
    const highUtilization = utilization.available && (utilization.utilizationPercent ?? 0) >= 90
    const recurringCluster = borrowing.clusterDetected && flags.some((f) => f.key === 'enquiry_burst')
    if (highUtilization || recurringCluster) {
      level = 'High Attention'
      if (highUtilization) signals.push(`Portfolio credit utilization at ${utilization.utilizationPercent}%.`)
      if (recurringCluster) signals.push('Recent account-opening cluster combined with a recent enquiry burst.')
    } else if (flags.length > 0) {
      level = 'Attention'
      signals.push(...flags.map((f) => f.detail))
    } else {
      level = 'Stable'
    }
  }

  if (signals.length === 0) {
    signals.push('No current overdue, no elevated DPD, and no active risk flags were identified from reported data.')
  }

  return { level, signals }
}

// --- Score vs. structure divergence (BBS Debt Analysis Module v3.0, §14) ------

export interface ScoreStructureDivergenceResult {
  available: boolean
  score: number | null
  scoreBand: string | null
  riskSignalCount: number
  divergenceFlag: boolean
  reason: string | null
  evidence: string[]
  unavailableReason: string | null
}

/** Severities that count as "Attention or above" for the risk-signal catalog — excludes 'Positive', 'Informational' (noteworthy but not risk-rising), and 'Data quality' (an integrity concern, not a structural risk signal). */
const ATTENTION_OR_ABOVE_SEVERITIES: RiskSignalSeverity[] = ['Attention', 'Elevated', 'High', 'Critical']

/**
 * A bureau score is a lagging indicator of historical repayment behaviour —
 * it does not necessarily reflect a debt structure that changed materially
 * after the score was last computed. This flags exactly the three
 * conditions the spec itself defines (§14.2). `riskSignalCount` is the
 * count of entries `evaluateStructuralRiskSignals()` actually triggered at
 * 'Attention' severity or above — the real ~20-check structural catalog
 * (debt concentration, recent borrowing/stacking, unsecured concentration,
 * enquiry conversion, etc.), matching the "risk signal(s) at Attention or
 * above" wording this function's own `reason` string already used.
 * Previously this counted `riskFlags()` output instead — a much narrower,
 * differently-scoped legacy catalog (only 3-4 checks, with its own
 * High/Medium severity vocabulary that never actually reaches "Attention or
 * above") built for the separate Risk Indicators card. That mismatch meant
 * `riskSignalCount` almost never reached the 3/5 thresholds below for any
 * lead, so divergence correctly flagged by the reference BBS report (e.g. a
 * "good" 748 score sitting on 94% single-lender concentration, 100%
 * unsecured debt, and 5 recently-opened accounts) silently never fired here.
 * `available: false` (never a fabricated non-divergence) when the bureau
 * reported no score at all.
 */
export function scoreStructureDivergence(
  report: CreditReportInput,
  now: Date,
  dq: DataQualityScoreResult,
  recency: DebtRecencyResult,
  timeline: AccountTimelineResult,
): ScoreStructureDivergenceResult {
  const { creditScore, scoreBand } = report
  if (creditScore === null) {
    return {
      available: false,
      score: null,
      scoreBand: null,
      riskSignalCount: 0,
      divergenceFlag: false,
      reason: null,
      evidence: [],
      unavailableReason: 'No bureau score was reported for this lead, so score-vs-structure divergence cannot be assessed.',
    }
  }

  const structuralSignals = evaluateStructuralRiskSignals(report, now, dq, recency, timeline).triggered.filter((e) =>
    ATTENTION_OR_ABOVE_SEVERITIES.includes(e.severity),
  )
  const riskSignalCount = structuralSignals.length
  const window12mo = recency.windows.find((w) => w.windowLabel === '12mo')
  const recentBorrowingPercent = window12mo?.percentOfTotalOutstanding ?? null
  const recentBorrowingAbove50 = recentBorrowingPercent !== null && recentBorrowingPercent > 50

  let reason: string | null = null
  if (creditScore >= 750 && riskSignalCount >= 3) {
    reason = `Score ${creditScore} (≥750) with ${riskSignalCount} risk signal(s) at Attention or above.`
  } else if (creditScore >= 700 && riskSignalCount >= 5) {
    reason = `Score ${creditScore} (≥700) with ${riskSignalCount} risk signal(s) at Attention or above.`
  } else if (creditScore >= 750 && recentBorrowingAbove50) {
    reason = `Score ${creditScore} (≥750) with ${recentBorrowingPercent}% of outstanding debt opened in the last 12 months (>50%).`
  }

  return {
    available: true,
    score: creditScore,
    scoreBand,
    riskSignalCount,
    divergenceFlag: reason !== null,
    reason,
    evidence: structuralSignals.map((e) => e.evidence),
    unavailableReason: null,
  }
}

// --- Data Quality Score (BBS Debt Analysis Module v3.0, §5.3/§5.4) ------------

export interface DataQualityFlag {
  code: string
  trigger: string
}

export interface DataQualityScoreResult {
  total: number
  band: 'High confidence' | 'Moderate confidence' | 'Low confidence' | 'Insufficient'
  components: {
    fieldCompleteness: { weight: 30; score: number; note: string }
    internalConsistency: { weight: 25; score: number; note: string }
    reportRecency: { weight: 15; score: number; note: string }
    identityMatchConfidence: { weight: 15; score: number; note: string }
    accountLevelSufficiency: { weight: 15; score: number; note: string }
  }
  flags: DataQualityFlag[]
  accountCountVerification: {
    /** The bureau's own CAIS_Summary total (active + closed + default) is never captured by this integration — only the active-account aggregate is. This verifies ACTIVE counts, not the full total the spec's literal rule describes. */
    summaryActiveCount: number
    detailActiveCount: number
    match: boolean
    note: string
  }
}

/** Matches the established convention used throughout this file (e.g. debtBurdenAndConcentration, debtAge): an unreported lifecycle status is treated as active, never as an unknown/closed account. */
function isActiveAccount(account: CreditAccountInput): boolean {
  return account.lifecycleStatus === null || account.lifecycleStatus === 'ACTIVE'
}

function isInstalmentLike(account: CreditAccountInput): boolean {
  return classifyProduct(account.accountType) !== 'Revolving'
}

function isCardLike(account: CreditAccountInput): boolean {
  return classifyProduct(account.accountType) === 'Revolving'
}

function dataQualityBand(score: number): DataQualityScoreResult['band'] {
  if (score >= 80) return 'High confidence'
  if (score >= 60) return 'Moderate confidence'
  if (score >= 40) return 'Low confidence'
  return 'Insufficient'
}

/**
 * §5.3's 5-component, 100-point formula, computed only from fields this
 * integration actually stores. Two deliberate departures from the literal
 * spec, each documented at the point it matters:
 * - Identity match confidence is a fixed 15/15 for any COMPLETED report —
 *   not a guess, but a structural guarantee: both bureau mappers
 *   (experian-response.mapper.ts, signzy-response.mapper.ts) only ever
 *   reach a matched/COMPLETED shape when Match_result.Exact_match === 'Y';
 *   any other value throws before a report is ever persisted. So "exact
 *   match" is logically certain here, not assumed.
 * - Account count verification compares ACTIVE counts (CreditReport.
 *   totalActiveAccounts vs. detail accounts with an ACTIVE lifecycle),
 *   because the bureau's literal CAIS_Summary.CreditAccountTotal (all
 *   accounts, not just active) is never captured by either mapper — only
 *   the active-account aggregate is. Never silently presented as the
 *   literal "total" verification the spec describes.
 */
export function dataQualityScore(report: CreditReportInput, now: Date): DataQualityScoreResult {
  const { accounts } = report
  const flags: DataQualityFlag[] = []

  // --- Field completeness (30) ---
  let expectedCount = 0
  let populatedCount = 0
  let completeAccountCount = 0
  for (const a of accounts) {
    let accountExpected = 0
    let accountPopulated = 0

    accountExpected++ // status
    if (a.lifecycleStatus !== null) accountPopulated++

    accountExpected++ // payment history (>=3 months)
    const historyOk = (a.paymentHistoryGrid?.length ?? 0) >= 3
    if (historyOk) accountPopulated++

    if (isActiveAccount(a) && isInstalmentLike(a)) {
      accountExpected++ // emi (active instalment loan only)
      if (a.monthlyEmiAmount !== null) accountPopulated++
    }

    if (isCardLike(a)) {
      accountExpected++ // credit limit (card only)
      if (a.creditLimit !== null) accountPopulated++
    }

    expectedCount += accountExpected
    populatedCount += accountPopulated
    if (accountPopulated === accountExpected) completeAccountCount++
  }
  const fieldCompletenessScore = expectedCount > 0 ? Math.round(30 * (populatedCount / expectedCount)) : 0

  // --- Internal consistency (25) --- (§5.2's checkable subset)
  let inconsistencyCount = 0
  for (const a of accounts) {
    const dpd = a.currentDpdDays ?? 0
    if (dpd > 0 && a.overdueAmount === 0) inconsistencyCount++ // DPD_OVERDUE_MISMATCH
    if (a.overdueAmount > 0 && a.currentDpdDays === 0) inconsistencyCount++ // OVERDUE_DPD_MISMATCH
    if (a.lifecycleStatus === 'CLOSED' && a.overdueAmount > 0) inconsistencyCount++ // CLOSED_WITH_OVERDUE
    if (a.overdueAmount > a.currentBalance) inconsistencyCount++ // OVERDUE_EXCEEDS_BALANCE
  }
  const internalConsistencyScore = Math.max(0, 25 - inconsistencyCount * 2)

  // --- Report recency (15) ---
  const reportAgeDays = Math.floor((now.getTime() - report.pulledAt.getTime()) / MS_PER_DAY)
  const reportRecencyScore = reportAgeDays <= 30 ? 15 : reportAgeDays <= 90 ? 10 : reportAgeDays <= 180 ? 5 : 0

  // --- Identity match confidence (15) --- (see function doc comment)
  const identityMatchScore = 15

  // --- Account-level data sufficiency (15) ---
  const accountSufficiencyScore = accounts.length > 0 ? Math.round(15 * (completeAccountCount / accounts.length)) : 0

  const total = Math.min(
    100,
    fieldCompletenessScore + internalConsistencyScore + reportRecencyScore + identityMatchScore + accountSufficiencyScore,
  )

  // --- Data quality flags (§12.1's "Data quality" severity codes, the subset this integration can honestly raise) ---
  const activeInstalmentMissingEmi = accounts.some((a) => isActiveAccount(a) && isInstalmentLike(a) && a.monthlyEmiAmount === null)
  if (activeInstalmentMissingEmi) flags.push({ code: 'EMI_SCHEDULED_MISSING', trigger: 'Scheduled EMI amount is blank on at least one active instalment loan.' })

  const anyIncompleteHistory = accounts.some((a) => a.paymentHistoryGrid !== null && a.paymentHistoryGrid.length > 0 && a.paymentHistoryGrid.length < 3)
  if (anyIncompleteHistory) flags.push({ code: 'HISTORY_INCOMPLETE', trigger: 'At least one account reports fewer than 3 months of payment history.' })

  const enquiryDetail = enquiryWindows(report.enquiries, accounts, now)
  if (enquiryDetail.totalEnquiries > 0 && enquiryDetail.correlatedWithNewAccountCount < enquiryDetail.totalEnquiries) {
    flags.push({ code: 'ENQUIRY_NOT_CONVERTED', trigger: 'At least one enquiry in the reported history has no matching account opened afterward.' })
  }

  const summaryActiveCount = report.totalActiveAccounts
  const detailActiveCount = accounts.filter(isActiveAccount).length
  const accountCountMatch = accounts.length === 0 || summaryActiveCount === detailActiveCount
  if (!accountCountMatch) flags.push({ code: 'ACCOUNT_COUNT_MISMATCH', trigger: `Bureau-reported active count (${summaryActiveCount}) does not match the detail array's active count (${detailActiveCount}).` })

  return {
    total,
    band: dataQualityBand(total),
    components: {
      fieldCompleteness: { weight: 30, score: fieldCompletenessScore, note: `${populatedCount}/${expectedCount} expected fields populated across all accounts.` },
      internalConsistency: { weight: 25, score: internalConsistencyScore, note: `${inconsistencyCount} inconsistency flag(s) found.` },
      reportRecency: { weight: 15, score: reportRecencyScore, note: `Report is ${reportAgeDays} day(s) old.` },
      identityMatchConfidence: { weight: 15, score: identityMatchScore, note: 'Exact match guaranteed by bureau mapping gate for every COMPLETED report.' },
      accountLevelSufficiency: { weight: 15, score: accountSufficiencyScore, note: `${completeAccountCount}/${accounts.length} accounts have all their expected fields populated.` },
    },
    flags,
    accountCountVerification: {
      summaryActiveCount,
      detailActiveCount,
      match: accountCountMatch,
      note: 'Compares active-account counts only — this integration does not capture the bureau\'s CAIS_Summary total (active + closed + default) field.',
    },
  }
}

// --- BBS Debt Risk Indicator (BBS Debt Analysis Module v3.0, §13) -------------

export interface DebtRiskIndicatorComponent {
  weight: number
  score: number
  evidence: string
}

export interface DebtRiskIndicatorResult {
  total: number
  band: 'Positive' | 'Attention' | 'Elevated' | 'High' | 'Critical'
  components: {
    currentDelinquency: DebtRiskIndicatorComponent
    adverseAccountStatus: DebtRiskIndicatorComponent
    debtBurdenConcentration: DebtRiskIndicatorComponent
    cardUtilisation: DebtRiskIndicatorComponent
    recentBorrowing: DebtRiskIndicatorComponent
    enquiryBehaviour: DebtRiskIndicatorComponent
    historicalRepayment: DebtRiskIndicatorComponent
    dataInconsistencies: DebtRiskIndicatorComponent
  }
}

function debtRiskBand(score: number): DebtRiskIndicatorResult['band'] {
  if (score <= 20) return 'Positive'
  if (score <= 40) return 'Attention'
  if (score <= 60) return 'Elevated'
  if (score <= 80) return 'High'
  return 'Critical'
}

/**
 * §13.2's 8-component, 100-point rubric. Two components omit a spec'd
 * bonus this integration cannot honestly evaluate, each noted inline
 * rather than approximated:
 * - Component 1 omits the asset-classification bonus (Sub-standard/
 *   Doubtful/Loss) — this integration never receives a structured asset
 *   classification per account (only a normalized lifecycle status).
 * - Component 7 omits the recovery-trend −2 adjustment and the
 *   history-completeness-based cap — no existing signal distinguishes
 *   "recovering" from merely "not currently deteriorating," and no
 *   account-age-based expected-months baseline exists to compute a
 *   completeness ratio against.
 * "W_3M" uses the existing 90-day window (the closest window label this
 * codebase already computes — see RECENCY_WINDOWS_DAYS) as a 3-month proxy.
 * `monthlyIncome` (same value already threaded through buildDebtAnalysisSummary
 * for debtServiceRatio/debtToIncome) drives Component 3's ">10x monthly
 * income" bonus — left at its natural 0 contribution when income isn't on
 * file, never guessed.
 */
export function debtRiskIndicator(
  report: CreditReportInput,
  now: Date,
  dqFlags: DataQualityFlag[],
  recency: DebtRecencyResult,
  monthlyIncome: number | null = null,
): DebtRiskIndicatorResult {
  const { accounts } = report

  // Component 1 — Current delinquency (25)
  let currentDelinquencyScore = 0
  for (const a of accounts) {
    const dpd = a.currentDpdDays ?? 0
    let s = 0
    if (a.overdueAmount > 0 && dpd === 0) s = 8
    else if (dpd > 90) s = 25
    else if (dpd > 60) s = 20
    else if (dpd > 30) s = 16
    else if (dpd > 0) s = 12
    currentDelinquencyScore = Math.max(currentDelinquencyScore, s)
  }

  // Component 2 — Adverse account status (20)
  const settlement = settlementSummary(accounts, report.willfulDefaultFlag)
  let adverseStatusScore = 0
  if (settlement.suitFiledCount > 0 || settlement.willfulDefault === true) adverseStatusScore = 20
  else if (settlement.writtenOffCount > 0) adverseStatusScore = 15
  else if (settlement.settledCount > 0) adverseStatusScore = 12
  else if (settlement.restructuredCount > 0) adverseStatusScore = 8

  // Component 3 — Debt burden / concentration (15)
  const debtBurden = debtBurdenAndConcentration(accounts)
  const totalOutstandingAmount = totalOutstanding(accounts, report.totalOutstandingBalance)
  const topAccountBalance = accounts.length > 0 ? Math.max(...accounts.map((a) => a.currentBalance)) : 0
  const topAccountConcentrationPercent = totalOutstandingAmount > 0 ? Math.round((topAccountBalance / totalOutstandingAmount) * 100) : 0
  let debtBurdenScore =
    topAccountConcentrationPercent > 70 ? 12 : topAccountConcentrationPercent > 50 ? 8 : topAccountConcentrationPercent > 30 ? 4 : 0
  let debtBurdenBonus = 0
  if ((debtBurden.top1LenderSharePercent ?? 0) > 60) debtBurdenBonus += 3
  if (monthlyIncome !== null && monthlyIncome > 0 && totalOutstandingAmount > monthlyIncome * 10) debtBurdenBonus += 5
  debtBurdenScore = Math.min(15, debtBurdenScore + debtBurdenBonus)

  // Component 4 — Credit-card utilisation (10)
  const utilization = creditUtilization(accounts)
  const overallUtil = utilization.available ? (utilization.utilizationPercent ?? 0) : 0
  let cardUtilisationScore = overallUtil > 90 ? 10 : overallUtil > 70 ? 8 : overallUtil > 50 ? 5 : overallUtil > 30 ? 3 : 0
  const multipleCardsAbove70 = utilization.cards.filter((c) => c.utilizationPercent > 70).length >= 2
  if (multipleCardsAbove70) cardUtilisationScore = Math.min(10, cardUtilisationScore + 2)

  // Component 5 — Recent borrowing (10)
  const window12mo = recency.windows.find((w) => w.windowLabel === '12mo')
  const window90d = recency.windows.find((w) => w.windowLabel === '90d') // W_3M proxy — see doc comment
  const accountsIn12mo = window12mo?.accountCount ?? 0
  let recentBorrowingScore = accountsIn12mo >= 3 ? 8 : accountsIn12mo === 2 ? 6 : accountsIn12mo === 1 ? 3 : 0
  let recentBorrowingBonus = 0
  const cutoff90d = now.getTime() - 90 * MS_PER_DAY
  const anyLargeRecentAccount = accounts.some((a) => a.openedOn.getTime() >= cutoff90d && a.currentBalance > 100000)
  if (anyLargeRecentAccount) recentBorrowingBonus += 2
  if ((window12mo?.percentOfTotalOutstanding ?? 0) > 50) recentBorrowingBonus += 2
  recentBorrowingScore = Math.min(10, recentBorrowingScore + recentBorrowingBonus)
  void window90d // reserved for a future, more exact W_3M read if this window is ever added explicitly

  // Component 6 — Enquiry behaviour (5)
  const enqDetail = enquiryWindows(report.enquiries, accounts, now)
  const enq180 = enqDetail.windows.find((w) => w.windowLabel === '180d')?.enquiryCount ?? 0
  const enq7 = enqDetail.windows.find((w) => w.windowLabel === '7d')?.enquiryCount ?? 0
  let enquiryScore = enq180 > 4 ? 5 : enq180 >= 3 ? 3 : enq180 >= 1 ? 2 : 0
  let enquiryBonus = 0
  if (enq7 > 2) enquiryBonus += 2
  if (enqDetail.totalEnquiries > 0 && enqDetail.correlatedWithNewAccountCount < enqDetail.totalEnquiries) enquiryBonus += 1
  enquiryScore = Math.min(5, enquiryScore + enquiryBonus)

  // Component 7 — Historical repayment behaviour (10)
  const delinquency = delinquencyAndDpd(accounts)
  const historyEntries = allHistoryEntries(accounts)
  const gridDpdMonthCount = historyEntries.filter((e) => e.dpdBucket !== '0').length
  // CRITICAL (found against real seeded data, not a hypothetical): a
  // per-account payment-history grid can have genuine gaps that omit the
  // very month a real historical DPD occurred — confirmed on a real
  // account whose maxDpdDays is 27 while its stored grid shows every
  // captured month as on-time ('0'). maxHistoricalDpd comes from a
  // separately-sourced, already-trusted field (delinquencyAndDpd() reads
  // maxDpdDays directly, not the grid), so whenever it reports a real DPD
  // > 0, that is at least one genuine occurrence even if the grid can't
  // corroborate which month — never let a sparse grid silently erase
  // evidence a more authoritative field already established.
  const dpdMonthCount = (delinquency.maxHistoricalDpd ?? 0) > 0 ? Math.max(gridDpdMonthCount, 1) : gridDpdMonthCount
  let historicalScore = 0
  if ((delinquency.maxHistoricalDpd ?? 0) > 90) historicalScore = 10
  else if (dpdMonthCount > 5) historicalScore = 7
  else if (dpdMonthCount >= 2) historicalScore = 5
  else if (dpdMonthCount === 1) historicalScore = 2
  const behavior = repaymentBehavior(accounts)
  if (behavior.available && behavior.increasingDelayTrend) historicalScore = Math.min(10, historicalScore + 2)

  // Component 8 — Data / profile inconsistencies (5)
  const flagCount = dqFlags.length
  let inconsistenciesScore = flagCount > 5 ? 5 : flagCount >= 3 ? 3 : flagCount >= 1 ? 2 : 0
  if (dqFlags.some((f) => f.code === 'ACCOUNT_COUNT_MISMATCH')) inconsistenciesScore = Math.min(5, inconsistenciesScore + 1)

  const total = Math.min(
    100,
    currentDelinquencyScore + adverseStatusScore + debtBurdenScore + cardUtilisationScore + recentBorrowingScore + enquiryScore + historicalScore + inconsistenciesScore,
  )

  return {
    total,
    band: debtRiskBand(total),
    components: {
      currentDelinquency: { weight: 25, score: currentDelinquencyScore, evidence: `Current max DPD ${delinquency.currentMaxDpd ?? 0}; overdue ${totalOverdue(accounts) ?? 0}.` },
      adverseAccountStatus: { weight: 20, score: adverseStatusScore, evidence: `Written-off ${settlement.writtenOffCount}, settled ${settlement.settledCount}, suit-filed ${settlement.suitFiledCount}, restructured ${settlement.restructuredCount}.` },
      debtBurdenConcentration: { weight: 15, score: debtBurdenScore, evidence: `Top account ${topAccountConcentrationPercent}%; top lender ${debtBurden.top1LenderSharePercent ?? 0}%.` },
      cardUtilisation: { weight: 10, score: cardUtilisationScore, evidence: `Overall utilisation ${overallUtil}%; ${utilization.cards.filter((c) => c.utilizationPercent > 70).length} card(s) above 70%.` },
      recentBorrowing: { weight: 10, score: recentBorrowingScore, evidence: `${accountsIn12mo} account(s) opened in the last 12 months; ${window12mo?.percentOfTotalOutstanding ?? 0}% of outstanding is recent.` },
      enquiryBehaviour: { weight: 5, score: enquiryScore, evidence: `${enq180} enquiries in 180 days; ${enq7} in 7 days.` },
      historicalRepayment: { weight: 10, score: historicalScore, evidence: `Max historical DPD ${delinquency.maxHistoricalDpd ?? 0}; ${dpdMonthCount} delinquent month(s) reported.` },
      dataInconsistencies: { weight: 5, score: inconsistenciesScore, evidence: `${flagCount} data quality flag(s).` },
    },
  }
}

// --- Missing Information Register (BBS Debt Analysis Module v3.0, §5.5) -------

export interface MissingInformationItem {
  category: string
  whatL1CannotDetermine: string
  whoResolves: string
}

/**
 * §5.5's "first-class output" register, deterministic — never AI-authored.
 * The spec's own 20-category list includes several identity-variant-driven
 * items (secondary contact numbers, address variants) this integration
 * cannot honestly populate — Identity Variant handling (§15.4) requires
 * per-holder bureau data neither mapper (experian-response.mapper.ts,
 * signzy-response.mapper.ts) captures today. Those categories are omitted
 * here rather than rendered with a fabricated "variant" that doesn't exist;
 * everything else the spec lists is either always true at L1 by design
 * (income, expenses, customer intent, etc. — L1 structurally never has
 * this) or included only when its real trigger condition is actually met.
 */
export function missingInformationRegister(report: CreditReportInput): MissingInformationItem[] {
  const { accounts, enquiries } = report
  const items: MissingInformationItem[] = [
    { category: 'Income', whatL1CannotDetermine: 'Not available at L1.', whoResolves: 'L2' },
    { category: 'Expenses', whatL1CannotDetermine: 'Not available at L1.', whoResolves: 'L2' },
    { category: 'Reason for financial distress', whatL1CannotDetermine: 'The bureau shows what happened, not why.', whoResolves: 'CCR' },
    { category: 'Bank behaviour', whatL1CannotDetermine: 'Not available at L1.', whoResolves: 'L2' },
    { category: 'Customer intent', whatL1CannotDetermine: 'Not available at L1.', whoResolves: 'CCR' },
    { category: 'Repayment capacity', whatL1CannotDetermine: 'Cannot be derived from bureau data alone.', whoResolves: 'L2 + CCR' },
    { category: 'Disputes with lenders', whatL1CannotDetermine: 'Not available at L1.', whoResolves: 'CCR' },
    { category: 'Current employment', whatL1CannotDetermine: 'Not available at L1.', whoResolves: 'CCR / L2' },
    { category: 'Household obligations', whatL1CannotDetermine: 'Not available at L1.', whoResolves: 'CCR' },
    { category: 'Informal borrowing', whatL1CannotDetermine: 'Not visible on bureau.', whoResolves: 'CCR' },
    { category: 'Business cash flow', whatL1CannotDetermine: 'Not available at L1.', whoResolves: 'L2' },
    { category: 'Cross-bureau agreement', whatL1CannotDetermine: 'This integration pulls a single bureau only.', whoResolves: 'L3' },
  ]

  const blankEmiAccounts = accounts.filter((a) => isActiveAccount(a) && isInstalmentLike(a) && a.monthlyEmiAmount === null)
  if (blankEmiAccounts.length > 0) {
    items.push({
      category: 'EMI amounts',
      whatL1CannotDetermine: `Scheduled EMI is blank on ${blankEmiAccounts.length} active instalment account(s): ${blankEmiAccounts.map((a) => a.lender).join(', ')}.`,
      whoResolves: 'L2 (bank debits) or CCR',
    })
  }

  const dpdAccounts = accounts.filter((a) => (a.currentDpdDays ?? 0) > 0 || (a.maxDpdDays ?? 0) > 0)
  if (dpdAccounts.length > 0) {
    items.push({
      category: 'Reason for DPD',
      whatL1CannotDetermine: `${dpdAccounts.length} account(s) show delinquency days-past-due — the bureau shows what, not why.`,
      whoResolves: 'CCR',
    })
  }

  const writtenOffAccounts = accounts.filter((a) => a.lifecycleStatus === 'WRITTEN_OFF')
  if (writtenOffAccounts.length > 0) {
    items.push({
      category: 'Reason for write-off',
      whatL1CannotDetermine: `${writtenOffAccounts.length} written-off account(s) — the bureau shows status, not cause.`,
      whoResolves: 'CCR',
    })
    items.push({
      category: 'Whether the write-off amount is settled',
      whatL1CannotDetermine: 'The bureau may not report a later settlement of a written-off balance.',
      whoResolves: 'CCR / lender',
    })
  }

  const enquiryDetail = enquiryWindows(enquiries, accounts, new Date())
  if (enquiryDetail.totalEnquiries > enquiryDetail.correlatedWithNewAccountCount) {
    items.push({
      category: 'Enquiry outcome',
      whatL1CannotDetermine: 'At least one enquiry has no matching account — the bureau shows the enquiry, not the lender\'s decision.',
      whoResolves: 'CCR / bureau re-pull',
    })
  }

  return items
}

// --- Risk Signal Engine (BBS Debt Analysis Module v3.0, §8/§12) ---------------

export type RiskSignalSeverity = 'Positive' | 'Informational' | 'Attention' | 'Elevated' | 'High' | 'Critical' | 'Data quality'

export interface RiskSignalEngineEntry {
  code: string
  signal: string
  severity: RiskSignalSeverity
  evidence: string
}

export interface NotTriggeredSignal {
  code: string
  reason: string
}

export interface NotEvaluatedSignal {
  code: string
  reason: string
}

export interface RiskSignalEngineResult {
  triggered: RiskSignalEngineEntry[]
  notTriggered: NotTriggeredSignal[]
  /** Codes this integration genuinely cannot evaluate, each with its specific blocker — never placed in either list above, since "not triggered" would falsely claim a negative result we never actually checked. */
  notEvaluated: NotEvaluatedSignal[]
}

/**
 * §12.1's fixed signal catalogue, reusing every value already computed
 * above rather than re-deriving anything. This is intentionally a
 * NEW, separate function from `riskFlags()` (kept entirely as-is) —
 * `riskFlags()` is a stable, tested, in-production 8-key system
 * RiskIndicatorsCard and the CCR call-brief depend on (confirmed via a
 * dedicated consumer trace that Cohort Engine does NOT read `riskFlags()`
 * or any Debt Analysis risk-signal field at all — it reads a small,
 * different subset of settlement/delinquency fields directly); replacing
 * or renaming `riskFlags()` would still be a breaking change this
 * rebuild's own "additive, never disturb an existing key" rule forbids.
 * `notEvaluated` lists every code this integration genuinely cannot check
 * either way, each with its own specific blocker (never a single generic
 * reason) — the identity-variant group (no per-holder bureau data), plus
 * several §12.1 data-integrity codes this integration structurally cannot
 * populate: no distinct account-number field is persisted
 * (DUPLICATE_ACCOUNT), no DOB/PAN-issuance-date capture exists
 * (DOB_MISSING, PRE_PAN_ACCOUNT), no raw bureau status/type codes are
 * retained post-mapping since both mappers already normalize to this
 * codebase's own vocabulary (UNMAPPED_STATUS, UNMAPPED_ACCOUNT_TYPE), no
 * distinct settlement/write-off/suit amount fields exist separate from
 * `currentBalance` (WO_AMOUNT_MISSING, SETTLEMENT_AMOUNT_MISSING,
 * SUIT_AMOUNT_MISSING, SETTLED_WITH_BALANCE, POST_WO_PAYMENT), no
 * restructure-date or last-payment-date fields are captured
 * (RESTRUCTURE_DATE_MISSING, DATE_SEQUENCE_ERROR), no separate EMI
 * "scheduled vs reported" distinction exists beyond a single
 * monthlyEmiAmount field (EMI_SCHEDULED_MISMATCH), and CROSS_REPORT_MISMATCH
 * is structurally impossible since BBS stores exactly one credit report
 * per lead ever (same reasoning as `debtTrajectory()`'s own doc comment).
 */
/**
 * The full structural risk-signal catalog EXCEPT the SCORE_STRUCTURE_DIVERGENCE
 * entry itself — split out from `riskSignalEngine()` so `scoreStructureDivergence()`
 * can consume the same real catalog of ~20 structural signals as its
 * `riskSignalCount` input without a circular dependency (the divergence verdict
 * itself depends on this catalog, and `riskSignalEngine()`'s one remaining entry
 * depends on the divergence verdict).
 */
function evaluateStructuralRiskSignals(
  report: CreditReportInput,
  now: Date,
  dq: DataQualityScoreResult,
  recency: DebtRecencyResult,
  timeline: AccountTimelineResult,
): RiskSignalEngineResult {
  const { accounts } = report
  const triggered: RiskSignalEngineEntry[] = []
  const notTriggered: NotTriggeredSignal[] = []

  const delinquency = delinquencyAndDpd(accounts)
  const settlement = settlementSummary(accounts, report.willfulDefaultFlag)
  const debtBurden = debtBurdenAndConcentration(accounts)
  const utilization = creditUtilization(accounts)
  const enqDetail = enquiryWindows(report.enquiries, accounts, now)
  const totalOutstandingAmount = totalOutstanding(accounts, report.totalOutstandingBalance)
  const overdue = totalOverdue(accounts) ?? 0

  const add = (condition: boolean, entry: RiskSignalEngineEntry, positiveReason: string) => {
    if (condition) triggered.push(entry)
    else notTriggered.push({ code: entry.code, reason: positiveReason })
  }

  add(overdue > 0, { code: 'CURRENT_OVERDUE', signal: 'Current overdue', severity: overdue > 50000 ? 'Critical' : 'High', evidence: `Total overdue ${overdue}.` }, 'Rs. 0 overdue.')
  add(
    (delinquency.currentMaxDpd ?? 0) > 0,
    { code: 'CURRENT_DPD', signal: 'Current DPD', severity: 'Attention', evidence: `Current max DPD ${delinquency.currentMaxDpd}.` },
    '0 current DPD.',
  )
  add(
    (delinquency.maxHistoricalDpd ?? 0) > 90,
    { code: 'HIGH_HISTORICAL_DPD', signal: 'Severe historical DPD', severity: 'High', evidence: `Max historical DPD ${delinquency.maxHistoricalDpd}.` },
    'No historical DPD exceeding 90 days.',
  )
  add(settlement.writtenOffCount > 0, { code: 'WRITTEN_OFF', signal: 'Written-off', severity: 'Critical', evidence: `${settlement.writtenOffCount} written-off account(s).` }, 'No written-off accounts.')
  add(settlement.settledCount > 0, { code: 'SETTLED_ACCOUNT', signal: 'Settled', severity: 'High', evidence: `${settlement.settledCount} settled account(s).` }, 'No settled accounts.')
  add(settlement.suitFiledCount > 0, { code: 'SUIT_FILED', signal: 'Suit-filed', severity: 'Critical', evidence: `${settlement.suitFiledCount} suit-filed account(s).` }, 'No suit-filed accounts.')
  add(settlement.restructuredCount > 0, { code: 'RESTRUCTURED', signal: 'Restructured', severity: 'Attention', evidence: `${settlement.restructuredCount} restructured account(s).` }, 'No restructured accounts.')
  add(settlement.willfulDefault === true, { code: 'WILFUL_DEFAULT', signal: 'Wilful default', severity: 'Critical', evidence: 'Willful-default flag reported.' }, 'No wilful-default flag reported.')

  const overallUtil = utilization.available ? (utilization.utilizationPercent ?? 0) : 0
  add(utilization.available && overallUtil > 70, { code: 'HIGH_CARD_UTILISATION', signal: 'High card utilisation', severity: 'Attention', evidence: `Overall utilisation ${overallUtil}%.` }, 'Utilisation at or below 70%.')
  const cardsAbove70 = utilization.cards.filter((c) => c.utilizationPercent > 70).length
  add(cardsAbove70 >= 2, { code: 'MULTIPLE_HIGH_UTILISATION', signal: 'Multiple high-utilisation cards', severity: 'Elevated', evidence: `${cardsAbove70} card(s) above 70%.` }, 'Only 0 or 1 card above threshold.')

  const window12mo = recency.windows.find((w) => w.windowLabel === '12mo')
  add((window12mo?.accountCount ?? 0) >= 3, { code: 'RECENT_BORROWING', signal: 'Recent borrowing', severity: 'Elevated', evidence: `${window12mo?.accountCount ?? 0} account(s) opened in the last 12 months.` }, 'Fewer than 3 accounts opened in the last 12 months.')
  const window90d = recency.windows.find((w) => w.windowLabel === '90d')
  add((window90d?.accountCount ?? 0) >= 1, { code: 'RECENT_ACCOUNT_OPENING', signal: 'Recent account opening', severity: 'Attention', evidence: `${window90d?.accountCount ?? 0} account(s) opened in the last ~3 months.` }, 'No accounts opened in the last ~3 months.')

  const enq180 = enqDetail.windows.find((w) => w.windowLabel === '180d')?.enquiryCount ?? 0
  add(enq180 > 4, { code: 'HIGH_ENQUIRY_VELOCITY', signal: 'High enquiry velocity', severity: 'Attention', evidence: `${enq180} enquiries in 180 days.` }, '4 or fewer enquiries in 180 days.')
  const enquiryNotConverted = enqDetail.totalEnquiries > enqDetail.correlatedWithNewAccountCount
  add(enquiryNotConverted, { code: 'ENQUIRY_NOT_CONVERTED', signal: 'Enquiry not converted', severity: 'Attention', evidence: 'At least one enquiry has no matching account.' }, 'Every enquiry has a matching account, or there are no enquiries.')
  add(enquiryNotConverted, { code: 'ENQUIRY_OUTCOME_UNKNOWN', signal: 'Enquiry outcome unknown', severity: 'Informational', evidence: 'At least one enquiry\'s lender decision cannot be determined from bureau data alone.' }, 'No enquiry with an unknown outcome.')

  // UNSECURED_DEBT_HEAVY previously duplicated this exact check (same condition,
  // same evidence string, no distinct consumer anywhere) under a second code —
  // removed as a genuine double-count, not a reference-driven change: it inflated
  // every "risk signal count" (scoreStructureDivergence, this catalog's own
  // triggered.length) by 1 for any unsecured-heavy portfolio.
  add((debtBurden.unsecuredPercent ?? 0) > 70, { code: 'UNSECURED_CONCENTRATION', signal: 'Unsecured concentration', severity: 'Attention', evidence: `Unsecured share ${debtBurden.unsecuredPercent ?? 0}%.` }, 'Unsecured share at or below 70%, or not classified.')
  add((debtBurden.securedPercent ?? 0) > 70, { code: 'SECURED_DEBT_HEAVY', signal: 'Secured debt heavy', severity: 'Informational', evidence: `Secured share ${debtBurden.securedPercent ?? 0}%.` }, 'Secured share at or below 70%, or not classified.')

  const topAccountBalance = accounts.length > 0 ? Math.max(...accounts.map((a) => a.currentBalance)) : 0
  const topAccountPercent = totalOutstandingAmount > 0 ? Math.round((topAccountBalance / totalOutstandingAmount) * 100) : 0
  add(topAccountPercent > 50, { code: 'DEBT_CONCENTRATION', signal: 'Debt concentration', severity: 'Attention', evidence: `Top account ${topAccountPercent}%.` }, 'Top account at or below 50% of outstanding.')
  add((debtBurden.top3LendersSharePercent ?? 0) > 80, { code: 'TOP3_CONCENTRATION', signal: 'Top-3 concentration', severity: 'Attention', evidence: `Top 3 ${debtBurden.top3LendersSharePercent ?? 0}%.` }, 'Top-3 lenders at or below 80% of outstanding.')
  add((debtBurden.top1LenderSharePercent ?? 0) > 60, { code: 'TOP_LENDER_CONCENTRATION', signal: 'Top-lender concentration', severity: 'Attention', evidence: `Top lender ${debtBurden.top1LenderSharePercent ?? 0}%.` }, 'Top lender at or below 60% of outstanding.')
  // §19.2's Cohort Signal Package schema keeps active_obligation_count
  // (active ACCOUNTS) and active_lender_count (distinct LENDERS) as two
  // separate fields — confirming "obligations" means accounts, not
  // distinct lenders. The reference report's own evidence text for this
  // exact signal ("5 active obligations across 4 lenders") makes the same
  // distinction explicit. Previously this incorrectly used lender count.
  const activeObligationCount = accounts.filter(isActiveAccount).length
  const activeLenderCount = new Set(accounts.filter(isActiveAccount).map((a) => a.lender)).size
  add(
    activeObligationCount >= 3,
    { code: 'DEBT_STACKING', signal: 'Debt stacking', severity: 'Elevated', evidence: `${activeObligationCount} active obligation(s) across ${activeLenderCount} active lender(s).` },
    'Fewer than 3 active obligations.',
  )

  add(timeline.churnPattern === 'HIGH_VELOCITY', { code: 'HIGH_ACCOUNT_CHURN', signal: 'High account churn', severity: 'Informational', evidence: `${timeline.churnRatePerYear ?? 0} accounts/year.` }, 'Account churn rate at or below 4/year.')
  add(
    timeline.creditAgeMonths !== null && timeline.creditAgeMonths < 24,
    { code: 'CREDIT_AGE_LOW', signal: 'Low credit age', severity: 'Informational', evidence: `Oldest account is ${timeline.creditAgeMonths} month(s) old.` },
    'Oldest account is 24 months or older.',
  )

  add(dq.flags.some((f) => f.code === 'ACCOUNT_COUNT_MISMATCH'), { code: 'ACCOUNT_COUNT_MISMATCH', signal: 'Account count mismatch', severity: 'Data quality', evidence: `${dq.accountCountVerification.summaryActiveCount} vs ${dq.accountCountVerification.detailActiveCount}.` }, `${dq.accountCountVerification.summaryActiveCount} = ${dq.accountCountVerification.detailActiveCount}.`)
  add(dq.flags.some((f) => f.code === 'HISTORY_INCOMPLETE'), { code: 'HISTORY_INCOMPLETE', signal: 'History incomplete', severity: 'Data quality', evidence: 'Multiple accounts with fewer than 3 reported months.' }, 'No accounts with significantly incomplete history.')
  add(dq.flags.some((f) => f.code === 'EMI_SCHEDULED_MISSING'), { code: 'EMI_SCHEDULED_MISSING', signal: 'EMI missing', severity: 'Data quality', evidence: 'Active instalment loan(s) report no scheduled EMI.' }, 'Every active instalment loan reports a scheduled EMI.')

  const zeroBalanceActive = accounts.filter((a) => isActiveAccount(a) && a.currentBalance === 0)
  add(zeroBalanceActive.length > 0, { code: 'ZERO_BALANCE_ACTIVE', signal: 'Zero balance active', severity: 'Informational', evidence: `${zeroBalanceActive.length} active account(s) at zero balance.` }, 'No active account at zero balance.')
  const closedWithBalance = accounts.filter((a) => a.lifecycleStatus === 'CLOSED' && a.currentBalance > 0)
  add(closedWithBalance.length > 0, { code: 'CLOSED_WITH_BALANCE', signal: 'Closed with balance', severity: 'Attention', evidence: `${closedWithBalance.length} closed account(s) with an outstanding balance.` }, 'No closed account carries an outstanding balance.')
  const negativeCardBalance = accounts.filter((a) => a.currentBalance < 0)
  add(negativeCardBalance.length > 0, { code: 'NEGATIVE_CARD_BALANCE', signal: 'Negative card balance', severity: 'Data quality', evidence: `${negativeCardBalance.length} account(s) with a negative balance.` }, 'No account reports a negative balance.')
  const overdueExceedsBalance = accounts.filter((a) => a.overdueAmount > a.currentBalance)
  add(overdueExceedsBalance.length > 0, { code: 'OVERDUE_EXCEEDS_BALANCE', signal: 'Overdue exceeds balance', severity: 'Data quality', evidence: `${overdueExceedsBalance.length} account(s) where overdue exceeds the current balance.` }, 'No account\'s overdue amount exceeds its current balance.')

  const futureDated = accounts.filter((a) => a.openedOn.getTime() > now.getTime())
  add(futureDated.length > 0, { code: 'FUTURE_DATE', signal: 'Future date', severity: 'Data quality', evidence: `${futureDated.length} account(s) report an open date after the report date.` }, 'No account reports a future open date.')
  const noPaymentHistory = accounts.filter((a) => a.paymentHistoryGrid === null)
  add(noPaymentHistory.length > 0, { code: 'NO_PAYMENT_HISTORY', signal: 'No payment history', severity: 'Data quality', evidence: `${noPaymentHistory.length} account(s) report no payment history at all.` }, 'Every account reports at least some payment history.')
  const zeroLimitActiveCards = accounts.filter((a) => isActiveAccount(a) && isCardLike(a) && a.creditLimit === 0)
  add(zeroLimitActiveCards.length > 0, { code: 'CARD_LIMIT_ZERO', signal: 'Card limit zero', severity: 'Data quality', evidence: `${zeroLimitActiveCards.length} active card(s) report a zero credit limit.` }, 'No active card reports a zero credit limit.')
  const ageInMonths = (openedOn: Date) => (now.getTime() - openedOn.getTime()) / MS_PER_DAY / 30.44
  const historyTruncated = accounts.filter((a) => (a.paymentHistoryGrid?.length ?? 0) > 0 && (a.paymentHistoryGrid?.length ?? 0) < Math.min(ageInMonths(a.openedOn), 12) * 0.5)
  add(
    historyTruncated.length > 0,
    { code: 'HISTORY_TRUNCATED', signal: 'History truncated', severity: 'Data quality', evidence: `${historyTruncated.length} account(s) report materially less payment history than their account age would suggest.` },
    'No account\'s reported history is materially shorter than its age.',
  )

  return {
    triggered,
    notTriggered,
    notEvaluated: [
      { code: 'SECONDARY_CONTACT_FOUND', reason: 'No per-holder identity data is captured by either bureau mapper (see Identity Variants).' },
      { code: 'MULTIPLE_PHONE_VARIANTS', reason: 'No per-holder identity data is captured by either bureau mapper (see Identity Variants).' },
      { code: 'MULTIPLE_NAME_VARIANTS', reason: 'No per-holder identity data is captured by either bureau mapper (see Identity Variants).' },
      { code: 'DUPLICATE_ACCOUNT', reason: 'No distinct account-number field is persisted for this integration.' },
      { code: 'DOB_MISSING', reason: 'Date of birth is not captured by this integration.' },
      { code: 'PRE_PAN_ACCOUNT', reason: 'PAN issuance date is not captured by this integration.' },
      { code: 'UNMAPPED_STATUS', reason: 'Both bureau mappers normalize status to this codebase\'s own vocabulary before persistence — raw bureau status codes are not retained.' },
      { code: 'UNMAPPED_ACCOUNT_TYPE', reason: 'Both bureau mappers normalize account type to this codebase\'s own vocabulary before persistence — raw bureau type codes are not retained.' },
      { code: 'WO_AMOUNT_MISSING', reason: 'No distinct write-off amount field exists separate from currentBalance.' },
      { code: 'SETTLEMENT_AMOUNT_MISSING', reason: 'No distinct settlement amount field exists separate from currentBalance.' },
      { code: 'SUIT_AMOUNT_MISSING', reason: 'No distinct suit-filed amount field exists separate from currentBalance.' },
      { code: 'SETTLED_WITH_BALANCE', reason: 'No distinct settlement amount field exists separate from currentBalance.' },
      { code: 'POST_WO_PAYMENT', reason: 'No post-write-off payment date is captured by this integration.' },
      { code: 'RESTRUCTURE_DATE_MISSING', reason: 'No restructure date field is captured by this integration.' },
      { code: 'DATE_SEQUENCE_ERROR', reason: 'No last-payment-date field is captured separate from the monthly payment-history grid.' },
      { code: 'EMI_SCHEDULED_MISMATCH', reason: 'Only a single scheduled-EMI field is captured — no distinct "reported payment" field to compare it against.' },
      { code: 'CROSS_REPORT_MISMATCH', reason: 'BBS stores exactly one credit report per lead, ever — there is never a second report to compare against.' },
    ],
  }
}

/**
 * Public catalog entry point: the full structural risk-signal catalog PLUS
 * the one entry (SCORE_STRUCTURE_DIVERGENCE) that depends on the
 * already-computed divergence verdict — appended on top of
 * `evaluateStructuralRiskSignals()`'s output rather than duplicating any of
 * its ~20 other checks.
 */
export function riskSignalEngine(
  report: CreditReportInput,
  now: Date,
  dq: DataQualityScoreResult,
  divergence: ScoreStructureDivergenceResult,
  recency: DebtRecencyResult,
  timeline: AccountTimelineResult,
): RiskSignalEngineResult {
  const core = evaluateStructuralRiskSignals(report, now, dq, recency, timeline)
  const divergenceEntry: RiskSignalEngineEntry = {
    code: 'SCORE_STRUCTURE_DIVERGENCE',
    signal: 'Score vs. structure divergence',
    severity: 'Attention',
    evidence: divergence.reason ?? '',
  }
  if (divergence.available && divergence.divergenceFlag) {
    return { ...core, triggered: [...core.triggered, divergenceEntry] }
  }
  return { ...core, notTriggered: [...core.notTriggered, { code: 'SCORE_STRUCTURE_DIVERGENCE', reason: 'No divergence between score and current debt structure.' }] }
}

// --- Cohort Signal Package (BBS Debt Analysis Module v3.0, §19.2) -------------

export interface CohortSignalPackage {
  currentDpd: number | null
  maxObservedDpd: number | null
  maxPossibleDpd: number | null
  /** An approximation: this integration tracks a per-month DPD grid, not a separate bureau "total months expected" field, so completeness is estimated as reported-months ÷ min(account age in months, 12), averaged across accounts — never a literal bureau-reported ratio. */
  historyCompleteness: number | null
  totalOverdue: number | null
  overdueAccountCount: number
  adverseStatusCount: number
  writtenOffCount: number
  settledCount: number
  suitFiledCount: number
  restructuredCount: number
  unsecuredSharePercent: number | null
  securedSharePercent: number | null
  cardUtilisationOverallPercent: number | null
  cardUtilisationMaxPercent: number | null
  debtStackingFlag: boolean
  activeObligationCount: number
  activeLenderCount: number
  recentBorrowing3m: boolean
  recentBorrowing6m: boolean
  recentBorrowing12m: boolean
  recentBorrowingSharePercent: number | null
  enquiryVelocityFlag: boolean
  enquiryNotConvertedFlag: boolean
  topAccountConcentrationPercent: number | null
  top3ConcentrationPercent: number | null
  topLenderConcentrationPercent: number | null
  accountChurnRatePerYear: number | null
  creditAgeMonths: number | null
  averageAccountAgeMonths: number | null
  debtRiskIndicator: number
  debtRiskIndicatorBand: string
  missingInformationCount: number
  provenance: { sourceBureau: string; analysisVersion: string; policyVersion: string }
}

/**
 * §19.2's fixed, flat export shape for a downstream Cohort Engine. This
 * pass only builds the PRODUCER — the Cohort Engine's own input contract
 * (already a separate, shipped module this session) is not modified to
 * consume it; wiring this package into that engine's actual evaluation
 * pipeline is a deliberately separate decision for that module's own
 * owners, not something this pass makes unilaterally.
 */
export function buildCohortSignalPackage(
  report: CreditReportInput,
  now: Date,
  indicator: DebtRiskIndicatorResult,
  missingInformationCount: number,
  recency: DebtRecencyResult,
  timeline: AccountTimelineResult,
): CohortSignalPackage {
  const { accounts } = report
  const delinquency = delinquencyAndDpd(accounts)
  const settlement = settlementSummary(accounts, report.willfulDefaultFlag)
  const debtBurden = debtBurdenAndConcentration(accounts)
  const utilization = creditUtilization(accounts)
  const enqDetail = enquiryWindows(report.enquiries, accounts, now)
  const totalOutstandingAmount = totalOutstanding(accounts, report.totalOutstandingBalance)

  const ageInMonths = (openedOn: Date) => (now.getTime() - openedOn.getTime()) / MS_PER_DAY / 30.44
  const completenessPerAccount = accounts
    .map((a) => {
      const expectedMonths = Math.min(Math.max(ageInMonths(a.openedOn), 1), 12)
      const reportedMonths = a.paymentHistoryGrid?.length ?? 0
      return Math.min(1, reportedMonths / expectedMonths)
    })
    .filter((v) => Number.isFinite(v))
  const historyCompleteness = completenessPerAccount.length > 0 ? Math.round((sum(completenessPerAccount) / completenessPerAccount.length) * 100) / 100 : null

  const topAccountBalance = accounts.length > 0 ? Math.max(...accounts.map((a) => a.currentBalance)) : 0
  const topAccountPercent = totalOutstandingAmount > 0 ? Math.round((topAccountBalance / totalOutstandingAmount) * 100) : null

  const window3m = recency.windows.find((w) => w.windowLabel === '90d') // closest existing window to "3m" — see accountOpeningVelocity's own doc comment
  const window6m = recency.windows.find((w) => w.windowLabel === '180d')
  const window12mo = recency.windows.find((w) => w.windowLabel === '12mo')
  const enq7 = enqDetail.windows.find((w) => w.windowLabel === '7d')?.enquiryCount ?? 0

  return {
    currentDpd: delinquency.currentMaxDpd,
    maxObservedDpd: delinquency.maxHistoricalDpd,
    maxPossibleDpd: historyCompleteness !== null && historyCompleteness < 0.5 ? null : delinquency.maxHistoricalDpd,
    historyCompleteness,
    totalOverdue: totalOverdue(accounts),
    overdueAccountCount: accounts.filter((a) => a.overdueAmount > 0).length,
    adverseStatusCount: settlement.writtenOffCount + settlement.settledCount + settlement.suitFiledCount + settlement.restructuredCount,
    writtenOffCount: settlement.writtenOffCount,
    settledCount: settlement.settledCount,
    suitFiledCount: settlement.suitFiledCount,
    restructuredCount: settlement.restructuredCount,
    unsecuredSharePercent: debtBurden.unsecuredPercent,
    securedSharePercent: debtBurden.securedPercent,
    cardUtilisationOverallPercent: utilization.available ? utilization.utilizationPercent : null,
    cardUtilisationMaxPercent: utilization.cards[0]?.utilizationPercent ?? null,
    debtStackingFlag: debtBurden.numbersOfLenders >= 3,
    activeObligationCount: accounts.filter(isActiveAccount).length,
    activeLenderCount: new Set(accounts.filter(isActiveAccount).map((a) => a.lender)).size,
    recentBorrowing3m: (window3m?.accountCount ?? 0) > 0,
    recentBorrowing6m: (window6m?.accountCount ?? 0) > 0,
    recentBorrowing12m: (window12mo?.accountCount ?? 0) > 0,
    recentBorrowingSharePercent: window12mo?.percentOfTotalOutstanding ?? null,
    enquiryVelocityFlag: enq7 > 2,
    enquiryNotConvertedFlag: enqDetail.totalEnquiries > enqDetail.correlatedWithNewAccountCount,
    topAccountConcentrationPercent: topAccountPercent,
    top3ConcentrationPercent: debtBurden.top3LendersSharePercent,
    topLenderConcentrationPercent: debtBurden.top1LenderSharePercent,
    accountChurnRatePerYear: timeline.churnRatePerYear,
    creditAgeMonths: timeline.creditAgeMonths,
    averageAccountAgeMonths: timeline.averageAccountAgeMonths,
    debtRiskIndicator: indicator.total,
    debtRiskIndicatorBand: indicator.band,
    missingInformationCount,
    provenance: { sourceBureau: report.bureau, analysisVersion: '3.0', policyVersion: '1.0' },
  }
}

// --- Final Summary table (BBS Debt Analysis Module v3.0, §17/§23) ------------

export interface FinalSummaryRow {
  dimension: string
  finding: string
  severity: RiskSignalSeverity
}

/**
 * §17's dimension/finding/severity recap — a pure presentation layer over
 * values every one of which was already computed above; this never scores
 * or derives anything new.
 */
export function finalSummaryTable(
  report: CreditReportInput,
  dataQuality: DataQualityScoreResult,
  indicator: DebtRiskIndicatorResult,
  divergence: ScoreStructureDivergenceResult,
  timeline: AccountTimelineResult,
  signalEngine: RiskSignalEngineResult,
): FinalSummaryRow[] {
  const { accounts } = report
  const delinquency = delinquencyAndDpd(accounts)
  const settlement = settlementSummary(accounts, report.willfulDefaultFlag)
  const debtBurden = debtBurdenAndConcentration(accounts)
  const utilization = creditUtilization(accounts)
  const hasAdverse = settlement.writtenOffCount + settlement.settledCount + settlement.suitFiledCount + settlement.restructuredCount > 0

  const triggeredCodes = new Set(signalEngine.triggered.map((t) => t.code))
  const severityFor = (code: string, fallback: RiskSignalSeverity): RiskSignalSeverity =>
    signalEngine.triggered.find((t) => t.code === code)?.severity ?? fallback

  const rows: FinalSummaryRow[] = [
    { dimension: 'Credit score', finding: report.creditScore !== null ? `${report.creditScore} (${report.scoreBand})` : 'Not reported', severity: 'Positive' },
    { dimension: 'Current delinquency', finding: (delinquency.currentMaxDpd ?? 0) > 0 ? `${delinquency.currentMaxDpd} DPD` : 'None', severity: triggeredCodes.has('CURRENT_DPD') ? severityFor('CURRENT_DPD', 'Attention') : 'Positive' },
    { dimension: 'Historical delinquency', finding: delinquency.maxHistoricalDpd !== null ? `Max historical DPD ${delinquency.maxHistoricalDpd}` : 'Not reported', severity: triggeredCodes.has('HIGH_HISTORICAL_DPD') ? 'High' : 'Positive' },
    { dimension: 'Adverse statuses', finding: hasAdverse ? `${settlement.writtenOffCount} written-off, ${settlement.settledCount} settled, ${settlement.suitFiledCount} suit-filed, ${settlement.restructuredCount} restructured` : 'None', severity: hasAdverse ? 'Critical' : 'Positive' },
    {
      dimension: 'Secured / unsecured debt',
      finding: debtBurden.securedUnsecuredAvailable ? `${debtBurden.securedPercent ?? 0}% / ${debtBurden.unsecuredPercent ?? 0}%` : 'Not classified',
      severity: triggeredCodes.has('UNSECURED_CONCENTRATION') ? 'Attention' : 'Positive',
    },
    { dimension: 'Top account concentration', finding: `${signalEngine.triggered.find((t) => t.code === 'DEBT_CONCENTRATION')?.evidence ?? 'below threshold'}`, severity: severityFor('DEBT_CONCENTRATION', 'Positive') },
    { dimension: 'Top lender concentration', finding: `${debtBurden.top1LenderSharePercent ?? 0}%`, severity: severityFor('TOP_LENDER_CONCENTRATION', 'Positive') },
    { dimension: 'Top-3 concentration', finding: `${debtBurden.top3LendersSharePercent ?? 0}%`, severity: severityFor('TOP3_CONCENTRATION', 'Positive') },
    { dimension: 'Card utilisation', finding: utilization.available ? `${utilization.utilizationPercent}% overall` : 'No revolving facility reported', severity: severityFor('HIGH_CARD_UTILISATION', 'Positive') },
    { dimension: 'Account churn', finding: timeline.churnRatePerYear !== null ? `${timeline.churnRatePerYear} accounts/year` : 'Not available', severity: severityFor('HIGH_ACCOUNT_CHURN', 'Informational') },
    {
      dimension: 'Debt stacking',
      finding: `${accounts.filter(isActiveAccount).length} active obligation(s) across ${new Set(accounts.filter(isActiveAccount).map((a) => a.lender)).size} active lender(s)`,
      severity: severityFor('DEBT_STACKING', 'Positive'),
    },
    { dimension: 'Data quality', finding: `${dataQuality.total} / 100 (${dataQuality.band})`, severity: dataQuality.total >= 80 ? 'Positive' : dataQuality.total >= 60 ? 'Attention' : 'Elevated' },
    { dimension: 'Debt Risk Indicator', finding: `${indicator.total} / 100 (${indicator.band})`, severity: indicator.band === 'Positive' ? 'Positive' : indicator.band },
    { dimension: 'Score-structure divergence', finding: divergence.available ? (divergence.divergenceFlag ? 'YES' : 'No') : 'Not available', severity: divergence.divergenceFlag ? 'Attention' : 'Positive' },
  ]

  return rows
}

// --- Identity Variants (BBS Debt Analysis Module v3.0, §3.3/§15.4) -----------

export interface IdentityVariantsResult {
  available: boolean
  unavailableReason: string | null
  canonicalName: string | null
  nameVariants: string[]
  mobileVariants: string[]
  addressVariants: string[]
}

/**
 * §3.3/§15.4 ask for every observed name/phone/address spelling variant
 * across the bureau's per-account holder-identity blocks
 * (CAIS_Holder_Details/CAIS_Holder_Phone_Details/CAIS_Holder_Address_Details
 * in Experian's raw XML). This integration's live bureau provider is
 * Signzy — confirmed by direct fixture inspection to carry NO equivalent
 * per-account holder-identity structure at all (only a single
 * applicant-level phone/address, and a per-account `AccountHoldertypeCode`
 * that's a holder-ROLE code — individual/joint/guarantor — not a spelling
 * variant). Experian's raw XML format does carry this data, but
 * `buildDebtAnalysisSummary()` never receives the raw bureau response
 * (only already-mapped Prisma rows) — parsing it live would need a new
 * code path threading `CreditReport.rawResponse` through, which is not
 * done in this pass. Rather than fabricate variants from data that isn't
 * there, or silently omit the section, this always returns an honest
 * unavailable state naming the specific blocker.
 */
export function identityVariants(report: CreditReportInput): IdentityVariantsResult {
  return {
    available: false,
    unavailableReason:
      `This integration's bureau source ("${report.bureau}") does not expose per-account holder identity data needed for this section. ` +
      'The Signzy integration (the live provider) has no per-account holder-identity structure at all. ' +
      "Experian's raw XML format does carry it, but this calculation layer only receives already-mapped tradeline data, never the raw response — parsing it live is a separate, not-yet-built code path.",
    canonicalName: null,
    nameVariants: [],
    mobileVariants: [],
    addressVariants: [],
  }
}

// --- Debt priority matrix (Rule 24) --------------------------------------------

export interface PriorityMatrixEntry {
  lender: string
  accountType: string
  currentBalance: number
  priorityScore: number
  reasons: string[]
}

/**
 * A new BBS-established scoring (Rule 24 requires "objective factors" but
 * specifies no weights): delinquency severity, status severity, overdue,
 * utilization, and outstanding size (capped, so one huge balance never
 * dominates — per Rule 24's own "do not prioritize solely by largest
 * balance"). Cost/interest is deliberately excluded — see
 * interestRateAndTenure(), no account in this data shape reports a rate.
 */
export function debtPriorityMatrix(accounts: CreditAccountInput[]): PriorityMatrixEntry[] {
  if (accounts.length === 0) return []
  const maxBalance = Math.max(...accounts.map((a) => a.currentBalance), 1)

  return accounts
    .map((a) => {
      const reasons: string[] = []
      let score = 0

      const dpd = a.currentDpdDays ?? 0
      if (dpd > 0) {
        score += (Math.min(dpd, 180) / 180) * 40
        reasons.push(`Current DPD of ${dpd} days.`)
      }

      if (a.lifecycleStatus === 'WRITTEN_OFF' || a.lifecycleStatus === 'SUIT_FILED' || a.lifecycleStatus === 'ARC_ASSIGNED') {
        score += 30
        reasons.push(`Account status: ${a.lifecycleStatus}.`)
      } else if (a.lifecycleStatus === 'SETTLED' || a.lifecycleStatus === 'RESTRUCTURED') {
        score += 15
        reasons.push(`Account status: ${a.lifecycleStatus}.`)
      }

      if (a.overdueAmount > 0) {
        score += 15
        reasons.push(`Overdue amount of ${a.overdueAmount}.`)
      }

      if (a.creditLimit !== null && a.creditLimit > 0) {
        const util = Math.round((a.currentBalance / a.creditLimit) * 100)
        if (util >= 75) {
          score += 10
          reasons.push(`Utilization at ${util}%.`)
        }
      }

      // Outstanding size contributes at most 15 of 100 points, scaled
      // against this portfolio's own largest balance — never the sole or
      // dominant factor.
      score += (a.currentBalance / maxBalance) * 15

      if (reasons.length === 0) {
        reasons.push('No elevated delinquency, status, overdue, or utilization signal.')
      }

      return { lender: a.lender, accountType: a.accountType, currentBalance: a.currentBalance, priorityScore: Math.round(score), reasons }
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
}

// --- BBS Level 1 Credit Intelligence -------------------------------------------

/**
 * One real tradeline's full detail, for `debtInventory.accounts` — every
 * field here is a direct passthrough of an already-normalized
 * CreditAccount column (see credit-report-provider.interface.ts's
 * RawCreditAccount), never re-derived or fabricated. This is the first
 * place any per-account detail is exposed via the API — previously these
 * fields were used only internally by the aggregate calculations above.
 */
export interface DebtInventoryAccount {
  lender: string
  accountType: string
  openedOn: string
  currentBalance: number
  overdueAmount: number
  monthlyEmiAmount: number | null
  currentDpdDays: number | null
  maxDpdDays: number | null
  creditLimit: number | null
  isSecured: boolean | null
  lifecycleStatus: string | null
  paymentStatus: string
}

function toDebtInventoryAccounts(accounts: CreditAccountInput[]): DebtInventoryAccount[] {
  return accounts.map((a) => ({
    lender: a.lender,
    accountType: a.accountType,
    openedOn: a.openedOn.toISOString(),
    currentBalance: a.currentBalance,
    overdueAmount: a.overdueAmount,
    monthlyEmiAmount: a.monthlyEmiAmount,
    currentDpdDays: a.currentDpdDays,
    maxDpdDays: a.maxDpdDays,
    creditLimit: a.creditLimit,
    isSecured: a.isSecured,
    lifecycleStatus: a.lifecycleStatus,
    paymentStatus: a.paymentStatus,
  }))
}

/**
 * Regroups the exact same values `buildDebtAnalysisSummary` already
 * computed into the three named BBS Level 1 domains (Credit Position /
 * Debt Inventory / Risk Signals) plus AI insights — a pure projection, not
 * a second calculation engine. Every number here is the identical value
 * the flat `summary` object below (and the Debt Analysis tab) already
 * uses; this only exists so a consumer (the CCR Call Brief, a future
 * Level 2 input, audit tooling) can read the architecturally-named
 * grouping instead of the tab-shaped flat object.
 */
export function toLevel1CreditIntelligence(
  input: CreditReportInput,
  summary: ReturnType<typeof buildDebtAnalysisSummary>,
) {
  return {
    creditPosition: {
      creditScore: summary.creditProfile.creditScore,
      scoreBand: summary.creditProfile.scoreBand,
      totalAccounts: summary.creditProfile.totalAccounts,
      activeAccounts: summary.creditProfile.activeAccounts,
      closedAccounts: summary.creditProfile.closedAccounts,
      defaultedAccounts: summary.creditProfile.defaultedAccounts,
      totalOutstanding: summary.creditProfile.totalOutstanding,
      totalOverdue: summary.creditProfile.totalOverdue,
      recentEnquiries: summary.creditProfile.recentEnquiries,
      utilization: summary.utilization,
      creditHistory: summary.creditHistory,
      enquiries: summary.enquiry,
    },
    debtInventory: {
      accounts: toDebtInventoryAccounts(input.accounts),
      accountTypeDistribution: summary.accountDistribution,
      totalActiveDebt: summary.debtBurden.totalActiveDebt,
      monthlyEmi: summary.debtBurden.monthlyEmi,
      numbersOfLenders: summary.debtBurden.numbersOfLenders,
      top3LendersSharePercent: summary.debtBurden.top3LendersSharePercent,
      securedAmount: summary.debtBurden.securedAmount,
      unsecuredAmount: summary.debtBurden.unsecuredAmount,
      paymentBehavior: summary.repaymentBehavior,
      delinquency: summary.delinquency,
      statusIndicators: summary.settlement,
    },
    riskSignals: summary.riskFlags,
    // Additive, for the full BBS Debt Analysis Module rebuild — same
    // underlying values `summary` already computed above, regrouped.
    debtStructure: {
      reconciliation: summary.reconciliation,
      productMix: summary.productMix,
      recency: summary.recency,
      lenderExposure: summary.lenderExposure,
      loanSize: summary.loanSize,
    },
    debtBehaviour: {
      borrowing: summary.borrowing,
      enquiryDetail: summary.enquiryDetail,
      debtAge: summary.debtAge,
    },
    repaymentCapacity: {
      debtServiceRatio: summary.debtServiceRatio,
      debtToIncome: summary.debtToIncome,
    },
    stressAnalysis: summary.stress,
    priorityMatrix: summary.priorityMatrix,
    unavailable: summary.unavailable,
  }
}

// --- Whole-report assembly ---------------------------------------------------

/**
 * Assembles every section above into the one object the Debt Analysis tab
 * (and, for the Experian integration, the Gemini insights prompt) consumes.
 * Pulled out as its own pure function — rather than left inline in
 * DebtAnalysisService — specifically so BureauReportService can feed a
 * just-fetched report's numbers into the Gemini insights job using the
 * exact same grounded calculations the tab itself displays, instead of
 * duplicating this assembly logic.
 */
export function buildDebtAnalysisSummary(input: CreditReportInput, monthlyIncome: number | null = null) {
  const now = new Date()
  const { accounts } = input

  const lifecycle = accountLifecycleCounts(input)
  const utilization = creditUtilization(accounts)
  const debtBurden = debtBurdenAndConcentration(accounts)
  const behavior = repaymentBehavior(accounts)
  const history = creditHistoryAndTrend(accounts, now)
  const enquiries = enquirySummary(input.enquiries, now)
  const delinquency = delinquencyAndDpd(accounts)
  const settlement = settlementSummary(accounts, input.willfulDefaultFlag)
  const flags = riskFlags(input, now)

  // New for the full BBS Debt Analysis Module rebuild (see
  // BBS_Debt_Analysis_Module.pdf) — every key below is additive; nothing
  // above this line changed shape, so no existing consumer breaks.
  const reconcile = reconciliation(accounts, input.totalOutstandingBalance)
  const productMix = productCategorization(accounts)
  const recency = debtRecency(accounts, now)
  const borrowing = borrowingFrequency(accounts, now)
  const enquiryDetail = enquiryWindows(input.enquiries, accounts, now)
  const age = debtAge(accounts, now)
  const loanSize = loanSizeBuckets(accounts)
  const exposure = lenderExposure(accounts)
  const dsr = debtServiceRatio(totalMonthlyEmi(accounts), monthlyIncome)
  const dti = debtToIncome(totalOutstanding(accounts, input.totalOutstandingBalance), monthlyIncome)
  const stress = debtStressLayer(input, now)
  const priorityMatrix = debtPriorityMatrix(accounts)
  const dataQuality = dataQualityScore(input, now)
  const timeline = accountTimeline(accounts, now)
  const divergence = scoreStructureDivergence(input, now, dataQuality, recency, timeline)
  const riskIndicator = debtRiskIndicator(input, now, dataQuality.flags, recency, monthlyIncome)
  const missingInformation = missingInformationRegister(input)
  const openingVelocity = accountOpeningVelocity(accounts, now)
  const signalEngine = riskSignalEngine(input, now, dataQuality, divergence, recency, timeline)
  const cohortSignalPackage = buildCohortSignalPackage(input, now, riskIndicator, missingInformation.length, recency, timeline)
  const finalSummary = finalSummaryTable(input, dataQuality, riskIndicator, divergence, timeline, signalEngine)
  const identity = identityVariants(input)

  return {
    meta: { bureau: input.bureau, reportDate: input.pulledAt.toISOString() },
    summary: {
      totalOutstanding: totalOutstanding(accounts, input.totalOutstandingBalance),
      totalOverdue: totalOverdue(accounts),
      monthlyEmi: totalMonthlyEmi(accounts),
      totalLenders: totalLenders(accounts),
    },
    creditProfile: {
      creditScore: input.creditScore,
      scoreBand: input.scoreBand,
      totalAccounts: lifecycle.totalAccounts,
      activeAccounts: lifecycle.activeAccounts,
      closedAccounts: lifecycle.closedAccounts,
      defaultedAccounts: lifecycle.defaultedAccounts,
      totalOutstanding: totalOutstanding(accounts, input.totalOutstandingBalance),
      totalOverdue: totalOverdue(accounts),
      recentEnquiries: enquiries.available ? enquiries.recentEnquiries : null,
    },
    accountDistribution: {
      totalAccounts: accounts.length,
      slices: accountTypeDistribution(accounts),
    },
    utilization,
    debtBurden,
    repaymentBehavior: behavior,
    creditHistory: {
      lengthOfHistoryYears: history.lengthOfHistoryYears,
      oldestAccountDate: history.oldestAccountDate?.toISOString() ?? null,
      newestAccountDate: history.newestAccountDate?.toISOString() ?? null,
      monthlyDelinquencyTrend: history.monthlyDelinquencyTrend,
    },
    enquiry: enquiries,
    delinquency,
    settlement,
    riskFlags: flags,
    // --- Additive fields for the full BBS Debt Analysis Module rebuild ---
    reconciliation: reconcile,
    productMix,
    recency,
    borrowing,
    enquiryDetail,
    debtAge: age,
    loanSize,
    lenderExposure: exposure,
    debtServiceRatio: dsr,
    debtToIncome: dti,
    stress,
    priorityMatrix,
    scoreStructureDivergence: divergence,
    dataQuality,
    debtRiskIndicator: riskIndicator,
    missingInformation,
    accountOpeningVelocity: openingVelocity,
    accountTimeline: timeline,
    riskSignalEngine: signalEngine,
    cohortSignalPackage,
    finalSummary,
    identityVariants: identity,
    consolidationDetection: debtConsolidationDetection(accounts),
    unavailable: {
      trajectory: debtTrajectory(),
      bankCrossCheck: bankCrossCheck(),
      bounceAnalysis: bounceAnalysis(),
      interestRateAndTenure: interestRateAndTenure(),
      status99: status99Handling(),
    },
  }
}
