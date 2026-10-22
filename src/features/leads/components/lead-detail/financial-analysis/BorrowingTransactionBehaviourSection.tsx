import { Activity } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { FinancialRiskFlagRecord, MonthlyFinancialAggregateRecord, NormalizedTransactionRecord } from '../../../types'
import { CardDivider, MetricRow, SectionCard } from '../shared/SectionCard'

/** §07 — Borrowing (loan inflows, dependency, lender count) and Transaction Behaviour (count/UPI/P2P/cash/ATM/self-transfers) side by side, since both describe behavioural patterns over the same transaction set. */
export function BorrowingTransactionBehaviourSection({ months, transactions, riskFlags }: { months: MonthlyFinancialAggregateRecord[]; transactions: NormalizedTransactionRecord[]; riskFlags: FinancialRiskFlagRecord[] }) {
  const totalInflow = months.reduce((s, m) => s + m.totalInflow, 0)
  const totalLoanInflows = months.reduce((s, m) => s + m.loanInflows, 0)
  const dependencyPercent = totalInflow > 0 ? Math.round((totalLoanInflows / totalInflow) * 100) : 0
  const borrowingMonths = months.filter((m) => m.loanInflows > 0)
  const lenders = new Set(transactions.filter((t) => t.lender).map((t) => t.lender))
  const hasDependencyPattern = riskFlags.some((f) => f.key === 'BORROWING_DEPENDENCY_PATTERN')

  const upiCount = transactions.filter((t) => /\bupi\b/i.test(t.narration)).length
  const p2pCount = transactions.filter((t) => t.category === 'TRANSFERS' && t.subcategory === 'P2P transfer').length
  const cashCount = transactions.filter((t) => t.category === 'CASH').length
  const selfTransferCount = transactions.filter((t) => t.subcategory === 'Self transfer').length
  const avgTxnPerMonth = months.length > 0 ? Math.round(transactions.length / months.length) : 0

  return (
    <SectionCard icon={Activity} title="Borrowing & transaction behaviour">
      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Borrowing</p>
        <MetricRow label="Loan inflows" value={formatCurrencyInr(totalLoanInflows)} />
        <MetricRow label="Borrowing dependency" value={`${dependencyPercent}%`} />
        <MetricRow label="Months with a loan inflow" value={String(borrowingMonths.length)} />
        <MetricRow label="Distinct lenders" value={String(lenders.size)} />
        {hasDependencyPattern && (
          <p className="mt-1 text-xs text-[#fa7319]">
            A loan credit followed by large subsequent spending and a low balance was observed — this is an investigation signal only, not a conclusion.
          </p>
        )}
      </div>

      <CardDivider />

      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Transaction behaviour</p>
        <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
          {[
            { label: 'Total', value: transactions.length },
            { label: 'UPI', value: upiCount },
            { label: 'P2P', value: p2pCount },
            { label: 'Cash', value: cashCount },
            { label: 'Self-transfer', value: selfTransferCount },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-[#f7f7f7] p-2">
              <p className="text-[10px] text-[#a3a3a3] uppercase">{stat.label}</p>
              <p className="text-sm font-medium text-[#171717]">{stat.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-[#a3a3a3]">~{avgTxnPerMonth} transactions/month on average — descriptive, not inherently negative.</p>
      </div>
    </SectionCard>
  )
}
