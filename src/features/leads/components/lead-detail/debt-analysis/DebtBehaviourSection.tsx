import { Activity } from 'lucide-react'

import { formatCurrencyInr, formatDateOnly } from '../../../utils/leadDisplay'
import type { DebtAnalysisReport } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * Layer 3 — Debt Behaviour: Recent borrowing (Rule 5), Enquiries (Rule 12),
 * New accounts / borrowing frequency (Rule 11), Debt age (Rule 13). Payment
 * behaviour and Debt growth are rendered by RepaymentBehaviorCard and the
 * permanently-unavailable trajectory note elsewhere on this tab — kept
 * separate here to avoid duplicating either.
 */
export function DebtBehaviourSection({ report }: { report: DebtAnalysisReport }) {
  const { recency, borrowing, enquiryDetail, debtAge } = report

  return (
    <SectionCard icon={Activity} title="Debt behaviour">
      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Recent borrowing (Rule 5)</p>
        <div className="grid grid-cols-5 gap-2 text-center">
          {recency.windows.map((w) => (
            <div key={w.windowLabel} className="flex flex-col gap-0.5 rounded-lg bg-[#f7f7f7] p-2">
              <p className="text-[10px] text-[#a3a3a3] uppercase">{w.windowLabel}</p>
              <p className="text-sm font-medium text-[#171717]">{w.accountCount}</p>
            </div>
          ))}
        </div>
        {recency.substantialRecentConcentration && (
          <p className="mt-2 text-xs text-[#fa7319]">Substantial concentration of current debt in recently opened accounts (180d).</p>
        )}
      </div>

      <CardDivider />

      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">New accounts / borrowing frequency (Rule 11)</p>
        <div className="grid grid-cols-5 gap-2 text-center">
          {borrowing.windows.map((w) => (
            <div key={w.windowLabel} className="flex flex-col gap-0.5 rounded-lg bg-[#f7f7f7] p-2">
              <p className="text-[10px] text-[#a3a3a3] uppercase">{w.windowLabel}</p>
              <p className="text-sm font-medium text-[#171717]">{w.newAccountCount}</p>
            </div>
          ))}
        </div>
        {borrowing.clusterDetected && <p className="mt-2 text-xs text-[#fa7319]">A cluster of new accounts was opened within a short period.</p>}
      </div>

      <CardDivider />

      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Enquiries (Rule 12)</p>
        <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
          {enquiryDetail.windows.map((w) => (
            <div key={w.windowLabel} className="flex flex-col gap-0.5 rounded-lg bg-[#f7f7f7] p-2">
              <p className="text-[10px] text-[#a3a3a3] uppercase">{w.windowLabel}</p>
              <p className="text-sm font-medium text-[#171717]">{w.enquiryCount}</p>
            </div>
          ))}
        </div>
        <MetricRow label="Enquiries followed by a new account within 30 days" value={String(enquiryDetail.correlatedWithNewAccountCount)} />
      </div>

      <CardDivider />

      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Debt age (Rule 13)</p>
        {debtAge.oldestActiveAccountDate === null ? (
          <NotAvailable reason="No active tradelines are available for this lead." />
        ) : (
          <>
            <MetricRow label="Oldest active account" value={formatDateOnly(debtAge.oldestActiveAccountDate)} />
            <MetricRow label="Newest active account" value={formatDateOnly(debtAge.newestActiveAccountDate!)} />
            <MetricRow label="Average age of active debt" value={`${debtAge.averageActiveDebtAgeYears} yrs`} />
            <MetricRow label="Age of largest-balance account" value={`${debtAge.ageOfLargestDebtYears} yrs (${debtAge.largestDebtLender})`} />
            <MetricRow label="Credit history length" value={report.creditHistory.lengthOfHistoryYears === null ? 'N/A' : `${report.creditHistory.lengthOfHistoryYears} yrs`} />
          </>
        )}
      </div>

      {report.summary.monthlyEmi !== null && (
        <>
          <CardDivider />
          <MetricRow label="Total monthly EMI" value={formatCurrencyInr(report.summary.monthlyEmi)} />
        </>
      )}
    </SectionCard>
  )
}
