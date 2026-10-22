import { Info } from 'lucide-react'

import type { DebtConcentrationLevel } from '../../../types'

/**
 * Rule 4 (lender concentration) and Rule 6 (card utilization) both define
 * their own "suggested BBS analytical thresholds" — explicitly spec-labeled
 * as BBS's own interpretation, NOT a bureau standard. This badge always
 * carries that distinction via its tooltip so a CCR never mistakes it for
 * an Experian/CIBIL classification.
 */
const LEVEL_META: Record<DebtConcentrationLevel | 'Elevated', { textClassName: string; bgClassName: string }> = {
  Low: { textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  Moderate: { textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  Elevated: { textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  High: { textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  'Very High': { textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
}

export function ThresholdBadge({ level }: { level: DebtConcentrationLevel | 'Elevated' }) {
  const meta = LEVEL_META[level]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-4 font-medium ${meta.bgClassName} ${meta.textClassName}`}
      title="BBS analytical threshold — not a bureau standard."
    >
      {level}
      <Info className="size-3" aria-hidden="true" />
    </span>
  )
}
