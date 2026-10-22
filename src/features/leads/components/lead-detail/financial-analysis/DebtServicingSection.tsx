import { CreditCard } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { FinancialDsrBreakdown, MonthlyFinancialAggregateRecord, NormalizedTransactionRecord } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * §05 Debt & EMI: identifiable monthly EMI, DSR, coverage, active lender
 * repayments, credit-card payments — never invents an EMI figure (Rule 7's
 * own "Not determinable from statement" instruction, honored via the null
 * checks below). `dsrBreakdown` (fixed/total/with-discretionary, v4.0 spec)
 * is optional on the wire — falls back to the single existing DSR-fixed
 * figure when a persisted row predates this field.
 */
export function DebtServicingSection({
  months,
  transactions,
  dsrBreakdown,
}: {
  months: MonthlyFinancialAggregateRecord[]
  transactions: NormalizedTransactionRecord[]
  dsrBreakdown?: FinancialDsrBreakdown
}) {
  const totalDebtPayments = months.reduce((s, m) => s + m.mandatoryDebtPayments, 0)
  const totalIncome = months.reduce((s, m) => s + m.normalizedIncome, 0)
  const avgMonthlyEmi = months.length > 0 ? totalDebtPayments / months.length : 0
  const dsrPercent = totalIncome > 0 ? Math.round((totalDebtPayments / totalIncome) * 100) : null
  const coverage = totalDebtPayments > 0 && totalIncome > 0 ? (totalIncome / totalDebtPayments).toFixed(1) : null
  const creditCardPayments = months.reduce((s, m) => s + m.creditCardPayments, 0)

  const byLender = new Map<string, number>()
  for (const t of transactions) {
    if (t.direction !== 'DEBIT' || !t.lender) continue
    if (t.subcategory !== 'EMI' && t.subcategory !== 'Loan repayment') continue
    byLender.set(t.lender, (byLender.get(t.lender) ?? 0) + t.amount)
  }
  const lenders = [...byLender.entries()].sort((a, b) => b[1] - a[1])

  if (totalDebtPayments === 0) {
    return (
      <SectionCard icon={CreditCard} title="Debt & EMI">
        <NotAvailable reason="No EMI or loan repayment could be reliably identified in this statement — EMI: Not determinable from statement." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={CreditCard} title="Debt & EMI">
      <MetricRow label="Identifiable monthly EMI" value={formatCurrencyInr(Math.round(avgMonthlyEmi))} />
      {dsrBreakdown && dsrBreakdown.availability === 'AVAILABLE' ? (
        <>
          <MetricRow label="DSR — fixed (EMI/loan repayment only)" value={`${dsrBreakdown.dsrFixedPercent}%`} />
          <MetricRow label="DSR — total (incl. credit-card payments)" value={`${dsrBreakdown.dsrTotalPercent}%`} />
          <MetricRow label="DSR — with discretionary spend" value={`${dsrBreakdown.dsrWithDiscretionaryPercent}%`} />
        </>
      ) : (
        <MetricRow label="Debt Service Ratio" value={dsrPercent !== null ? `${dsrPercent}%` : 'Not reported — income unavailable'} />
      )}
      <MetricRow label="Loan repayment coverage" value={coverage !== null ? `${coverage}x` : 'N/A'} />
      <MetricRow label="Credit-card payments" value={formatCurrencyInr(creditCardPayments)} />
      <CardDivider />
      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Active lender repayments</p>
        {lenders.length === 0 ? (
          <NotAvailable reason="No lender-attributable recurring repayment was identified." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {lenders.map(([lender, amount]) => (
              <div key={lender} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-[#171717]">{lender}</span>
                <span className="text-[#5c5c5c]">{formatCurrencyInr(amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
