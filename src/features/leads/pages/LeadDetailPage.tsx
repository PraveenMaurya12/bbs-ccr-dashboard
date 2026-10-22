import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, History, PhoneCall } from 'lucide-react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'

import { QueryBoundary } from '@/components/shared/QueryBoundary'
import { ContactInfoStrip } from '../components/lead-detail/ContactInfoStrip'
import { DebtAnalysisTab } from '../components/lead-detail/debt-analysis/DebtAnalysisTab'
import { FinancialAnalysisTab } from '../components/lead-detail/financial-analysis/FinancialAnalysisTab'
import { DocumentsTab } from '../components/lead-detail/documents/DocumentsTab'
import { MasterProfileTab } from '../components/lead-detail/master-profile/MasterProfileTab'
import { PathwayDecisionSection } from '../components/lead-detail/pathway-engine/PathwayDecisionSection'
import { PlanEngineSection } from '../components/lead-detail/plan-engine/PlanEngineSection'
import { EmptyTabContent } from '../components/lead-detail/EmptyTabContent'
import { LeadDetailTabs, type LeadDetailTabId } from '../components/lead-detail/LeadDetailTabs'
import { LeadDetailsForm, type LeadDetailsFormHandle } from '../components/lead-detail/LeadDetailsForm'
import { LeadSummaryCard } from '../components/lead-detail/LeadSummaryCard'
import { leadDetailService } from '../services/leadDetailService'
import type { UpdateLeadDetailInput } from '../types'

const UNSAVED_CHANGES_MESSAGE = 'You have unsaved changes on the Lead Details tab. Leave without saving?'

export default function LeadDetailPage() {
  const { bbsLeadId } = useParams<{ bbsLeadId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<LeadDetailTabId>('lead-details')
  const formRef = useRef<LeadDetailsFormHandle>(null)

  // Covers a hard reload/tab close — a route change away from this page
  // (sidebar links, browser back/forward, "Back to leads") is instead
  // guarded by useBlocker below, since this native prompt can't run for
  // in-app SPA navigation at all.
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (formRef.current?.isDirty()) {
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Covers EVERY route change away from this page while the Lead Details
  // form is dirty — sidebar links, browser back/forward, and the "Back to
  // leads" button below — not just the one or two hand-wired call sites a
  // manual confirm() would require (previously only "Back to leads" and
  // the in-page tab strip were actually guarded; a data-router `useBlocker`
  // intercepts the navigation itself, regardless of what triggered it).
  const blocker = useBlocker(() => tab === 'lead-details' && (formRef.current?.isDirty() ?? false))
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(UNSAVED_CHANGES_MESSAGE)) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  function confirmDiscardIfDirty(): boolean {
    if (!formRef.current?.isDirty()) return true
    return window.confirm(UNSAVED_CHANGES_MESSAGE)
  }

  function handleTabChange(nextTab: LeadDetailTabId) {
    if (tab === nextTab) return
    if (tab === 'lead-details' && !confirmDiscardIfDirty()) return
    setTab(nextTab)
  }

  function handleBackToLeads() {
    navigate('/leads')
  }

  const leadQuery = useQuery({
    queryKey: ['leadDetail', bbsLeadId],
    queryFn: () => leadDetailService.get(bbsLeadId!),
    enabled: Boolean(bbsLeadId),
  })

  const updateMutation = useMutation({
    mutationFn: (input: UpdateLeadDetailInput) => leadDetailService.update(bbsLeadId!, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(['leadDetail', bbsLeadId], updated)
      queryClient.invalidateQueries({ queryKey: ['leadRecords'] })
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={handleBackToLeads}
        className="inline-flex w-fit items-center gap-1 text-sm text-[#5c5c5c] hover:text-[#171717]"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to leads
      </button>

      <QueryBoundary query={leadQuery} emptyTitle="Lead not found">
        {(lead) => (
          <div className="flex flex-col gap-4">
            <LeadSummaryCard lead={lead} />
            <ContactInfoStrip lead={lead} />

            <div>
              <LeadDetailTabs active={tab} onChange={handleTabChange} />

              <div
                role="tabpanel"
                id={`lead-detail-panel-${tab}`}
                aria-labelledby={`lead-detail-tab-${tab}`}
                className="pt-6"
              >
                {tab === 'lead-details' && (
                  <LeadDetailsForm
                    ref={formRef}
                    lead={lead}
                    onSave={(input) => updateMutation.mutateAsync(input).then(() => {})}
                  />
                )}
                {tab === 'call-details' && (
                  <EmptyTabContent
                    icon={PhoneCall}
                    title="No call history yet"
                    description="Call outcomes, follow-ups, and counsellor notes will appear here once this lead is contacted."
                  />
                )}
                {tab === 'debt-analysis' && <DebtAnalysisTab bbsLeadId={lead.bbsLeadId} />}
                {tab === 'financial-analysis' && <FinancialAnalysisTab bbsLeadId={lead.bbsLeadId} />}
                {tab === 'final-profile' && <MasterProfileTab bbsLeadId={lead.bbsLeadId} leadName={lead.fullName} />}
                {tab === 'recovery-plan' && (
                  <div className="flex flex-col gap-6">
                    <PathwayDecisionSection bbsLeadId={lead.bbsLeadId} />
                    <PlanEngineSection bbsLeadId={lead.bbsLeadId} />
                  </div>
                )}
                {tab === 'documents' && <DocumentsTab bbsLeadId={lead.bbsLeadId} />}
                {tab === 'timeline' && (
                  <EmptyTabContent
                    icon={History}
                    title="No activity recorded yet"
                    description="Status changes and other lead activity will appear here as they happen."
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </QueryBoundary>
    </div>
  )
}
