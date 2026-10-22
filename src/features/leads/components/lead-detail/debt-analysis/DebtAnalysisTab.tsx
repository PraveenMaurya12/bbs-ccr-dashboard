import { Loader2, SearchX } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { QueryBoundary } from '@/components/shared/QueryBoundary'
import { Button } from '@/components/ui/button'
import { debtAnalysisService } from '../../../services/debtAnalysisService'
import type { DebtAnalysisResponse } from '../../../types'
import { AccountLevelTable } from './AccountLevelTable'
import { AccountTimelineCard } from './AccountTimelineCard'
import { BBSActionPlanPanel } from './BBSActionPlanPanel'
import { BankCrossCheckSection } from './BankCrossCheckSection'
import { CCRBriefCard } from './CCRBriefCard'
import { CreditCardExposureSection } from './CreditCardExposureSection'
import { CreditHistoryTrendCard } from './CreditHistoryTrendCard'
import { CreditProfileSummaryCard } from './CreditProfileSummaryCard'
import { DataQualityScoreCard } from './DataQualityScoreCard'
import { DebtAnalysisHeader } from './DebtAnalysisHeader'
import { DebtBehaviourSection } from './DebtBehaviourSection'
import { DebtConsolidationCard } from './DebtConsolidationCard'
import { DebtDiagnosisPanel } from './DebtDiagnosisPanel'
import { DebtPriorityMatrix } from './DebtPriorityMatrix'
import { DebtQualitySection } from './DebtQualitySection'
import { DebtRiskIndicatorCard } from './DebtRiskIndicatorCard'
import { DebtSnapshotStrip } from './DebtSnapshotStrip'
import { DebtStructureSection } from './DebtStructureSection'
import { DelinquencySection } from './DelinquencySection'
import { ExecutiveDiagnosisSummary } from './ExecutiveDiagnosisSummary'
import { FinalSummaryCard } from './FinalSummaryCard'
import { IdentityVariantsCard } from './IdentityVariantsCard'
import { LoanAccountAnalysisCard } from './LoanAccountAnalysisCard'
import { MissingInformationRegisterCard } from './MissingInformationRegisterCard'
import { RepaymentBehaviorCard } from './RepaymentBehaviorCard'
import { RepaymentBurdenSection } from './RepaymentBurdenSection'
import { ResolutionOpportunityList } from './ResolutionOpportunityList'
import { RiskIndicatorsCard } from './RiskIndicatorsCard'
import { RiskSignalEngineCard } from './RiskSignalEngineCard'
import { ScoreStructureDivergenceCard } from './ScoreStructureDivergenceCard'
import { SectionGroupHeading } from '../shared/SectionGroupHeading'
import { StressAnalysisSection } from './StressAnalysisSection'

function isEmpty(data: DebtAnalysisResponse): boolean {
  return !data.reportAvailable
}

export function DebtAnalysisTab({ bbsLeadId }: { bbsLeadId: string }) {
  const queryClient = useQueryClient()
  const queryKey = ['debtAnalysis', bbsLeadId]

  const query = useQuery({
    queryKey,
    queryFn: () => debtAnalysisService.getForLead(bbsLeadId),
    // Keeps polling while the lead's one-and-only bureau call is genuinely
    // in flight, AND separately while the Gemini insights job (which only
    // starts once the bureau report itself is already COMPLETED — see
    // BureauReportService.applyMappedResult) is still QUEUED/RUNNING — two
    // independent lifecycles the backend tracks separately (CreditReport
    // vs AnalysisJob), so polling must watch both or the tab silently
    // freezes on "AI insights are still being generated" once the bureau
    // report itself stops being IN_PROGRESS. (At most one bureau call is
    // ever made per lead — see BureauReportService.)
    refetchInterval: (q) => {
      const data = q.state.data
      if (!data?.reportAvailable) return false
      if (data.status === 'IN_PROGRESS') return 3000
      if (data.status === 'COMPLETED' && data.insights && (data.insights.status === 'QUEUED' || data.insights.status === 'RUNNING')) {
        return 3000
      }
      return false
    },
  })

  const reprocessMutation = useMutation({
    mutationFn: () => debtAnalysisService.reprocess(bbsLeadId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return (
    <QueryBoundary
      query={query}
      isEmpty={isEmpty}
      emptyTitle="No debt analysis yet"
      emptyDescription="Credit bureau data, lenders, outstanding balances, and DPD details will appear here once a bureau report is pulled."
    >
      {(data) => {
        // isEmpty already routed the `reportAvailable: false` case to the
        // empty state above.
        if (!data.reportAvailable) return null

        switch (data.status) {
          case 'IN_PROGRESS':
            return (
              <EmptyState
                icon={Loader2}
                title="Fetching the credit report from the bureau…"
                description="This can take a little while — this tab refreshes itself automatically."
              />
            )
          case 'NO_RECORD':
            // A legitimate, verified terminal result — not an error, and
            // never retried. The one Experian call for this lead has been
            // made and answered; there is nothing more to fetch.
            return (
              <EmptyState
                icon={SearchX}
                title="No Experian credit record was found for this lead"
                description="The bureau confirmed no credit history exists for this identity. This is a final result — it will not be checked again."
              />
            )
          case 'FAILED':
            // No raw response was ever received for this lead's one
            // Experian call, so there is nothing to reprocess — this is a
            // terminal state requiring manual review, never an automatic
            // or manual re-call.
            return (
              <ErrorState
                title="Experian report unavailable — manual review required"
                description={data.errorMessage ?? 'An unknown error occurred while contacting the credit bureau.'}
              />
            )
          case 'REQUIRES_REVIEW':
            return (
              <ErrorState
                title="Credit report requires review before analysis can be completed"
                description={
                  data.errorMessage ??
                  'Experian returned a real response for this lead, but it does not match the currently ' +
                    'supported mapping. The response has been preserved for reprocessing once the mapper is fixed.'
                }
              >
                <div className="flex flex-col items-start gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reprocessMutation.isPending}
                    onClick={() => reprocessMutation.mutate()}
                  >
                    {reprocessMutation.isPending ? 'Reprocessing…' : 'Reprocess stored response'}
                  </Button>
                  {/* The backend resolves (never throws) when it rejects a
                      duplicate concurrent reprocess, so a rejection must be
                      surfaced here explicitly — silently refetching would
                      look like nothing happened. */}
                  {reprocessMutation.data?.reprocessed === false && (
                    <p className="text-xs text-[#fa7319]">{reprocessMutation.data.reason}</p>
                  )}
                </div>
              </ErrorState>
            )
        }

        const report = data

        return (
          <div className="flex flex-col gap-6">
            <DebtAnalysisHeader
              bureau={report.meta.bureau}
              reportDate={report.meta.reportDate}
              insights={report.insights}
              onReprocess={() => reprocessMutation.mutate()}
              isReprocessing={reprocessMutation.isPending}
              reprocessRejectionReason={reprocessMutation.data?.reprocessed === false ? (reprocessMutation.data.reason ?? null) : null}
            />

            {/* 1 — Executive Overview: headline credit position, snapshot tiles, and the AI executive summary. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading step={1} title="Executive Overview" description="Credit score, account counts, outstanding/overdue headline figures, and the AI executive summary." />
              <DebtSnapshotStrip report={report} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[31%_1fr]">
                <CreditProfileSummaryCard report={report} />
                <ExecutiveDiagnosisSummary insights={report.insights} />
              </div>
            </section>

            {/* 2 — Report Coverage & Data Quality: how complete/trustworthy this report is, what's missing, and identity caveats. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading
                step={2}
                title="Report Coverage & Data Quality"
                description="The Data Quality Score, the Missing Information Register, bank cross-check coverage, and identity variants on file."
              />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <DataQualityScoreCard dataQuality={report.dataQuality} />
                <IdentityVariantsCard identity={report.identityVariants} />
              </div>
              <MissingInformationRegisterCard items={report.missingInformation} />
              <BankCrossCheckSection unavailable={report.unavailable} />
            </section>

            {/* 3 — Debt Structure & Lender Exposure: secured/unsecured, product mix, lender concentration, and every account. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading
                step={3}
                title="Debt Structure & Lender Exposure"
                description="Secured vs. unsecured, loan vs. card composition, lender concentration (all-time vs. active), credit-card utilisation, and the full account-level table."
              />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <DebtStructureSection report={report} />
                <LoanAccountAnalysisCard totalAccounts={report.accountDistribution.totalAccounts} slices={report.accountDistribution.slices} />
              </div>
              <CreditCardExposureSection utilization={report.utilization} />
              <AccountLevelTable accounts={report.level1.debtInventory.accounts} />
            </section>

            {/* 4 — Delinquency & Repayment Behaviour: current vs. historical DPD (kept strictly distinct), settlement status, and credit-history trend. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading
                step={4}
                title="Delinquency & Repayment Behaviour"
                description="Current DPD and historical DPD (never merged), account-status tiers, repayment-behaviour signals, and the monthly delinquency trend."
              />
              <DelinquencySection delinquency={report.delinquency} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <RepaymentBehaviorCard behavior={report.repaymentBehavior} />
                <DebtQualitySection report={report} />
              </div>
              <CreditHistoryTrendCard history={report.creditHistory} />
            </section>

            {/* 5 — Credit Behaviour & Timeline: account-opening velocity, churn, credit age, and borrowing-frequency behaviour. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading
                step={5}
                title="Credit Behaviour & Timeline"
                description="Account-opening recency windows, borrowing frequency, credit age, and account-churn pattern over the full credit timeline."
              />
              <DebtBehaviourSection report={report} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <AccountTimelineCard timeline={report.accountTimeline} openingVelocity={report.accountOpeningVelocity} />
                <DebtConsolidationCard consolidation={report.consolidationDetection} />
              </div>
            </section>

            {/* 6 — Stress, Diagnosis & Resolution Opportunities: the risk/stress scoring layer plus the AI diagnosis and action plan it grounds. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading
                step={6}
                title="Stress, Diagnosis & Resolution Opportunities"
                description="Debt stress level, risk-signal catalog, score-vs-structure divergence, the BBS Debt Risk Indicator, repayment capacity (DSR/DTI), resolution priority, and the AI diagnosis/action plan built from all of it."
              />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <StressAnalysisSection stress={report.stress} />
                <RepaymentBurdenSection debtServiceRatio={report.debtServiceRatio} debtToIncome={report.debtToIncome} />
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ScoreStructureDivergenceCard divergence={report.scoreStructureDivergence} />
                <DebtRiskIndicatorCard indicator={report.debtRiskIndicator} />
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <RiskIndicatorsCard riskFlags={report.riskFlags} />
                <RiskSignalEngineCard engine={report.riskSignalEngine} />
              </div>
              <DebtPriorityMatrix entries={report.priorityMatrix} />
              <DebtDiagnosisPanel insights={report.insights} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <BBSActionPlanPanel insights={report.insights} />
                <ResolutionOpportunityList insights={report.insights} />
              </div>
            </section>

            {/* 7 — Final Assessment & Downstream Handoff: the recap table and the fixed CCR Brief contract. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading step={7} title="Final Assessment & Downstream Handoff" description="The per-dimension Final Summary recap and the fixed CCR Brief handoff template." />
              <FinalSummaryCard rows={report.finalSummary} />
              <CCRBriefCard bbsLeadId={bbsLeadId} />
            </section>
          </div>
        )
      }}
    </QueryBoundary>
  )
}
