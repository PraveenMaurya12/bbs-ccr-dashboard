import { Gauge } from 'lucide-react'

import type { FinancialHealthScoreRecord, FinancialStressBand } from '../../../types'

const STRESS_BAND_META: Record<FinancialStressBand, { label: string; textClassName: string; bgClassName: string }> = {
  LOW: { label: 'Low', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  MODERATE: { label: 'Moderate', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  ELEVATED: { label: 'Elevated', textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  HIGH: { label: 'High', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  CRITICAL: { label: 'Critical', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
}

/**
 * §01/§09 hero: the BBS Financial Health Score AND, separately, the BBS
 * Financial Stress Indicator — the spec's own explicit instruction never
 * to combine these into one number, so they are two visually distinct
 * blocks here, never averaged or merged.
 */
export function FinancialHealthHero({ score }: { score: FinancialHealthScoreRecord }) {
  const stressMeta = STRESS_BAND_META[score.stressBand]
  // Never show a bare "62 / 100" when only some components were
  // assessable — that misleadingly implies a full-scale score. Falls back
  // to /100 only for a pre-this-feature row with no persisted achievable max.
  const denominator = score.scorePartial ? (score.maxAchievablePoints ?? 100) : 100

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#ebebeb] bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#ebf1ff]">
          <Gauge className="size-7 text-[#335cff]" aria-hidden="true" />
        </span>
        <div>
          <p className="font-mono text-xs text-[#5c5c5c] uppercase">BBS Financial Health Indicator</p>
          <p className="text-3xl font-semibold text-[#171717]">
            {score.totalScore ?? 'N/A'}
            <span className="text-base font-normal text-[#a3a3a3]"> / {denominator}{score.scorePartial ? ' assessable points' : ''}</span>
          </p>
          {score.scorePartial && <p className="mt-0.5 text-xs text-[#f6b51e]">Some components could not be assessed because required data was unavailable.</p>}
          <p className="text-xs text-[#a3a3a3]">A financial-health indicator for case management — not a lending approval score, credit score, or bureau score.</p>
        </div>
      </div>

      <div className={`flex flex-col items-start gap-1 rounded-xl px-4 py-3 sm:items-end ${stressMeta.bgClassName}`}>
        <p className="font-mono text-xs text-[#5c5c5c] uppercase">BBS Financial Stress Indicator</p>
        <p className={`text-2xl font-semibold ${stressMeta.textClassName}`}>
          {score.stressIndicator0to100} <span className="text-sm font-medium">({stressMeta.label})</span>
        </p>
      </div>
    </div>
  )
}
