import { Loader2, RefreshCw, Scale } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { CohortArchetype, CohortDebtComplexityBand, CohortDecisionReport } from '../../../types'
import { CardDivider, MetricRow, SectionCard } from '../shared/SectionCard'
import { CohortConfidenceBadge, CohortPrimaryBadge, LifecycleStateBadge, PlanEligibilityBadge } from './CohortBadges'

const ARCHETYPE_LABEL: Record<CohortArchetype, string> = {
  CIRCUMSTANTIAL: 'Circumstantial defaulter',
  DEBT_SPIRAL: 'Debt spiral borrower',
  HABITUAL_AVOIDER: 'Habitual avoider',
  UNCLASSIFIED: 'Unclassified',
}

const COMPLEXITY_LABEL: Record<CohortDebtComplexityBand, string> = {
  LOW: 'Low',
  MODERATE: 'Moderate',
  HIGH: 'High',
  VERY_HIGH: 'Very high',
}

/**
 * Section 1 — Cohort Executive Overview: final assignment, status,
 * confidence, pathway, lifecycle, and primary rationale. Never a loan/
 * credit/settlement decision — this engine is a deterministic
 * operating-treatment classification only (the spec's own first
 * principle). `primaryState`/`primaryReasonCode` (v3.0 §12's own derived
 * split) drive the headline badge, never the raw `primaryCohort` value
 * directly — a BLOCKED case is rendered as blocked, never as if it were a
 * real cohort assignment.
 */
export function CohortAssessmentHero({
  decision,
  onEvaluate,
  evaluating,
}: {
  decision: CohortDecisionReport
  onEvaluate: () => void
  evaluating: boolean
}) {
  const isBlocked = decision.primaryState === 'BLOCKED'

  return (
    <SectionCard icon={Scale} title="Cohort assessment">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <CohortPrimaryBadge cohort={decision.primaryCohort} />
          {!isBlocked && decision.pathway && <p className="text-xs text-[#5c5c5c]">Pathway: {decision.pathway}</p>}
          {!isBlocked && decision.lifecycleState && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#a3a3a3]">Lifecycle:</span>
              <LifecycleStateBadge state={decision.lifecycleState} />
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button size="sm" variant="outline" disabled={evaluating} onClick={onEvaluate}>
            <RefreshCw className={`mr-1.5 size-3.5 ${evaluating ? 'animate-spin' : ''}`} aria-hidden="true" />
            {evaluating ? 'Evaluating…' : 'Re-evaluate'}
          </Button>
          <p className="text-xs text-[#a3a3a3]">
            v{decision.version} · {decision.ruleVersion}
          </p>
        </div>
      </div>

      {decision.isStale && (
        <div className="rounded-lg bg-[#fffaeb] px-3 py-2 text-xs text-[#f6b51e]">
          Master Profile has been regenerated since this decision was made — re-evaluate to reflect the latest profile.
        </div>
      )}
      {decision.specialistReviewRequired && (
        <div className="rounded-lg bg-[#ffebec] px-3 py-2 text-xs text-[#fb3748]">
          {decision.specialistReviewReason ?? 'Specialist/legal review is required before a standard pathway can proceed.'}
        </div>
      )}
      {decision.manualReviewRequired && (
        <div className="rounded-lg bg-[#f4edff] px-3 py-2 text-xs text-[#8e51ff]">No approved precedence row cleanly matched this lead — a CCR/supervisor should review and, if appropriate, override.</div>
      )}
      {decision.declinedAt && (
        <div className="rounded-lg bg-[#ffebec] px-3 py-2 text-xs text-[#fb3748]">
          Customer declined to proceed on {new Date(decision.declinedAt).toLocaleDateString()}{decision.declineReason ? ` — ${decision.declineReason}` : '.'}
        </div>
      )}

      <CardDivider />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricRow label="Plan eligibility" value={<PlanEligibilityBadge eligibility={decision.planEligibility} />} />
        <MetricRow label="Capacity" value={decision.capacityBand ?? 'N/A'} />
        <MetricRow label="Confidence" value={<CohortConfidenceBadge level={decision.confidence} />} />
        <MetricRow label="Archetype (internal only)" value={decision.archetype ? ARCHETYPE_LABEL[decision.archetype] : 'N/A'} />
        <MetricRow label="Debt complexity" value={decision.debtComplexityBand ? COMPLEXITY_LABEL[decision.debtComplexityBand] : 'N/A'} />
      </div>

      {evaluating && (
        <div className="flex items-center gap-2 text-xs text-[#5c5c5c]">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Re-running the rule engine…
        </div>
      )}

      <p className="text-xs text-[#a3a3a3]">This is an operating-treatment classification, not a credit, loan, or settlement decision.</p>
    </SectionCard>
  )
}
