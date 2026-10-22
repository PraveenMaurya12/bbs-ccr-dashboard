import { Fragment } from 'react'
import { ListChecks } from 'lucide-react'

import type { MasterMissingInformationItem, MirPriority } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

const PRIORITY_META: Record<MirPriority, { label: string; textClassName: string; bgClassName: string }> = {
  P1: { label: 'P1 — Critical', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  P2: { label: 'P2 — Important', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  P3: { label: 'P3 — Informational', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
}

const PRIORITY_ORDER: MirPriority[] = ['P1', 'P2', 'P3']

/**
 * v3.0 §20: the Missing Information Register, tiered P1 (critical) / P2
 * (important) / P3 (informational) — deterministic, never AI-authored,
 * and never fabricated when the backend has not populated it.
 */
export function MasterMissingInformationRegisterCard({ items }: { items: MasterMissingInformationItem[] | undefined }) {
  if (!items) {
    return (
      <SectionCard icon={ListChecks} title="Missing information register">
        <NotAvailable reason="Missing information register unavailable — this field was not included in this profile response." />
      </SectionCard>
    )
  }

  if (items.length === 0) {
    return (
      <SectionCard icon={ListChecks} title="Missing information register">
        <NotAvailable reason="No missing-information items were raised for this profile." />
      </SectionCard>
    )
  }

  const unresolvedCount = items.filter((item) => !item.resolved).length
  const presentPriorities = PRIORITY_ORDER.filter((priority) => items.some((item) => item.priority === priority))

  return (
    <SectionCard icon={ListChecks} title={`Missing information register (${unresolvedCount} open of ${items.length})`}>
      <div className="flex flex-col gap-4">
        {presentPriorities.map((priority, i) => {
          const meta = PRIORITY_META[priority]
          const group = items.filter((item) => item.priority === priority)
          return (
            <Fragment key={priority}>
              {i > 0 && <CardDivider />}
              <div className="flex flex-col gap-2">
                <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.bgClassName} ${meta.textClassName}`}>{meta.label}</span>
                <ul className="flex flex-col gap-2">
                  {group.map((item, idx) => (
                    <li key={idx} className="flex items-start justify-between gap-2 text-sm text-[#171717]">
                      <span className={item.resolved ? 'text-[#a3a3a3] line-through' : ''}>{item.itemText}</span>
                      <span className="shrink-0 rounded-full bg-[#f7f7f7] px-2 py-0.5 text-xs font-medium text-[#5c5c5c]">{item.sourceModule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Fragment>
          )
        })}
      </div>
    </SectionCard>
  )
}
