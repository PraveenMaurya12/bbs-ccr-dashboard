import { Fragment } from 'react'
import { ShieldAlert } from 'lucide-react'

import type { FinancialRiskFlagRecord } from '../../../types'
import { SeverityBadge } from './SeverityBadge'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

/** Every deterministic risk flag the backend computed — the real, evidence-backed signals behind the Stress Indicator, never a bare count (Rule 21's own instruction). */
export function RiskFlagsCard({ riskFlags }: { riskFlags: FinancialRiskFlagRecord[] }) {
  // Credit-correlation flags have their own dedicated table (ReconciliationTable) — not duplicated here.
  const flags = riskFlags.filter((f) => !['CREDIT_BANK_MATCH', 'CREDIT_OBLIGATION_NOT_OBSERVED', 'UNMATCHED_DEBT_PAYMENT'].includes(f.key))

  return (
    <SectionCard icon={ShieldAlert} title="Risk flags">
      {flags.length === 0 ? (
        <NotAvailable reason="No risk flags were identified from the current statement." />
      ) : (
        flags.map((flag, i) => (
          <Fragment key={flag.key}>
            {i > 0 && <CardDivider />}
            <div className="flex w-full items-start gap-1" title={flag.detail}>
              <p className="min-w-0 flex-1 text-sm leading-5 text-[#171717]">{flag.detail}</p>
              <SeverityBadge severity={flag.severity} />
            </div>
          </Fragment>
        ))
      )}
    </SectionCard>
  )
}
