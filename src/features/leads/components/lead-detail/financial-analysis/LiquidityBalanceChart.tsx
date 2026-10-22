import { Landmark } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { formatCurrencyInr, formatMonthLabel } from '../../../utils/leadDisplay'
import type { MonthlyFinancialAggregateRecord } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * §06 Liquidity: a 12-month balance chart plus avg/min/max/low-balance-day/
 * negative-balance summary. Low balance is never automatically colored red
 * unless real evidence (a reported threshold breach) warrants it — the
 * spec's own explicit instruction.
 */
export function LiquidityBalanceChart({ months }: { months: MonthlyFinancialAggregateRecord[] }) {
  const withBalance = months.filter((m) => m.closingBalance !== null)
  if (withBalance.length === 0) {
    return (
      <SectionCard icon={Landmark} title="Liquidity">
        <NotAvailable reason="No month in this statement reports a running balance." />
      </SectionCard>
    )
  }

  const chartData = months.map((m) => ({ month: formatMonthLabel(m.periodMonth), 'Closing balance': m.closingBalance, 'Minimum balance': m.minBalance }))
  const avgBalance = withBalance.reduce((s, m) => s + m.closingBalance!, 0) / withBalance.length
  const withMinBalance = months.filter((m) => m.minBalance !== null)
  const minBalance = withMinBalance.length > 0 ? Math.min(...withMinBalance.map((m) => m.minBalance!)) : null
  const maxBalance = Math.max(...withBalance.map((m) => m.closingBalance!))
  const totalLowBalanceDays = months.some((m) => m.lowBalanceDays !== null) ? months.reduce((s, m) => s + (m.lowBalanceDays ?? 0), 0) : null
  const negativeBalanceMonths = months.filter((m) => m.hadNegativeBalance === true)
  const totalCashWithdrawals = months.reduce((s, m) => s + m.cashWithdrawals, 0)
  const totalCashDeposits = months.reduce((s, m) => s + m.cashDeposits, 0)

  return (
    <SectionCard icon={Landmark} title="Liquidity">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => formatCurrencyInr(v)} />
            <Tooltip formatter={(value) => formatCurrencyInr(Number(value))} />
            <Line type="monotone" dataKey="Closing balance" stroke="#335cff" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="Minimum balance" stroke="#a3a3a3" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <CardDivider />
      <MetricRow label="Average balance" value={formatCurrencyInr(Math.round(avgBalance))} />
      <MetricRow label="Minimum balance" value={minBalance !== null ? formatCurrencyInr(minBalance) : 'N/A'} />
      <MetricRow label="Maximum balance" value={formatCurrencyInr(maxBalance)} />
      <MetricRow label="Low-balance days" value={totalLowBalanceDays !== null ? String(totalLowBalanceDays) : 'N/A'} />
      <MetricRow label="Total cash withdrawals" value={formatCurrencyInr(totalCashWithdrawals)} />
      <MetricRow label="Total cash deposits" value={formatCurrencyInr(totalCashDeposits)} />
      {negativeBalanceMonths.length > 0 ? (
        <p className="text-xs text-[#fb3748]">Negative balance occurred in: {negativeBalanceMonths.map((m) => formatMonthLabel(m.periodMonth)).join(', ')}</p>
      ) : (
        <p className="text-xs text-[#a3a3a3]">No negative-balance events were observed.</p>
      )}
    </SectionCard>
  )
}
