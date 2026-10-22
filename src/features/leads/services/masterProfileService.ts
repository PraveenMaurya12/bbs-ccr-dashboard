import { env } from '@/lib/env'
import { apiRequest } from '@/services/api/client'
import { delay } from '@/services/mock/delay'
import type { MasterProfileReport, MasterProfileResponse } from '../types'

export interface MasterProfileService {
  getForLead(bbsLeadId: string): Promise<MasterProfileResponse>
  /** CCR-initiated generation (first run or explicit regenerate) — never triggered automatically on tab open. */
  generate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }>
}

// --- Mock implementation ----------------------------------------------------

/** One realistic fictional profile, keyed by the seeded demo lead — mirrors financialAnalysisService.ts's own convention. */
const mockReport: MasterProfileReport = {
  profileAvailable: true,
  status: 'COMPLETED',
  version: 1,
  generatedAt: new Date().toISOString(),
  isStale: false,
  alignmentState: 'CREDIT_STRONG_FINANCIAL_STRESSED',
  resolutionCapacity: 'TIGHT',
  overallConfidence: 'HIGH',
  bureauDsrPercent: 18,
  bankDsrPercent: 16,
  masterDsrPercent: 16,
  identitySnapshot: {
    fields: [
      { field: 'fullName', canonicalValue: 'Demo Lead', sourceValues: [{ value: 'Demo Lead', source: 'LEAD_FORM' }], confidence: 'HIGH', conflict: false },
      { field: 'phone', canonicalValue: '+91 9000012345', sourceValues: [{ value: '+91 9000012345', source: 'LEAD_FORM' }], confidence: 'HIGH', conflict: false },
      { field: 'city', canonicalValue: 'Pune', sourceValues: [{ value: 'Mumbai', source: 'LEAD_FORM' }, { value: 'Pune', source: 'CCR_VERIFIED' }], confidence: 'MEDIUM', conflict: true },
    ],
    hasConflict: true,
    panAvailable: true,
    panRefConflict: false,
  },
  stressProfile: { level: 'Attention', drivers: ['Loan inflows are 18% of total inflow.'], confidence: 'MEDIUM' },
  strengths: [
    { key: 'NO_CURRENT_OVERDUE', label: 'No current overdue', detail: 'No credit account currently reports a positive DPD.', confidence: 'HIGH', sourceModules: ['DEBT_ANALYSIS'] },
    { key: 'REGULAR_EMI_PAYMENT', label: 'Regular EMI payment observed', detail: '1 bureau-reported obligation has a matching recurring bank repayment.', confidence: 'HIGH', sourceModules: ['DEBT_ANALYSIS', 'FINANCIAL_ANALYSIS'] },
  ],
  concerns: [
    { key: 'BORROWING_DEPENDENCY', label: 'Borrowing dependency', detail: 'Loan inflows are 18% of total inflow.', confidence: 'MEDIUM', sourceModules: ['FINANCIAL_ANALYSIS'] },
  ],
  opportunitySignals: [
    { key: 'CURRENT_REPAYMENT_CAPACITY', label: 'Current repayment capacity', detail: 'Matched obligations show the lead is actively servicing at least one reported debt.', confidence: 'MEDIUM', sourceModules: ['DEBT_ANALYSIS', 'FINANCIAL_ANALYSIS'] },
  ],
  possibleCauses: [
    { key: 'DEBT_CONSOLIDATION', label: 'Possible debt consolidation', detail: 'A significant share of inflow is loan proceeds, which may reflect refinancing or consolidation activity rather than income.', causeConfidence: 'POSSIBLE' },
  ],
  validationRequired: [
    { item: 'Whether all repayments use this bank account', why: 'This profile only has visibility into one bank statement — obligations serviced from another account would not appear here.' },
  ],
  cohortAttributes: {
    creditScoreBand: 'GOOD',
    currentDelinquency: false,
    historicalDelinquency: false,
    writeoffStatus: false,
    settlementStatus: false,
    totalDebtBand: 'LOW',
    unsecuredDebtRatio: 20,
    recentBorrowingLevel: 'NONE',
    normalizedIncomeBand: 'MODERATE',
    incomeStability: 'STABLE',
    freeCashflowBand: 'MODERATE',
    debtServiceBand: 'LOW',
    liquidityBand: 'LOW',
    borrowingDependency: 'MODERATE',
    lenderCount: 1,
    cardUtilisation: 'LOW',
    creditBankAlignment: 'CREDIT_STRONG_FINANCIAL_STRESSED',
    repaymentObserved: true,
    financialStressLevel: 'MODERATE',
    resolutionCapacity: 'TIGHT',
    dataConfidence: 'HIGH',
  },
  reconciliationRows: [
    { lender: 'HDFC', product: 'Personal Loan', reportedOutstanding: 65000, reportedEmi: 8000, observedPayment: 8000, observedFrequencyMonths: null, matchStatus: 'MATCHED', confidence: 0.95, explanation: 'HDFC: bureau-reported obligation matched to a recurring bank repayment (high confidence).' },
  ],
  l1DataAsOf: new Date('2026-10-07').toISOString(),
  l2DataAsOf: new Date('2026-03-31').toISOString(),
  dataQuality: { band: 'MODERATE', flags: ['FCF_UNRECONCILED', 'SINGLE_SNAPSHOT'] },
  complianceRouting: { complianceHold: false, reason: null, matchedEntity: null, since: null, slaHours: null, escalationHours: null },
  postStatementDebt: { detected: false, accountCount: 0, totalAmount: 0, repaymentUnverified: false, ccrPriority: null, accounts: [] },
  readinessGate: {
    conditions: [
      { code: 'R1', label: 'Both L1 and L2 present', passed: true, detail: 'Debt Analysis and Financial Analysis are both COMPLETED.' },
      { code: 'R3', label: 'DQ band >= LOW-MODERATE', passed: true, detail: 'Data Quality band is MODERATE.' },
      { code: 'R5', label: 'No COMPLIANCE_HOLD active', passed: true, detail: 'No compliance hold.' },
      { code: 'R6', label: 'No P1 Critical missing items', passed: true, detail: '0 P1 Critical item(s) outstanding.' },
    ],
    outcome: 'READY',
    blockingFactors: [],
  },
  dimensionConfidences: { IDENTITY_COMPLIANCE: 'MEDIUM', CREDIT_HEALTH: 'HIGH', INCOME_CASH_FLOW: 'MEDIUM', DEBT_LIQUIDITY: 'HIGH', ALIGNMENT_CAPACITY: 'MEDIUM' },
  familyNetworkVerification: { members: [], treatedAsEssentialPendingCcr: false },
  missingInformation: [{ itemText: 'Mock: whether all repayments use this bank account', sourceModule: 'L2', priority: 'P2', resolved: false }],
  insights: {
    status: 'COMPLETED',
    findings: {
      executiveProfile: 'Mock Master Profile synthesis — no real AI provider was called.',
      currentPosition: 'Mock: no current overdue, with one actively serviced obligation.',
      creditPosition: 'Mock: clean credit history with a moderate debt burden.',
      financialPosition: 'Mock: stable recurring income with a elevated loan-inflow share.',
      debtBurden: 'Mock: one reconciled EMI obligation.',
      repaymentCapacity: 'Mock: Bureau, Bank, and Master DSR are all within a comfortable range.',
      liquidityAssessment: 'Mock: no tight-liquidity events were observed.',
      stressAssessment: 'Mock: the combined Master Stress Profile is Attention, driven by borrowing dependency.',
      alignmentExplanation: 'Mock: classified CREDIT_STRONG_FINANCIAL_STRESSED because no current overdue was found alongside an elevated loan-inflow share.',
      strengths: [],
      concerns: [],
      opportunitySignals: [],
      possibleCauses: [],
      keyContradictions: [],
      validationRequired: [],
      resolutionReadinessNarrative: 'Mock: resolution readiness is MODERATE given clean credit and a manageable debt service ratio.',
      confidence: 'medium',
    },
    confidence: 0.5,
    modelVersion: 'mock',
    generatedAt: new Date().toISOString(),
  },
}

class MockMasterProfileService implements MasterProfileService {
  async getForLead(bbsLeadId: string): Promise<MasterProfileResponse> {
    if (bbsLeadId === 'BBS-LD-900001') {
      return delay(mockReport, 300)
    }
    return delay({ profileAvailable: false, debtAnalysisReady: false, financialAnalysisReady: false }, 300)
  }

  async generate(): Promise<{ generated: boolean; reason?: string }> {
    return delay({ generated: false, reason: 'Mock mode has no live upstream modules to reconcile.' }, 300)
  }
}

// --- Real backend implementation --------------------------------------------

class ApiMasterProfileService implements MasterProfileService {
  async getForLead(bbsLeadId: string): Promise<MasterProfileResponse> {
    return apiRequest<MasterProfileResponse>(`/leads/${bbsLeadId}/master-profile`)
  }

  async generate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    return apiRequest<{ generated: boolean; reason?: string }>(`/leads/${bbsLeadId}/master-profile/generate`, { method: 'POST' })
  }
}

export const masterProfileService: MasterProfileService =
  env.apiMode === 'api' ? new ApiMasterProfileService() : new MockMasterProfileService()
