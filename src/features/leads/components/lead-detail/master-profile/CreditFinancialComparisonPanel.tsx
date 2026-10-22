import { Columns3, LayoutGrid } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { DebtAnalysisReport, FinancialAnalysisReport } from '../../../types'
import { CardDivider, MetricRow, SectionCard, Stat } from '../shared/SectionCard'

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null
}

/**
 * Spec Part 7/33: the Financial Snapshot — key facts drawn directly from
 * Debt Analysis and Financial Analysis's own already-computed figures,
 * never recalculated here. Per the spec's own instruction ("do not
 * duplicate the entire Debt Analysis page"), this is a small, fixed set of
 * headline metrics with a pointer back to each module's own full tab for
 * detail.
 */
export function FinancialSnapshotGrid({ debt, financial }: { debt: DebtAnalysisReport; financial: FinancialAnalysisReport }) {
  const avgIncome = average(financial.months.map((m) => m.normalizedIncome))
  const avgDebtService = average(financial.months.map((m) => m.mandatoryDebtPayments))
  const avgFreeCashFlow = average(financial.months.map((m) => m.netCashFlow))
  const avgMinBalance = average(financial.months.filter((m) => m.minBalance !== null).map((m) => m.minBalance!))

  return (
    <SectionCard icon={LayoutGrid} title="Financial snapshot">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Credit score" value={debt.creditProfile.creditScore !== null ? String(debt.creditProfile.creditScore) : 'N/A'} />
        <Stat label="Total debt" value={formatCurrencyInr(debt.summary.totalOutstanding)} />
        <Stat label="Current overdue" value={debt.summary.totalOverdue !== null ? formatCurrencyInr(debt.summary.totalOverdue) : 'N/A'} />
        <Stat label="Normalized income" value={avgIncome !== null ? formatCurrencyInr(Math.round(avgIncome)) : 'N/A'} />
        <Stat label="Monthly debt service" value={avgDebtService !== null ? formatCurrencyInr(Math.round(avgDebtService)) : 'N/A'} />
        <Stat label="Free cash flow" value={avgFreeCashFlow !== null ? formatCurrencyInr(Math.round(avgFreeCashFlow)) : 'N/A'} />
        <Stat label="Liquidity (avg min balance)" value={avgMinBalance !== null ? formatCurrencyInr(Math.round(avgMinBalance)) : 'N/A'} />
        <Stat label="Financial stress" value={financial.score.stressBand} />
      </div>
    </SectionCard>
  )
}

/** Spec Part 34: two-column Credit Report vs. Bank Statement comparison — the signature side-by-side view. */
export function CreditFinancialComparisonPanel({ debt, financial }: { debt: DebtAnalysisReport; financial: FinancialAnalysisReport }) {
  const avgIncome = average(financial.months.map((m) => m.normalizedIncome))

  return (
    <SectionCard icon={Columns3} title="Credit report vs. bank statement">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Credit report</p>
          <MetricRow label="Score" value={debt.creditProfile.creditScore ?? 'N/A'} />
          <MetricRow label="Total debt" value={formatCurrencyInr(debt.summary.totalOutstanding)} />
          <MetricRow label="Overdue" value={debt.summary.totalOverdue !== null ? formatCurrencyInr(debt.summary.totalOverdue) : 'N/A'} />
          <MetricRow label="Current DPD" value={debt.delinquency.currentMaxDpd ?? 'N/A'} />
          <MetricRow label="Utilization" value={debt.utilization.available && debt.utilization.utilizationPercent !== null ? `${debt.utilization.utilizationPercent}%` : 'N/A'} />
          <MetricRow label="Active lenders" value={debt.debtBurden.numbersOfLenders} />
          <MetricRow label="Recent enquiries" value={debt.creditProfile.recentEnquiries ?? 'N/A'} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Bank statement</p>
          <MetricRow label="Normalized income" value={avgIncome !== null ? formatCurrencyInr(Math.round(avgIncome)) : 'N/A'} />
          <MetricRow label="Cash flow" value={financial.score.cashFlowStrengthAvailability === 'AVAILABLE' ? `${financial.score.cashFlowStrengthScore}/15` : 'N/A'} />
          <MetricRow label="Debt payments observed" value={financial.score.debtServicingCapacityAvailability === 'AVAILABLE' ? `${financial.score.debtServicingCapacityScore}/20` : 'N/A'} />
          <MetricRow label="Liquidity" value={financial.score.liquidityAvailability === 'AVAILABLE' ? `${financial.score.liquidityScore}/15` : 'N/A'} />
          <MetricRow label="Borrowing inflows" value={financial.score.borrowingDependencyAvailability === 'AVAILABLE' ? `${financial.score.borrowingDependencyScore}/10` : 'N/A'} />
          <MetricRow label="Observed repayments" value={financial.riskFlags.filter((f) => f.key === 'CREDIT_BANK_MATCH').length} />
        </div>
      </div>
      <CardDivider />
      <p className="text-xs text-[#a3a3a3]">See the Debt Analysis and Financial Analysis tabs for the full detail behind each figure above.</p>
    </SectionCard>
  )
}
