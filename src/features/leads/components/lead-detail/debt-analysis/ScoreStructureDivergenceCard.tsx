import { GitCompareArrows } from 'lucide-react'

import type { ScoreStructureDivergenceResult } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * BBS Debt Analysis Module v3.0, §14: a bureau score is a lagging indicator
 * and can diverge from the debt structure that produced it. This never
 * recomputes anything — it only renders the backend's already-evaluated
 * `scoreStructureDivergence` verdict and the risk-flag evidence behind it.
 *
 * `divergence` is typed optional (see DebtAnalysisReport's own doc comment)
 * because this field was added after the module first shipped — a report
 * served from a backend process, cache, or fixture that predates the change
 * can omit the key entirely at runtime despite the TS type elsewhere
 * claiming it's always present. This component is the one place that gap
 * must be handled honestly: never assume presence, never infer a verdict
 * for a report this check was never run against.
 */
export function ScoreStructureDivergenceCard({ divergence }: { divergence: ScoreStructureDivergenceResult | undefined }) {
  if (!divergence) {
    return (
      <SectionCard icon={GitCompareArrows} title="Score vs. structure divergence">
        <NotAvailable reason="Score–structure comparison unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  if (!divergence.available) {
    return (
      <SectionCard icon={GitCompareArrows} title="Score vs. structure divergence">
        <NotAvailable reason={divergence.unavailableReason} />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={GitCompareArrows} title="Score vs. structure divergence">
      <div
        className={`rounded-xl border p-3 ${
          divergence.divergenceFlag ? 'border-[#fa7319]/20 bg-[#fff3eb]' : 'border-[#1fc16b]/20 bg-[#e3f7ec]'
        }`}
      >
        <p className={`text-lg font-semibold ${divergence.divergenceFlag ? 'text-[#fa7319]' : 'text-[#1fc16b]'}`}>
          {divergence.divergenceFlag ? 'Divergence detected' : 'No divergence detected'}
        </p>
        <p className="mt-0.5 text-xs text-[#5c5c5c]">
          {divergence.reason ?? 'The bureau score is consistent with the current debt structure.'}
        </p>
      </div>
      <CardDivider />
      <MetricRow label="Bureau score" value={`${divergence.score} (${divergence.scoreBand})`} />
      <MetricRow label="Risk signals at Attention or above" value={divergence.riskSignalCount} />
      {divergence.evidence.length > 0 && (
        <>
          <CardDivider />
          <div>
            <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Evidence</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-[#171717]">
              {divergence.evidence.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </SectionCard>
  )
}
