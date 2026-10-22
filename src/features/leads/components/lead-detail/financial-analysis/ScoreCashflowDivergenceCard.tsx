import { GitCompareArrows } from 'lucide-react'

import type { FinancialScoreCashflowDivergence } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * v4.0 spec §"Score vs. Cash Flow Divergence" — a Financial Health Score
 * can look strong while the underlying monthly cash flow is actually
 * stressed (or vice versa). Mirrors the Debt Analysis module's own
 * ScoreStructureDivergenceCard pattern exactly, for the same reason: this
 * never recomputes anything client-side, it only renders the backend's
 * already-evaluated verdict.
 */
export function ScoreCashflowDivergenceCard({ divergence }: { divergence: FinancialScoreCashflowDivergence | undefined }) {
  if (!divergence) {
    return (
      <SectionCard icon={GitCompareArrows} title="Score vs. cash flow divergence">
        <NotAvailable reason="Score–cash flow comparison unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  if (divergence.availability !== 'AVAILABLE') {
    return (
      <SectionCard icon={GitCompareArrows} title="Score vs. cash flow divergence">
        <NotAvailable reason={divergence.detail} />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={GitCompareArrows} title="Score vs. cash flow divergence">
      <div className={`rounded-xl border p-3 ${divergence.divergent ? 'border-[#fa7319]/20 bg-[#fff3eb]' : 'border-[#1fc16b]/20 bg-[#e3f7ec]'}`}>
        <p className={`text-lg font-semibold ${divergence.divergent ? 'text-[#fa7319]' : 'text-[#1fc16b]'}`}>
          {divergence.divergent ? 'Divergence detected' : 'No divergence detected'}
        </p>
        <p className="mt-0.5 text-xs text-[#5c5c5c]">{divergence.detail}</p>
      </div>
      <CardDivider />
      <MetricRow label="Financial Health Score" value={divergence.totalScore ?? 'N/A'} />
      <MetricRow label="Deficit months" value={divergence.deficitMonths} />
      <MetricRow label="Low-balance day frequency" value={divergence.lowBalanceFrequencyPercent !== null ? `${divergence.lowBalanceFrequencyPercent}%` : 'Not reported'} />
      <MetricRow label="FCF unreconciled" value={divergence.fcfUnreconciled ? 'Yes' : 'No'} />
      <MetricRow label="Risk signals at Attention or above" value={divergence.attentionOrWorseFlagCount} />
    </SectionCard>
  )
}
