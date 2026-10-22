import { CreditCard, Landmark, PiggyBank, TrendingDown, TrendingUp, Wallet } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { FinancialIncomeProfile, MonthlyFinancialAggregateRecord } from '../../../types'

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null
}

function Tile({ icon: Icon, label, value, sublabel, bgClassName, iconBgClassName }: { icon: typeof Wallet; label: string; value: string; sublabel?: string; bgClassName: string; iconBgClassName: string }) {
  return (
    <div className={`flex flex-1 items-start gap-3 rounded-2xl p-4 ${bgClassName}`}>
      <span className={`flex shrink-0 items-center justify-center rounded-full p-2.5 ${iconBgClassName}`}>
        <Icon className="size-5 text-white" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-mono text-xs text-[#5c5c5c] uppercase">{label}</p>
        <p className="truncate text-lg font-medium text-[#171717]">{value}</p>
        {sublabel && <p className="truncate text-xs text-[#a3a3a3]">{sublabel}</p>}
      </div>
    </div>
  )
}

/**
 * §01 Financial Overview's own 10 headline metrics — every value computed
 * directly from the real persisted monthly aggregates, never hardcoded.
 *
 * CRITICAL: "Normalized monthly income" uses the backend's canonical
 * `incomeProfile.currentMonthlyAmount` (the current recurring income
 * source's own typical amount) — NEVER an average of every month's
 * `normalizedIncome` across the whole statement window. A statement
 * spanning an income transition or employment ramp-up has real months
 * with zero recognized income before the current source existed; averaging
 * those in silently understates the customer's actual current income the
 * longer the pre-transition window is (confirmed against a real statement:
 * ₹0×4 + ₹99,715 + ₹1,10,613×7 averaged over 12 months produces ₹72,834 —
 * materially wrong when the real, current, stable salary is ₹1,10,613/month).
 * Free cash flow and DSR below are derived from this same current-income
 * figure so this row never shows internally inconsistent numbers.
 */
export function FinancialOverviewMetricsGrid({ months, incomeProfile }: { months: MonthlyFinancialAggregateRecord[]; incomeProfile: FinancialIncomeProfile | undefined }) {
  const normalizedIncome = incomeProfile?.currentMonthlyAmount ?? null
  const essentialExpenses = average(months.map((m) => m.essentialExpenses))
  const debtPayments = average(months.map((m) => m.mandatoryDebtPayments))
  const freeCashFlow = normalizedIncome !== null && essentialExpenses !== null && debtPayments !== null ? normalizedIncome - essentialExpenses - debtPayments : null

  const totalDebtPayments = months.reduce((s, m) => s + m.mandatoryDebtPayments, 0)
  const avgMonthlyDebtPayments = months.length > 0 ? totalDebtPayments / months.length : 0
  const dsrPercent = normalizedIncome !== null && normalizedIncome > 0 ? Math.round((avgMonthlyDebtPayments / normalizedIncome) * 100) : null

  const monthsWithBalance = months.filter((m) => m.closingBalance !== null)
  const averageBalance = monthsWithBalance.length > 0 ? average(monthsWithBalance.map((m) => m.closingBalance!)) : null
  const monthsWithMinBalance = months.filter((m) => m.minBalance !== null)
  const minimumBalance = monthsWithMinBalance.length > 0 ? Math.min(...monthsWithMinBalance.map((m) => m.minBalance!)) : null
  const lowBalanceDays = months.some((m) => m.lowBalanceDays !== null) ? months.reduce((s, m) => s + (m.lowBalanceDays ?? 0), 0) : null

  const loanInflows = months.reduce((s, m) => s + m.loanInflows, 0)
  const deficitMonths = months.filter((m) => m.netCashFlow < 0).length

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      <Tile icon={Wallet} bgClassName="bg-[#ebf1ff]" iconBgClassName="bg-[#335cff]" label="Normalized monthly income" value={normalizedIncome !== null ? formatCurrencyInr(normalizedIncome) : 'N/A'} />
      <Tile icon={TrendingDown} bgClassName="bg-[#fff3eb]" iconBgClassName="bg-[#fa7319]" label="Monthly essential expenses" value={essentialExpenses !== null ? formatCurrencyInr(Math.round(essentialExpenses)) : 'N/A'} />
      <Tile icon={CreditCard} bgClassName="bg-[#efebff]" iconBgClassName="bg-[#7d52f4]" label="Monthly debt payments" value={debtPayments !== null ? formatCurrencyInr(Math.round(debtPayments)) : 'N/A'} />
      <Tile icon={PiggyBank} bgClassName="bg-[#e3f7ec]" iconBgClassName="bg-[#1fc16b]" label="Free cash flow" value={freeCashFlow !== null ? formatCurrencyInr(Math.round(freeCashFlow)) : 'N/A'} />
      <Tile icon={TrendingUp} bgClassName="bg-[#fffaeb]" iconBgClassName="bg-[#f6b51e]" label="Debt service ratio" value={dsrPercent !== null ? `${dsrPercent}%` : 'N/A'} />
      <Tile icon={Landmark} bgClassName="bg-[#ebf1ff]" iconBgClassName="bg-[#335cff]" label="Average balance" value={averageBalance !== null ? formatCurrencyInr(Math.round(averageBalance)) : 'N/A'} sublabel={averageBalance === null ? 'No balance reported' : undefined} />
      <Tile icon={Landmark} bgClassName="bg-[#ffebec]" iconBgClassName="bg-[#fb3748]" label="Minimum balance" value={minimumBalance !== null ? formatCurrencyInr(minimumBalance) : 'N/A'} sublabel={minimumBalance === null ? 'No balance reported' : undefined} />
      <Tile icon={TrendingDown} bgClassName="bg-[#fff3eb]" iconBgClassName="bg-[#fa7319]" label="Low balance days" value={lowBalanceDays !== null ? String(lowBalanceDays) : 'N/A'} />
      <Tile icon={CreditCard} bgClassName="bg-[#efebff]" iconBgClassName="bg-[#7d52f4]" label="Loan inflows" value={formatCurrencyInr(loanInflows)} />
      <Tile icon={TrendingDown} bgClassName="bg-[#ffebec]" iconBgClassName="bg-[#fb3748]" label="Deficit months" value={String(deficitMonths)} sublabel={`of ${months.length} months`} />
    </div>
  )
}
