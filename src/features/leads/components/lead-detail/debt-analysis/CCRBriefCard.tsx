import { useQuery } from '@tanstack/react-query'
import { Phone } from 'lucide-react'

import { debtAnalysisService } from '../../../services/debtAnalysisService'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * BBS Debt Analysis Module v3.0, §18.1 — the fixed CCR Brief template,
 * backed by the existing `getCallBriefForLead()` contract (a read-only
 * projection of the same analysis the rest of this tab already renders,
 * never a second bureau call or a second analysis engine). Fetched
 * independently from the main `/debt-analysis` query since it's a
 * separate backend endpoint with its own response shape.
 */
export function CCRBriefCard({ bbsLeadId }: { bbsLeadId: string }) {
  const query = useQuery({
    queryKey: ['debtAnalysisCallBrief', bbsLeadId],
    queryFn: () => debtAnalysisService.getCallBrief(bbsLeadId),
  })

  if (query.isPending) {
    return (
      <SectionCard icon={Phone} title="CCR brief">
        <NotAvailable reason="Loading…" />
      </SectionCard>
    )
  }

  if (query.isError) {
    return (
      <SectionCard icon={Phone} title="CCR brief">
        <NotAvailable reason="Failed to load the CCR brief." />
      </SectionCard>
    )
  }

  const brief = query.data
  if (!brief.reportAvailable || brief.status !== 'COMPLETED') {
    return (
      <SectionCard icon={Phone} title="CCR brief">
        <NotAvailable reason="The CCR brief is generated alongside the full debt analysis — not yet available for this report." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={Phone} title="CCR brief">
      <MetricRow label="Case ID" value={brief.header.caseId} />
      <MetricRow label="Customer" value={brief.header.customerName} />
      <MetricRow label="Score" value={brief.header.score !== null ? `${brief.header.score} (${brief.header.scoreBand})` : 'N/A'} />
      <MetricRow label="Mobile" value={brief.header.mobile} />
      <MetricRow label="Email" value={brief.header.email ?? 'N/A'} />
      <MetricRow label="Data quality" value={brief.header.dataQuality ?? 'N/A'} />

      <CardDivider />

      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">
          CCR discovery agenda ({brief.discoveryAgenda.length})
        </p>
        <ol className="list-inside list-decimal space-y-1 text-sm text-[#171717]">
          {brief.discoveryAgenda.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
      </div>

      {brief.accountsNeedingValidation.length > 0 && (
        <>
          <CardDivider />
          <div>
            <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">
              Accounts needing validation ({brief.accountsNeedingValidation.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {brief.accountsNeedingValidation.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[#171717]">
                    {item.lender} — {item.accountType}
                  </span>
                  <span className="shrink-0 text-xs text-[#a3a3a3]">
                    {item.issue} → {item.action}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </SectionCard>
  )
}
