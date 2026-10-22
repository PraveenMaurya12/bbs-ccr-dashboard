import { History } from 'lucide-react'

import type { CohortDecisionHistoryEntry } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'
import { CohortPrimaryBadge, LifecycleStateBadge } from './CohortBadges'

/** Spec Part 23's "Decision History" — every persisted version, newest first. Historical decisions are never overwritten. */
export function CohortDecisionHistoryTable({ history }: { history: CohortDecisionHistoryEntry[] }) {
  if (history.length <= 1) {
    return (
      <SectionCard icon={History} title="Decision history">
        <NotAvailable reason="Only one decision version exists so far." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={History} title="Decision history">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#ebebeb] text-left text-xs text-[#a3a3a3] uppercase">
              <th className="pb-2 font-medium">Version</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Primary cohort</th>
              <th className="pb-2 font-medium">Lifecycle</th>
              <th className="pb-2 font-medium">Pathway</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => (
              <tr key={entry.version} className="border-b border-[#ebebeb] last:border-0">
                <td className="py-2 pr-2">v{entry.version}</td>
                <td className="py-2 pr-2 text-[#5c5c5c]">{entry.generatedAt ? new Date(entry.generatedAt).toLocaleString() : '—'}</td>
                <td className="py-2 pr-2">
                  <CohortPrimaryBadge cohort={entry.primaryCohort} />
                </td>
                <td className="py-2 pr-2">
                  <LifecycleStateBadge state={entry.lifecycleState} />
                </td>
                <td className="py-2 text-[#5c5c5c]">{entry.pathway ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
