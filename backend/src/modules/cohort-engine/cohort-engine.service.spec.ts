import { NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { CohortEngineService } from './cohort-engine.service'

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })
}

function cohortConfig() {
  return {
    overdueCapacityTriggerRupees: 100000,
    enquiryBurstThreshold30d: 4,
    stackingIndexPerYear: 15,
    activeOverdueRatioThreshold: 0.6,
    stressedCapacityRatioMax: 0.1,
    tightCapacityRatioMax: 0.2,
    stabilisationCoverageStrongMin: 1.25,
    stabilisationCoverageMinimum: 1.0,
    ruleVersion: 'BBS_COHORT_V3.0',
    postStatementMinorMaxPercent: 10,
    postStatementMaterialMaxPercent: 30,
    otherAccountsMinorMaxPercent: 5,
    otherAccountsFlagMaxPercent: 10,
    p1ForceBlockThreshold: 4,
    exceptionSpecialistThreshold: 5,
    exceptionManualReviewThreshold: 8,
    complianceSlaRelatedPartyHours: 72,
    complianceSlaRegulatoryHours: 24,
    complianceSlaLegalHours: 120,
    ttlConsentPendingDays: 30,
    ttlKycPendingDays: 30,
    ttlDataRefreshRequiredDays: 60,
    ttlOtherAccountsRequiredDays: 30,
    ttlP1InformationRequiredDays: 30,
    ttlManualReviewRequiredDays: 15,
    ttlSpecialistRequiredDays: 30,
  }
}

function completedMasterProfile(overrides: Record<string, unknown> = {}) {
  return {
    profileAvailable: true as const,
    status: 'COMPLETED' as const,
    version: 1,
    generatedAt: '2026-09-01T00:00:00.000Z',
    isStale: false,
    alignmentState: 'ALIGNED_HEALTHY',
    resolutionCapacity: 'STRONG',
    overallConfidence: 'HIGH',
    cohortAttributes: { liquidityBand: 'LOW', incomeStability: 'STABLE', recentBorrowingLevel: 'NONE', repaymentObserved: true, totalDebtBand: 'LOW' },
    readinessGate: { conditions: [], outcome: 'READY', blockingFactors: [] },
    complianceRouting: { complianceHold: false, reason: null, matchedEntity: null, since: null, slaHours: null, escalationHours: null },
    postStatementDebt: { detected: false, accountCount: 0, totalAmount: 0, repaymentUnverified: false, ccrPriority: null, accounts: [] },
    missingInformation: [],
    dataQuality: { band: 'HIGH', flags: [] },
    ...overrides,
  }
}

function completedDebtAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    reportAvailable: true as const,
    status: 'COMPLETED' as const,
    meta: { bureau: 'Experian', reportDate: '2026-09-01T00:00:00.000Z' },
    summary: { totalOutstanding: 50000, totalOverdue: 0, monthlyEmi: 8000, totalLenders: 1 },
    creditProfile: { creditScore: 750, scoreBand: 'good', activeAccounts: 1, recentEnquiries: 1 },
    debtBurden: { unsecuredPercent: 20, numbersOfLenders: 1, totalActiveDebt: 50000 },
    delinquency: { currentMaxDpd: 0, maxHistoricalDpd: 0 },
    settlement: { writtenOffCount: 0, settledCount: 0, suitFiledCount: 0, arcAssignedCount: 0, willfulDefault: false },
    creditHistory: { monthlyDelinquencyTrend: [] },
    enquiryDetail: { windows: [{ windowLabel: '30d', windowDays: 30, enquiryCount: 1 }] },
    borrowing: { clusterDetected: false, windows: [{ windowLabel: '12mo', windowDays: 365, newAccountCount: 1 }] },
    accountDistribution: { totalAccounts: 1, slices: [{ accountType: 'Personal Loan', count: 1, percent: 100 }] },
    ...overrides,
  }
}

function completedFinancialAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    reportAvailable: true as const,
    status: 'COMPLETED' as const,
    statement: { generatedAt: '2026-08-31T00:00:00.000Z' },
    months: [
      { normalizedIncome: { toNumber: () => 50000 }, essentialExpenses: { toNumber: () => 20000 }, mandatoryDebtPayments: { toNumber: () => 8000 } },
    ],
    riskFlags: [],
    ...overrides,
  }
}

describe('CohortEngineService', () => {
  let prisma: {
    lead: { findUnique: jest.Mock }
    customer: { findUnique: jest.Mock }
    consentRecord: { findMany: jest.Mock }
    cohortDecision: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock }
    cohortRuleResult: { createMany: jest.Mock }
    cohortOverride: { create: jest.Mock }
    cohortComplianceDecision: { create: jest.Mock }
    $transaction: jest.Mock
  }
  let debtAnalysisService: { getForLead: jest.Mock }
  let financialAnalysisService: { getForLead: jest.Mock }
  let masterProfileService: { getForLead: jest.Mock }
  let service: CohortEngineService

  beforeEach(() => {
    prisma = {
      lead: { findUnique: jest.fn() },
      customer: { findUnique: jest.fn() },
      consentRecord: { findMany: jest.fn() },
      cohortDecision: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      cohortRuleResult: { createMany: jest.fn() },
      cohortOverride: { create: jest.fn() },
      cohortComplianceDecision: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation((ops: Array<Promise<unknown>>) => Promise.all(ops)),
    }
    debtAnalysisService = { getForLead: jest.fn() }
    financialAnalysisService = { getForLead: jest.fn() }
    masterProfileService = { getForLead: jest.fn() }
    service = new CohortEngineService(prisma as never, { get: () => ({ cohortEngine: cohortConfig() }) } as never, debtAnalysisService as never, financialAnalysisService as never, masterProfileService as never)
  })

  describe('evaluate', () => {
    it('throws NotFoundException for an unknown lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(null)
      await expect(service.evaluate('BBS-LD-000000')).rejects.toThrow(NotFoundException)
    })

    it('CRITICAL: never persists a decision when Master Profile has not completed', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      masterProfileService.getForLead.mockResolvedValue({ profileAvailable: false })

      const result = await service.evaluate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(prisma.cohortDecision.create).not.toHaveBeenCalled()
    })

    it('refuses to evaluate against a stale Master Profile', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile({ isStale: true }))

      const result = await service.evaluate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(result.reason).toMatch(/stale/)
      expect(prisma.cohortDecision.create).not.toHaveBeenCalled()
    })

    it('generates a COMPLETED decision with 24 persisted rule results when the full upstream chain is ready', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', helpCategory: 'loan_settlement', situation: 'Job loss', panRef: 'hash123' })
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      debtAnalysisService.getForLead.mockResolvedValue(completedDebtAnalysis())
      financialAnalysisService.getForLead.mockResolvedValue(completedFinancialAnalysis())
      prisma.customer.findUnique.mockResolvedValue(null)
      prisma.consentRecord.findMany.mockResolvedValue([{ status: 'GRANTED', revokedAt: null, version: 'v1' }])
      prisma.cohortDecision.findFirst.mockResolvedValue(null)
      prisma.cohortDecision.create.mockResolvedValue({ id: 'cd-1', version: 1 })

      const result = await service.evaluate('BBS-LD-100001')

      expect(result.generated).toBe(true)
      expect(prisma.cohortDecision.create).toHaveBeenCalledWith({ data: { leadId: 'lead-1', version: 1, status: 'GENERATING', ruleVersion: 'BBS_COHORT_V3.0' } })
      const ruleResultsCall = prisma.cohortRuleResult.createMany.mock.calls[0][0]
      expect(ruleResultsCall.data).toHaveLength(24)
      const updateCall = prisma.cohortDecision.update.mock.calls[0][0]
      expect(updateCall.data.status).toBe('COMPLETED')
      expect(typeof updateCall.data.primaryCohort).toBe('string')
    })

    it('appends a new version rather than overwriting a prior decision', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', helpCategory: null, situation: null, panRef: null })
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      debtAnalysisService.getForLead.mockResolvedValue(completedDebtAnalysis())
      financialAnalysisService.getForLead.mockResolvedValue(completedFinancialAnalysis())
      prisma.customer.findUnique.mockResolvedValue(null)
      prisma.consentRecord.findMany.mockResolvedValue([])
      prisma.cohortDecision.findFirst.mockResolvedValue({ version: 2 })
      prisma.cohortDecision.create.mockResolvedValue({ id: 'cd-3', version: 3 })

      await service.evaluate('BBS-LD-100001')

      expect(prisma.cohortDecision.create).toHaveBeenCalledWith({ data: { leadId: 'lead-1', version: 3, status: 'GENERATING', ruleVersion: 'BBS_COHORT_V3.0' } })
    })

    it('marks the decision FAILED (never silently swallowed) when persistence throws', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', helpCategory: null, situation: null, panRef: null })
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      debtAnalysisService.getForLead.mockResolvedValue(completedDebtAnalysis())
      financialAnalysisService.getForLead.mockResolvedValue(completedFinancialAnalysis())
      prisma.customer.findUnique.mockResolvedValue(null)
      prisma.consentRecord.findMany.mockResolvedValue([])
      prisma.cohortDecision.findFirst.mockResolvedValue(null)
      prisma.cohortDecision.create.mockResolvedValue({ id: 'cd-1', version: 1 })
      prisma.$transaction.mockRejectedValue(new Error('db exploded'))

      const result = await service.evaluate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(prisma.cohortDecision.update).toHaveBeenCalledWith({ where: { id: 'cd-1' }, data: { status: 'FAILED', errorMessage: 'db exploded' } })
    })

    it('CRITICAL: a concurrent evaluate() race (same version create()d twice) returns a clean reason, never an unhandled 500', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', helpCategory: null, situation: null, panRef: null })
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      debtAnalysisService.getForLead.mockResolvedValue(completedDebtAnalysis())
      financialAnalysisService.getForLead.mockResolvedValue(completedFinancialAnalysis())
      prisma.customer.findUnique.mockResolvedValue(null)
      prisma.consentRecord.findMany.mockResolvedValue([])
      prisma.cohortDecision.findFirst.mockResolvedValue(null)
      prisma.cohortDecision.create.mockRejectedValue(uniqueViolation())

      const result = await service.evaluate('BBS-LD-100001')

      expect(result).toEqual({ generated: false, reason: 'A cohort evaluation is already in progress for this lead — refresh and retry.' })
    })
  })

  describe('getForLead', () => {
    it('reports decisionAvailable:false with masterProfileReady when no decision exists yet', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue(null)
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toEqual({ decisionAvailable: false, masterProfileReady: true })
    })

    it('CRITICAL: reports isStale:true when Master Profile has moved to a newer version since this decision', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue({ status: 'COMPLETED', version: 1, sourceMasterProfileVersion: 1, ruleResults: [], complianceActionsTo: [] })
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile({ version: 2 }))

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toMatchObject({ isStale: true })
    })

    it('reports isStale:false when Master Profile version matches the stored source version', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue({ status: 'COMPLETED', version: 1, sourceMasterProfileVersion: 1, ruleResults: [], complianceActionsTo: [] })
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile({ version: 1 }))

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toMatchObject({ isStale: false })
    })
  })

  describe('getRefreshTriggers (v3.0 §15.1 taxonomy)', () => {
    it('throws NotFoundException for an unknown lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(null)
      await expect(service.getRefreshTriggers('BBS-LD-999999')).rejects.toThrow(NotFoundException)
    })

    it('returns the static 6-trigger catalog with perLeadApplicability:false when no decision exists yet', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue(null)

      const result = await service.getRefreshTriggers('BBS-LD-100001')

      expect(result.perLeadApplicability).toBe(false)
      expect(result.triggers).toHaveLength(6)
    })

    it('enriches with real per-lead applicability when a COMPLETED decision exists — MATERIAL_EVENT applicable when Master Profile has moved on', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue({ status: 'COMPLETED', sourceMasterProfileVersion: 1, complianceHold: false, complianceClearedAt: null, complianceDeclinedAt: null })
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile({ version: 2 }))

      const result = await service.getRefreshTriggers('BBS-LD-100001')

      expect(result.perLeadApplicability).toBe(true)
      const materialEvent = (result.triggers as Array<{ id: string; currentlyApplicable: boolean }>).find((t) => t.id === 'MATERIAL_EVENT')
      expect(materialEvent?.currentlyApplicable).toBe(true)
    })

    it('COMPLIANCE_CLEARED is applicable when the latest decision has an active, unresolved compliance hold', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue({ status: 'COMPLETED', sourceMasterProfileVersion: 1, complianceHold: true, complianceClearedAt: null, complianceDeclinedAt: null })
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile({ version: 1 }))

      const result = await service.getRefreshTriggers('BBS-LD-100001')

      const complianceCleared = (result.triggers as Array<{ id: string; currentlyApplicable: boolean }>).find((t) => t.id === 'COMPLIANCE_CLEARED')
      expect(complianceCleared?.currentlyApplicable).toBe(true)
    })

    it('returns the static catalog unenriched when the latest decision is still GENERATING/FAILED (not COMPLETED)', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue({ status: 'GENERATING' })

      const result = await service.getRefreshTriggers('BBS-LD-100001')

      expect(result.perLeadApplicability).toBe(false)
      expect(masterProfileService.getForLead).not.toHaveBeenCalled()
    })
  })

  describe('override', () => {
    it('CRITICAL: never mutates the previous decision\'s primaryCohort — only requiresManualOverride/decidedBy are updated on it', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1, primaryCohort: 'C3', ruleVersion: 'BBS_COHORT_V1.0', secondaryFlags: null, archetype: null, pathway: null, capacityBand: null, capacityRatio: null, sustainableCashFlow: null, debtComplexityBand: null, customerExplanation: 'x', missingData: null, requiredDocuments: null, specialistReviewRequired: false, confidence: null, dataProvenance: null, consentVersion: null })
      prisma.cohortDecision.create.mockResolvedValue({ id: 'cd-2', version: 2 })
      prisma.cohortOverride.create.mockResolvedValue({ id: 'ov-1' })

      const result = await service.override('BBS-LD-100001', { newPrimaryCohort: 'C6', reason: 'Legal dispute discovered during CCR call.', approverId: 'approver-1' }, { userId: 'user-1', role: 'SUPERVISOR' as never })

      expect(result.overridden).toBe(true)
      const previousUpdateCall = prisma.cohortDecision.update.mock.calls[0][0]
      expect(previousUpdateCall.data).not.toHaveProperty('primaryCohort')
      expect(previousUpdateCall.data.requiresManualOverride).toBe(true)
      const newDecisionCreateCall = prisma.cohortDecision.create.mock.calls[0][0]
      expect(newDecisionCreateCall.data.primaryCohort).toBe('C6')
      expect(newDecisionCreateCall.data.version).toBe(2)
      expect(prisma.cohortOverride.create).toHaveBeenCalledWith({ data: expect.objectContaining({ previousDecisionId: 'cd-1', newDecisionId: 'cd-2', oldPrimaryCohort: 'C3', newPrimaryCohort: 'C6' }) })
    })

    it('§19.2 CRITICAL: rejects an override landing on C1/C4/C6 with no approverId (maker-checker)', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1, primaryCohort: 'C3', ruleVersion: 'BBS_COHORT_V3.0', secondaryFlags: null, archetype: null, pathway: null, capacityBand: null, capacityRatio: null, sustainableCashFlow: null, debtComplexityBand: null, customerExplanation: 'x', missingData: null, requiredDocuments: null, specialistReviewRequired: false, confidence: null, dataProvenance: null, consentVersion: null })

      await expect(service.override('BBS-LD-100001', { newPrimaryCohort: 'C4', reason: 'x'.repeat(10) }, { userId: 'user-1', role: 'SUPERVISOR' as never })).rejects.toThrow(/second approver/)
    })

    it('§19.2 CRITICAL: rejects an override landing on C1/C4/C6 when the approver is the same person as the actor', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1, primaryCohort: 'C3', ruleVersion: 'BBS_COHORT_V3.0', secondaryFlags: null, archetype: null, pathway: null, capacityBand: null, capacityRatio: null, sustainableCashFlow: null, debtComplexityBand: null, customerExplanation: 'x', missingData: null, requiredDocuments: null, specialistReviewRequired: false, confidence: null, dataProvenance: null, consentVersion: null })

      await expect(service.override('BBS-LD-100001', { newPrimaryCohort: 'C1', reason: 'x'.repeat(10), approverId: 'user-1' }, { userId: 'user-1', role: 'SUPERVISOR' as never })).rejects.toThrow(/distinct from the acting user/)
    })

    it('does NOT require an approver when overriding to a cohort outside the maker-checker list (e.g. C2/C3/C5/C7)', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1, primaryCohort: 'C3', ruleVersion: 'BBS_COHORT_V3.0', secondaryFlags: null, archetype: null, pathway: null, capacityBand: null, capacityRatio: null, sustainableCashFlow: null, debtComplexityBand: null, customerExplanation: 'x', missingData: null, requiredDocuments: null, specialistReviewRequired: false, confidence: null, dataProvenance: null, consentVersion: null })
      prisma.cohortDecision.create.mockResolvedValue({ id: 'cd-2', version: 2 })
      prisma.cohortOverride.create.mockResolvedValue({ id: 'ov-1' })

      const result = await service.override('BBS-LD-100001', { newPrimaryCohort: 'C2', reason: 'x'.repeat(10) }, { userId: 'user-1', role: 'SUPERVISOR' as never })
      expect(result.overridden).toBe(true)
    })

    it('CRITICAL: the new decision\'s pathway/customerExplanation reflect the NEW cohort, never the overridden one\'s stale text', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1, primaryCohort: 'C4', ruleVersion: 'BBS_COHORT_V1.0', secondaryFlags: null, archetype: null, pathway: 'RESOLVE', capacityBand: null, capacityRatio: null, sustainableCashFlow: null, debtComplexityBand: null, customerExplanation: 'This is C4 text about resolution.', missingData: null, requiredDocuments: null, specialistReviewRequired: false, confidence: null, dataProvenance: null, consentVersion: null })
      prisma.cohortDecision.create.mockResolvedValue({ id: 'cd-2', version: 2 })
      prisma.cohortOverride.create.mockResolvedValue({ id: 'ov-1' })

      await service.override('BBS-LD-100001', { newPrimaryCohort: 'C2', reason: 'Lead actually qualifies for consolidation, not resolution.' }, { userId: 'user-1', role: 'SUPERVISOR' as never })

      const newDecisionCreateCall = prisma.cohortDecision.create.mock.calls[0][0]
      expect(newDecisionCreateCall.data.pathway).toBe('CONSOLIDATE')
      expect(newDecisionCreateCall.data.customerExplanation).not.toBe('This is C4 text about resolution.')
    })

    it('throws NotFoundException when no prior decision exists to override', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue(null)
      await expect(service.override('BBS-LD-100001', { newPrimaryCohort: 'C6', reason: 'x'.repeat(10) }, { userId: 'user-1', role: 'SUPERVISOR' as never })).rejects.toThrow(NotFoundException)
    })
  })

  describe('clearCompliance / declineCompliance (v3.0 §7.4 compliance feedback loop)', () => {
    function heldDecision(overrides: Record<string, unknown> = {}) {
      return {
        id: 'cd-1',
        version: 1,
        ruleVersion: 'BBS_COHORT_V3.0',
        primaryCohort: 'COMPLIANCE_HOLD',
        complianceHold: true,
        complianceClearedAt: null,
        complianceDeclinedAt: null,
        complianceReason: 'RELATED_PARTY_EMPLOYER',
        complianceMatchedEntity: 'GLLFL',
        complianceSlaHours: 72,
        secondaryFlags: [
          { key: 'C5', label: 'Debt-cycle intervention', reason: '...' },
          { key: 'C3', label: 'Restructure candidate', reason: '...' },
          { key: 'ESCALATING_DPD', label: 'ESCALATING DPD', reason: '...' },
        ],
        archetype: null,
        pathway: null,
        capacityBand: 'STRESSED',
        capacityRatio: 0.05,
        sustainableCashFlow: null,
        debtComplexityBand: 'MODERATE',
        customerExplanation: 'x',
        internalReasons: null,
        missingData: null,
        requiredDocuments: null,
        specialistReviewRequired: false,
        specialistReviewReason: null,
        confidence: 'MEDIUM',
        dataProvenance: null,
        consentVersion: null,
        ...overrides,
      }
    }

    it('CRITICAL: clearCompliance() promotes the highest-priority REAL cohort candidate from secondaryFlags, never re-running the 24-rule evaluation', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue(heldDecision())
      prisma.cohortDecision.create.mockResolvedValue({ id: 'cd-2', version: 2 })
      prisma.cohortComplianceDecision.create.mockResolvedValue({ id: 'cc-1' })

      const result = await service.clearCompliance('BBS-LD-100001', 'Compliance confirmed no related-party match on further review.', { userId: 'compliance-1' })

      expect(result).toEqual({ resolved: true, action: 'CLEARED', newPrimaryCohort: 'C5', newVersion: 2 })
      const newDecisionCreateCall = prisma.cohortDecision.create.mock.calls[0][0]
      expect(newDecisionCreateCall.data.primaryCohort).toBe('C5')
      expect(newDecisionCreateCall.data.complianceHold).toBe(false)
      expect(newDecisionCreateCall.data.complianceAgingState).toBe('COMPLIANCE_CLEARED')
      expect(newDecisionCreateCall.data.lifecycleState).toBe('CCR_REVIEW')
      // The promoted candidate (C5) is removed from the new decision's own
      // secondaryFlags — it is now the primary, not also a secondary.
      expect((newDecisionCreateCall.data.secondaryFlags as Array<{ key: string }>).some((f) => f.key === 'C5')).toBe(false)
      expect((newDecisionCreateCall.data.secondaryFlags as Array<{ key: string }>).some((f) => f.key === 'C3')).toBe(true)

      const previousUpdateCall = prisma.cohortDecision.update.mock.calls[0][0]
      expect(previousUpdateCall.data.complianceClearedAt).toBeInstanceOf(Date)

      expect(prisma.cohortComplianceDecision.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ previousDecisionId: 'cd-1', newDecisionId: 'cd-2', action: 'CLEARED', oldPrimaryCohort: 'COMPLIANCE_HOLD', newPrimaryCohort: 'C5', actorId: 'compliance-1' }),
      })
    })

    it('falls back to MANUAL_REVIEW when no real cohort candidate remains in secondaryFlags — never an arbitrary default', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue(heldDecision({ secondaryFlags: [{ key: 'ESCALATING_DPD', label: 'ESCALATING DPD', reason: '...' }] }))
      prisma.cohortDecision.create.mockResolvedValue({ id: 'cd-2', version: 2 })
      prisma.cohortComplianceDecision.create.mockResolvedValue({ id: 'cc-1' })

      const result = await service.clearCompliance('BBS-LD-100001', 'Cleared by compliance, no other cohort signal present.', { userId: 'compliance-1' })

      expect(result.newPrimaryCohort).toBe('MANUAL_REVIEW')
      const newDecisionCreateCall = prisma.cohortDecision.create.mock.calls[0][0]
      expect(newDecisionCreateCall.data.manualReviewRequired).toBe(true)
    })

    it('CRITICAL: declineCompliance() always routes to X2, per the spec\'s own explicit instruction, regardless of what else was in secondaryFlags', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue(heldDecision())
      prisma.cohortDecision.create.mockResolvedValue({ id: 'cd-2', version: 2 })
      prisma.cohortComplianceDecision.create.mockResolvedValue({ id: 'cc-1' })

      const result = await service.declineCompliance('BBS-LD-100001', 'Compliance confirmed the related-party match and declined to proceed.', { userId: 'compliance-1' })

      expect(result).toEqual({ resolved: true, action: 'DECLINED', newPrimaryCohort: 'X2', newVersion: 2 })
      const newDecisionCreateCall = prisma.cohortDecision.create.mock.calls[0][0]
      expect(newDecisionCreateCall.data.primaryCohort).toBe('X2')
      expect(newDecisionCreateCall.data.complianceAgingState).toBe('COMPLIANCE_DECLINED')
      const previousUpdateCall = prisma.cohortDecision.update.mock.calls[0][0]
      expect(previousUpdateCall.data.complianceDeclinedAt).toBeInstanceOf(Date)
      expect(prisma.cohortComplianceDecision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'DECLINED', newPrimaryCohort: 'X2' }) })
    })

    it('rejects clearCompliance() when no compliance hold is active on the latest decision', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue(heldDecision({ complianceHold: false }))
      await expect(service.clearCompliance('BBS-LD-100001', 'x'.repeat(10), { userId: 'compliance-1' })).rejects.toThrow(/No compliance hold is active/)
    })

    it('rejects declineCompliance() when the hold was already cleared — a compliance action can only be taken once', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue(heldDecision({ complianceClearedAt: new Date('2026-10-01') }))
      await expect(service.declineCompliance('BBS-LD-100001', 'x'.repeat(10), { userId: 'compliance-1' })).rejects.toThrow(/already been resolved/)
    })

    it('throws NotFoundException when no prior decision exists at all', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.cohortDecision.findFirst.mockResolvedValue(null)
      await expect(service.clearCompliance('BBS-LD-100001', 'x'.repeat(10), { userId: 'compliance-1' })).rejects.toThrow(NotFoundException)
    })
  })
})
