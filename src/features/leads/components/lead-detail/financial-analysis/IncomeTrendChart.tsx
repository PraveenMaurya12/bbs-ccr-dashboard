import { TrendingUp } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { formatCurrencyInr, formatMonthLabel } from '../../../utils/leadDisplay'
import type { MonthlyFinancialAggregateRecord } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  }
  return sorted[mid] ?? 0
}

/** §02 Income's own 12-month trend — average/median/concentration summary alongside the chart. */
export function IncomeTrendChart({ months }: { months: MonthlyFinancialAggregateRecord[] }) {
  const incomes = months.map((m) => m.normalizedIncome)
  if (incomes.every((v) => v === 0)) {
    return (
      <SectionCard icon={TrendingUp} title="Income trend">
        <NotAvailable reason="No normalized income was identified across any month." />
      </SectionCard>
    )
  }

  const average = incomes.reduce((s, v) => s + v, 0) / incomes.length
  const med = median(incomes)
  const chartData = months.map((m) => ({ month: formatMonthLabel(m.periodMonth), Income: m.normalizedIncome }))

  return (
    <SectionCard icon={TrendingUp} title="Income trend">
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => formatCurrencyInr(v)} />
            <Tooltip formatter={(value) => formatCurrencyInr(Number(value))} />
            <Line type="monotone" dataKey="Income" stroke="#1fc16b" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <CardDivider />
      <MetricRow label="Average monthly income" value={formatCurrencyInr(Math.round(average))} />
      <MetricRow label="Median monthly income" value={med !== null ? formatCurrencyInr(Math.round(med)) : 'N/A'} />
    </SectionCard>
  )
}
