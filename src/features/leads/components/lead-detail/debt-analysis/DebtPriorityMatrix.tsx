import { ListOrdered } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { DebtPriorityMatrixEntry } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * Layer 5 — Debt Priority Matrix (Rule 24): accounts ranked by the
 * deterministic `priorityScore` the backend computes from delinquency,
 * status severity, overdue, and utilization — explicitly NOT sorted by
 * balance alone (the spec's own instruction). Each row's `reasons` shows
 * why it needs attention, never just a number.
 */
export function DebtPriorityMatrix({ entries }: { entries: DebtPriorityMatrixEntry[] }) {
  if (entries.length === 0) {
    return (
      <SectionCard icon={ListOrdered} title="Debt priority matrix (Rule 24)">
        <NotAvailable reason="No tradeline data is available for this lead yet." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ListOrdered} title="Debt priority matrix (Rule 24)">
      <div className="flex flex-col gap-3">
        {entries.map((entry, i) => (
          <div key={`${entry.lender}-${i}`} className="flex flex-col gap-1 rounded-lg bg-[#f7f7f7] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-[#171717]">
                #{i + 1} {entry.lender} ({entry.accountType})
              </span>
              <span className="shrink-0 text-sm text-[#5c5c5c]">{formatCurrencyInr(entry.currentBalance)}</span>
            </div>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-[#5c5c5c]">
              {entry.reasons.map((reason, j) => (
                <li key={j}>{reason}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
