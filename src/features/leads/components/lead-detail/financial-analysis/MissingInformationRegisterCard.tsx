import { Fragment } from 'react'
import { ListChecks } from 'lucide-react'

import type { FinancialMissingInformationItem } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

const STATUS_META: Record<FinancialMissingInformationItem['status'], string> = {
  NOT_CAPTURED: 'bg-[#ffebec] text-[#fb3748]',
  PARTIAL: 'bg-[#fffaeb] text-[#f6b51e]',
}

/**
 * v4.0 spec §"Missing Information Register" — L2's own honest list of what
 * this module's data model/detection scope cannot determine, deterministic
 * and never AI-authored (same discipline as the Debt Analysis module's own
 * register). `missingInformationRegister` is optional on the wire — see
 * FinancialHealthScoreRecord's own doc comment.
 */
export function MissingInformationRegisterCard({ items }: { items: FinancialMissingInformationItem[] | undefined }) {
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
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_META[item.status]}`}>
                  {item.status === 'NOT_CAPTURED' ? 'Not captured' : 'Partial'}
                </span>
              </div>
              <p className="text-sm text-[#5c5c5c]">{item.description}</p>
              <p className="text-xs text-[#a3a3a3]">{item.reason}</p>
            </div>
          </Fragment>
        ))}
      </div>
    </SectionCard>
  )
}
