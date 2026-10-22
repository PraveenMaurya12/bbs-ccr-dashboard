import { CalendarClock, ClipboardList } from 'lucide-react'

import type { CohortDecisionReport } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

/** Spec Part 23's "Missing Data" panel for the X1 path — never a dead end. */
export function CohortMissingDataPanel({ decision }: { decision: CohortDecisionReport }) {
  const items = decision.missingData ?? []
  if (items.length === 0) return null

  return (
    <SectionCard icon={ClipboardList} title="Missing data — before resolution planning">
      <ul className="flex flex-col gap-3">
        {items.map((item, i) => (
          <li key={i} className="flex flex-col gap-1 border-b border-[#ebebeb] pb-3 last:border-0 last:pb-0">
            <p className="text-sm font-medium text-[#171717]">{item.field}</p>
            <p className="text-xs text-[#5c5c5c]">{item.why}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#a3a3a3]">
              {item.document && <span>Document: {item.document}</span>}
              <span>Owner: {item.owner}</span>
              <span>Next: {item.nextAction}</span>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

/** Spec Part 23's "Next Review" indicator — Day 30/60/90 or event triggers, never an actually-scheduled background job (no scheduler infra exists in this codebase). */
export function NextReviewPanel({ decision }: { decision: CohortDecisionReport }) {
  return (
    <SectionCard icon={CalendarClock} title="Next review">
      {!decision.nextReviewEvent ? (
        <NotAvailable reason="No review schedule is available for this decision." />
      ) : (
        <>
          <p className="text-sm text-[#171717]">Scheduled check-ins: Day {decision.nextReviewEvent.scheduledDaysFromNow.join(' / ')}</p>
          <CardDivider />
          <p className="text-xs text-[#a3a3a3]">Event triggers: {decision.nextReviewEvent.eventTriggers.map((t) => t.replace(/_/g, ' ')).join(', ')}</p>
        </>
      )}
    </SectionCard>
  )
}
