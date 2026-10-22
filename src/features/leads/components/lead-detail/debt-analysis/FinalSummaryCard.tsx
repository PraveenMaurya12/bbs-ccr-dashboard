import { ClipboardCheck } from 'lucide-react'

import type { FinalSummaryRow } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'
import { RiskSignalSeverityBadge } from './RiskSignalSeverityBadge'

/**
 * BBS Debt Analysis Module v3.0, §17/§23 — a pure recap of findings already
 * computed and shown elsewhere in this tab; this never derives a new
 * figure. "Credit score is the starting point, not the conclusion."
 */
export function FinalSummaryCard({ rows }: { rows: FinalSummaryRow[] | undefined }) {
  if (!rows) {
    return (
      <SectionCard icon={ClipboardCheck} title="Final summary">
        <NotAvailable reason="Final summary unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ClipboardCheck} title="Final summary">
      <p className="rounded-lg bg-[#eef2ff] px-3 py-2 text-xs text-[#335cff]">
        Credit score is the starting point, not the conclusion — the bureau shows what happened, not why, or what is next.
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={row.dimension}>
            {i > 0 && <CardDivider />}
            <div className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#171717]">{row.dimension}</p>
                <p className="text-xs text-[#5c5c5c]">{row.finding}</p>
              </div>
              <RiskSignalSeverityBadge severity={row.severity} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
