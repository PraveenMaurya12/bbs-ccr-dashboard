import { Landmark } from 'lucide-react'

import type { DebtUnavailableSections } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * Bank Cross-Check / Bounce Analysis (Rule 19 & 20). Built per the spec, but
 * genuinely inert today: no bank-statement ingestion pipeline exists
 * anywhere in this codebase (see the backend's `BankTransaction` model,
 * which is defined but populated by zero code). Shows the honest reason
 * rather than a blank gap or a fabricated "0 bounces" — becomes live only
 * once a future bank-statement ingestion feature exists. Rule 15
 * (consolidation detection) previously lived in this same `unavailable`
 * bucket but is now genuinely computable — see `DebtConsolidationCard`.
 */
export function BankCrossCheckSection({ unavailable }: { unavailable: DebtUnavailableSections }) {
  return (
    <SectionCard icon={Landmark} title="Bank cross-check & bounce analysis (Rule 19 & 20)">
      <NotAvailable reason={unavailable.bankCrossCheck.reason} />
      <NotAvailable reason={unavailable.bounceAnalysis.reason} />
    </SectionCard>
  )
}
