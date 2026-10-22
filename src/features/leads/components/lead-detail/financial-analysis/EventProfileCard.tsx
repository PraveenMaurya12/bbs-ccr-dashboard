import { CalendarClock } from 'lucide-react'

import { formatCurrencyInr, formatMonthLabel } from '../../../utils/leadDisplay'
import type { FinancialEventProfile } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * v4.0 spec §11.8 Event Profile Output — income transition, bonus, medical
 * shock/chronic, related-party employer, and other-accounts-likely. Every
 * field here is a real pattern match over already-classified transactions
 * (never a speculative conclusion like "job loss" — see this module's own
 * Missing Information Register entry for what L2 deliberately does NOT
 * attempt to detect). `eventProfile` is optional on the wire.
 */
export function EventProfileCard({ eventProfile }: { eventProfile: FinancialEventProfile | undefined }) {
  if (!eventProfile) {
    return (
      <SectionCard icon={CalendarClock} title="Event detection">
        <NotAvailable reason="Event profile unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  const { incomeTransition, bonuses, medicalEvents, relatedPartyEmployer, otherAccountsLikely } = eventProfile
  const worstMedicalMonth = medicalEvents.shockMonths[0] as (typeof medicalEvents.shockMonths)[number] | undefined

  return (
    <SectionCard icon={CalendarClock} title="Event detection">
      <MetricRow
        label="Income transition"
        value={
          incomeTransition.detected
            ? `Yes — ${formatCurrencyInr(incomeTransition.previousAverage ?? 0)} → ${formatCurrencyInr(incomeTransition.currentAverage ?? 0)} (${incomeTransition.deltaPercent}%)`
            : 'No'
        }
      />
      <MetricRow label="Bonus" value={bonuses.length === 0 ? 'No' : `Yes — ${bonuses.length} detected`} />
      <MetricRow
        label="Medical shock"
        value={!worstMedicalMonth ? 'No' : `Yes — ${formatCurrencyInr(worstMedicalMonth.total)}, ${formatMonthLabel(worstMedicalMonth.periodMonth)}${worstMedicalMonth.acute ? ' (ACUTE)' : ''}`}
      />
      <MetricRow label="Chronic medical pattern" value={medicalEvents.chronic ? `Yes — ${medicalEvents.monthlyEntries.length} month(s)` : 'No'} />
      <MetricRow label="Related-party employer" value={relatedPartyEmployer.detected ? `Yes — ${relatedPartyEmployer.matchedName} (compliance review required)` : 'No'} />
      <MetricRow label="Other accounts detected" value={otherAccountsLikely ? 'Likely — see OTHER_ACCOUNTS_LIKELY risk signal' : 'No'} />

      {bonuses.length > 0 && (
        <>
          <CardDivider />
          <div>
            <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Bonus credits</p>
            <div className="flex flex-col gap-1.5">
              {bonuses.map((b, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-[#171717]">{formatMonthLabel(b.transactionDate)}</span>
                  <span className="text-[#5c5c5c]">
                    {formatCurrencyInr(b.amount)} ({b.multipleOfSalary}× recurring income)
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
