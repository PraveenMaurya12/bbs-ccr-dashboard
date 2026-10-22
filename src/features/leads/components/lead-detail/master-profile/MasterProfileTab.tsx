import type { ReactNode } from 'react'
import { CheckCircle2, CircleDashed, Loader2, ShieldCheck } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ErrorState } from '@/components/shared/ErrorState'
import { QueryBoundary } from '@/components/shared/QueryBoundary'
import { Button } from '@/components/ui/button'
import { debtAnalysisService } from '../../../services/debtAnalysisService'
import { financialAnalysisService } from '../../../services/financialAnalysisService'
import { masterProfileService } from '../../../services/masterProfileService'
import type { MasterProfileResponse } from '../../../types'
import { CohortAssessmentSection } from '../cohort-engine/CohortAssessmentSection'
import { CohortAttributeVectorCard } from './CohortAttributeVectorCard'
import { ComplianceHoldBanner } from './ComplianceHoldBanner'
import { CreditFinancialComparisonPanel, FinancialSnapshotGrid } from './CreditFinancialComparisonPanel'
import { DimensionConfidenceCard } from './DimensionConfidenceCard'
import { ExecutiveProfileCard } from './ExecutiveProfileCard'
import { FamilyNetworkVerificationTable } from './FamilyNetworkVerificationTable'
import { IdentityReconciliationCard } from './IdentityReconciliationCard'
import { MasterCapacityPanel } from './MasterCapacityPanel'
import { MasterMissingInformationRegisterCard } from './MasterMissingInformationRegisterCard'
import { MasterProfileHero } from './MasterProfileHero'
import { MasterReconciliationTable } from './MasterReconciliationTable'
import { MasterStressPanel } from './MasterStressPanel'
import { PossibleDriversSection, ValidationRequiredSection } from './PossibleDriversAndValidation'
import { PostStatementDebtCard } from './PostStatementDebtCard'
import { ReadinessGateCard } from './ReadinessGateCard'
import { ResolutionReadinessPanel } from './ResolutionReadinessPanel'
import { StrengthsConcernsOpportunities } from './StrengthsConcernsOpportunities'
import { WhyThisProfileSection } from './WhyThisProfileSection'

function UpstreamReadinessState({ data }: { data: Extract<MasterProfileResponse, { profileAvailable: false }> }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#ebebeb] bg-white p-10 text-center">
      <ShieldCheck className="size-10 text-[#8e51ff]" aria-hidden="true" />
      <div>
        <p className="text-base font-medium text-[#171717]">Master Profile not generated yet</p>
        <p className="mt-1 max-w-md text-sm text-[#5c5c5c]">
          The Master Profile reconciles Debt Analysis and Financial Analysis into one evidence-based profile — both must be completed first.
        </p>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          {data.debtAnalysisReady ? <CheckCircle2 className="size-4 text-[#1fc16b]" aria-hidden="true" /> : <CircleDashed className="size-4 text-[#a3a3a3]" aria-hidden="true" />}
          Debt Analysis {data.debtAnalysisReady ? 'completed' : 'not completed'}
        </div>
        <div className="flex items-center gap-2">
          {data.financialAnalysisReady ? <CheckCircle2 className="size-4 text-[#1fc16b]" aria-hidden="true" /> : <CircleDashed className="size-4 text-[#a3a3a3]" aria-hidden="true" />}
          Financial Analysis {data.financialAnalysisReady ? 'completed' : 'not completed'}
        </div>
      </div>
      {!data.debtAnalysisReady || !data.financialAnalysisReady ? (
        <p className="text-xs text-[#a3a3a3]">Complete both the Debt Analysis and Financial Analysis tabs for this lead, then return here to generate the profile.</p>
      ) : null}
    </div>
  )
}

/** One numbered section heading shared by all 7 sections below — gives CCR staff a stable, scannable hierarchy matching the v3.0 reference report's own structure. */
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

export function MasterProfileTab({ bbsLeadId, leadName }: { bbsLeadId: string; leadName: string }) {
  const queryClient = useQueryClient()
  const queryKey = ['masterProfile', bbsLeadId]

  const query = useQuery({
    queryKey,
    queryFn: () => masterProfileService.getForLead(bbsLeadId),
    refetchInterval: (q) => {
      const data = q.state.data
      if (!data?.profileAvailable) return false
      return data.status === 'GENERATING' ? 2000 : false
    },
  })

  const debtQuery = useQuery({ queryKey: ['debtAnalysis', bbsLeadId], queryFn: () => debtAnalysisService.getForLead(bbsLeadId) })
  const financialQuery = useQuery({ queryKey: ['financialAnalysis', bbsLeadId], queryFn: () => financialAnalysisService.getForLead(bbsLeadId) })

  const generateMutation = useMutation({
    mutationFn: () => masterProfileService.generate(bbsLeadId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return (
    <QueryBoundary query={query}>
      {(data) => {
        if (!data.profileAvailable) {
          return (
            <div className="flex flex-col gap-4">
              <UpstreamReadinessState data={data} />
              {data.debtAnalysisReady && data.financialAnalysisReady && (
                <div className="flex justify-center">
                  <Button disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
                    {generateMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : null}
                    Generate Master Profile
                  </Button>
                </div>
              )}
            </div>
          )
        }

        if (data.status === 'GENERATING') {
          return (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#ebebeb] bg-white p-10 text-center">
              <Loader2 className="size-8 animate-spin text-[#8e51ff]" aria-hidden="true" />
              <p className="text-sm text-[#5c5c5c]">Generating the Master Profile — reconciling Debt Analysis and Financial Analysis…</p>
            </div>
          )
        }

        if (data.status === 'FAILED') {
          return (
            <ErrorState title="Master Profile generation failed" description={data.errorMessage ?? 'An unknown error occurred while generating this profile.'}>
              <Button size="sm" variant="outline" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
                {generateMutation.isPending ? 'Retrying…' : 'Retry'}
              </Button>
            </ErrorState>
          )
        }

        const profile = data
        const debtReport = debtQuery.data
        const financialReport = financialQuery.data
        const debtCompleted = debtReport?.reportAvailable === true && debtReport.status === 'COMPLETED' ? debtReport : null
        const financialCompleted = financialReport?.reportAvailable === true && financialReport.status === 'COMPLETED' ? financialReport : null

        return (
          <div className="flex flex-col gap-8">
            <MasterProfileHero profile={profile} leadName={leadName} onRegenerate={() => generateMutation.mutate()} regenerating={generateMutation.isPending} />

            {/* Section 1 — Executive Profile */}
            <Section step={1} title="Executive profile" description="Overall synthesis, Data Quality, and confidence.">
              <ExecutiveProfileCard profile={profile} />
            </Section>

            {/* Section 2 — Identity & Reconciliation */}
            <Section step={2} title="Identity & reconciliation" description="Canonical identity fields and the credit-to-bank reconciliation.">
              <IdentityReconciliationCard identity={profile.identitySnapshot} />
              <MasterReconciliationTable rows={profile.reconciliationRows} />
            </Section>

            {/* Section 3 — Credit & Debt Position */}
            <Section step={3} title="Credit & debt position" description="Headline credit and debt figures sourced directly from Debt/Financial Analysis.">
              {debtCompleted && financialCompleted ? (
                <>
                  <FinancialSnapshotGrid debt={debtCompleted} financial={financialCompleted} />
                  <CreditFinancialComparisonPanel debt={debtCompleted} financial={financialCompleted} />
                </>
              ) : (
                <p className="rounded-lg bg-[#f7f7f7] px-3 py-2 text-xs text-[#a3a3a3]">Debt/Financial Analysis detail is unavailable for this snapshot.</p>
              )}
              <PostStatementDebtCard debt={profile.postStatementDebt} />
            </Section>

            {/* Section 4 — Income/Cash Flow & Capacity */}
            <Section step={4} title="Income, cash flow & capacity" description="Repayment capacity, stress synthesis, and family-network treatment.">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <MasterCapacityPanel profile={profile} />
                <MasterStressPanel stress={profile.stressProfile} />
              </div>
              <ResolutionReadinessPanel profile={profile} />
              <FamilyNetworkVerificationTable verification={profile.familyNetworkVerification} />
            </Section>

            {/* Section 5 — Compliance & Readiness Gate */}
            <Section step={5} title="Compliance & readiness gate" description="Compliance routing and the R1-R8 handoff conditions.">
              <ComplianceHoldBanner routing={profile.complianceRouting} />
              <ReadinessGateCard gate={profile.readinessGate} />
            </Section>

            {/* Section 6 — Missing Information & Verification */}
            <Section step={6} title="Missing information & verification" description="What BBS does not yet know, tiered by priority, and per-dimension confidence.">
              <MasterMissingInformationRegisterCard items={profile.missingInformation} />
              <DimensionConfidenceCard confidences={profile.dimensionConfidences} />
              <StrengthsConcernsOpportunities strengths={profile.strengths} concerns={profile.concerns} opportunitySignals={profile.opportunitySignals} />
              <WhyThisProfileSection strengths={profile.strengths} concerns={profile.concerns} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <PossibleDriversSection causes={profile.possibleCauses} />
                <ValidationRequiredSection items={profile.validationRequired} />
              </div>
            </Section>

            {/* Section 7 — Final Customer Profile & Downstream Handoff */}
            <Section step={7} title="Final profile & downstream handoff" description="The inputs handed to Cohort/Plan Engine — never a cohort assigned by Master Profile itself.">
              <CohortAttributeVectorCard attributes={profile.cohortAttributes} />
              <CohortAssessmentSection bbsLeadId={bbsLeadId} masterProfileReady={!profile.isStale} />
            </Section>
          </div>
        )
      }}
    </QueryBoundary>
  )
}
