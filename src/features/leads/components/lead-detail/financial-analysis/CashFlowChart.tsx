import { BarChart3 } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { formatCurrencyInr, formatMonthLabel } from '../../../utils/leadDisplay'
import type { MonthlyFinancialAggregateRecord } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * §03 Cash Flow: a 12-month (or however many are covered) chart of
 * inflow/outflow/net cash flow, with deficit and exceptional months
 * highlighted directly in the data labels — never hidden in a tooltip only.
 */
export function CashFlowChart({ months }: { months: MonthlyFinancialAggregateRecord[] }) {
  if (months.length === 0) {
    return (
      <SectionCard icon={BarChart3} title="Cash flow">
        <NotAvailable reason="No monthly data is available yet." />
      </SectionCard>
    )
  }

  const chartData = months.map((m) => ({
    month: formatMonthLabel(m.periodMonth),
    Inflow: m.totalInflow,
    Outflow: -m.totalOutflow,
    'Net cash flow': m.netCashFlow,
    isExceptional: m.isExceptionalMonth,
  }))

  const totalIncome = months.reduce((s, m) => s + m.normalizedIncome, 0)
  const totalEssential = months.reduce((s, m) => s + m.essentialExpenses, 0)
  const totalDebt = months.reduce((s, m) => s + m.mandatoryDebtPayments, 0)
  const freeCashFlow = totalIncome - totalEssential - totalDebt
  const deficitMonths = months.filter((m) => m.netCashFlow < 0)
  const exceptionalMonths = months.filter((m) => m.isExceptionalMonth)

  return (
    <SectionCard icon={BarChart3} title="Cash flow">
      <MetricRow label="Free cash flow (normalized income − essential expenses − debt payments)" value={formatCurrencyInr(freeCashFlow)} />
      <CardDivider />
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => formatCurrencyInr(Math.abs(v))} />
            <Tooltip formatter={(value) => formatCurrencyInr(Math.abs(Number(value)))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Inflow" radius={[4, 4, 0, 0]} className="fill-[#1fc16b]" />
            <Bar dataKey="Outflow" radius={[0, 0, 4, 4]} className="fill-[#fb3748]" />
            <Line type="monotone" dataKey="Net cash flow" stroke="#335cff" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {(deficitMonths.length > 0 || exceptionalMonths.length > 0) && (
        <>
          <CardDivider />
          {deficitMonths.length > 0 && (
            <p className="text-xs text-[#fb3748]">Deficit months: {deficitMonths.map((m) => formatMonthLabel(m.periodMonth)).join(', ')}</p>
          )}
          {exceptionalMonths.length > 0 && (
            <p className="text-xs text-[#f6b51e]">Exceptional months: {exceptionalMonths.map((m) => formatMonthLabel(m.periodMonth)).join(', ')} — excluded from normal-income baselines.</p>
          )}
        </>
      )}
    </SectionCard>
  )
}
