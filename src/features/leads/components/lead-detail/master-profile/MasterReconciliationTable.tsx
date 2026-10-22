import { GitCompareArrows } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { MasterProfileReconciliationRowRecord } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'
import { ReconciliationMatchLabel } from './MasterProfileBadges'

/**
 * Spec Part 12/13/35: the signature Credit <-> Bank Reconciliation table —
 * one row per bureau-reported obligation (or unmatched bank-observed
 * payment), each with its own 5-state match + confidence + a plain-
 * language explanation. "Not observed" never implies a missed payment —
 * the row's own `explanation` string (passed through verbatim from the
 * backend) always carries the required "repayment not observed in this
 * statement" phrasing rather than this component rephrasing it.
 */
export function MasterReconciliationTable({ rows }: { rows: MasterProfileReconciliationRowRecord[] }) {
  if (rows.length === 0) {
    return (
      <SectionCard icon={GitCompareArrows} title="Credit ↔ bank reconciliation">
        <NotAvailable reason="No in-scope bureau obligations or unmatched bank payments were available to reconcile." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={GitCompareArrows} title="Credit ↔ bank reconciliation">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#ebebeb] text-left text-xs text-[#a3a3a3] uppercase">
              <th className="pb-2 font-medium">Lender</th>
              <th className="pb-2 font-medium">Product</th>
              <th className="pb-2 font-medium">Reported</th>
              <th className="pb-2 font-medium">Observed</th>
              <th className="pb-2 font-medium">Match</th>
              <th className="pb-2 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-[#ebebeb] align-top last:border-0">
                <td className="py-2 pr-2">{row.lender}</td>
                <td className="py-2 pr-2 text-[#5c5c5c]">{row.product ?? '—'}</td>
                <td className="py-2 pr-2">
                  {row.reportedEmi !== null ? `${formatCurrencyInr(row.reportedEmi)}/mo` : '—'}
                  {row.reportedOutstanding !== null && <span className="block text-xs text-[#a3a3a3]">{formatCurrencyInr(row.reportedOutstanding)} outstanding</span>}
                </td>
                <td className="py-2 pr-2">
                  {row.observedPayment !== null ? `${formatCurrencyInr(row.observedPayment)}/mo` : '—'}
                  {row.observedFrequencyMonths !== null && <span className="block text-xs text-[#a3a3a3]">{row.observedFrequencyMonths} month(s) observed</span>}
                </td>
                <td className="py-2 pr-2">
                  <ReconciliationMatchLabel status={row.matchStatus} />
                </td>
                <td className="py-2 text-[#5c5c5c]">{row.confidence !== null ? `${Math.round(row.confidence * 100)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[#a3a3a3]">
        "Not observed" means no matching repayment was found in this statement — the payment may occur through another account, another cycle, or an
        unrecognized narration. It is never evidence of a missed payment.
      </p>
    </SectionCard>
  )
}
