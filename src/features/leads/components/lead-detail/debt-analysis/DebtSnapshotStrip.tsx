import { CreditCard, Landmark, Shield, ShieldOff, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { DebtAnalysisReport } from '../../../types'

/**
 * Layer 1 — Debt Snapshot (BBS_Debt_Analysis_Module.pdf, "Final BBS Debt
 * Analysis Output"): exactly the eight headline metrics the spec lists —
 * Total Outstanding, Secured Debt, Unsecured Debt, Active Accounts, Active
 * Lenders, Current Overdue, Card Utilization, Recent Debt. Replaces the
 * previous 4-metric FinancialSummaryStrip entirely — this is a different
 * information architecture, not a visual refresh of it.
 */
function SnapshotTile({
  icon: Icon,
  bgClassName,
  iconBgClassName,
  label,
  value,
  sublabel,
}: {
  icon: typeof Wallet
  bgClassName: string
  iconBgClassName: string
  label: string
  value: string
  sublabel?: string
}) {
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

export function DebtSnapshotStrip({ report }: { report: DebtAnalysisReport }) {
  const recent180 = report.recency.windows.find((w) => w.windowLabel === '180d') ?? null

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <SnapshotTile icon={Wallet} bgClassName="bg-[#ebf1ff]" iconBgClassName="bg-[#335cff]" label="Total outstanding" value={formatCurrencyInr(report.summary.totalOutstanding)} />
      <SnapshotTile
        icon={Shield}
        bgClassName="bg-[#e3f7ec]"
        iconBgClassName="bg-[#1fc16b]"
        label="Secured debt"
        value={report.debtBurden.securedUnsecuredAvailable ? formatCurrencyInr(report.debtBurden.securedAmount ?? 0) : 'N/A'}
        sublabel={report.debtBurden.securedUnsecuredAvailable ? `${report.debtBurden.securedPercent ?? 0}% of outstanding` : 'Not classified'}
      />
      <SnapshotTile
        icon={ShieldOff}
        bgClassName="bg-[#efebff]"
        iconBgClassName="bg-[#7d52f4]"
        label="Unsecured debt"
        value={report.debtBurden.securedUnsecuredAvailable ? formatCurrencyInr(report.debtBurden.unsecuredAmount ?? 0) : 'N/A'}
        sublabel={report.debtBurden.securedUnsecuredAvailable ? `${report.debtBurden.unsecuredPercent ?? 0}% of outstanding` : 'Not classified'}
      />
      <SnapshotTile
        icon={Landmark}
        bgClassName="bg-[#fff3eb]"
        iconBgClassName="bg-[#fa7319]"
        label="Active accounts"
        value={report.creditProfile.activeAccounts !== null ? String(report.creditProfile.activeAccounts) : 'N/A'}
      />
      <SnapshotTile icon={Users} bgClassName="bg-[#fff3eb]" iconBgClassName="bg-[#fa7319]" label="Active lenders" value={String(report.lenderExposure.activeLenders)} />
      <SnapshotTile
        icon={TrendingDown}
        bgClassName="bg-[#ffebec]"
        iconBgClassName="bg-[#fb3748]"
        label="Current overdue"
        value={report.summary.totalOverdue === null ? 'N/A' : formatCurrencyInr(report.summary.totalOverdue)}
      />
      <SnapshotTile
        icon={CreditCard}
        bgClassName="bg-[#efebff]"
        iconBgClassName="bg-[#7d52f4]"
        label="Card utilization"
        value={report.utilization.available ? `${report.utilization.utilizationPercent}%` : 'N/A'}
        sublabel={report.utilization.available ? undefined : 'No revolving facility reported'}
      />
      <SnapshotTile
        icon={TrendingUp}
        bgClassName="bg-[#fffaeb]"
        iconBgClassName="bg-[#f6b51e]"
        label="Recent debt (180d)"
        value={recent180 ? formatCurrencyInr(recent180.outstandingAmount) : 'N/A'}
        sublabel={recent180?.percentOfTotalOutstanding !== null && recent180?.percentOfTotalOutstanding !== undefined ? `${recent180.percentOfTotalOutstanding}% of outstanding` : undefined}
      />
    </div>
  )
}
