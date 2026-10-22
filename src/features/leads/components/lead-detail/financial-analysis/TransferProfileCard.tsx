import { Fragment } from 'react'
import { Users } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { FinancialTransferProfile } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

const CONFIDENCE_META: Record<'HIGH' | 'MEDIUM', string> = {
  HIGH: 'bg-[#e3f7ec] text-[#1fc16b]',
  MEDIUM: 'bg-[#fffaeb] text-[#f6b51e]',
}

const LRT_BAND_META: Record<'LRT_HIGH' | 'LRT_MEDIUM', string> = {
  LRT_HIGH: 'bg-[#ffebec] text-[#fb3748]',
  LRT_MEDIUM: 'bg-[#fffaeb] text-[#f6b51e]',
}

/**
 * v4.0 spec §5.8 Transfer Profile Output — self-transfers, round-trips, the
 * INFERRED family network (never a verified relationship — see this
 * component's own badge, which always reads "inferred"), large recurring
 * transfers, business counterparties, and unattributed P2P activity.
 * `transferProfile` is optional on the wire — a report persisted before
 * this feature shipped has no such field.
 */
export function TransferProfileCard({ transferProfile }: { transferProfile: FinancialTransferProfile | undefined }) {
  if (!transferProfile) {
    return (
      <SectionCard icon={Users} title="Transfer & P2P analysis">
        <NotAvailable reason="Transfer profile unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  const { selfTransfers, roundTrips, familyNetwork, largeRecurringTransfers, businessCounterparties, unclassifiedP2pCount } = transferProfile

  return (
    <SectionCard icon={Users} title="Transfer & P2P analysis">
      <MetricRow label="Self-transfers" value={`${selfTransfers.count} (net ${formatCurrencyInr(selfTransfers.net)})`} />
      <MetricRow label="Round trips (excluded from income/expense)" value={`${roundTrips.count} (₹${roundTrips.volume})`} />
      <MetricRow label="Unattributed P2P transfers" value={unclassifiedP2pCount} />

      <CardDivider />
      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">
          Family / household network <span className="normal-case">(inferred — never a confirmed relationship)</span>
        </p>
        {familyNetwork.length === 0 ? (
          <NotAvailable reason="No counterparty matched enough signals to suggest a family/household transfer." />
        ) : (
          <div className="flex flex-col gap-2">
            {familyNetwork.map((f, i) => (
              <Fragment key={f.counterparty}>
                {i > 0 && <CardDivider />}
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[#171717]">{f.counterparty}</span>
                  <span className="shrink-0 text-[#5c5c5c]">
                    {f.direction.toLowerCase()}, net {formatCurrencyInr(f.netFlow)}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_META[f.confidence]}`}>{f.confidence}</span>
                </div>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      <CardDivider />
      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Large recurring transfers</p>
        {largeRecurringTransfers.length === 0 ? (
          <NotAvailable reason="No counterparty cleared the large-recurring-transfer thresholds." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {largeRecurringTransfers.map((l) => (
              <div key={l.counterparty} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-[#171717]">{l.counterparty}</span>
                <span className="shrink-0 text-[#5c5c5c]">
                  {l.occurrences}× · {formatCurrencyInr(l.totalVolume)} total
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${LRT_BAND_META[l.band]}`}>{l.band.replace('LRT_', '')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {businessCounterparties.length > 0 && (
        <>
          <CardDivider />
          <div>
            <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Business counterparties</p>
            <div className="flex flex-col gap-1.5">
              {businessCounterparties.map((b) => (
                <div key={b.counterparty} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[#171717]">{b.counterparty}</span>
                  <span className="shrink-0 text-[#5c5c5c]">
                    {b.occurrences}× · {formatCurrencyInr(b.totalVolume)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </SectionCard>
  )
}
