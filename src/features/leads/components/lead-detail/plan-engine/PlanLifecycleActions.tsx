import { CheckCircle2, PlayCircle, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { BbsPlanLifecycleStatus } from '../../../types'

/**
 * The spec's own explicit, CCR-driven lifecycle actions — no automated
 * transition ever fires (no scheduler/job-queue infrastructure exists in
 * this codebase). "Accept" is a CCR-attested record of the customer's
 * decision: this dashboard has no customer-facing portal, so acceptance
 * is always captured by a CCR on the customer's behalf (a documented,
 * known limitation).
 *
 * Each button is only enabled from the one lifecycle status it actually
 * transitions out of (matching PlanEngineService's own server-side
 * gating exactly) — a CCR clicking a button that's invalid for the
 * current state would otherwise get a silent, ignored
 * `{updated:false, reason}` response with no visible feedback at all.
 */
export function PlanLifecycleActions({
  lifecycleStatus,
  onSubmitReview,
  onAccept,
  onActivate,
  submitting,
}: {
  lifecycleStatus: BbsPlanLifecycleStatus | null
  onSubmitReview: () => void
  onAccept: () => void
  onActivate: () => void
  submitting: boolean
}) {
  const canSubmitReview = lifecycleStatus === 'DRAFT' || lifecycleStatus === 'SPECIALIST_REVIEW'
  const canAccept = lifecycleStatus === 'CCR_REVIEW'
  const canActivate = lifecycleStatus === 'EXECUTION_READY'

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={submitting || !canSubmitReview} onClick={onSubmitReview}>
        <Send className="mr-1.5 size-3.5" aria-hidden="true" />
        Submit for review
      </Button>
      <Button size="sm" variant="outline" disabled={submitting || !canAccept} onClick={onAccept}>
        <CheckCircle2 className="mr-1.5 size-3.5" aria-hidden="true" />
        Record customer acceptance
      </Button>
      <Button size="sm" variant="outline" disabled={submitting || !canActivate} onClick={onActivate}>
        <PlayCircle className="mr-1.5 size-3.5" aria-hidden="true" />
        Activate
      </Button>
    </div>
  )
}
