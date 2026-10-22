import { debtServicingCapacityScore } from '@/modules/financial-analysis/scoring/financial-health-scoring'
import type { MonthlyFinancialAggregateInput } from '@/modules/financial-analysis/financial-analysis.types'
import type { DataAvailability, DebtAnalysisFacts, DsrComparisonResult, ReconciliationRowResult } from '../master-profile.types'

function sum(values: number[]): number {
  return values.reduce((t, v) => t + v, 0)
}

/**
 * Spec Part 11/12: compares what the credit report SAYS is owed against
 * what the bank statement SHOWS being paid.
 *
 * - Bureau DSR is a pure passthrough of Debt Analysis's own
 *   debtServiceRatio() result — never recalculated here.
 * - Bank DSR calls Financial Analysis's own exported
 *   debtServicingCapacityScore() and reads its `evidence.dsrPercent`,
 *   rather than re-deriving `mandatoryDebtPayments / normalizedIncome` by
 *   hand — so a future change to that formula can't silently diverge
 *   between the two modules.
 * - Master DSR is the one genuinely new calculation here: confirmed
 *   recurring obligations AFTER reconciliation (MATCHED/PARTIALLY_MATCHED
 *   rows only) divided by normalized income — the spec's own definition of
 *   "validated recurring obligations".
 */
export function compareDebtServicing(
  debt: Pick<DebtAnalysisFacts, 'debtServiceRatio'>,
  months: MonthlyFinancialAggregateInput[],
  activeLenderCount: number | null,
  reconciliationRows: ReconciliationRowResult[],
): DsrComparisonResult {
  const bureauDsr = {
    availability: debt.debtServiceRatio.availability,
    percent: debt.debtServiceRatio.debtServiceRatioPercent,
  }

  const bankScore = debtServicingCapacityScore(months, activeLenderCount)
  const bankDsr = {
    availability: bankScore.availability,
    percent: bankScore.availability === 'AVAILABLE' ? ((bankScore.evidence.dsrPercent as number) ?? null) : null,
  }

  const totalIncome = sum(months.map((m) => m.normalizedIncome))
  const confirmedRows = reconciliationRows.filter((r) => r.matchStatus === 'MATCHED' || r.matchStatus === 'PARTIALLY_MATCHED')
  const confirmedMonthlyObligations = confirmedRows.length > 0 ? sum(confirmedRows.map((r) => r.reportedEmi ?? 0)) : null

  let masterDsr: DsrComparisonResult['masterDsr']
  if (totalIncome <= 0) {
    masterDsr = { availability: 'NOT_REPORTED' as DataAvailability, percent: null, confirmedMonthlyObligations }
  } else if (confirmedMonthlyObligations === null) {
    masterDsr = { availability: 'INSUFFICIENT_DATA' as DataAvailability, percent: null, confirmedMonthlyObligations: null }
  } else {
    // totalIncome above is a sum across every observed month; express
    // confirmed monthly obligations on the same monthly basis for a
    // meaningful ratio.
    const averageMonthlyIncome = totalIncome / months.length
    masterDsr = {
      availability: 'AVAILABLE' as DataAvailability,
      percent: averageMonthlyIncome > 0 ? Math.round((confirmedMonthlyObligations / averageMonthlyIncome) * 100) : null,
      confirmedMonthlyObligations,
    }
  }

  const debtCoverage =
    masterDsr.availability === 'AVAILABLE' && masterDsr.confirmedMonthlyObligations && masterDsr.confirmedMonthlyObligations > 0
      ? { availability: 'AVAILABLE' as DataAvailability, ratio: Math.round(((totalIncome / months.length) / masterDsr.confirmedMonthlyObligations) * 10) / 10 }
      : { availability: 'NOT_REPORTED' as DataAvailability, ratio: null }

  return { bureauDsr, bankDsr, masterDsr, debtCoverage }
}
