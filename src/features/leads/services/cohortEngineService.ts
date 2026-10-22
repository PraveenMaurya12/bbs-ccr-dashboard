import { env } from '@/lib/env'
import { apiRequest } from '@/services/api/client'
import { delay } from '@/services/mock/delay'
import type { CohortComplianceActionType, CohortDecisionHistoryEntry, CohortDecisionReport, CohortDecisionResponse, CohortPrimaryState, CohortRefreshTriggersResponse } from '../types'

export interface CohortComplianceActionResult {
  resolved: boolean
  action: CohortComplianceActionType
  newPrimaryCohort: CohortPrimaryState
  newVersion: number
}

export interface CohortEngineService {
  getForLead(bbsLeadId: string): Promise<CohortDecisionResponse>
  /** CCR-initiated evaluation (first run or explicit re-evaluation) — never triggered automatically. */
  evaluate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }>
  /** Alias of evaluate() — the spec's own two separate endpoints map to the same operation. */
  recalculate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }>
  getHistory(bbsLeadId: string): Promise<CohortDecisionHistoryEntry[]>
  /** v3.0 §15.1's refresh-trigger taxonomy, made inspectable — the 6 documented triggers, enriched with real per-lead applicability where available. */
  getRefreshTriggers(bbsLeadId: string): Promise<CohortRefreshTriggersResponse>
  /** Supervisor/admin only — enforced server-side via RolesGuard. `approverId` is required (and must differ from the acting user) when overriding to C1/C4/C6 — v3.0 §19.2 maker-checker. */
  override(bbsLeadId: string, newPrimaryCohort: CohortPrimaryState, reason: string, approverId?: string): Promise<{ overridden: boolean; overrideId: string; newVersion: number }>
  /** v3.0 §14.3: records an explicit customer decline — CCR-attested (no customer portal exists in this dashboard). */
  decline(bbsLeadId: string, reason: string | null): Promise<{ declined: boolean; newVersion: number }>
  /** v3.0 §7.4 compliance feedback loop, step 1 — supervisor/admin only. Promotes the next-highest preserved cohort candidate. Requires an active, unresolved compliance hold. */
  clearCompliance(bbsLeadId: string, reason: string): Promise<CohortComplianceActionResult>
  /** v3.0 §7.4 compliance feedback loop, step 2 — supervisor/admin only. Always resolves to X2 ("Outside Current Program"). Requires an active, unresolved compliance hold. */
  declineCompliance(bbsLeadId: string, reason: string): Promise<CohortComplianceActionResult>
}

// --- v3.0 §15.1 refresh-trigger taxonomy ------------------------------------
// Mirrors backend/src/modules/cohort-engine/calculations/refresh-triggers.ts's
// own static REFRESH_TRIGGER_TAXONOMY exactly — the frontend has no shared
// package with the backend, so this is a deliberate, documented duplication
// of the same spec-derived static catalog (not independently re-derived).

const REFRESH_TRIGGER_TAXONOMY: CohortRefreshTriggersResponse['triggers'] = [
  {
    id: 'NEW_BANK_STATEMENT',
    label: 'New bank statement received',
    layersRerun: ['L2_FINANCIAL_ANALYSIS', 'L3_MASTER_PROFILE', 'L4_COHORT_DECISION'],
    requiredConditions: 'A new bank statement is uploaded and Financial Analysis (L2) is regenerated from it for this lead.',
    affectedAssessment: 'Financial Analysis, then Master Profile, then the Cohort Decision — in that order.',
    expectedReevaluationBehavior: 'Financial Analysis, then Master Profile, then the Cohort Decision all regenerate in order; the prior Cohort Decision version is preserved, never mutated.',
    mechanicallyDetectable: true,
    detectionNote: "Indirectly detectable via the decision's `isStale` flag — indistinguishable from NEW_BUREAU_PULL/CCR_DISCOVERY_COMPLETE/MATERIAL_EVENT by cause alone in this codebase today.",
  },
  {
    id: 'NEW_BUREAU_PULL',
    label: 'New bureau pull',
    layersRerun: ['L1_DEBT_ANALYSIS', 'L3_MASTER_PROFILE', 'L4_COHORT_DECISION'],
    requiredConditions: 'A new bureau report is pulled and Debt Analysis (L1) is regenerated from it for this lead.',
    affectedAssessment: 'Debt Analysis, then Master Profile, then the Cohort Decision — in that order.',
    expectedReevaluationBehavior: 'Debt Analysis, then Master Profile, then the Cohort Decision all regenerate in order; the prior Cohort Decision version is preserved, never mutated.',
    mechanicallyDetectable: true,
    detectionNote: "Same `isStale` signal as NEW_BANK_STATEMENT. Also structurally limited today: a lead can only ever have one CreditReport in this schema, so a genuine second pull doesn't yet exist to trigger this.",
  },
  {
    id: 'CCR_DISCOVERY_COMPLETE',
    label: 'CCR discovery complete',
    layersRerun: ['L3_MASTER_PROFILE', 'L4_COHORT_DECISION'],
    requiredConditions: 'A CCR resolves open Master Profile reconciliation/missing-information items and Master Profile (L3) is regenerated to reflect it.',
    affectedAssessment: 'Master Profile only, then the Cohort Decision.',
    expectedReevaluationBehavior: 'Master Profile regenerates from the CCR-resolved facts, then the Cohort Decision re-evaluates against it.',
    mechanicallyDetectable: true,
    detectionNote: 'Same `isStale` signal — this codebase does not persist a discrete "CCR discovery" event log to confirm this specific cause.',
  },
  {
    id: 'COMPLIANCE_CLEARED',
    label: 'Compliance cleared',
    layersRerun: ['L4_COHORT_DECISION'],
    requiredConditions: 'The latest Cohort Decision has an active, unresolved compliance hold.',
    affectedAssessment: 'The Cohort Decision only — L1/L2/L3 are never touched.',
    expectedReevaluationBehavior: 'The compliance hold is removed from active blocks, precedence is re-evaluated over the preserved secondary flags (never a full rule re-run), and the next-highest candidate is auto-assigned. Implemented by the Clear/Decline compliance actions above (§7.4).',
    mechanicallyDetectable: true,
    detectionNote: 'Directly detectable: an active, unresolved compliance hold on the latest decision is exactly the precondition the clear/decline actions enforce.',
  },
  {
    id: 'POLICY_CHANGE',
    label: 'Policy change',
    layersRerun: ['L4_COHORT_DECISION'],
    requiredConditions: "A Policy Registry threshold or rule version changes, requiring re-evaluation without any new upstream fact having changed.",
    affectedAssessment: 'The Cohort Decision only.',
    expectedReevaluationBehavior: 'Re-evaluation runs against the same Master Profile version, under the new policy/rule version.',
    mechanicallyDetectable: false,
    detectionNote: 'Not detectable from persisted data — no versioned policy-change event exists in this codebase. Always requires an explicit, out-of-band recalculation.',
  },
  {
    id: 'MATERIAL_EVENT',
    label: 'Material event',
    layersRerun: ['L3_MASTER_PROFILE', 'L4_COHORT_DECISION'],
    requiredConditions: 'A material change (income transition, medical shock, new overdue, lender decline, legal-status change) is recorded and Master Profile (L3) is regenerated.',
    affectedAssessment: 'Master Profile, then the Cohort Decision.',
    expectedReevaluationBehavior: 'Master Profile regenerates incorporating the material change, then the Cohort Decision re-evaluates against it.',
    mechanicallyDetectable: true,
    detectionNote: 'Same `isStale` signal as the other L3-triggered triggers — not separately distinguishable after the fact by cause.',
  },
]

// --- Mock implementation ----------------------------------------------------

const mockReport: CohortDecisionReport = {
  decisionAvailable: true,
  status: 'COMPLETED',
  version: 1,
  ruleVersion: 'BBS_COHORT_V3.0',
  isStale: false,
  generatedAt: new Date().toISOString(),
  decidedAt: null,
  primaryCohort: 'C5',
  primaryState: 'C5',
  primaryReasonCode: null,
  lifecycleState: 'CCR_REVIEW',
  secondaryFlags: [
    { key: 'C3', label: 'Restructure candidate', reason: 'Surplus is non-negative but the current debt structure does not meet comfortable affordability.' },
    { key: 'OVERDUE_THRESHOLD_EXCEEDED', label: 'OVERDUE THRESHOLD EXCEEDED', reason: 'Total overdue exceeds the configured capacity/review trigger.' },
  ],
  archetype: 'DEBT_SPIRAL',
  pathway: 'STABILISE',
  capacityBand: 'STRESSED',
  capacityRatio: 0.05,
  sustainableCashFlow: 2500,
  stabilisationCoverage: null,
  debtComplexityBand: 'MODERATE',
  planEligibility: 'DRAFT',
  customerExplanation: 'We identified multiple active credit obligations and recent borrowing activity. Your current plan focuses first on stabilising monthly cash flow and preventing further debt accumulation before reassessing your options.',
  customerReasons: [
    'We identified multiple active credit obligations and recent borrowing activity. Your current plan focuses first on stabilising monthly cash flow and preventing further debt accumulation before reassessing your options.',
    'What happens next: our team will review your case and follow up with the next step.',
    'What is not guaranteed: no plan or outcome is final until your information is complete and verified.',
  ],
  internalReasons: ['R009: A loan credit followed by large transfers/withdrawals and a subsequent low balance was observed.', 'R010: A cluster of new accounts was opened within 180 days.'],
  missingData: [],
  requiredDocuments: [],
  specialistReviewRequired: false,
  specialistReviewReason: null,
  manualReviewRequired: false,
  requiresManualOverride: false,
  confidence: 'HIGH',
  dataProvenance: [
    { field: 'credit.score', source: 'DEBT_ANALYSIS', asOf: null, verified: true, confidence: 'HIGH' },
    { field: 'financial.sustainableSurplus', source: 'CALCULATED', asOf: null, verified: true, confidence: 'HIGH' },
  ],
  consentVersion: 'v1',
  nextReviewEvent: { scheduledDaysFromNow: [30, 60, 90], eventTriggers: ['missed_payment', 'income_shock', 'new_borrowing', 'dpd_change'] },
  complianceHold: false,
  complianceReason: null,
  complianceMatchedEntity: null,
  complianceSlaHours: null,
  complianceEscalationAt: null,
  complianceAgingState: null,
  complianceClearedAt: null,
  complianceDeclinedAt: null,
  complianceAction: null,
  declinedAt: null,
  declineReason: null,
  caseAging: null,
  ruleResults: [
    { ruleId: 'R009', evaluated: true, matched: true, severity: 'HIGH', evidence: { borrowingToRepay: true }, evidenceLevel: 'DERIVED', reason: 'A loan credit followed by large transfers/withdrawals and a subsequent low balance was observed.', sourceFields: ['behaviour.borrowingToRepay'] },
    { ruleId: 'R010', evaluated: true, matched: true, severity: 'HIGH', evidence: { recentStackingClusterDetected: true }, evidenceLevel: 'DERIVED', reason: 'A cluster of new accounts was opened within 180 days.', sourceFields: ['debt.recentStackingClusterDetected'] },
    { ruleId: 'R014', evaluated: false, matched: false, severity: 'LOW', evidence: {}, evidenceLevel: 'UNKNOWN', reason: 'Stabilisation coverage requires an approved support amount from the BBS Plan Engine, which is not yet implemented.', sourceFields: [] },
    { ruleId: 'R017', evaluated: true, matched: false, severity: 'HIGH', evidence: { hold: false }, evidenceLevel: 'CONFIRMED', reason: 'No compliance hold is active.', sourceFields: ['compliance.hold'] },
  ],
}

class MockCohortEngineService implements CohortEngineService {
  async getForLead(bbsLeadId: string): Promise<CohortDecisionResponse> {
    if (bbsLeadId === 'BBS-LD-900001') return delay(mockReport, 300)
    return delay({ decisionAvailable: false, masterProfileReady: false }, 300)
  }

  async evaluate(): Promise<{ generated: boolean; reason?: string }> {
    return delay({ generated: false, reason: 'Mock mode has no live upstream modules to reconcile.' }, 300)
  }

  async recalculate(): Promise<{ generated: boolean; reason?: string }> {
    return this.evaluate()
  }

  async getHistory(): Promise<CohortDecisionHistoryEntry[]> {
    return delay([{ version: 1, status: 'COMPLETED', primaryCohort: 'C5', lifecycleState: 'CCR_REVIEW', pathway: 'STABILISE', generatedAt: mockReport.generatedAt, decidedAt: null }], 300)
  }

  async override(): Promise<{ overridden: boolean; overrideId: string; newVersion: number }> {
    return delay({ overridden: false, overrideId: '', newVersion: 1 }, 300)
  }

  async decline(): Promise<{ declined: boolean; newVersion: number }> {
    return delay({ declined: false, newVersion: 1 }, 300)
  }

  async getRefreshTriggers(): Promise<CohortRefreshTriggersResponse> {
    return delay({ triggers: REFRESH_TRIGGER_TAXONOMY, perLeadApplicability: false }, 300)
  }

  async clearCompliance(): Promise<CohortComplianceActionResult> {
    return delay({ resolved: false, action: 'CLEARED', newPrimaryCohort: 'MANUAL_REVIEW', newVersion: 1 }, 300)
  }

  async declineCompliance(): Promise<CohortComplianceActionResult> {
    return delay({ resolved: false, action: 'DECLINED', newPrimaryCohort: 'X2', newVersion: 1 }, 300)
  }
}

// --- Real backend implementation --------------------------------------------

class ApiCohortEngineService implements CohortEngineService {
  async getForLead(bbsLeadId: string): Promise<CohortDecisionResponse> {
    return apiRequest<CohortDecisionResponse>(`/leads/${bbsLeadId}/cohort`)
  }

  async evaluate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    return apiRequest<{ generated: boolean; reason?: string }>(`/leads/${bbsLeadId}/cohort/evaluate`, { method: 'POST' })
  }

  async recalculate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    return apiRequest<{ generated: boolean; reason?: string }>(`/leads/${bbsLeadId}/cohort/recalculate`, { method: 'POST' })
  }

  async getHistory(bbsLeadId: string): Promise<CohortDecisionHistoryEntry[]> {
    return apiRequest<CohortDecisionHistoryEntry[]>(`/leads/${bbsLeadId}/cohort/history`)
  }

  async override(bbsLeadId: string, newPrimaryCohort: CohortPrimaryState, reason: string, approverId?: string): Promise<{ overridden: boolean; overrideId: string; newVersion: number }> {
    return apiRequest<{ overridden: boolean; overrideId: string; newVersion: number }>(`/leads/${bbsLeadId}/cohort/override`, {
      method: 'POST',
      body: JSON.stringify({ newPrimaryCohort, reason, approverId }),
    })
  }

  async decline(bbsLeadId: string, reason: string | null): Promise<{ declined: boolean; newVersion: number }> {
    return apiRequest<{ declined: boolean; newVersion: number }>(`/leads/${bbsLeadId}/cohort/decline`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? undefined }),
    })
  }

  async getRefreshTriggers(bbsLeadId: string): Promise<CohortRefreshTriggersResponse> {
    return apiRequest<CohortRefreshTriggersResponse>(`/leads/${bbsLeadId}/cohort/refresh-triggers`)
  }

  async clearCompliance(bbsLeadId: string, reason: string): Promise<CohortComplianceActionResult> {
    return apiRequest<CohortComplianceActionResult>(`/leads/${bbsLeadId}/cohort/compliance/clear`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  async declineCompliance(bbsLeadId: string, reason: string): Promise<CohortComplianceActionResult> {
    return apiRequest<CohortComplianceActionResult>(`/leads/${bbsLeadId}/cohort/compliance/decline`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }
}

export const cohortEngineService: CohortEngineService = env.apiMode === 'api' ? new ApiCohortEngineService() : new MockCohortEngineService()
