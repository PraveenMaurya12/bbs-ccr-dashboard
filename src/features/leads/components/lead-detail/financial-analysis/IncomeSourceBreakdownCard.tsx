import { TrendingUp } from 'lucide-react'

import { formatCurrencyInr, formatDateOnly } from '../../../utils/leadDisplay'
import type { FinancialDaysToNextIncome, FinancialIncomeProfile, MonthlyFinancialAggregateRecord, NormalizedTransactionRecord } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'
import { ConcentrationBar } from '../shared/ConcentrationBar'

const SOURCE_COLORS = ['#1fc16b', '#335cff', '#7d52f4', '#fa7319', '#f6b51e']

const EMPLOYMENT_TYPE_LABEL: Record<FinancialIncomeProfile['employmentType'], string> = {
  SALARIED: 'Salaried',
  BUSINESS: 'Business',
  GIG: 'Gig',
  UNKNOWN: 'Not established',
}

/**
 * §02 Income: separates EARNED INCOME (every transaction classifyTransaction/
 * detectRecurringIncome assigned to category INCOME) from NON-INCOME
 * INFLOWS (everything else credited — loan proceeds, transfers, cash
 * deposits, refunds) — Rule 17's own core distinction, made visually
 * explicit rather than left implicit in a single gross total. Employment
 * type + tenure-confidence (v4.0 spec §6.2-6.4) and days-to-next-income
 * (§10) are purely informational additions — they never feed back into the
 * existing 9-component income stability score.
 */
export function IncomeSourceBreakdownCard({
  transactions,
  months,
  incomeProfile,
  daysToNextIncome,
}: {
  transactions: NormalizedTransactionRecord[]
  months: MonthlyFinancialAggregateRecord[]
  incomeProfile?: FinancialIncomeProfile
  daysToNextIncome?: FinancialDaysToNextIncome
}) {
  const incomeTransactions = transactions.filter((t) => t.category === 'INCOME' && t.direction === 'CREDIT')
  const earnedIncomeTotal = incomeTransactions.reduce((s, t) => s + t.amount, 0)
  const totalInflow = months.reduce((s, m) => s + m.totalInflow, 0)
  const nonIncomeInflows = Math.max(0, totalInflow - earnedIncomeTotal)

  const bySource = new Map<string, number>()
  for (const t of incomeTransactions) {
    const key = t.subcategory ?? 'Other recurring earned income'
    bySource.set(key, (bySource.get(key) ?? 0) + t.amount)
  }
  const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1])

  if (incomeTransactions.length === 0) {
    return (
      <SectionCard icon={TrendingUp} title="Income">
        <NotAvailable reason="No recurring earned income was identified in this statement." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={TrendingUp} title="Income">
      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Earned income vs. non-income inflows</p>
        <ConcentrationBar
          segments={[
            { percent: totalInflow > 0 ? Math.round((earnedIncomeTotal / totalInflow) * 100) : 0, color: '#1fc16b' },
            { percent: totalInflow > 0 ? Math.round((nonIncomeInflows / totalInflow) * 100) : 0, color: '#d1d1d1' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-medium text-[#5c5c5c]">
          <span className="flex items-center gap-1"><span className="size-3 rounded-full bg-[#1fc16b]" /> Earned income ({formatCurrencyInr(earnedIncomeTotal)})</span>
          <span className="flex items-center gap-1"><span className="size-3 rounded-full bg-[#d1d1d1]" /> Non-income inflows ({formatCurrencyInr(nonIncomeInflows)})</span>
        </div>
      </div>

      <CardDivider />

      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Income sources</p>
        <div className="flex flex-col gap-2">
          {sources.map(([source, amount], i) => (
            <div key={source} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-sm text-[#171717]">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                {source}
              </span>
              <span className="shrink-0 text-sm text-[#5c5c5c]">
                {formatCurrencyInr(amount)} ({earnedIncomeTotal > 0 ? Math.round((amount / earnedIncomeTotal) * 100) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      <CardDivider />

      <MetricRow label="Average monthly income" value={formatCurrencyInr(Math.round(months.length > 0 ? months.reduce((s, m) => s + m.normalizedIncome, 0) / months.length : 0))} />
      <MetricRow label="Primary source" value={sources[0]?.[0] ?? 'N/A'} />

      {incomeProfile && incomeProfile.availability === 'AVAILABLE' && (
        <>
          <CardDivider />
          <MetricRow label="Employment type" value={EMPLOYMENT_TYPE_LABEL[incomeProfile.employmentType]} />
          <MetricRow label="Tenure" value={incomeProfile.tenureMonths !== null ? `${incomeProfile.tenureMonths} month(s)` : 'N/A'} />
          <MetricRow label="Income confidence" value={incomeProfile.confidenceLevel ?? 'N/A'} />
          {incomeProfile.confidenceDowngradeReason && <p className="text-xs text-[#a3a3a3]">{incomeProfile.confidenceDowngradeReason}</p>}
        </>
      )}

      {daysToNextIncome && (
        <>
          <CardDivider />
          <MetricRow
            label="Days to next income"
            value={
              daysToNextIncome.availability === 'AVAILABLE'
                ? `${daysToNextIncome.daysToNextIncome} day(s) (${formatDateOnly(daysToNextIncome.nextExpectedDate!)})`
                : 'Not available'
            }
          />
          {daysToNextIncome.availability !== 'AVAILABLE' && <p className="text-xs text-[#a3a3a3]">{daysToNextIncome.reason}</p>}
        </>
      )}
    </SectionCard>
  )
}
