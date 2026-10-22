import { useState } from 'react'
import { Loader2, Target } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ErrorState } from '@/components/shared/ErrorState'
import { QueryBoundary } from '@/components/shared/QueryBoundary'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { planEngineService } from '../../../services/planEngineService'
import type { BbsPlanActionStatus, BbsPlanConditionState, BbsPlanLifecycleStatus } from '../../../types'
import { ActionPlanTable } from './ActionPlanTable'
import { ConditionsPanel, RisksAndDisclosuresPanel, SuccessCriteriaPanel } from './ConditionsAndRisksPanel'
import { CustomerNarrativePanel } from './CustomerNarrativePanel'
import { FinancialCapacityAndTargetsPanel } from './FinancialCapacityAndTargetsPanel'
import { PlanDecisionHistoryTable } from './PlanDecisionHistoryTable'
import { PlanHero } from './PlanHero'
import { PlanLifecycleActions } from './PlanLifecycleActions'
import { PlanMissingDataPanel, PlanMonitoringPanel } from './PlanMonitoringPanel'
import { PlanOverrideAction } from './PlanOverrideAction'
import { PlanRuleResultsTable } from './PlanRuleResultsTable'
import { ProblemDefinitionSection, SituationAssessmentSection } from './SituationAndProblemSection'

/**
 * The Final Cohort Decision -> BBS Plan handoff. Never runs against a
 * stale Cohort Decision — the "Generate"/"Reassess" action is always
 * CCR-initiated, never automatic, and the Plan Engine's own stale-source
 * check (`isStale`) is surfaced plainly rather than silently re-running.
 */
export function PlanEngineSection({ bbsLeadId }: { bbsLeadId: string }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = ['bbsPlan', bbsLeadId]
  const canOverride = user?.role === 'SUPERVISOR' || user?.role === 'ADMIN'

  const query = useQuery({
    queryKey,
    queryFn: () => planEngineService.getForLead(bbsLeadId),
    refetchInterval: (q) => {
      const data = q.state.data
      if (!data?.planAvailable) return false
      return data.status === 'GENERATING' ? 2000 : false
    },
  })

  const historyQuery = useQuery({
    queryKey: ['bbsPlanHistory', bbsLeadId],
    queryFn: () => planEngineService.getHistory(bbsLeadId),
    enabled: query.data?.planAvailable === true && query.data.status === 'COMPLETED',
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey })
    queryClient.invalidateQueries({ queryKey: ['bbsPlanHistory', bbsLeadId] })
  }

  const [lifecycleError, setLifecycleError] = useState<string | null>(null)

  function handleLifecycleResult(result: { updated: boolean; reason?: string }) {
    setLifecycleError(result.updated ? null : (result.reason ?? 'This action is not valid for the plan’s current status.'))
    if (result.updated) invalidateAll()
  }

  const generateMutation = useMutation({ mutationFn: () => planEngineService.generate(bbsLeadId), onSuccess: invalidateAll })
  const reassessMutation = useMutation({ mutationFn: () => planEngineService.reassess(bbsLeadId), onSuccess: invalidateAll })
  const submitReviewMutation = useMutation({ mutationFn: () => planEngineService.submitReview(bbsLeadId), onSuccess: handleLifecycleResult })
  const acceptMutation = useMutation({ mutationFn: () => planEngineService.accept(bbsLeadId), onSuccess: handleLifecycleResult })
  const activateMutation = useMutation({ mutationFn: () => planEngineService.activate(bbsLeadId), onSuccess: handleLifecycleResult })
  const overrideMutation = useMutation({
    mutationFn: ({ newLifecycleStatus, reason }: { newLifecycleStatus: BbsPlanLifecycleStatus; reason: string }) => planEngineService.override(bbsLeadId, newLifecycleStatus, reason),
    onSuccess: invalidateAll,
  })

  const lifecycleSubmitting = submitReviewMutation.isPending || acceptMutation.isPending || activateMutation.isPending

  // v3.0 §11.2/§13.3 — the backend enforces the real legal-transition
  // table; a rejected change comes back as {updated:false, reason}, never
  // an HTTP error, so it's surfaced the same way as a lifecycle rejection.
  const [actionStatusError, setActionStatusError] = useState<string | null>(null)
  const [updatingActionId, setUpdatingActionId] = useState<string | null>(null)
  const updateActionStatusMutation = useMutation({
    mutationFn: ({ actionId, status }: { actionId: string; status: BbsPlanActionStatus }) => planEngineService.updateActionStatus(bbsLeadId, actionId, status),
    onSuccess: (result) => {
      setActionStatusError(result.updated ? null : (result.reason ?? 'This status change is not valid for the action’s current state.'))
      setUpdatingActionId(null)
      if (result.updated) invalidateAll()
    },
    onError: () => setUpdatingActionId(null),
  })

  const [conditionStatusError, setConditionStatusError] = useState<string | null>(null)
  const [updatingConditionId, setUpdatingConditionId] = useState<string | null>(null)
  const updateConditionStatusMutation = useMutation({
    mutationFn: ({ conditionId, state }: { conditionId: string; state: BbsPlanConditionState }) => planEngineService.updateConditionStatus(bbsLeadId, conditionId, state),
    onSuccess: (result) => {
      setConditionStatusError(result.updated ? null : (result.reason ?? 'This state change is not valid for the condition’s current state.'))
      setUpdatingConditionId(null)
      if (result.updated) invalidateAll()
    },
    onError: () => setUpdatingConditionId(null),
  })

  return (
    <QueryBoundary query={query}>
      {(data) => {
        if (!data.planAvailable) {
          return (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#ebebeb] bg-white p-8 text-center">
              <Target className="size-8 text-[#fa7319]" aria-hidden="true" />
              <div>
                <p className="text-base font-medium text-[#171717]">BBS Plan not generated yet</p>
                <p className="mt-1 max-w-md text-sm text-[#5c5c5c]">
                  {data.cohortDecisionReady ? 'The Cohort Decision is ready — generate a BBS Plan to turn it into a concrete, cohort-specific intervention plan.' : 'Complete the Cohort Assessment on the Final Profile tab before generating a Plan.'}
                </p>
              </div>
              {data.cohortDecisionReady && (
                <Button disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
                  {generateMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : <Target className="mr-1.5 size-4" aria-hidden="true" />}
                  Generate Plan
                </Button>
              )}
            </div>
          )
        }

        if (data.status === 'GENERATING') {
          return (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#ebebeb] bg-white p-10 text-center">
              <Loader2 className="size-8 animate-spin text-[#fa7319]" aria-hidden="true" />
              <p className="text-sm text-[#5c5c5c]">Composing the plan from the current Cohort Decision…</p>
            </div>
          )
        }

        if (data.status === 'FAILED') {
          return (
            <ErrorState title="Plan generation failed" description={data.errorMessage ?? 'An unknown error occurred while generating this plan.'}>
              <Button size="sm" variant="outline" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
                {generateMutation.isPending ? 'Retrying…' : 'Retry'}
              </Button>
            </ErrorState>
          )
        }

        const plan = data

        return (
          <div className="flex flex-col gap-4">
            <PlanHero plan={plan} onGenerate={() => reassessMutation.mutate()} generating={reassessMutation.isPending} />

            <SituationAssessmentSection plan={plan} />
            <ProblemDefinitionSection plan={plan} />

            <FinancialCapacityAndTargetsPanel plan={plan} />

            {actionStatusError && <div className="rounded-lg bg-[#ffebec] px-3 py-2 text-xs text-[#fb3748]">{actionStatusError}</div>}
            <ActionPlanTable
              actions={plan.actions}
              updatingActionId={updatingActionId}
              onUpdateStatus={(actionId, status) => {
                setUpdatingActionId(actionId)
                updateActionStatusMutation.mutate({ actionId, status })
              }}
            />

            {conditionStatusError && <div className="rounded-lg bg-[#ffebec] px-3 py-2 text-xs text-[#fb3748]">{conditionStatusError}</div>}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ConditionsPanel
                conditions={plan.conditions}
                updatingConditionId={updatingConditionId}
                onUpdateState={(conditionId, state) => {
                  setUpdatingConditionId(conditionId)
                  updateConditionStatusMutation.mutate({ conditionId, state })
                }}
              />
              <RisksAndDisclosuresPanel risks={plan.risks} disclosures={plan.disclosures} />
            </div>

            <SuccessCriteriaPanel successCriteria={plan.successCriteria} />

            <PlanMissingDataPanel plan={plan} />

            <PlanRuleResultsTable ruleResults={plan.ruleResults} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <PlanMonitoringPanel plan={plan} />
              {historyQuery.data && <PlanDecisionHistoryTable history={historyQuery.data} />}
            </div>

            <CustomerNarrativePanel plan={plan} />

            {lifecycleError && <div className="rounded-lg bg-[#ffebec] px-3 py-2 text-xs text-[#fb3748]">{lifecycleError}</div>}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <PlanLifecycleActions lifecycleStatus={plan.lifecycleStatus} onSubmitReview={() => submitReviewMutation.mutate()} onAccept={() => acceptMutation.mutate()} onActivate={() => activateMutation.mutate()} submitting={lifecycleSubmitting} />
              {canOverride && <PlanOverrideAction submitting={overrideMutation.isPending} onOverride={(newLifecycleStatus, reason) => overrideMutation.mutate({ newLifecycleStatus, reason })} />}
            </div>
          </div>
        )
      }}
    </QueryBoundary>
  )
}
