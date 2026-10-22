import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import type { MasterStressProfile } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'
import { MasterConfidenceBadge } from './MasterProfileBadges'

const LEVEL_META: Record<MasterStressProfile['level'], { textClassName: string }> = {
  Stable: { textClassName: 'text-[#1fc16b]' },
  Attention: { textClassName: 'text-[#f6b51e]' },
  'High Attention': { textClassName: 'text-[#fa7319]' },
  Critical: { textClassName: 'text-[#fb3748]' },
}

/**
 * Spec Part 14/15/37: the Master Stress Profile — combines Debt Analysis's
 * own stress layer with Financial Analysis's own stress band and risk
 * flags. Kept structurally distinct from both modules' own Financial
 * Health Score, per the spec's repeated instruction never to sum these
 * into one number — this panel only names a level and lists its drivers.
 */
export function MasterStressPanel({ stress }: { stress: MasterStressProfile | null }) {
  if (!stress) {
    return (
      <SectionCard icon={AlertTriangle} title="BBS financial stress">
        <NotAvailable reason="Stress synthesis is not available for this profile." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={AlertTriangle} title="BBS financial stress">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-lg font-medium ${LEVEL_META[stress.level].textClassName}`}>{stress.level}</span>
        <MasterConfidenceBadge level={stress.confidence} />
      </div>
      <CardDivider />
      <ul className="flex flex-col gap-2">
        {stress.drivers.map((driver, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[#171717]">
            {stress.level === 'Stable' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1fc16b]" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#f6b51e]" aria-hidden="true" />
            )}
            {driver}
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
