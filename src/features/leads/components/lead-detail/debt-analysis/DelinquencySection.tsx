import { HandHeart } from 'lucide-react'

import type { DebtDelinquency } from '../../../types'
import { CardDivider, SectionCard } from '../shared/SectionCard'

/**
 * Layer 3 — Delinquency: Rule 8 (current, surfaced first and visually
 * dominant) and Rule 9 (historical, clearly subordinate) are NEVER merged
 * into one figure — this is the one piece of UI this whole rebuild is most
 * explicit about keeping strictly separated. Replaces the old
 * DelinquencyDpdCard with the full Rule 9 DPD-threshold breakdown.
 */
function DpdTile({ label, value, bgClassName, textClassName }: { label: string; value: string; bgClassName: string; textClassName: string }) {
  return (
    <div className={`flex flex-1 flex-col gap-1 rounded-xl p-3 ${bgClassName}`}>
      <p className="text-xs text-[#5c5c5c]">{label}</p>
      <p className={`text-2xl font-medium ${textClassName}`}>{value}</p>
      {value !== 'N/A' && <p className="text-xs text-[#a3a3a3]">Days</p>}
    </div>
  )
}

function BucketColumn({ label, count, dotClassName }: { label: string; count: number; dotClassName: string }) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <p className="text-xs text-[#5c5c5c]">{label}</p>
      <p className="flex items-center gap-1.5 text-sm font-medium text-[#171717]">
        <span className={`size-1.5 shrink-0 rounded-full ${dotClassName}`} />
        {count} account{count === 1 ? '' : 's'}
      </p>
    </div>
  )
}

export function DelinquencySection({ delinquency }: { delinquency: DebtDelinquency }) {
  const { buckets } = delinquency

  return (
    <SectionCard icon={HandHeart} title="Delinquency (current vs. historical — Rule 8 & 9)">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-[0.22px] text-[#171717] uppercase">Current (Rule 8)</p>
        <DpdTile
          label="Current DPD"
          value={delinquency.currentMaxDpd === null ? 'N/A' : String(delinquency.currentMaxDpd)}
          bgClassName={delinquency.currentMaxDpd ? 'bg-[#ffebec]' : 'bg-[#f7f7f7]'}
          textClassName={delinquency.currentMaxDpd ? 'text-[#fb3748]' : 'text-[#171717]'}
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <BucketColumn label="0–60 DPD" count={buckets.zeroToSixty} dotClassName="bg-[#1fc16b]" />
          <div className="h-8 w-px shrink-0 bg-[#ebebeb]" />
          <BucketColumn label="61–90 DPD" count={buckets.sixtyOneToNinety} dotClassName="bg-[#f6b51e]" />
          <div className="h-8 w-px shrink-0 bg-[#ebebeb]" />
          <BucketColumn label="91+ DPD" count={buckets.ninetyOnePlus} dotClassName="bg-[#fb3748]" />
        </div>
      </div>

      <CardDivider />

      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Historical (Rule 9 — kept separate from current, above)</p>
        <DpdTile label="Max historical DPD" value={delinquency.maxHistoricalDpd === null ? 'N/A' : String(delinquency.maxHistoricalDpd)} bgClassName="bg-[#f7f7f7]" textClassName="text-[#171717]" />
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <div className="rounded-lg bg-[#f7f7f7] p-2">
            <p className="text-[10px] text-[#a3a3a3] uppercase">&gt;0</p>
            <p className="text-sm font-medium text-[#171717]">{delinquency.accountsWithDpdOver0}</p>
          </div>
          <div className="rounded-lg bg-[#f7f7f7] p-2">
            <p className="text-[10px] text-[#a3a3a3] uppercase">&gt;30</p>
            <p className="text-sm font-medium text-[#171717]">{delinquency.accountsWithDpdOver30}</p>
          </div>
          <div className="rounded-lg bg-[#f7f7f7] p-2">
            <p className="text-[10px] text-[#a3a3a3] uppercase">&gt;60</p>
            <p className="text-sm font-medium text-[#171717]">{delinquency.accountsWithDpdOver60}</p>
          </div>
          <div className="rounded-lg bg-[#f7f7f7] p-2">
            <p className="text-[10px] text-[#a3a3a3] uppercase">&gt;90</p>
            <p className="text-sm font-medium text-[#171717]">{delinquency.accountsWithDpdOver90}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-[#a3a3a3]">
          {delinquency.delinquencyEventsCount === null
            ? 'No monthly payment-history grid was reported — delinquency event count unavailable.'
            : delinquency.delinquencyEventsCount === 0
              ? 'No delinquency events recorded in the reported payment history.'
              : `${delinquency.delinquencyEventsCount} delinquency event(s) recorded${delinquency.mostRecentDelinquencyMonth ? `, most recently in ${delinquency.mostRecentDelinquencyMonth}` : ''}.`}
        </p>
      </div>

      {delinquency.accountsWithoutDpdData > 0 && (
        <p className="text-xs text-[#a3a3a3]">{delinquency.accountsWithoutDpdData} account(s) do not report a current DPD figure.</p>
      )}
    </SectionCard>
  )
}
