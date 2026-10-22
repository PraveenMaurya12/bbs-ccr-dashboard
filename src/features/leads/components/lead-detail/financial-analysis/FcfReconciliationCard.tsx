import { Scale } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { FinancialFcfReconciliation } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * v4.0 spec §"Cash Flow Analysis" — theoretical FCF (Normalized Income −
 * Essential Expenses − Mandatory Debt Payments) vs. the actual net cash
 * flow already shown in the Cash Flow chart, plus where the gap between
 * them comes from. `fcfReconciliation` is optional on the wire (see
 * FinancialHealthScoreRecord's own doc comment) — a report persisted before
 * this feature shipped has no such field.
 */
export function FcfReconciliationCard({ fcfReconciliation }: { fcfReconciliation: FinancialFcfReconciliation | undefined }) {
  if (!fcfReconciliation) {
    return (
      <SectionCard icon={Scale} title="Free cash flow reconciliation">
        <NotAvailable reason="FCF reconciliation unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  if (fcfReconciliation.availability !== 'AVAILABLE') {
    return (
      <SectionCard icon={Scale} title="Free cash flow reconciliation">
        <NotAvailable reason={fcfReconciliation.detail} />
      </SectionCard>
    )
  }

  const a = fcfReconciliation.attribution

  return (
    <SectionCard icon={Scale} title="Free cash flow reconciliation">
      <div className={`rounded-xl border p-3 ${fcfReconciliation.unreconciled ? 'border-[#fa7319]/20 bg-[#fff3eb]' : 'border-[#1fc16b]/20 bg-[#e3f7ec]'}`}>
        <p className={`text-lg font-semibold ${fcfReconciliation.unreconciled ? 'text-[#fa7319]' : 'text-[#1fc16b]'}`}>
          {fcfReconciliation.unreconciled ? 'FCF unreconciled' : 'FCF reconciled'}
          {fcfReconciliation.gapPercent !== null && ` — ${fcfReconciliation.gapPercent}% gap`}
        </p>
        <p className="mt-0.5 text-xs text-[#5c5c5c]">{fcfReconciliation.detail}</p>
      </div>

      <CardDivider />
      <MetricRow label="Theoretical FCF (Income − Essential − Mandatory debt)" value={formatCurrencyInr(fcfReconciliation.totalTheoreticalFcf ?? 0)} />
      <MetricRow label="Actual net cash flow" value={formatCurrencyInr(fcfReconciliation.totalActualNetCashFlow ?? 0)} />
      <MetricRow label="Gap" value={formatCurrencyInr(fcfReconciliation.gapRupees ?? 0)} />

      {a && (
        <>
          <CardDivider />
          <div>
            <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Gap attribution</p>
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#171717]">Credit-card payments</span>
                <span className="text-[#5c5c5c]">{formatCurrencyInr(a.creditCardPayments)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#171717]">Transfers out</span>
                <span className="text-[#5c5c5c]">{formatCurrencyInr(a.transferOutflows)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#171717]">Cash withdrawals</span>
                <span className="text-[#5c5c5c]">{formatCurrencyInr(a.cashWithdrawals)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#171717]">Discretionary expenses</span>
                <span className="text-[#5c5c5c]">{formatCurrencyInr(a.discretionaryExpenses)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#171717]">Other financial / unclassified outflows</span>
                <span className="text-[#5c5c5c]">{formatCurrencyInr(a.otherFinancialAndUnclassifiedOutflows)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#171717]">Non-income inflows (loans/transfers/other credits)</span>
                <span className="text-[#5c5c5c]">{formatCurrencyInr(a.nonIncomeInflowsOffset)}</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-[#a3a3a3]">
              The five outflow buckets above, netted against the non-income-inflows offset, reconcile exactly to the gap shown above.
            </p>
          </div>
        </>
      )}
    </SectionCard>
  )
}
