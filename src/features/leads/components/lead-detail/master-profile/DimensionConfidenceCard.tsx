import { Gauge } from 'lucide-react'

import type { MasterDimensionConfidences, MasterDimensionName } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'
import { MasterConfidenceBadge } from './MasterProfileBadges'

const DIMENSION_LABELS: Record<MasterDimensionName, string> = {
  IDENTITY_COMPLIANCE: 'Identity & compliance',
  CREDIT_HEALTH: 'Credit health',
  INCOME_CASH_FLOW: 'Income & cash flow',
  DEBT_LIQUIDITY: 'Debt & liquidity',
  ALIGNMENT_CAPACITY: 'Alignment & capacity',
}

const DIMENSION_ORDER: MasterDimensionName[] = ['IDENTITY_COMPLIANCE', 'CREDIT_HEALTH', 'INCOME_CASH_FLOW', 'DEBT_LIQUIDITY', 'ALIGNMENT_CAPACITY']

/**
 * v3.0 §4.2: per-dimension confidence replaces a single "overall
 * confidence" as the primary confidence surface — each of the 5 dimensions
 * is rated independently rather than averaged into one number.
 */
export function DimensionConfidenceCard({ confidences }: { confidences: MasterDimensionConfidences | undefined }) {
  if (!confidences) {
    return (
      <SectionCard icon={Gauge} title="Dimension confidence">
        <NotAvailable reason="Per-dimension confidence was not computed for this profile." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={Gauge} title="Dimension confidence">
      <ul className="flex flex-col gap-2">
        {DIMENSION_ORDER.map((dimension) => (
          <li key={dimension} className="flex items-center justify-between gap-2">
            <span className="text-sm text-[#171717]">{DIMENSION_LABELS[dimension]}</span>
            <MasterConfidenceBadge level={confidences[dimension]} />
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
