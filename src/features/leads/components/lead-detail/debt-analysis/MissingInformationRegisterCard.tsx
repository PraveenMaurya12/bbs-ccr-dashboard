import { Fragment } from 'react'
import { ListChecks } from 'lucide-react'

import type { MissingInformationItem } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * BBS Debt Analysis Module v3.0, §5.5 — "a first-class output of L1: it
 * explicitly lists what BBS does not know." Deterministic, never
 * AI-authored. Optional on the wire for the same reason as the other new
 * fields this phase — added after this module first shipped.
 */
export function MissingInformationRegisterCard({ items }: { items: MissingInformationItem[] | undefined }) {
  if (!items) {
    return (
      <SectionCard icon={ListChecks} title="Missing information register">
        <NotAvailable reason="Missing information register unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  if (items.length === 0) {
    return (
      <SectionCard icon={ListChecks} title="Missing information register">
        <NotAvailable reason="No missing-information items were raised for this report." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ListChecks} title={`Missing information register (${items.length})`}>
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <Fragment key={item.category}>
            {i > 0 && <CardDivider />}
            <div className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium text-[#171717]">{item.category}</p>
                <span className="shrink-0 rounded-full bg-[#f7f7f7] px-2 py-0.5 text-xs font-medium text-[#5c5c5c]">{item.whoResolves}</span>
              </div>
              <p className="text-sm text-[#5c5c5c]">{item.whatL1CannotDetermine}</p>
            </div>
          </Fragment>
        ))}
      </div>
    </SectionCard>
  )
}
