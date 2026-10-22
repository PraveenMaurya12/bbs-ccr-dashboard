import type { ReactNode } from 'react'
import { Loader2, Scale, ShieldCheck } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ErrorState } from '@/components/shared/ErrorState'
import { QueryBoundary } from '@/components/shared/QueryBoundary'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { cohortEngineService } from '../../../services/cohortEngineService'
import { CohortAssessmentHero } from './CohortAssessmentHero'
import { CohortComplianceAction } from './CohortComplianceAction'
import { CohortComplianceCard } from './CohortComplianceCard'
import { CohortDeclineAction } from './CohortDeclineAction'
import { CohortDecisionHistoryTable } from './CohortDecisionHistoryTable'
import { CohortMissingDataPanel, NextReviewPanel } from './CohortMissingDataPanel'
import { CohortOverrideAction } from './CohortOverrideAction'
import { RefreshTriggersPanel } from './RefreshTriggersPanel'
import { RuleEvaluationTable } from './RuleEvaluationTable'
import { PrecedenceSection, SecondaryFlagsSection } from './SecondaryFlagsAndPrecedence'
import { WhyThisCohortSection } from './WhyThisCohortSection'

/** One numbered section heading, same convention as the Master Profile tab's own 7-section rebuild — gives CCR staff a stable, scannable hierarchy matching the task's own 9-section checklist. */
function SectionHeading({ step, title, description }: { step: number; title: string; description?: string }) {
  return (
    <div className="flex items-baseline gap-2.5 pt-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#171717] text-xs font-medium text-white">{step}</span>
      <div>
        <h2 className="text-base font-medium tracking-[-0.176px] text-[#171717]">{title}</h2>
        {description && <p className="text-xs text-[#a3a3a3]">{description}</p>}
      </div>
    </div>
  )
}

function Section({ step, title, description, children }: { step: number; title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeading step={step} title={title} description={description} />
      {children}
    </div>
  )
}

/**
 * Spec Part 22: the Final Profile -> Cohort Assessment handoff. Never runs
 * against stale Master Profile data — the "Run Cohort Assessment"/
 * "Re-evaluate" action is always CCR-initiated, never automatic, and the
 * Cohort Engine's own stale-source check (`isStale`) is surfaced plainly
 * rather than silently re-running.
 *
 * Rebuilt (v3.0) into the task's own 9-section structure: 1. Cohort
 * Executive Overview, 2. Customer Profile & Eligibility (folded into the
 * overview + precedence, since this engine has no separate "customer
 * profile" concept beyond what Master Profile already renders above it in
 * the tab), 3. Decision Evidence, 4. Rule Evaluation, 5. Readiness &
 * Compliance, 6. Alternative Matches & Exclusions, 7. Missing Information &
 * Uncertainty, 8. Recommended Pathway & Actions, 9. Audit & Downstream
 * Handoff.
 */
export function CohortAssessmentSection({ bbsLeadId, masterProfileReady }: { bbsLeadId: string; masterProfileReady: boolean }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = ['cohortDecision', bbsLeadId]
  const canOverride = user?.role === 'SUPERVISOR' || user?.role === 'ADMIN'

  const query = useQuery({
    queryKey,
    queryFn: () => cohortEngineService.getForLead(bbsLeadId),
    refetchInterval: (q) => {
      const data = q.state.data
      if (!data?.decisionAvailable) return false
      return data.status === 'GENERATING' ? 2000 : false
    },
  })

  const historyQuery = useQuery({
    queryKey: ['cohortDecisionHistory', bbsLeadId],
    queryFn: () => cohortEngineService.getHistory(bbsLeadId),
    enabled: query.data?.decisionAvailable === true && query.data.status === 'COMPLETED',
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey })
    queryClient.invalidateQueries({ queryKey: ['cohortDecisionHistory', bbsLeadId] })
  }

  const evaluateMutation = useMutation({ mutationFn: () => cohortEngineService.evaluate(bbsLeadId), onSuccess: invalidateAll })
  const overrideMutation = useMutation({
    mutationFn: ({ newPrimaryCohort, reason, approverId }: { newPrimaryCohort: Parameters<typeof cohortEngineService.override>[1]; reason: string; approverId?: string }) => cohortEngineService.override(bbsLeadId, newPrimaryCohort, reason, approverId),
    onSuccess: invalidateAll,
  })
  const declineMutation = useMutation({ mutationFn: (reason: string | null) => cohortEngineService.decline(bbsLeadId, reason), onSuccess: invalidateAll })
  const clearComplianceMutation = useMutation({ mutationFn: (reason: string) => cohortEngineService.clearCompliance(bbsLeadId, reason), onSuccess: invalidateAll })
  const declineComplianceMutation = useMutation({ mutationFn: (reason: string) => cohortEngineService.declineCompliance(bbsLeadId, reason), onSuccess: invalidateAll })

  return (
    <QueryBoundary query={query}>
      {(data) => {
        if (!data.decisionAvailable) {
          return (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#ebebeb] bg-white p-8 text-center">
              <Scale className="size-8 text-[#2a8f60]" aria-hidden="true" />
              <div>
                <p className="text-base font-medium text-[#171717]">Cohort assessment not run yet</p>
                <p className="mt-1 max-w-md text-sm text-[#5c5c5c]">
                  {masterProfileReady ? 'Master Profile is ready — run the Cohort Engine to classify this lead into an operating treatment.' : 'Complete the Master Profile above before running the Cohort Engine.'}
                </p>
              </div>
              {masterProfileReady && (
                <Button disabled={evaluateMutation.isPending} onClick={() => evaluateMutation.mutate()}>
                  {evaluateMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="mr-1.5 size-4" aria-hidden="true" />}
                  Run Cohort Assessment
                </Button>
              )}
            </div>
          )
        }

        if (data.status === 'GENERATING') {
          return (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#ebebeb] bg-white p-10 text-center">
              <Loader2 className="size-8 animate-spin text-[#2a8f60]" aria-hidden="true" />
              <p className="text-sm text-[#5c5c5c]">Evaluating all 24 rules and resolving precedence…</p>
            </div>
          )
        }

        if (data.status === 'FAILED') {
          return (
            <ErrorState title="Cohort evaluation failed" description={data.errorMessage ?? 'An unknown error occurred while evaluating this lead.'}>
              <Button size="sm" variant="outline" disabled={evaluateMutation.isPending} onClick={() => evaluateMutation.mutate()}>
                {evaluateMutation.isPending ? 'Retrying…' : 'Retry'}
              </Button>
            </ErrorState>
          )
        }

        const decision = data
        const isTerminalDeclined = decision.lifecycleState === 'CUSTOMER_DECLINED'

        return (
          <div className="flex flex-col gap-8">
            {/* Section 1 — Cohort Executive Overview */}
            <Section step={1} title="Cohort executive overview" description="Final assignment, status, confidence, pathway, and primary rationale.">
              <CohortAssessmentHero decision={decision} onEvaluate={() => evaluateMutation.mutate()} evaluating={evaluateMutation.isPending} />
            </Section>

            {/* Section 3 (task numbering) — Decision Evidence. Section 2 "Customer Profile & Eligibility" is Master Profile's own responsibility, rendered immediately above this section in the parent tab — this engine never recomputes or re-displays those attributes, only consumes them. */}
            <Section step={2} title="Decision evidence" description="The customer-safe explanation, CCR-only internal reasons, and the evidence that actually drove this decision.">
              <WhyThisCohortSection decision={decision} />
              {decision.internalReasons && decision.internalReasons.length > 0 && (
                <div className="rounded-2xl border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]">
                  <p className="mb-2 text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Internal reasons (CCR only — never shown to the customer)</p>
                  <ul className="flex flex-col gap-1">
                    {decision.internalReasons.map((r, i) => (
                      <li key={i} className="text-xs text-[#5c5c5c]">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            {/* Section 3 — Rule Evaluation */}
            <Section step={3} title="Rule evaluation" description="All 24 rules (R001-R024), expandable for their underlying evidence.">
              <RuleEvaluationTable ruleResults={decision.ruleResults} />
            </Section>

            {/* Section 4 — Readiness & Compliance */}
            <Section step={4} title="Readiness & compliance" description="Compliance-hold aging/escalation and case-aging for a blocked decision.">
              <CohortComplianceCard decision={decision} />
              {decision.complianceHold && canOverride && (
                <CohortComplianceAction
                  clearSubmitting={clearComplianceMutation.isPending}
                  declineSubmitting={declineComplianceMutation.isPending}
                  onClear={(reason) => clearComplianceMutation.mutate(reason)}
                  onDecline={(reason) => declineComplianceMutation.mutate(reason)}
                />
              )}
            </Section>

            {/* Section 5 — Alternative Matches & Exclusions */}
            <Section step={5} title="Alternative matches & exclusions" description="Every other matched condition, preserved — and the full §6.1 precedence table.">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SecondaryFlagsSection flags={decision.secondaryFlags} />
                <PrecedenceSection decision={decision} />
              </div>
            </Section>

            {/* Section 6 — Missing Information & Uncertainty */}
            <Section step={6} title="Missing information & uncertainty" description="What this engine does not yet know, and what it needs before resolution planning.">
              <CohortMissingDataPanel decision={decision} />
            </Section>

            {/* Section 7 — Recommended Pathway & Actions */}
            <Section step={7} title="Recommended pathway & actions" description="The review schedule and the customer-decision actions available to a CCR.">
              <NextReviewPanel decision={decision} />
              {!isTerminalDeclined && (
                <div className="flex flex-wrap justify-end gap-2">
                  <CohortDeclineAction submitting={declineMutation.isPending} onDecline={(reason) => declineMutation.mutate(reason)} />
                </div>
              )}
            </Section>

            {/* Section 8 — Audit & Downstream Handoff */}
            <Section step={8} title="Audit & downstream handoff" description="Decision history, source versions, the refresh-trigger taxonomy, and the override action available to a supervisor/admin.">
              {historyQuery.data && <CohortDecisionHistoryTable history={historyQuery.data} />}
              <p className="text-xs text-[#a3a3a3]">
                Source Master Profile version at generation time is tracked internally for staleness detection (see the "regenerate" banner above when stale) —
                this engine never re-reads raw bureau/bank data itself.
              </p>
              <RefreshTriggersPanel bbsLeadId={bbsLeadId} />
              {canOverride && (
                <div className="flex justify-end">
                  <CohortOverrideAction submitting={overrideMutation.isPending} onOverride={(newPrimaryCohort, reason, approverId) => overrideMutation.mutate({ newPrimaryCohort, reason, approverId })} />
                </div>
              )}
            </Section>
          </div>
        )
      }}
    </QueryBoundary>
  )
}
