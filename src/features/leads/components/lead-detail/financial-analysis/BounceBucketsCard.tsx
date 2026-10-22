import { AlertCircle } from 'lucide-react'

import { formatDateOnly, formatCurrencyInr } from '../../../utils/leadDisplay'
import type { NormalizedTransactionRecord } from '../../../types'
import { CardDivider, SectionCard } from '../shared/SectionCard'

const BUCKETS: { key: 'CONFIRMED_BOUNCE' | 'POSSIBLE_BOUNCE' | 'UNKNOWN'; label: string; textClassName: string; bgClassName: string }[] = [
  { key: 'CONFIRMED_BOUNCE', label: 'Confirmed', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  { key: 'POSSIBLE_BOUNCE', label: 'Possible', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  { key: 'UNKNOWN', label: 'Unknown', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
]

/**
 * Rule 13/20's strict 3-tier bounce evidence — rendered as 3 genuinely
 * separate buckets, NEVER merged into one count (the spec's own explicit
 * instruction, and the one rule this component exists specifically to
 * honor). A Possible bounce (fee-only evidence) is never promoted into the
 * Confirmed bucket just because it's displayed nearby.
 */
export function BounceBucketsCard({ transactions }: { transactions: NormalizedTransactionRecord[] }) {
  const byBucket = BUCKETS.map((bucket) => ({ ...bucket, items: transactions.filter((t) => t.bounceEvidence === bucket.key) }))
  const anyBounceEvidence = byBucket.some((b) => b.items.length > 0)

  return (
    <SectionCard icon={AlertCircle} title="Bounce / return events">
      {!anyBounceEvidence ? (
        <p className="text-sm text-[#a3a3a3]">No bounce or return evidence was identified in this statement.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {byBucket.map((bucket, i) => (
            <div key={bucket.key} className={`flex flex-col gap-2 rounded-xl p-3 ${bucket.bgClassName}`}>
              <p className={`text-xs font-semibold uppercase ${bucket.textClassName}`}>{bucket.label} ({bucket.items.length})</p>
              {bucket.items.length === 0 ? (
                <p className="text-xs text-[#a3a3a3]">None.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {bucket.items.map((t, j) => (
                    <div key={t.id}>
                      {j > 0 && <CardDivider />}
                      <p className="truncate text-xs text-[#171717]" title={t.narration}>{t.narration}</p>
                      <p className="text-xs text-[#5c5c5c]">{formatDateOnly(t.transactionDate)} · {formatCurrencyInr(t.amount)}</p>
                    </div>
                  ))}
                </div>
              )}
              {i === 1 && <p className="text-[10px] text-[#a3a3a3]">Fee-only evidence — never treated as confirmed (D06).</p>}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
