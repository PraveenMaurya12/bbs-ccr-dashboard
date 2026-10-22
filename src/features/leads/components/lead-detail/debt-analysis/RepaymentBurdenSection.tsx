import { Scale } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { DebtServiceRatio, DebtToIncome } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * Layer 4 — Repayment Burden (Rule 7 & 18): EMI/DSR and DTI, activated only
 * when real declared income is on file. Missing EMI or income is always
 * rendered as "Not reported", NEVER a fabricated 0% ratio — the one rule
 * this section exists specifically to honor.
 */
function availabilityReason(availability: string): string {
  switch (availability) {
    case 'NOT_REPORTED':
      return 'Income and/or EMI is not reported for this lead — never assumed as zero.'
    case 'NOT_APPLICABLE':
      return 'This metric does not apply to this lead.'
    case 'INSUFFICIENT_DATA':
      return 'Not enough data is available to calculate this metric.'
    default:
      return 'Not available.'
  }
}

export function RepaymentBurdenSection({ debtServiceRatio, debtToIncome }: { debtServiceRatio: DebtServiceRatio; debtToIncome: DebtToIncome }) {
  return (
    <SectionCard icon={Scale} title="Repayment burden (Rule 7 & 18)">
      <MetricRow label="Monthly EMI" value={debtServiceRatio.monthlyEmi === null ? 'Not reported' : formatCurrencyInr(debtServiceRatio.monthlyEmi)} />
      <MetricRow label="Declared monthly income" value={debtServiceRatio.monthlyIncome === null ? 'Not reported' : formatCurrencyInr(debtServiceRatio.monthlyIncome)} />
      <CardDivider />
      {debtServiceRatio.availability === 'AVAILABLE' ? (
        <MetricRow label="Debt Service Ratio (EMI / income)" value={`${debtServiceRatio.debtServiceRatioPercent}%`} />
      ) : (
        <NotAvailable reason={availabilityReason(debtServiceRatio.availability)} />
      )}
      <CardDivider />
      {debtToIncome.availability === 'AVAILABLE' ? (
        <MetricRow label="Debt-to-Income (outstanding / annual income)" value={`${debtToIncome.dtiPercent}%`} />
      ) : (
        <NotAvailable reason={availabilityReason(debtToIncome.availability)} />
      )}
    </SectionCard>
  )
}
