import { Fragment } from 'react'
import { ListTodo } from 'lucide-react'

import type { FinancialReviewChecklistItem, FinancialReviewChecklistStatus } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

const STATUS_META: Record<FinancialReviewChecklistStatus, string> = {
  PASS: 'bg-[#e3f7ec] text-[#1fc16b]',
  FAIL: 'bg-[#ffebec] text-[#fb3748]',
  PARTIAL: 'bg-[#fffaeb] text-[#f6b51e]',
  NOT_EVALUATED: 'bg-[#f7f7f7] text-[#5c5c5c]',
}

/**
 * v4.0 spec §23 Review Checklist — the spec's own 14 fixed questions,
 * each answered deterministically against already-computed analysis
 * fields (see calculations/final-summary.ts). `reviewChecklist` is
 * optional on the wire — a report persisted before this feature shipped
 * has no such field.
 */
export function ReviewChecklistCard({ reviewChecklist }: { reviewChecklist: FinancialReviewChecklistItem[] | undefined }) {
  if (!reviewChecklist) {
    return (
      <SectionCard icon={ListTodo} title="Review checklist">
        <NotAvailable reason="Review checklist unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  const passCount = reviewChecklist.filter((i) => i.status === 'PASS').length

  return (
    <SectionCard icon={ListTodo} title={`Review checklist (${passCount}/${reviewChecklist.length} passed)`}>
      <div className="flex flex-col gap-3">
        {reviewChecklist.map((item, i) => (
          <Fragment key={item.item}>
            {i > 0 && <CardDivider />}
            <div className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium text-[#171717]">{item.item}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_META[item.status]}`}>{item.status.replace('_', ' ')}</span>
              </div>
              <p className="text-xs text-[#5c5c5c]">{item.detail}</p>
            </div>
          </Fragment>
        ))}
      </div>
    </SectionCard>
  )
}
