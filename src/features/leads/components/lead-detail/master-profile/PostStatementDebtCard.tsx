import { AlertTriangle, CalendarClock } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { MasterPostStatementDebt } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * v3.0 §5.7: a bureau-reported account opened AFTER the bank statement's own
 * period end has no chance of appearing in that statement — never treated
 * as an "unmatched/missed" repayment, always flagged as unverifiable
 * because of timing, not because of behavior.
 */
export function PostStatementDebtCard({ debt }: { debt: MasterPostStatementDebt | undefined }) {
  if (!debt) {
    return (
      <SectionCard icon={CalendarClock} title="Post-statement debt">
        <NotAvailable reason="Post-statement debt detection was not computed for this profile." />
      </SectionCard>
    )
  }

  if (!debt.detected) {
    return (
      <SectionCard icon={CalendarClock} title="Post-statement debt">
        <NotAvailable reason="No bureau-reported account was opened after the bank statement's period end." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={AlertTriangle} title="Post-statement debt">
      <MetricRow label="Accounts opened after statement period" value={debt.accountCount} />
      <MetricRow label="Total outstanding" value={formatCurrencyInr(debt.totalAmount)} />
      <MetricRow label="Repayment verification" value={debt.repaymentUnverified ? 'Unverified — not yet observable in bank data' : 'Verified'} />
      {debt.ccrPriority && <MetricRow label="CCR priority" value={<span className="font-medium text-[#fb3748]">{debt.ccrPriority} — Critical</span>} />}
      {debt.accounts.length > 0 && (
        <>
          <CardDivider />
          <div className="flex flex-col gap-2">
            {debt.accounts.map((account, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs text-[#5c5c5c]">
                <span>{account.lender}</span>
                <span>
                  {formatCurrencyInr(account.outstanding)} · opened {new Date(account.openedOn).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-[#a3a3a3]">
        These accounts were opened after the bank statement's own period end — the statement could never show their repayment, so this is a timing gap, not a missed-payment signal.
      </p>
    </SectionCard>
  )
}
