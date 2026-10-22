import { ShieldAlert } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { DebtAnalysisReport } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * Layer 3 — Debt Quality (Rule 10): groups account status into the spec's
 * own three tiers — Positive/current, Warning, Severe — rather than a flat
 * settlement count list (the old SettlementCard). Never classifies a status
 * code such as 99 as an actual write-off/settlement without supporting
 * evidence — see `unavailable.status99` (this integration never receives
 * Experian's raw numeric codes, so that ambiguity cannot arise here).
 */
export function DebtQualitySection({ report }: { report: DebtAnalysisReport }) {
  const { creditProfile, settlement, unavailable } = report

  return (
    <SectionCard icon={ShieldAlert} title="Debt quality (Rule 10)">
      <div>
        <p className="mb-1 text-xs font-medium tracking-[0.22px] text-[#1fc16b] uppercase">Positive / current</p>
        <MetricRow label="Active accounts (Standard/Current)" value={creditProfile.activeAccounts !== null ? String(creditProfile.activeAccounts) : 'N/A'} />
        <MetricRow label="Normally closed accounts" value={creditProfile.closedAccounts === null ? 'N/A' : String(creditProfile.closedAccounts)} />
      </div>

      <CardDivider />

      <div>
        <p className="mb-1 text-xs font-medium tracking-[0.22px] text-[#f6b51e] uppercase">Warning</p>
        <MetricRow label="Restructured accounts" value={String(settlement.restructuredCount)} />
        <MetricRow label="Defaulted accounts (bureau-reported)" value={String(creditProfile.defaultedAccounts)} />
      </div>

      <CardDivider />

      <div>
        <p className="mb-1 text-xs font-medium tracking-[0.22px] text-[#fb3748] uppercase">Severe</p>
        <MetricRow label="Settled" value={`${settlement.settledCount} (${formatCurrencyInr(settlement.settledAmount)})`} />
        <MetricRow label="Written-off" value={`${settlement.writtenOffCount} (${formatCurrencyInr(settlement.writtenOffAmount)})`} />
        <MetricRow label="Suit-filed" value={String(settlement.suitFiledCount)} />
        <MetricRow label="ARC-assigned" value={String(settlement.arcAssignedCount)} />
        <MetricRow label="Wilful default" value={settlement.willfulDefault === null ? 'Not reported' : settlement.willfulDefault ? 'Yes' : 'No'} />
      </div>

      <CardDivider />

      <NotAvailable reason={unavailable.status99.reason} />
    </SectionCard>
  )
}
