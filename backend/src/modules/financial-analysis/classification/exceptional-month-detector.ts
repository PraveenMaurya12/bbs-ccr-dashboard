export interface ExceptionalMonthResult {
  isExceptional: boolean
  reason: string | null
}

/**
 * Rule 16/21: a month is exceptional when its inflow is materially above
 * normal, OR a loan inflow is detected, OR a large one-time transaction
 * occurred — never used as a "normal income month" baseline afterward
 * (D11). `medianMonthlyInflow` must be the trailing-12-month MEDIAN, never
 * a mean (D10) — the caller (aggregateMonthly) is responsible for that.
 */
export function isExceptionalMonth(
  monthlyInflow: number,
  medianMonthlyInflow: number | null,
  hasLoanInflow: boolean,
  hasLargeTransaction: boolean,
  multiplier: number,
): ExceptionalMonthResult {
  if (hasLoanInflow) return { isExceptional: true, reason: 'A loan/borrowing inflow was detected this month.' }
  if (hasLargeTransaction) return { isExceptional: true, reason: 'A large one-time transaction materially changed this month.' }
  if (medianMonthlyInflow !== null && medianMonthlyInflow > 0 && monthlyInflow > medianMonthlyInflow * multiplier) {
    return { isExceptional: true, reason: `Inflow this month is more than ${multiplier}x the trailing median monthly inflow.` }
  }
  return { isExceptional: false, reason: null }
}
