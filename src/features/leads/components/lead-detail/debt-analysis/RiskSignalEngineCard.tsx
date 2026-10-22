import { useState } from 'react'
import { Radar } from 'lucide-react'

import type { RiskSignalEngineResult } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'
import { RiskSignalSeverityBadge } from './RiskSignalSeverityBadge'

/**
 * BBS Debt Analysis Module v3.0, §8/§12 — a separate, newer system from the
 * existing RiskIndicatorsCard (riskFlags()). Both are rendered: riskFlags()
 * remains the stable, already-shipped system other consumers (the CCR call
 * brief, Cohort Engine's flat-path reads) depend on, while this is the
 * additive, spec-literal fixed-code catalogue. `notEvaluated` codes
 * (identity-variant-dependent) are shown separately, never silently folded
 * into "not triggered" — that would falsely claim a check this integration
 * never actually ran.
 */
export function RiskSignalEngineCard({ engine }: { engine: RiskSignalEngineResult | undefined }) {
  const [showNotTriggered, setShowNotTriggered] = useState(false)
  const [showNotEvaluated, setShowNotEvaluated] = useState(false)

  if (!engine) {
    return (
      <SectionCard icon={Radar} title="Risk Signal Engine">
        <NotAvailable reason="Risk Signal Engine unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={Radar} title="Risk Signal Engine">
      {engine.triggered.length === 0 ? (
        <NotAvailable reason="No risk signals were triggered for this report." />
      ) : (
        <div className="flex flex-col gap-2">
          {engine.triggered.map((entry) => (
            <div key={entry.code} className="flex items-start justify-between gap-2" title={entry.evidence}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#171717]">{entry.signal}</p>
                <p className="text-xs text-[#a3a3a3]">{entry.evidence}</p>
              </div>
              <RiskSignalSeverityBadge severity={entry.severity} />
            </div>
          ))}
        </div>
      )}

      {engine.notTriggered.length > 0 && (
        <>
          <CardDivider />
          <button
            type="button"
            className="text-left text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase"
            onClick={() => setShowNotTriggered((v) => !v)}
          >
            {showNotTriggered ? 'Hide' : 'Show'} signals not triggered ({engine.notTriggered.length})
          </button>
          {showNotTriggered && (
            <ul className="mt-2 flex flex-col gap-1">
              {engine.notTriggered.map((n) => (
                <li key={n.code} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-[#171717]">{n.code}</span>
                  <span className="text-xs text-[#a3a3a3]">{n.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {engine.notEvaluated.length > 0 && (
        <>
          <CardDivider />
          <button
            type="button"
            className="text-left text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase"
            onClick={() => setShowNotEvaluated((v) => !v)}
          >
            {showNotEvaluated ? 'Hide' : 'Show'} not evaluated ({engine.notEvaluated.length})
          </button>
          {showNotEvaluated && (
            <ul className="mt-2 flex flex-col gap-1">
              {engine.notEvaluated.map((n) => (
                <li key={n.code} className="flex items-start justify-between gap-2 text-sm">
                  <span className="shrink-0 text-[#171717]">{n.code}</span>
                  <span className="text-right text-xs text-[#a3a3a3]">{n.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </SectionCard>
  )
}
