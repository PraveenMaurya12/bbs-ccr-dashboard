import { Shuffle } from 'lucide-react'

import { formatCurrencyInr, formatDateOnly } from '../../../utils/leadDisplay'
import type { DebtConsolidationResult } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * Rule 15 — flags an old loan closing while a new, larger loan opens
 * shortly after (a consolidation/refinancing signature). Previously
 * `unavailable.consolidationDetection` was a permanent stub never rendered
 * anywhere in this tab; it is now a genuinely computable result (see
 * `debtConsolidationDetection`'s own doc comment in the backend).
 */
export function DebtConsolidationCard({ consolidation }: { consolidation: DebtConsolidationResult | undefined }) {
  if (!consolidation || !consolidation.available) {
    return (
      <SectionCard icon={Shuffle} title="Consolidation / refinancing signature (Rule 15)">
        <NotAvailable reason={consolidation?.unavailableReason ?? 'This field was not included in this analysis response.'} />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={Shuffle} title="Consolidation / refinancing signature (Rule 15)">
      <MetricRow
        label="Result"
        value={<span className={consolidation.detected ? 'text-[#fa7319]' : 'text-[#1fc16b]'}>{consolidation.detected ? 'Pattern detected' : 'No pattern detected'}</span>}
      />
      <MetricRow label="Closed accounts with a known closure date" value={`${consolidation.closedAccountsWithKnownDate} / ${consolidation.closedAccountsTotal}`} />
      {consolidation.events.length > 0 && (
        <>
          <CardDivider />
          <div className="flex flex-col gap-2">
            {consolidation.events.map((event, i) => (
              <div key={i} className="rounded-xl bg-[#fff3eb] p-3 text-sm text-[#171717]">
                <span className="font-medium">{event.closedLender}</span> ({formatCurrencyInr(event.closedSanctionedAmount)}, closed {formatDateOnly(event.closedOn)}) was followed{' '}
                {event.daysBetween} day(s) later by a larger account at <span className="font-medium">{event.newAccountLender}</span> (
                {formatCurrencyInr(event.newAccountSanctionedAmount)}, opened {formatDateOnly(event.newAccountOpenedOn)}).
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  )
}
