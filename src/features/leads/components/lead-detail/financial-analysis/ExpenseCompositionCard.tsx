import { PieChart as PieChartIcon } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { MonthlyFinancialAggregateRecord, NormalizedTransactionRecord } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

const COLORS = { Essential: '#fa7319', Financial: '#7d52f4', Discretionary: '#fb4ba3', Transfers: '#335cff', Unclassified: '#d1d1d1' }

/**
 * §04 Expenses: Essential/Financial/Discretionary/Transfers/Unclassified —
 * every category kept visually distinct, never mixed (the spec's own
 * explicit instruction). Financial here reuses the same monthly-aggregate
 * totals the Debt & EMI section shows, never a second calculation.
 */
export function ExpenseCompositionCard({ months, transactions }: { months: MonthlyFinancialAggregateRecord[]; transactions: NormalizedTransactionRecord[] }) {
  const essential = months.reduce((s, m) => s + m.essentialExpenses, 0)
  const financial = months.reduce((s, m) => s + m.financialExpenses, 0)
  const discretionary = months.reduce((s, m) => s + m.discretionaryExpenses, 0)
  const transferOutflows = months.reduce((s, m) => s + m.transferOutflows, 0)
  const unclassified = transactions.filter((t) => t.direction === 'DEBIT' && t.category === 'UNCLASSIFIED').reduce((s, t) => s + t.amount, 0)

  const total = essential + financial + discretionary + transferOutflows + unclassified
  if (total === 0) {
    return (
      <SectionCard icon={PieChartIcon} title="Expense composition">
        <NotAvailable reason="No expense transactions were identified in this statement." />
      </SectionCard>
    )
  }

  const slices = [
    { name: 'Essential', value: essential },
    { name: 'Financial', value: financial },
    { name: 'Discretionary', value: discretionary },
    { name: 'Transfers', value: transferOutflows },
    { name: 'Unclassified', value: unclassified },
  ].filter((s) => s.value > 0)

  return (
    <SectionCard icon={PieChartIcon} title="Expense composition">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <div className="relative h-[220px] w-[220px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="100%" stroke="none" isAnimationActive={false}>
                {slices.map((slice) => (
                  <Cell key={slice.name} fill={COLORS[slice.name as keyof typeof COLORS]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-lg font-medium text-[#171717]">{formatCurrencyInr(total)}</p>
            <p className="text-xs text-[#5c5c5c]">Total expenses</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          {slices.map((slice) => (
            <div key={slice.name} className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: COLORS[slice.name as keyof typeof COLORS] }} />
              <span className="min-w-0 flex-1 text-sm text-[#171717]">{slice.name}</span>
              <span className="shrink-0 text-sm text-[#5c5c5c]">
                {formatCurrencyInr(slice.value)} ({Math.round((slice.value / total) * 100)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}
