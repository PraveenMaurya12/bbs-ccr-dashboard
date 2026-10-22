import { Layers } from 'lucide-react'

import type { MasterCohortAttributeVector } from '../../../types'
import { MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

function yesNo(value: boolean | null): string {
  if (value === null) return 'Unknown'
  return value ? 'Yes' : 'No'
}

/**
 * v3.0 §19/§24: Master Profile computes these attributes FOR the Cohort
 * Engine — it never assigns a cohort itself. Labeled explicitly as inputs
 * handed downstream, never as a decision this module made.
 */
export function CohortAttributeVectorCard({ attributes }: { attributes: MasterCohortAttributeVector | null }) {
  if (!attributes) {
    return (
      <SectionCard icon={Layers} title="Cohort attributes (handed to Cohort Engine)">
        <NotAvailable reason="Cohort attribute vector was not computed for this profile." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={Layers} title="Cohort attributes (handed to Cohort Engine)">
      <p className="text-xs text-[#a3a3a3]">These are the computed inputs Master Profile hands to the Cohort Engine — Master Profile does not assign a cohort itself.</p>
      <MetricRow label="Credit score band" value={attributes.creditScoreBand} />
      <MetricRow label="Current delinquency" value={yesNo(attributes.currentDelinquency)} />
      <MetricRow label="Historical delinquency" value={yesNo(attributes.historicalDelinquency)} />
      <MetricRow label="Write-off status" value={yesNo(attributes.writeoffStatus)} />
      <MetricRow label="Settlement status" value={yesNo(attributes.settlementStatus)} />
      <MetricRow label="Total debt band" value={attributes.totalDebtBand} />
      <MetricRow label="Unsecured debt ratio" value={attributes.unsecuredDebtRatio !== null ? `${attributes.unsecuredDebtRatio}%` : 'Not available'} />
      <MetricRow label="Recent borrowing level" value={attributes.recentBorrowingLevel} />
      <MetricRow label="Normalized income band" value={attributes.normalizedIncomeBand} />
      <MetricRow label="Income stability" value={attributes.incomeStability} />
      <MetricRow label="Free cash flow band" value={attributes.freeCashflowBand} />
      <MetricRow label="Debt service band" value={attributes.debtServiceBand} />
      <MetricRow label="Liquidity band" value={attributes.liquidityBand} />
      <MetricRow label="Borrowing dependency" value={attributes.borrowingDependency} />
      <MetricRow label="Lender count" value={attributes.lenderCount ?? 'Not available'} />
      <MetricRow label="Card utilisation" value={attributes.cardUtilisation} />
      <MetricRow label="Repayment observed" value={yesNo(attributes.repaymentObserved)} />
      <MetricRow label="Financial stress level" value={attributes.financialStressLevel} />
      <MetricRow label="Data confidence" value={attributes.dataConfidence} />
    </SectionCard>
  )
}
