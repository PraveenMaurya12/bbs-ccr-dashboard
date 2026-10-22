import { HelpCircle, ListChecks } from 'lucide-react'

import type { MasterPossibleCause, MasterValidationRequiredItem } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

const CAUSE_LABEL: Record<MasterPossibleCause['causeConfidence'], string> = {
  OBSERVED: 'Observed',
  SUPPORTED: 'Supported',
  POSSIBLE: 'Possible',
  UNKNOWN: 'Unknown',
}
const CAUSE_COLOR: Record<MasterPossibleCause['causeConfidence'], string> = {
  OBSERVED: 'text-[#1fc16b]',
  SUPPORTED: 'text-[#8e51ff]',
  POSSIBLE: 'text-[#f6b51e]',
  UNKNOWN: 'text-[#a3a3a3]',
}

/** Spec Part 20/24/42: possible causes — never presented as established fact, each explicitly labeled observed/supported/possible/unknown. */
export function PossibleDriversSection({ causes }: { causes: MasterPossibleCause[] | null }) {
  return (
    <SectionCard icon={HelpCircle} title="Possible drivers">
      {!causes || causes.length === 0 ? (
        <NotAvailable reason="No evidence-supported possible cause was identified." />
      ) : (
        <ul className="flex flex-col gap-3">
          {causes.map((cause) => (
            <li key={cause.key} className="flex flex-col gap-1 border-b border-[#ebebeb] pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[#171717]">{cause.label}</p>
                <span className={`text-xs font-medium ${CAUSE_COLOR[cause.causeConfidence]}`}>{CAUSE_LABEL[cause.causeConfidence]}</span>
              </div>
              <p className="text-xs text-[#5c5c5c]">{cause.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

/** Spec Part 25/43: explicit validation items for CCR workflow, each with a `why`. */
export function ValidationRequiredSection({ items }: { items: MasterValidationRequiredItem[] | null }) {
  return (
    <SectionCard icon={ListChecks} title="Before resolution planning">
      {!items || items.length === 0 ? (
        <NotAvailable reason="No outstanding validation items were identified." />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item, i) => (
            <li key={i} className="flex flex-col gap-1 border-b border-[#ebebeb] pb-3 last:border-0 last:pb-0">
              <p className="text-sm font-medium text-[#171717]">{item.item}</p>
              <p className="text-xs text-[#5c5c5c]">{item.why}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
