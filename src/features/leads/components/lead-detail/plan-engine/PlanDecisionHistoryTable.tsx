import { History } from 'lucide-react'

import type { BbsPlanHistoryEntry } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'
import { CohortPrimaryBadge } from '../cohort-engine/CohortBadges'
import { PlanLifecycleBadge } from './PlanBadges'

/** Every persisted plan version, newest first — historical plans are never overwritten. */
export function PlanDecisionHistoryTable({ history }: { history: BbsPlanHistoryEntry[] }) {
  if (history.length <= 1) {
    return (
      <SectionCard icon={History} title="Plan history">
        <NotAvailable reason="Only one plan version exists so far." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={History} title="Plan history">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#ebebeb] text-left text-xs text-[#a3a3a3] uppercase">
              <th className="pb-2 font-medium">Version</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Cohort</th>
              <th className="pb-2 font-medium">Template</th>
              <th className="pb-2 font-medium">Lifecycle</th>
              <th className="pb-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => (
              <tr key={entry.version} className="border-b border-[#ebebeb] last:border-0">
                <td className="py-2 pr-2">v{entry.version}</td>
                <td className="py-2 pr-2 text-[#5c5c5c]">{entry.generatedAt ? new Date(entry.generatedAt).toLocaleString() : '—'}</td>
                <td className="py-2 pr-2">
                  <CohortPrimaryBadge cohort={entry.cohort} />
                </td>
                <td className="py-2 pr-2 text-[#5c5c5c]">{entry.templateId}</td>
                <td className="py-2">
                  <PlanLifecycleBadge status={entry.lifecycleStatus} />
                </td>
                <td className="py-2 pr-2 text-xs text-[#5c5c5c]">{entry.changeSummary ? `${entry.changeSummary.materiality} — ${entry.changeSummary.changes.map((c) => c.field).join(', ')}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
