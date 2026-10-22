import { ClipboardCheck } from 'lucide-react'

import type { FinancialFinalSummary } from '../../../types'
import { SeverityBadge } from './SeverityBadge'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * v4.0 spec §25 "Final Principle" + the report's own §19 "Final Principle &
 * Summary" — a pure recap of findings already computed and shown elsewhere
 * in this tab; this never derives a new figure. "Bank statement is
 * evidence, not conclusion."
 */
export function FinalSummaryCard({ finalSummary }: { finalSummary: FinancialFinalSummary | undefined }) {
  if (!finalSummary) {
    return (
      <SectionCard icon={ClipboardCheck} title="Final principle & summary">
        <NotAvailable reason="Final summary unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ClipboardCheck} title="Final principle & summary">
      <p className="rounded-lg bg-[#eef2ff] px-3 py-2 text-xs text-[#335cff]">
        Bank statement is evidence, not conclusion — this is L2 Financial Intelligence, not a final decision.
      </p>

      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">What this analysis surfaced</p>
        <ul className="list-inside list-disc space-y-1 text-sm text-[#171717]">
          {finalSummary.topFindings.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </div>

      <CardDivider />

      <div className="flex flex-col gap-2">
        {finalSummary.dimensions.map((row, i) => (
          <div key={row.dimension}>
            {i > 0 && <CardDivider />}
            <div className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#171717]">{row.dimension}</p>
                <p className="text-xs text-[#5c5c5c]">{row.finding}</p>
              </div>
              <SeverityBadge severity={row.severity} />
            </div>
          </div>
        ))}
      </div>

      <CardDivider />
      <p className="text-sm font-medium text-[#171717]">Bottom line</p>
      <p className="text-sm text-[#5c5c5c]">{finalSummary.bottomLine}</p>
    </SectionCard>
  )
}
