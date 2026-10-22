import { AlertTriangle } from 'lucide-react'

import type { DebtRiskLevel, DebtStressLayer } from '../../../types'
import { SectionCard } from '../shared/SectionCard'

/**
 * Layer 4 — Stress Analysis (Rule 21 & 22): a single evidence-backed level
 * — Stable/Attention/High Attention/Critical — never a bare flag count
 * (Rule 21's own instruction). These labels describe debt conditions, not
 * the person (Rule 22's own closing note).
 */
const LEVEL_META: Record<DebtRiskLevel, { textClassName: string; bgClassName: string; borderClassName: string }> = {
  Stable: { textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]', borderClassName: 'border-[#1fc16b]/20' },
  Attention: { textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]', borderClassName: 'border-[#f6b51e]/20' },
  'High Attention': { textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]', borderClassName: 'border-[#fa7319]/20' },
  Critical: { textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]', borderClassName: 'border-[#fb3748]/20' },
}

export function StressAnalysisSection({ stress }: { stress: DebtStressLayer }) {
  const meta = LEVEL_META[stress.level]

  return (
    <SectionCard icon={AlertTriangle} title="Stress analysis (Rule 21 & 22)">
      <div className={`rounded-xl border p-3 ${meta.bgClassName} ${meta.borderClassName}`}>
        <p className={`text-lg font-semibold ${meta.textClassName}`}>{stress.level}</p>
        <p className="mt-0.5 text-xs text-[#5c5c5c]">This label describes current debt conditions — it is not a label for the person.</p>
      </div>
      <ul className="list-inside list-disc space-y-1 text-sm text-[#171717]">
        {stress.signals.map((signal, i) => (
          <li key={i}>{signal}</li>
        ))}
      </ul>
    </SectionCard>
  )
}
