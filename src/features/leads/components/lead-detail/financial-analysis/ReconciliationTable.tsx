import { GitCompareArrows } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { FinancialRiskFlagRecord } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

const MATCH_LABEL: Record<string, string> = {
  CREDIT_BANK_MATCH: 'Matched',
  CREDIT_OBLIGATION_NOT_OBSERVED: 'Not observed',
  UNMATCHED_DEBT_PAYMENT: 'Unmatched',
}
const MATCH_COLOR: Record<string, string> = {
  CREDIT_BANK_MATCH: 'text-[#1fc16b]',
  CREDIT_OBLIGATION_NOT_OBSERVED: 'text-[#f6b51e]',
  UNMATCHED_DEBT_PAYMENT: 'text-[#fa7319]',
}

/**
 * §05's mini reconciliation and §08's full Credit Correlation table share
 * this one component (`variant` controls row count only) — never a second,
 * independent rendering of the same underlying riskFlags. Rule 15: never
 * says "missed payment"/"not paying" for an unobserved obligation — the
 * backend's own flag `detail` string already carries the exact required
 * "repayment not observed in this statement" phrasing, rendered verbatim.
 */
export function ReconciliationTable({ riskFlags, variant = 'full' }: { riskFlags: FinancialRiskFlagRecord[]; variant?: 'compact' | 'full' }) {
  const rows = riskFlags.filter((f) => f.key === 'CREDIT_BANK_MATCH' || f.key === 'CREDIT_OBLIGATION_NOT_OBSERVED' || f.key === 'UNMATCHED_DEBT_PAYMENT')
  const visibleRows = variant === 'compact' ? rows.slice(0, 3) : rows

  if (rows.length === 0) {
    return (
      <SectionCard icon={GitCompareArrows} title={variant === 'compact' ? 'Credit report vs. bank statement' : 'Credit correlation'}>
        <NotAvailable reason="No bureau-reported obligations or recurring statement debt payments were available to correlate." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={GitCompareArrows} title={variant === 'compact' ? 'Credit report vs. bank statement' : 'Credit correlation'}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#ebebeb] text-left text-xs text-[#a3a3a3] uppercase">
              <th className="pb-2 font-medium">Credit report</th>
              <th className="pb-2 font-medium">Bank statement</th>
              <th className="pb-2 font-medium">Match</th>
              <th className="pb-2 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((flag, i) => {
              const e = flag.evidence
              return (
                <tr key={i} className="border-b border-[#ebebeb] last:border-0">
                  <td className="py-2 pr-2">
                    {typeof e.bureauLender === 'string' ? e.bureauLender : 'N/A'}
                    {typeof e.reportedEmi === 'number' && <span className="block text-xs text-[#a3a3a3]">{formatCurrencyInr(e.reportedEmi)}/mo reported</span>}
                  </td>
                  <td className="py-2 pr-2">
                    {typeof e.statementLender === 'string' ? e.statementLender : 'Not identified'}
                    {typeof e.observedPayment === 'number' && <span className="block text-xs text-[#a3a3a3]">{formatCurrencyInr(e.observedPayment)}/mo observed</span>}
                    {typeof e.averageAmount === 'number' && <span className="block text-xs text-[#a3a3a3]">{formatCurrencyInr(e.averageAmount)}/mo observed</span>}
                  </td>
                  <td className={`py-2 pr-2 font-medium ${MATCH_COLOR[flag.key]}`}>{MATCH_LABEL[flag.key]}</td>
                  <td className="py-2 text-[#5c5c5c]">{typeof e.confidenceLabel === 'string' ? e.confidenceLabel : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {variant === 'compact' && rows.length > 3 && <p className="mt-2 text-xs text-[#a3a3a3]">+{rows.length - 3} more — see the Credit Correlation section.</p>}
    </SectionCard>
  )
}
