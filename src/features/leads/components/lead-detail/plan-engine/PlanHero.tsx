import { Loader2, RefreshCw, Target } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { BbsPlanReport } from '../../../types'
import { CardDivider, MetricRow, SectionCard } from '../shared/SectionCard'
import { CohortPrimaryBadge } from '../cohort-engine/CohortBadges'
import { PlanLifecycleBadge } from './PlanBadges'

/**
 * The BBS Plan Engine's own hero — template, cohort/pathway, lifecycle
 * status, plus the Generate/Reassess action. Strictly an intervention-
 * design summary, never a credit/loan/settlement decision — the Plan
 * Engine never re-decides the cohort itself (that's Cohort Engine's job).
 */
export function PlanHero({ plan, onGenerate, generating }: { plan: BbsPlanReport; onGenerate: () => void; generating: boolean }) {
  return (
    <SectionCard icon={Target} title="BBS Plan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CohortPrimaryBadge cohort={plan.cohort} />
            <PlanLifecycleBadge status={plan.lifecycleStatus} />
          </div>
          {plan.pathway && <p className="text-xs text-[#5c5c5c]">Pathway: {plan.pathway}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button size="sm" variant="outline" disabled={generating} onClick={onGenerate}>
            <RefreshCw className={`mr-1.5 size-3.5 ${generating ? 'animate-spin' : ''}`} aria-hidden="true" />
            {generating ? 'Reassessing…' : 'Reassess'}
          </Button>
          <p className="text-xs text-[#a3a3a3]">v{plan.version} · {plan.templateVersion}</p>
        </div>
      </div>

      {plan.isStale && (
        <div className="rounded-lg bg-[#fffaeb] px-3 py-2 text-xs text-[#f6b51e]">
          The Cohort Decision has been re-evaluated since this plan was generated — reassess to reflect the latest decision.
        </div>
      )}
      {plan.specialistReviewRequired && (
        <div className="rounded-lg bg-[#ffebec] px-3 py-2 text-xs text-[#fb3748]">Specialist/legal review is required before this plan can proceed further.</div>
      )}
      {plan.ttl.liveStatus === 'EXPIRED' && (
        <div className="rounded-lg bg-[#ffebec] px-3 py-2 text-xs text-[#fb3748]">This plan&apos;s TTL has expired ({plan.ttl.planTtlDays} day{plan.ttl.planTtlDays === 1 ? '' : 's'}) — reassess before presenting it further.</div>
      )}

      <CardDivider />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricRow label="Template" value={plan.templateId} />
        <MetricRow label="Actions" value={String(plan.actions.length)} />
        <MetricRow label="Conditions" value={String(plan.conditions.length)} />
        <MetricRow label="TTL" value={plan.ttl.planTtlDays !== null ? `${plan.ttl.planTtlDays}d (${plan.ttl.liveStatus})` : 'N/A'} />
      </div>

      {generating && (
        <div className="flex items-center gap-2 text-xs text-[#5c5c5c]">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Re-composing the plan from the current Cohort Decision…
        </div>
      )}

      <p className="text-xs text-[#a3a3a3]">This plan is derived only from the Final Master Profile and Final Cohort Decision — it never re-analyzes raw bureau/bank data.</p>
    </SectionCard>
  )
}
