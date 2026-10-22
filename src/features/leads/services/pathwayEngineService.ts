import { env } from '@/lib/env'
import { apiRequest } from '@/services/api/client'
import { delay } from '@/services/mock/delay'
import type { PathwayDecisionHistoryEntry, PathwayDecisionReport, PathwayDecisionResponse } from '../types'

export interface PathwayEngineService {
  getForLead(bbsLeadId: string): Promise<PathwayDecisionResponse>
  /** CCR-initiated evaluation (first run or explicit re-evaluation) — never triggered automatically. */
  evaluate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }>
  /** Alias of evaluate() — the spec's own two separate endpoints map to the same operation. */
  reassess(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }>
  getHistory(bbsLeadId: string): Promise<PathwayDecisionHistoryEntry[]>
}

// --- Mock implementation ----------------------------------------------------

const mockReport: PathwayDecisionReport = {
  decisionAvailable: true,
  status: 'COMPLETED',
  version: 1,
  ruleVersion: 'BBS_PATHWAY_V3.0',
  isStale: false,
  generatedAt: new Date().toISOString(),
  primaryPathway: 'STABILISE',
  pathwayVariant: 'STANDARD',
  pathwayStatus: 'READY',
  blockingReason: null,
  inheritedBlocks: [],
  l4Reference: { cohortDecisionId: 'cd-mock-1', primaryState: 'C5', primaryReasonCode: null, secondaryFlags: [] },
  alternatives: [
    { pathway: 'CONSOLIDATE', suitabilityScore: 0.5, metConditions: ['FCF reconciled'], blockingConditions: ['2+ eligible active obligations'], reasonNotPrimary: 'Fewer than 2 eligible obligations', switchTrigger: '2 or more eligible obligations exist' },
  ],
  sequencingHint: null,
  confidence: 'MEDIUM',
  confidenceMethod: 'MIN_OF_DIMENSIONS',
  dataQualityBand: 'MODERATE',
  dimensionConfidences: { incomeCashFlow: 'MEDIUM', alignmentCapacity: 'MEDIUM', l4Overall: 'HIGH' },
  capacityBand: 'STRESSED',
  capacityCap: 'STRESSED',
  resolutionCapacity: 'MARGINAL',
  archetype: 'DEBT_SPIRAL',
  archetypeConfidence: 'HIGH',
  customerReasons: [
    { tier: 'primary', text: 'First, stabilise your immediate financial position.' },
    { tier: 'detail', text: "You're currently under some financial pressure, and we need to understand what you can sustainably afford before recommending next steps." },
  ],
  internalReasons: ['Priority 11 matched in §7\'s own precedence table.', 'L4 cohort C5 -> STABILISE.'],
  unresolvedQuestions: [],
  riskFlags: ['OVERDUE_THRESHOLD_EXCEEDED'],
  requiredApprovals: [{ approver: 'CCR', status: 'PENDING' }],
  specialistReviewRequired: false,
  complianceHold: false,
  nextActions: ['CCR to confirm sustainable repayment capacity.', 'Document any temporary support arrangements.'],
  ttl: { pathwayTtlDays: 30, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), liveStatus: 'ACTIVE' },
  reviewSchedule: { scheduled: null, eventDriven: ['L4 re-evaluation (new cohort)', 'Material income change', 'New debt detected', 'Compliance hold added', 'Customer decline', 'Lender decline'] },
  changeSummary: null,
  dataProvenance: [
    { field: 'l4', source: 'COHORT_ENGINE', verified: true, confidence: 'HIGH' },
    { field: 'l3', source: 'MASTER_PROFILE', verified: true, confidence: 'HIGH' },
  ],
  ruleResults: [
    { ruleId: 'P001', evaluation: 'NOT_FIRED', severity: 'HIGH', evidence: { primaryCohort: 'C5' }, reason: 'L4 primary cohort C5 is a real terminal cohort — proceeding to pathway evaluation.', sourceFields: ['l4.primaryCohort'] },
    { ruleId: 'P019', evaluation: 'FIRED', severity: 'HIGH', evidence: { priority: 11 }, reason: 'Priority 11 matched — highest-priority row in §7\'s own 14-row precedence table.', sourceFields: [] },
  ],
}

class MockPathwayEngineService implements PathwayEngineService {
  async getForLead(bbsLeadId: string): Promise<PathwayDecisionResponse> {
    if (bbsLeadId === 'BBS-LD-900001') return delay(mockReport, 300)
    return delay({ decisionAvailable: false, cohortDecisionReady: false }, 300)
  }

  async evaluate(): Promise<{ generated: boolean; reason?: string }> {
    return delay({ generated: false, reason: 'Mock mode has no live upstream modules to reconcile.' }, 300)
  }

  async reassess(): Promise<{ generated: boolean; reason?: string }> {
    return this.evaluate()
  }

  async getHistory(): Promise<PathwayDecisionHistoryEntry[]> {
    return delay([{ version: 1, status: 'COMPLETED', primaryPathway: 'STABILISE', pathwayStatus: 'READY', confidence: 'MEDIUM', generatedAt: mockReport.generatedAt }], 300)
  }
}

// --- Real backend implementation --------------------------------------------

class ApiPathwayEngineService implements PathwayEngineService {
  async getForLead(bbsLeadId: string): Promise<PathwayDecisionResponse> {
    return apiRequest<PathwayDecisionResponse>(`/leads/${bbsLeadId}/pathway`)
  }

  async evaluate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    return apiRequest<{ generated: boolean; reason?: string }>(`/leads/${bbsLeadId}/pathway/evaluate`, { method: 'POST' })
  }

  async reassess(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    return apiRequest<{ generated: boolean; reason?: string }>(`/leads/${bbsLeadId}/pathway/reassess`, { method: 'POST' })
  }

  async getHistory(bbsLeadId: string): Promise<PathwayDecisionHistoryEntry[]> {
    return apiRequest<PathwayDecisionHistoryEntry[]>(`/leads/${bbsLeadId}/pathway/history`)
  }
}

export const pathwayEngineService: PathwayEngineService = env.apiMode === 'api' ? new ApiPathwayEngineService() : new MockPathwayEngineService()
