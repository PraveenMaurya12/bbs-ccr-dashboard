import { CalendarClock, ClipboardList } from 'lucide-react'

import type { BbsPlanReport } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

/** Monitoring & Reassessment triggers — data, never an actually-scheduled background job (no scheduler infra exists in this codebase), same discipline as Cohort Engine's own nextReviewEvent. */
export function PlanMonitoringPanel({ plan }: { plan: BbsPlanReport }) {
  const monitoring = plan.monitoringTriggers
  const review = plan.reviewSchedule

  return (
    <SectionCard icon={CalendarClock} title="Monitoring & review">
      {!review && !monitoring ? (
        <NotAvailable reason="No monitoring/review schedule is available for this plan." />
      ) : (
        <>
          {review && <p className="text-sm text-[#171717]">Next review due in {review.nextReviewDueInDays} day(s) — cadence: Day {review.cadenceDays.join(' / ')}</p>}
          {monitoring && (
            <>
              <CardDivider />
              <p className="text-xs text-[#a3a3a3]">Event triggers: {monitoring.eventTriggers.map((t) => t.replace(/_/g, ' ')).join(', ')}</p>
            </>
          )}
        </>
      )}
    </SectionCard>
  )
}

/** Surfaces the Cohort Decision's own missing-data items this plan inherited (the X1/thinner-template path) — never a dead end. */
export function PlanMissingDataPanel({ plan }: { plan: BbsPlanReport }) {
  const items = plan.missingData ?? []
  if (items.length === 0) return null

  return (
    <SectionCard icon={ClipboardList} title="Missing data — before this plan can progress">
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
