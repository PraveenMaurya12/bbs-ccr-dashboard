import { env } from '@/lib/env'
import { apiRequest } from '@/services/api/client'
import { delay } from '@/services/mock/delay'
import type { BbsPlanActionStatus, BbsPlanConditionState, BbsPlanHistoryEntry, BbsPlanLifecycleStatus, BbsPlanReport, BbsPlanResponse } from '../types'

export interface PlanEngineService {
  getForLead(bbsLeadId: string): Promise<BbsPlanResponse>
  /** CCR-initiated generation (first run or explicit re-generation) — never triggered automatically. */
  generate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }>
  /** Alias of generate() — the spec's own two separate endpoints map to the same operation. */
  reassess(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }>
  getHistory(bbsLeadId: string): Promise<BbsPlanHistoryEntry[]>
  submitReview(bbsLeadId: string): Promise<{ updated: boolean; reason?: string; lifecycleStatus?: BbsPlanLifecycleStatus }>
  /** CCR-attested customer acceptance — this dashboard has no customer-facing portal. */
  accept(bbsLeadId: string): Promise<{ updated: boolean; reason?: string; lifecycleStatus?: BbsPlanLifecycleStatus }>
  activate(bbsLeadId: string): Promise<{ updated: boolean; reason?: string; lifecycleStatus?: BbsPlanLifecycleStatus }>
  /** Supervisor/admin only — enforced server-side via RolesGuard. */
  override(bbsLeadId: string, newLifecycleStatus: BbsPlanLifecycleStatus, reason: string): Promise<{ overridden: boolean; overrideId: string; newVersion: number }>
  /** v3.0 §11.2 — the legal-transition table is enforced server-side; a rejected transition comes back as `{updated: false, reason}`, not an HTTP error. */
  updateActionStatus(bbsLeadId: string, actionId: string, status: BbsPlanActionStatus): Promise<{ updated: boolean; reason?: string; status?: BbsPlanActionStatus }>
  /** v3.0 §13.3 — same server-enforced transition discipline as updateActionStatus. */
  updateConditionStatus(bbsLeadId: string, conditionId: string, state: BbsPlanConditionState, verificationEvidence?: string): Promise<{ updated: boolean; reason?: string; state?: string }>
}

// --- Mock implementation ----------------------------------------------------

const mockReport: BbsPlanReport = {
  planAvailable: true,
  status: 'COMPLETED',
  version: 1,
  templateId: 'TPL_STABILISE_STD_v1',
  templateVersion: 'BBS_PLAN_V3.0',
  isStale: false,
  generatedAt: new Date().toISOString(),
  cohort: 'C5',
  pathway: 'STABILISE',
  lifecycleStatus: 'DRAFT',
  situationAssessment: { narrative: 'Recent borrowing activity indicates an active debt cycle rather than a one-time event.', cohort: 'C5', pathway: 'STABILISE', capacityBand: 'STRESSED' },
  problemDefinition: { narrative: 'Continued new borrowing against an already-stretched position will outpace any repayment or restructuring plan unless the cycle itself is addressed first.' },
  financialCapacity: { capacityBand: 'STRESSED', capacityRatio: 0.05, sustainableCashFlow: 2500, stabilisationCoverage: null },
  debtStrategy: { narrative: 'Freeze any new borrowing as a precondition before pursuing restructuring/consolidation.' },
  financialTargets: {
    shortTermPlanTarget: { label: 'Short-term plan target', value: 2500, formula: 'essential_expenses + prioritized_payments (proxy: sustainableCashFlow)', dataAvailability: 'PARTIAL' },
    protectedBuffer: { label: 'Protected buffer', value: 250, formula: 'L3.stress_buffer (proxy: 10% of sustainableCashFlow)', dataAvailability: 'PARTIAL' },
    feasibility: 'NOT_APPLICABLE',
    proposedPayment: null,
  },
  debtTargets: { currentDebtComplexityBand: 'MODERATE' },
  risks: ['Without addressing the underlying driver, the customer may continue borrowing even after this plan is accepted'],
  disclosures: ['This plan does not freeze the customer’s credit facilities directly — it is a commitment the customer agrees to, not a technical block BBS can enforce.'],
  successCriteria: ['No new credit account opened during the review window', 'Enquiry volume returns to baseline (below the Cohort Engine’s enquiry-burst threshold)'],
  monitoringTriggers: { scheduledDaysFromNow: [30, 60, 90], eventTriggers: ['action_overdue', 'condition_failed', 'new_cohort_decision', 'missed_payment', 'lender_decline'] },
  reviewSchedule: { cadenceDays: [30, 60, 90], nextReviewDueInDays: 30 },
  dataProvenance: [
    { field: 'cohort', source: 'COHORT_ENGINE', verified: true, confidence: 'HIGH' },
    { field: 'capacityBand', source: 'COHORT_ENGINE', verified: true, confidence: 'HIGH' },
  ],
  missingData: [],
  customerExplanation: 'We identified multiple active credit obligations and recent borrowing activity. Break an active debt-stacking/debt-cycle pattern before further new borrowing escalates risk.',
  specialistReviewRequired: false,
  ruleResults: [
    { ruleId: 'PL001', evaluation: 'FIRED', reason: 'Gate outcome: GENERATE — L5 pathway_status is READY with a non-null primary_pathway.', evidence: { outcome: 'GENERATE' } },
    { ruleId: 'PL013', evaluation: 'FIRED', reason: 'Plan TTL fixed at 30 days for pathway STABILISE, per v3.0 §12.5\'s per-pathway TTL table.', evidence: { pathway: 'STABILISE', planTtlDays: 30 } },
  ],
  changeSummary: null,
  ttl: { planTtlDays: 30, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), liveStatus: 'ACTIVE' },
  actions: [
    { actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Discuss the recent borrowing pattern with the customer and identify the underlying driver.', owner: 'CCR', timing: 'Within 2 business days', dependency: null, evidenceRequired: null, status: 'PENDING', slaDays: null },
    { actionId: 'immediate-2', ownerType: 'CUSTOMER', phase: 'IMMEDIATE', description: 'Commit to not taking on new unsecured credit for the duration of this plan.', owner: 'Customer', timing: 'Immediate', dependency: null, evidenceRequired: null, status: 'PENDING', slaDays: null },
    { actionId: 'day30-1', ownerType: 'BBS', phase: 'DAY_30', description: 'Re-check enquiry/new-account activity against the Cohort Engine’s own thresholds.', owner: 'CCR', timing: 'Day 30 review', dependency: null, evidenceRequired: null, status: 'PENDING', slaDays: null },
  ],
  conditions: [
    { conditionId: 'cond-1', description: 'No new credit account opened since plan generation.', state: 'UNKNOWN', source: 'Debt Analysis (next Cohort re-evaluation)', verificationStatus: 'UNVERIFIED' },
    { conditionId: 'std-consent-valid', description: 'Consent valid.', state: 'MET', source: 'Cohort Engine upstream gate', verificationStatus: 'VERIFIED', priority: 'P1' },
    { conditionId: 'std-product-available', description: 'Product available.', state: 'NOT_APPLICABLE', source: 'No live product-catalog integration exists in this codebase', verificationStatus: 'UNVERIFIED', priority: 'P2' },
  ],
  narrative: null,
}

class MockPlanEngineService implements PlanEngineService {
  async getForLead(bbsLeadId: string): Promise<BbsPlanResponse> {
    if (bbsLeadId === 'BBS-LD-900001') return delay(mockReport, 300)
    return delay({ planAvailable: false, cohortDecisionReady: false }, 300)
  }

  async generate(): Promise<{ generated: boolean; reason?: string }> {
    return delay({ generated: false, reason: 'Mock mode has no live upstream modules to reconcile.' }, 300)
  }

  async reassess(): Promise<{ generated: boolean; reason?: string }> {
    return this.generate()
  }

  async getHistory(): Promise<BbsPlanHistoryEntry[]> {
    return delay([{ version: 1, generationStatus: 'COMPLETED', lifecycleStatus: 'DRAFT', cohort: 'C5', pathway: 'STABILISE', templateId: 'TPL_STABILISE_STD_v1', generatedAt: mockReport.generatedAt, changeSummary: null }], 300)
  }

  async submitReview(): Promise<{ updated: boolean; reason?: string; lifecycleStatus?: BbsPlanLifecycleStatus }> {
    return delay({ updated: false, reason: 'Mock mode has no live Plan to transition.' }, 300)
  }

  async accept(): Promise<{ updated: boolean; reason?: string; lifecycleStatus?: BbsPlanLifecycleStatus }> {
    return this.submitReview()
  }

  async activate(): Promise<{ updated: boolean; reason?: string; lifecycleStatus?: BbsPlanLifecycleStatus }> {
    return this.submitReview()
  }

  async override(): Promise<{ overridden: boolean; overrideId: string; newVersion: number }> {
    return delay({ overridden: false, overrideId: '', newVersion: 1 }, 300)
  }

  async updateActionStatus(): Promise<{ updated: boolean; reason?: string; status?: BbsPlanActionStatus }> {
    return delay({ updated: false, reason: 'Mock mode has no live Plan action to transition.' }, 300)
  }

  async updateConditionStatus(): Promise<{ updated: boolean; reason?: string; state?: string }> {
    return delay({ updated: false, reason: 'Mock mode has no live Plan condition to transition.' }, 300)
  }
}

// --- Real backend implementation --------------------------------------------

class ApiPlanEngineService implements PlanEngineService {
  async getForLead(bbsLeadId: string): Promise<BbsPlanResponse> {
    return apiRequest<BbsPlanResponse>(`/leads/${bbsLeadId}/plan`)
  }

  async generate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    return apiRequest<{ generated: boolean; reason?: string }>(`/leads/${bbsLeadId}/plan/generate`, { method: 'POST' })
  }

  async reassess(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    return apiRequest<{ generated: boolean; reason?: string }>(`/leads/${bbsLeadId}/plan/reassess`, { method: 'POST' })
  }

  async getHistory(bbsLeadId: string): Promise<BbsPlanHistoryEntry[]> {
    return apiRequest<BbsPlanHistoryEntry[]>(`/leads/${bbsLeadId}/plan/history`)
  }

  async submitReview(bbsLeadId: string): Promise<{ updated: boolean; reason?: string; lifecycleStatus?: BbsPlanLifecycleStatus }> {
    return apiRequest(`/leads/${bbsLeadId}/plan/submit-review`, { method: 'POST' })
  }

  async accept(bbsLeadId: string): Promise<{ updated: boolean; reason?: string; lifecycleStatus?: BbsPlanLifecycleStatus }> {
    return apiRequest(`/leads/${bbsLeadId}/plan/accept`, { method: 'POST' })
  }

  async activate(bbsLeadId: string): Promise<{ updated: boolean; reason?: string; lifecycleStatus?: BbsPlanLifecycleStatus }> {
    return apiRequest(`/leads/${bbsLeadId}/plan/activate`, { method: 'POST' })
  }

  async override(bbsLeadId: string, newLifecycleStatus: BbsPlanLifecycleStatus, reason: string): Promise<{ overridden: boolean; overrideId: string; newVersion: number }> {
    return apiRequest<{ overridden: boolean; overrideId: string; newVersion: number }>(`/leads/${bbsLeadId}/plan/override`, {
      method: 'POST',
      body: JSON.stringify({ newLifecycleStatus, reason }),
    })
  }

  async updateActionStatus(bbsLeadId: string, actionId: string, status: BbsPlanActionStatus): Promise<{ updated: boolean; reason?: string; status?: BbsPlanActionStatus }> {
    return apiRequest(`/leads/${bbsLeadId}/plan/actions/${actionId}/status`, { method: 'POST', body: JSON.stringify({ status }) })
  }

  async updateConditionStatus(bbsLeadId: string, conditionId: string, state: BbsPlanConditionState, verificationEvidence?: string): Promise<{ updated: boolean; reason?: string; state?: string }> {
    return apiRequest(`/leads/${bbsLeadId}/plan/conditions/${conditionId}/status`, { method: 'POST', body: JSON.stringify({ state, verificationEvidence }) })
  }
}

export const planEngineService: PlanEngineService = env.apiMode === 'api' ? new ApiPlanEngineService() : new MockPlanEngineService()
