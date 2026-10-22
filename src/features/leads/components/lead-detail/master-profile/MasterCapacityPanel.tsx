import { Gauge } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { MasterProfileReport } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

function dsrLine(percent: number | null): string {
  return percent !== null ? `${percent}%` : 'Not available'
}

/**
 * Spec Part 11/12/36: Bureau DSR (what the credit report says is owed),
 * Bank DSR (what the bank statement shows being paid), and Master DSR
 * (confirmed, reconciled obligations only) — shown side by side so a CCR
 * can see at a glance whether the three sources agree, rather than trusting
 * any one blindly.
 */
export function MasterCapacityPanel({ profile }: { profile: MasterProfileReport }) {
  const { bureauDsrPercent, bankDsrPercent, masterDsrPercent } = profile
  const confirmedObligations = profile.reconciliationRows
    .filter((r) => r.matchStatus === 'MATCHED' || r.matchStatus === 'PARTIALLY_MATCHED')
    .reduce((sum, r) => sum + (r.reportedEmi ?? 0), 0)

  return (
    <SectionCard icon={Gauge} title="Repayment capacity">
      {bureauDsrPercent === null && bankDsrPercent === null && masterDsrPercent === null ? (
        <NotAvailable reason="Insufficient data to compare bureau, bank, and reconciled debt-service ratios." />
      ) : (
        <>
          <MetricRow label="Bureau DSR (reported EMI ÷ normalized income)" value={dsrLine(bureauDsrPercent)} />
          <MetricRow label="Bank DSR (observed debt payments ÷ normalized income)" value={dsrLine(bankDsrPercent)} />
          <MetricRow label="Master DSR (confirmed, reconciled obligations only)" value={dsrLine(masterDsrPercent)} />
          <CardDivider />
          <MetricRow label="Confirmed monthly obligations" value={confirmedObligations > 0 ? formatCurrencyInr(confirmedObligations) : 'Not available'} />
        </>
      )}
    </SectionCard>
  )
}
