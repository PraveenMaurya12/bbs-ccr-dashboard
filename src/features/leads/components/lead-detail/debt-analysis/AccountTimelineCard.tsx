import { History } from 'lucide-react'

import { formatDateOnly } from '../../../utils/leadDisplay'
import type { AccountOpeningVelocityWindow, AccountTimelineResult } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

const CHURN_PATTERN_META: Record<NonNullable<AccountTimelineResult['churnPattern']>, { label: string; textClassName: string; bgClassName: string }> = {
  HIGH_VELOCITY: { label: 'High velocity', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  MODERATE: { label: 'Moderate', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  LOW: { label: 'Low', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
}

/**
 * BBS Debt Analysis Module v3.0, §14.5/§8.4 — the year-by-year opened/
 * closed/net-active table and churn events both honestly reflect
 * `closedAccountsWithKnownDate` vs `closedAccountsTotal`: any CLOSED
 * account persisted before the `closedOn` column existed is excluded from
 * both rather than silently misplaced. The coverage note below makes that
 * gap visible rather than presenting an understated timeline as complete.
 */
export function AccountTimelineCard({
  timeline,
  openingVelocity,
}: {
  timeline: AccountTimelineResult | undefined
  openingVelocity: AccountOpeningVelocityWindow[] | undefined
}) {
  if (!timeline) {
    return (
      <SectionCard icon={History} title="Account timeline">
        <NotAvailable reason="Account timeline unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  const coverageIncomplete = timeline.closedAccountsTotal > 0 && timeline.closedAccountsWithKnownDate < timeline.closedAccountsTotal

  return (
    <SectionCard icon={History} title="Account timeline">
      {openingVelocity && openingVelocity.length > 0 && (
        <>
          <div>
            <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Accounts opened by window</p>
            <div className="grid grid-cols-5 gap-2 text-center">
              {openingVelocity.map((w) => (
                <div key={w.windowLabel} className="rounded-lg bg-[#f7f7f7] p-2">
                  <p className="text-[10px] text-[#a3a3a3] uppercase">{w.windowLabel}</p>
                  <p className="text-sm font-medium text-[#171717]">{w.accountsOpened}</p>
                </div>
              ))}
            </div>
          </div>
          <CardDivider />
        </>
      )}

      <MetricRow label="Credit age" value={timeline.creditAgeMonths !== null ? `${timeline.creditAgeMonths} months` : 'N/A'} />
      <MetricRow label="Average account age" value={timeline.averageAccountAgeMonths !== null ? `${timeline.averageAccountAgeMonths} months` : 'N/A'} />
      <MetricRow label="Oldest account" value={timeline.oldestAccountDate ? formatDateOnly(timeline.oldestAccountDate) : 'N/A'} />
      <MetricRow label="Oldest active account" value={timeline.oldestActiveAccountDate ? formatDateOnly(timeline.oldestActiveAccountDate) : 'N/A'} />

      {timeline.churnRatePerYear !== null && timeline.churnPattern && (
        <div className={`flex items-center justify-between rounded-xl p-3 ${CHURN_PATTERN_META[timeline.churnPattern].bgClassName}`}>
          <span className={`text-sm font-medium ${CHURN_PATTERN_META[timeline.churnPattern].textClassName}`}>
            Account churn: {CHURN_PATTERN_META[timeline.churnPattern].label}
          </span>
          <span className={`text-sm ${CHURN_PATTERN_META[timeline.churnPattern].textClassName}`}>{timeline.churnRatePerYear} accounts/year</span>
        </div>
      )}

      {timeline.yearly.length > 0 && (
        <>
          <CardDivider />
          <div>
            <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Accounts by year</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] text-[#a3a3a3] uppercase">
                <span className="flex-1">Year</span>
                <span className="w-16 text-right">Opened</span>
                <span className="w-16 text-right">Closed</span>
                <span className="w-20 text-right">Net active</span>
              </div>
              {timeline.yearly.map((y) => (
                <div key={y.year} className="flex items-center justify-between text-sm">
                  <span className="flex-1 text-[#171717]">{y.year}</span>
                  <span className="w-16 text-right text-[#171717]">{y.opened}</span>
                  <span className="w-16 text-right text-[#171717]">{y.closed}</span>
                  <span className="w-20 text-right text-[#171717]">{y.netActive}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {coverageIncomplete && (
        <p className="rounded-lg bg-[#fff3eb] px-3 py-2 text-xs text-[#fa7319]">
          {timeline.closedAccountsTotal - timeline.closedAccountsWithKnownDate} of {timeline.closedAccountsTotal} closed account(s) have no
          recorded closure date (reported before this field existed) — closed counts above understate real closures until this lead is
          reprocessed.
        </p>
      )}

      {timeline.churnEvents.length > 0 && (
        <>
          <CardDivider />
          <div>
            <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Churn events (closed within ~6 months)</p>
            <div className="flex flex-col gap-1.5">
              {timeline.churnEvents.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[#171717]">{e.lender}</span>
                  <span className="shrink-0 text-xs text-[#a3a3a3]">{e.lifetimeDays} days</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </SectionCard>
  )
}
