import type { DateAlignmentResult } from '../master-profile.types'

const MS_PER_DAY = 24 * 60 * 60 * 1000
// New BBS threshold (the spec gives the rule — "never treat an earlier bank
// statement period as proof of later financial behaviour" — but no exact
// number): a bank statement period ending more than 60 days before the
// credit report date is flagged as materially stale.
const STALE_PERIOD_THRESHOLD_DAYS = 60

/**
 * Spec Part 22/26/47: always store and display the three dates, and never
 * let the AI (or a CCR skimming the UI) treat an older bank statement
 * period as proof of current financial behaviour.
 */
export function detectDateAlignment(creditReportPulledAt: Date, bankStatementPeriodStart: Date | null, bankStatementPeriodEnd: Date | null): DateAlignmentResult {
  let aligned = true
  let warning: string | null = null

  if (bankStatementPeriodEnd !== null) {
    const gapDays = (creditReportPulledAt.getTime() - bankStatementPeriodEnd.getTime()) / MS_PER_DAY
    if (gapDays > STALE_PERIOD_THRESHOLD_DAYS) {
      aligned = false
      warning = `Source periods are not aligned — the bank statement period ends ${Math.round(gapDays)} day(s) before the credit report date. Financial behaviour shown reflects that earlier period, not necessarily the lead's current position.`
    }
  }

  return {
    creditReportDate: creditReportPulledAt.toISOString(),
    bankStatementPeriodStart: bankStatementPeriodStart?.toISOString() ?? null,
    bankStatementPeriodEnd: bankStatementPeriodEnd?.toISOString() ?? null,
    aligned,
    warning,
  }
}
