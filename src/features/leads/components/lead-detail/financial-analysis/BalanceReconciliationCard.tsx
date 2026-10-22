import { Scale } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { FinancialReconciliationCheck } from '../../../types'
import { MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * v4.0 spec §3.3 "Statement Completeness Checks" — Opening + Credits −
 * Debits = Closing. The Data Quality Score's own "Reconciliation status"
 * row already folds this into a pass/fail sentence; this card is the one
 * place that shows the actual opening/closing balances and the real
 * rupee gap, so a reviewer never has to take "reconciled" on faith.
 */
export function BalanceReconciliationCard({ reconciliation }: { reconciliation: FinancialReconciliationCheck | undefined }) {
  if (!reconciliation || reconciliation.availability !== 'AVAILABLE') {
    return (
      <SectionCard icon={Scale} title="Balance reconciliation">
        <NotAvailable reason={reconciliation?.detail ?? 'Balance reconciliation unavailable — this field was not included in this analysis response.'} />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={Scale} title="Balance reconciliation">
      <MetricRow label="Opening balance" value={reconciliation.openingBalance !== null ? formatCurrencyInr(reconciliation.openingBalance) : 'Not reported'} />
      <MetricRow label="Closing balance (reported)" value={reconciliation.closingBalance !== null ? formatCurrencyInr(reconciliation.closingBalance) : 'Not reported'} />
      <MetricRow
        label="Closing balance (expected: opening + credits − debits)"
        value={reconciliation.expectedClosingBalance !== null ? formatCurrencyInr(reconciliation.expectedClosingBalance) : 'Not reported'}
      />
      <MetricRow label="Gap" value={reconciliation.gapRupees !== null ? formatCurrencyInr(reconciliation.gapRupees) : 'Not reported'} />
      <MetricRow label="Tolerance" value={formatCurrencyInr(reconciliation.toleranceRupees)} />
      <MetricRow
        label="Result"
        value={
          <span className={reconciliation.reconciled ? 'text-[#1fc16b]' : 'text-[#fb3748]'}>{reconciliation.reconciled ? 'Reconciled' : 'Not reconciled'}</span>
        }
      />
      <p className="text-xs text-[#5c5c5c]">{reconciliation.detail}</p>
    </SectionCard>
  )
}
