import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ErrorState } from '@/components/shared/ErrorState'
import { QueryBoundary } from '@/components/shared/QueryBoundary'
import { Button } from '@/components/ui/button'
import { financialAnalysisService } from '../../../services/financialAnalysisService'
import type { FinancialAnalysisResponse } from '../../../types'
import { ActionPriorityQuadrants } from './ActionPriorityQuadrants'
import { AIFinancialAssessmentPanel } from './AIFinancialAssessmentPanel'
import { BalanceReconciliationCard } from './BalanceReconciliationCard'
import { BorrowingTransactionBehaviourSection } from './BorrowingTransactionBehaviourSection'
import { BounceBucketsCard } from './BounceBucketsCard'
import { CashFlowChart } from './CashFlowChart'
import { CCRBriefCard } from './CCRBriefCard'
import { CohortSignalPackageCard } from './CohortSignalPackageCard'
import { DataQualityScoreCard } from './DataQualityScoreCard'
import { DebtServicingSection } from './DebtServicingSection'
import { DocumentProcessingStatus } from './DocumentProcessingStatus'
import { EventProfileCard } from './EventProfileCard'
import { ExpenseCompositionCard } from './ExpenseCompositionCard'
import { FcfReconciliationCard } from './FcfReconciliationCard'
import { FinalSummaryCard } from './FinalSummaryCard'
import { FinancialAnalysisHeader } from './FinancialAnalysisHeader'
import { FinancialHealthHero } from './FinancialHealthHero'
import { FinancialOverviewMetricsGrid } from './FinancialOverviewMetricsGrid'
import { IncomeSourceBreakdownCard } from './IncomeSourceBreakdownCard'
import { IncomeTrendChart } from './IncomeTrendChart'
import { LiquidityBalanceChart } from './LiquidityBalanceChart'
import { MissingInformationRegisterCard } from './MissingInformationRegisterCard'
import { ReconciliationTable } from './ReconciliationTable'
import { ReviewChecklistCard } from './ReviewChecklistCard'
import { RiskFlagsCard } from './RiskFlagsCard'
import { ScoreCashflowDivergenceCard } from './ScoreCashflowDivergenceCard'
import { SectionGroupHeading } from '../shared/SectionGroupHeading'
import { TransactionsTable } from './TransactionsTable'
import { TransferProfileCard } from './TransferProfileCard'
import { WeightedComponentsTable } from './WeightedComponentsTable'
import { WhatL2CannotDecideCard } from './WhatL2CannotDecideCard'

function isEmpty(data: FinancialAnalysisResponse): boolean {
  return !data.reportAvailable
}

const IN_FLIGHT_STATUSES = new Set(['UPLOADED', 'EXTRACTING', 'NORMALIZING', 'CLASSIFYING', 'ANALYZING'])

export function FinancialAnalysisTab({ bbsLeadId }: { bbsLeadId: string }) {
  const queryClient = useQueryClient()
  const queryKey = ['financialAnalysis', bbsLeadId]

  const query = useQuery({
    queryKey,
    queryFn: () => financialAnalysisService.getForLead(bbsLeadId),
    // Collapsed 2-lifecycle polling, same shape as DebtAnalysisTab's own:
    // the document-processing pipeline (UPLOADED..ANALYZING) is one
    // lifecycle, and — once COMPLETED — the separate AI insights job
    // (QUEUED/RUNNING) is the other. Deliberately NOT a 3rd axis: the
    // deterministic calculation finishes synchronously as part of the same
    // pipeline run that flips status to COMPLETED.
    refetchInterval: (q) => {
      const data = q.state.data
      if (!data?.reportAvailable) return false
      if (IN_FLIGHT_STATUSES.has(data.status)) return 3000
      if (data.status === 'COMPLETED' && data.insights && (data.insights.status === 'QUEUED' || data.insights.status === 'RUNNING')) {
        return 3000
      }
      return false
    },
  })

  const reprocessMutation = useMutation({
    mutationFn: (documentId: string) => financialAnalysisService.reprocess(bbsLeadId, documentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return (
    <QueryBoundary
      query={query}
      isEmpty={isEmpty}
      emptyTitle="No financial analysis yet"
      emptyDescription="Upload a bank statement (PDF, XLSX, or CSV) under the Documents tab — as a Bank Statement — to begin. Processing starts automatically once uploaded."
    >
      {(data) => {
        if (!data.reportAvailable) return null

        switch (data.status) {
          case 'UPLOADED':
          case 'EXTRACTING':
          case 'NORMALIZING':
          case 'CLASSIFYING':
          case 'ANALYZING':
            return (
              <div className="rounded-2xl border border-[#ebebeb] bg-white">
                <DocumentProcessingStatus status={data.status} />
              </div>
            )
          case 'FAILED':
            return (
              <ErrorState title="Statement processing failed" description={data.errorMessage ?? 'An unknown error occurred while processing this statement.'}>
                <Button size="sm" variant="outline" disabled={reprocessMutation.isPending} onClick={() => reprocessMutation.mutate(data.documentId)}>
                  {reprocessMutation.isPending ? 'Reprocessing…' : 'Reprocess'}
                </Button>
              </ErrorState>
            )
        }

        const report = data

        return (
          <div className="flex flex-col gap-6">
            {report.latestUploadFailed && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#fde4a8] bg-[#fffaeb] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#854d0e]">A more recent bank statement upload failed to process</p>
                  <p className="text-xs text-[#854d0e]/80">
                    {report.latestUploadFailed.errorMessage ?? 'An unknown error occurred.'} The report below is still from the last successfully completed
                    analysis — it has not been replaced by this failed attempt.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reprocessMutation.isPending}
                  onClick={() => reprocessMutation.mutate(report.latestUploadFailed!.documentId)}
                >
                  {reprocessMutation.isPending ? 'Reprocessing…' : 'Reprocess'}
                </Button>
              </div>
            )}

            <FinancialAnalysisHeader statement={report.statement} />

            {/* 1 — Executive Overview: score, components, and the headline metrics a reviewer needs before anything else. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading step={1} title="Executive Overview" description="Financial Health Score, component breakdown, and the headline income/expense/debt/liquidity metrics." />
              <FinancialHealthHero score={report.score} />
              <WeightedComponentsTable score={report.score} />
              <FinancialOverviewMetricsGrid months={report.months} incomeProfile={report.score.extendedAnalysis?.incomeProfile} />
            </section>

            {/* 2 — Statement & Data Quality: reconciliation, the Data Quality Score, and what's missing. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading step={2} title="Statement & Data Quality" description="Balance reconciliation, the Data Quality Score, and the Missing Information Register." />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <DataQualityScoreCard dataQuality={report.score.extendedAnalysis?.dataQuality} />
                <BalanceReconciliationCard reconciliation={report.score.extendedAnalysis?.reconciliation} />
              </div>
              <MissingInformationRegisterCard items={report.score.extendedAnalysis?.missingInformationRegister} />
            </section>

            {/* 3 — Income Profile: current normalized income, source breakdown, and the monthly timeline. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading step={3} title="Income Profile" description="Current normalized monthly income, employment type, tenure/confidence, and the monthly income timeline." />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <IncomeSourceBreakdownCard
                  transactions={report.transactions}
                  months={report.months}
                  incomeProfile={report.score.extendedAnalysis?.incomeProfile}
                  daysToNextIncome={report.score.extendedAnalysis?.daysToNextIncome}
                />
                <IncomeTrendChart months={report.months} />
              </div>
            </section>

            {/* 4 — Expense & Cash-Flow Analysis: essential/discretionary split, FCF reconciliation, liquidity, borrowing dependency. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading
                step={4}
                title="Expense & Cash-Flow Analysis"
                description="Essential vs. discretionary expenses, theoretical vs. actual free cash flow, liquidity, and borrowing dependency."
              />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <CashFlowChart months={report.months} />
                <ExpenseCompositionCard months={report.months} transactions={report.transactions} />
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <FcfReconciliationCard fcfReconciliation={report.score.extendedAnalysis?.fcfReconciliation} />
                <LiquidityBalanceChart months={report.months} />
              </div>
              <BorrowingTransactionBehaviourSection months={report.months} transactions={report.transactions} riskFlags={report.riskFlags} />
            </section>

            {/* 5 — Debt & Recurring Payments: detected EMIs/obligations by lender, DSR, and bounce evidence. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading
                step={5}
                title="Debt & Recurring Payments"
                description="Detected EMI/debt obligations by lender, fixed/total DSR, bounce evidence, and credit-bureau reconciliation."
              />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <DebtServicingSection months={report.months} transactions={report.transactions} dsrBreakdown={report.score.extendedAnalysis?.dsrBreakdown} />
                <BounceBucketsCard transactions={report.transactions} />
              </div>
              <ReconciliationTable riskFlags={report.riskFlags} variant="full" />
            </section>

            {/* 6 — Behaviour, Risks & Financial Events: transfers/family network, events, risk signals, score-cashflow divergence. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading
                step={6}
                title="Behaviour, Risks & Financial Events"
                description="Transfer/P2P and family-network signals, detected events, the risk signal catalog, and score-vs-cash-flow divergence."
              />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <TransferProfileCard transferProfile={report.score.extendedAnalysis?.transferProfile} />
                <EventProfileCard eventProfile={report.score.extendedAnalysis?.eventProfile} />
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <RiskFlagsCard riskFlags={report.riskFlags} />
                <ScoreCashflowDivergenceCard divergence={report.score.extendedAnalysis?.scoreCashflowDivergence} />
              </div>
              <AIFinancialAssessmentPanel insights={report.insights} />
              <ActionPriorityQuadrants insights={report.insights} />
            </section>

            {/* 7 — Final Assessment & Downstream Handoff: summary, checklist, limitations, and the CCR/Cohort handoff contracts. */}
            <section className="flex flex-col gap-4">
              <SectionGroupHeading
                step={7}
                title="Final Assessment & Downstream Handoff"
                description="Final Summary, Review Checklist, What L2 Cannot Decide, CCR Brief, and the Cohort Signal Package."
              />
              <FinalSummaryCard finalSummary={report.score.extendedAnalysis?.finalSummary} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ReviewChecklistCard reviewChecklist={report.score.extendedAnalysis?.reviewChecklist} />
                <WhatL2CannotDecideCard items={report.score.extendedAnalysis?.whatL2CannotDecide} />
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <CCRBriefCard ccrBrief={report.score.extendedAnalysis?.ccrBrief} />
                <CohortSignalPackageCard cohortSignalPackage={report.score.extendedAnalysis?.cohortSignalPackage} />
              </div>
              <TransactionsTable transactions={report.transactions} />
            </section>
          </div>
        )
      }}
    </QueryBoundary>
  )
}
