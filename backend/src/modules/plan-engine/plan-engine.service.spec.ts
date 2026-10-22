import { NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { PlanEngineService } from './plan-engine.service'

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })
}

function planEngineConfig() {
  return {
    reviewCadenceDays: [30, 60, 90],
    templateRegistryVersion: 'BBS_PLAN_V3.0',
    ruleVersion: 'BBS_PLAN_V3.0',
    ttlDaysByPathway: { OPTIMISE: 90, STABILISE: 30, CONSOLIDATE: 45, RESTRUCTURE: 45, RESOLVE: 60, RECOVER: 180 },
    placeholderTtlDays: 30,
  }
}

function completedCohortDecision(overrides: Record<string, unknown> = {}) {
  return {
    decisionAvailable: true as const,
    status: 'COMPLETED' as const,
    version: 1,
    isStale: false,
    generatedAt: '2026-09-01T00:00:00.000Z',
    primaryCohort: 'C1',
    pathway: 'STABILISE',
    planEligibility: 'DRAFT',
    archetype: 'UNCLASSIFIED',
    specialistReviewRequired: false,
    manualReviewRequired: false,
    confidence: 'HIGH',
    capacityBand: 'COMFORTABLE',
    capacityRatio: 0.3,
    sustainableCashFlow: 15000,
    stabilisationCoverage: 1.3,
    debtComplexityBand: 'LOW',
    secondaryFlags: [],
    missingData: [],
    customerExplanation: 'You are on a stabilisation track.',
    ...overrides,
  }
}

function completedPathwayDecision(overrides: Record<string, unknown> = {}) {
  return {
    decisionAvailable: true as const,
    status: 'COMPLETED' as const,
    version: 1,
    isStale: false,
    generatedAt: '2026-09-01T00:00:00.000Z',
    primaryPathway: 'STABILISE',
    pathwayVariant: 'STANDARD',
    pathwayStatus: 'READY',
    blockingReason: null,
    riskFlags: [],
    ttl: { liveStatus: 'ACTIVE' },
    ...overrides,
  }
}

function completedMasterProfile(overrides: Record<string, unknown> = {}) {
  return {
    profileAvailable: true as const,
    status: 'COMPLETED' as const,
    version: 1,
    isStale: false,
    alignmentState: 'ALIGNED_HEALTHY',
    resolutionCapacity: 'STRONG',
    overallConfidence: 'HIGH',
    bureauDsrPercent: 20,
    bankDsrPercent: 18,
    masterDsrPercent: 19,
    ...overrides,
  }
}

describe('PlanEngineService', () => {
  let prisma: {
    lead: { findUnique: jest.Mock }
    cohortDecision: { findFirst: jest.Mock }
    pathwayDecision: { findFirst: jest.Mock }
    bbsPlan: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock }
    bbsPlanAction: { createMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock }
    bbsPlanCondition: { createMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock }
    bbsPlanOverride: { create: jest.Mock }
    analysisJob: { findFirst: jest.Mock }
    $transaction: jest.Mock
  }
  let cohortEngineService: { getForLead: jest.Mock }
  let masterProfileService: { getForLead: jest.Mock }
  let pathwayEngineService: { getForLead: jest.Mock }
  let analysisService: { createAndRun: jest.Mock }
  let service: PlanEngineService

  beforeEach(() => {
    prisma = {
      lead: { findUnique: jest.fn() },
      cohortDecision: { findFirst: jest.fn() },
      pathwayDecision: { findFirst: jest.fn() },
      bbsPlan: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      bbsPlanAction: { createMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      bbsPlanCondition: { createMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      bbsPlanOverride: { create: jest.fn() },
      analysisJob: { findFirst: jest.fn() },
      $transaction: jest.fn().mockImplementation((arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]))),
    }
    cohortEngineService = { getForLead: jest.fn() }
    masterProfileService = { getForLead: jest.fn() }
    pathwayEngineService = { getForLead: jest.fn().mockResolvedValue(completedPathwayDecision()) }
    analysisService = { createAndRun: jest.fn().mockResolvedValue(undefined) }
    service = new PlanEngineService(prisma as never, { get: () => ({ planEngine: planEngineConfig() }) } as never, cohortEngineService as never, masterProfileService as never, pathwayEngineService as never, analysisService as never)
  })

  describe('generate', () => {
    it('throws NotFoundException for an unknown lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(null)
      await expect(service.generate('BBS-LD-000000')).rejects.toThrow(NotFoundException)
    })

    it('CRITICAL: never persists a plan when no Cohort Decision exists yet', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', fullName: 'Test Customer' })
      cohortEngineService.getForLead.mockResolvedValue({ decisionAvailable: false, masterProfileReady: false })

      const result = await service.generate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(prisma.bbsPlan.create).not.toHaveBeenCalled()
    })

    it('refuses to generate against a stale Cohort Decision', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', fullName: 'Test Customer' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision({ isStale: true }))

      const result = await service.generate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(result.reason).toMatch(/stale/)
      expect(prisma.bbsPlan.create).not.toHaveBeenCalled()
    })

    it('CRITICAL: never persists a plan when no Pathway Decision exists yet (BBS Pathway Engine v3.0, L5)', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', fullName: 'Test Customer' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())
      pathwayEngineService.getForLead.mockResolvedValue({ decisionAvailable: false, cohortDecisionReady: true })

      const result = await service.generate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(result.reason).toMatch(/Pathway/)
      expect(prisma.bbsPlan.create).not.toHaveBeenCalled()
    })

    it('refuses to generate against a stale Pathway Decision', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', fullName: 'Test Customer' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())
      pathwayEngineService.getForLead.mockResolvedValue(completedPathwayDecision({ isStale: true }))

      const result = await service.generate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(result.reason).toMatch(/stale/)
      expect(prisma.bbsPlan.create).not.toHaveBeenCalled()
    })

    it('CRITICAL: uses the Pathway Decision\'s own primaryPathway as the authoritative pathway, never Cohort Decision\'s own simpler static map', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', fullName: 'Test Customer' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision({ pathway: 'STABILISE' }))
      pathwayEngineService.getForLead.mockResolvedValue(completedPathwayDecision({ primaryPathway: 'OPTIMISE' }))
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1 })
      prisma.pathwayDecision.findFirst.mockResolvedValue({ id: 'pd-1', version: 1 })
      prisma.bbsPlan.findFirst.mockResolvedValue(null)
      prisma.bbsPlan.create.mockResolvedValue({ id: 'plan-1', version: 1 })

      await service.generate('BBS-LD-100001')

      const updateCall = prisma.bbsPlan.update.mock.calls[0][0]
      expect(updateCall.data.pathway).toBe('OPTIMISE')
      expect(updateCall.data.sourcePathwayDecisionId).toBe('pd-1')
      expect(updateCall.data.sourcePathwayDecisionVersion).toBe(1)
    })

    it('generates a COMPLETED plan with actions/conditions persisted and fires the AI narrative job', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', fullName: 'Test Customer' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1 })
      prisma.bbsPlan.findFirst.mockResolvedValue(null)
      prisma.bbsPlan.create.mockResolvedValue({ id: 'plan-1', version: 1 })

      const result = await service.generate('BBS-LD-100001')

      expect(result.generated).toBe(true)
      expect(prisma.bbsPlan.create).toHaveBeenCalledWith({ data: { leadId: 'lead-1', version: 1, generationStatus: 'GENERATING', templateId: '', templateVersion: 'BBS_PLAN_V3.0' } })
      const actionsCall = prisma.bbsPlanAction.createMany.mock.calls[0][0]
      expect(actionsCall.data.length).toBeGreaterThan(0)
      const updateCall = prisma.bbsPlan.update.mock.calls[0][0]
      expect(updateCall.data.generationStatus).toBe('COMPLETED')
      // v3.0 §8.1: template now routes on the authoritative pathway (STABILISE/STANDARD), not the old cohort-keyed C1_STABILISATION fallback.
      expect(updateCall.data.templateId).toBe('TPL_STABILISE_STD_v1')
      expect(analysisService.createAndRun).toHaveBeenCalledWith(expect.objectContaining({ bbsLeadId: 'BBS-LD-100001', jobType: 'RECOVERY_PLAN_GENERATION' }))
    })

    it('CRITICAL: generates a real (thinner) plan for X1 rather than refusing — generation never refuses based on which cohort was decided', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', fullName: 'Test Customer' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision({ primaryCohort: 'X1', pathway: null, planEligibility: 'INSUFFICIENT_DATA', missingData: [{ field: 'verifiedIncome', why: 'Not reported', document: 'Salary slip', owner: 'Customer', nextAction: 'Request salary slip' }] }))
      // A real X1 cohort would never accompany a READY Pathway Decision (Pathway Engine's own P001 gate blocks X1 before a primary pathway is ever assigned) — reflect that honestly here.
      pathwayEngineService.getForLead.mockResolvedValue(completedPathwayDecision({ primaryPathway: null, pathwayStatus: 'INSUFFICIENT_DATA', blockingReason: 'INSUFFICIENT_DATA' }))
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1 })
      prisma.bbsPlan.findFirst.mockResolvedValue(null)
      prisma.bbsPlan.create.mockResolvedValue({ id: 'plan-1', version: 1 })

      const result = await service.generate('BBS-LD-100001')

      expect(result.generated).toBe(true)
      const updateCall = prisma.bbsPlan.update.mock.calls[0][0]
      expect(updateCall.data.templateId).toBe('X1_DATA_COMPLETION')
      expect(updateCall.data.lifecycleStatus).toBe('CCR_REVIEW')
    })

    it('appends a new version rather than overwriting a prior plan', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', fullName: 'Test Customer' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1 })
      prisma.bbsPlan.findFirst.mockResolvedValue({ version: 2 })
      prisma.bbsPlan.create.mockResolvedValue({ id: 'plan-3', version: 3 })

      await service.generate('BBS-LD-100001')

      expect(prisma.bbsPlan.create).toHaveBeenCalledWith({ data: { leadId: 'lead-1', version: 3, generationStatus: 'GENERATING', templateId: '', templateVersion: 'BBS_PLAN_V3.0' } })
    })

    it('marks the plan FAILED (never silently swallowed) when persistence throws', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', fullName: 'Test Customer' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1 })
      prisma.bbsPlan.findFirst.mockResolvedValue(null)
      prisma.bbsPlan.create.mockResolvedValue({ id: 'plan-1', version: 1 })
      prisma.$transaction.mockRejectedValueOnce(new Error('db exploded'))

      const result = await service.generate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(prisma.bbsPlan.update).toHaveBeenCalledWith({ where: { id: 'plan-1' }, data: { generationStatus: 'FAILED', errorMessage: 'db exploded' } })
    })

    it('CRITICAL: a concurrent generate() race (same version create()d twice) returns a clean reason, never an unhandled 500', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', fullName: 'Test Customer' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1 })
      prisma.bbsPlan.findFirst.mockResolvedValue(null)
      prisma.bbsPlan.create.mockRejectedValue(uniqueViolation())

      const result = await service.generate('BBS-LD-100001')

      expect(result).toEqual({ generated: false, reason: 'A plan generation is already in progress for this lead — refresh and retry.' })
    })
  })

  describe('getForLead', () => {
    it('reports planAvailable:false with cohortDecisionReady when no plan exists yet', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue(null)
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toEqual({ planAvailable: false, cohortDecisionReady: true })
    })

    it('CRITICAL: reports isStale:true when the Cohort Decision has moved to a newer version since this plan', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ generationStatus: 'COMPLETED', version: 1, sourceCohortDecisionVersion: 1, actions: [], conditions: [] })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision({ version: 2 }))
      prisma.analysisJob.findFirst.mockResolvedValue(null)

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toMatchObject({ isStale: true })
    })
  })

  describe('lifecycle transitions', () => {
    it('submitReview moves DRAFT -> CCR_REVIEW when no specialist review is required', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ id: 'plan-1', generationStatus: 'COMPLETED', lifecycleStatus: 'DRAFT', specialistReviewRequired: false })

      const result = await service.submitReview('BBS-LD-100001')

      expect(result).toEqual({ updated: true, lifecycleStatus: 'CCR_REVIEW' })
    })

    it('submitReview moves DRAFT -> SPECIALIST_REVIEW when specialist review is required', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ id: 'plan-1', generationStatus: 'COMPLETED', lifecycleStatus: 'DRAFT', specialistReviewRequired: true })

      const result = await service.submitReview('BBS-LD-100001')

      expect(result).toEqual({ updated: true, lifecycleStatus: 'SPECIALIST_REVIEW' })
    })

    it('submitReview moves SPECIALIST_REVIEW -> CCR_REVIEW once a specialist has cleared it', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ id: 'plan-1', generationStatus: 'COMPLETED', lifecycleStatus: 'SPECIALIST_REVIEW', specialistReviewRequired: true })

      const result = await service.submitReview('BBS-LD-100001')

      expect(result).toEqual({ updated: true, lifecycleStatus: 'CCR_REVIEW' })
    })

    it('accept refuses when the plan is not CCR_REVIEW', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ id: 'plan-1', generationStatus: 'COMPLETED', lifecycleStatus: 'DRAFT' })

      const result = await service.accept('BBS-LD-100001')

      expect(result.updated).toBe(false)
    })

    it('accept moves CCR_REVIEW -> EXECUTION_READY', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ id: 'plan-1', generationStatus: 'COMPLETED', lifecycleStatus: 'CCR_REVIEW' })

      const result = await service.accept('BBS-LD-100001')

      expect(result).toEqual({ updated: true, lifecycleStatus: 'EXECUTION_READY' })
    })

    it('activate moves EXECUTION_READY -> ACTIVE', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ id: 'plan-1', generationStatus: 'COMPLETED', lifecycleStatus: 'EXECUTION_READY' })

      const result = await service.activate('BBS-LD-100001')

      expect(result).toEqual({ updated: true, lifecycleStatus: 'ACTIVE' })
    })
  })

  describe('override', () => {
    it('CRITICAL: never mutates the previous plan — creates a new version and copies actions/conditions forward', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        version: 1,
        lifecycleStatus: 'DRAFT',
        templateId: 'C1_STABILISATION',
        templateVersion: 'BBS_PLAN_V3.0',
        sourceCohortDecisionId: 'cd-1',
        sourceCohortDecisionVersion: 1,
        sourceCohortDecisionGeneratedAt: null,
        sourceMasterProfileVersion: 1,
        cohort: 'C1',
        pathway: 'STABILISE',
        situationAssessment: {},
        problemDefinition: {},
        financialCapacity: {},
        debtStrategy: {},
        financialTargets: {},
        debtTargets: {},
        risks: [],
        disclosures: [],
        successCriteria: [],
        monitoringTriggers: {},
        reviewSchedule: {},
        dataProvenance: [],
        missingData: null,
        customerExplanation: 'x',
        specialistReviewRequired: false,
        actions: [{ actionId: 'a1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'd', owner: 'CCR', timing: 't', dependency: null, evidenceRequired: null, status: 'PENDING' }],
        conditions: [{ conditionId: 'c1', description: 'd', state: 'UNKNOWN', source: 's', verificationStatus: 'UNVERIFIED' }],
      })
      prisma.bbsPlan.create.mockResolvedValue({ id: 'plan-2', version: 2 })
      prisma.bbsPlanOverride.create.mockResolvedValue({ id: 'ov-1' })

      const result = await service.override('BBS-LD-100001', { newLifecycleStatus: 'CANCELLED', reason: 'Customer withdrew consent to proceed.' }, { userId: 'user-1', role: 'SUPERVISOR' as never })

      expect(result.overridden).toBe(true)
      const newPlanCreateCall = prisma.bbsPlan.create.mock.calls[0][0]
      expect(newPlanCreateCall.data.lifecycleStatus).toBe('CANCELLED')
      expect(newPlanCreateCall.data.version).toBe(2)
      expect(prisma.bbsPlanAction.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ planId: 'plan-2', actionId: 'a1' })] })
      expect(prisma.bbsPlanOverride.create).toHaveBeenCalledWith({ data: expect.objectContaining({ previousPlanId: 'plan-1', newPlanId: 'plan-2', oldLifecycleStatus: 'DRAFT', newLifecycleStatus: 'CANCELLED' }) })
    })

    it('throws NotFoundException when no prior plan exists to override', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue(null)
      await expect(service.override('BBS-LD-100001', { newLifecycleStatus: 'CANCELLED', reason: 'x'.repeat(10) }, { userId: 'user-1', role: 'SUPERVISOR' as never })).rejects.toThrow(NotFoundException)
    })
  })

  describe('generate — PL001 gate (v3.0 §4.2)', () => {
    it('CRITICAL: refuses to generate when the Pathway Decision\'s own live TTL has EXPIRED, even though pathwayStatus itself still reads READY', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', fullName: 'Test Customer' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())
      pathwayEngineService.getForLead.mockResolvedValue(completedPathwayDecision({ ttl: { liveStatus: 'EXPIRED' } }))

      const result = await service.generate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(result.reason).toMatch(/expired/i)
      expect(prisma.bbsPlan.create).not.toHaveBeenCalled()
    })
  })

  describe('getForLead — live TTL status (v3.0 §12.5)', () => {
    it('ACTIVE when ttlExpiresAt is in the future and the plan has not yet progressed past CCR_REVIEW', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ generationStatus: 'COMPLETED', version: 1, lifecycleStatus: 'CCR_REVIEW', sourceCohortDecisionVersion: 1, sourcePathwayDecisionVersion: 1, ttlExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), planTtlDays: 45, actions: [], conditions: [] })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision({ version: 1 }))
      pathwayEngineService.getForLead.mockResolvedValue(completedPathwayDecision({ version: 1 }))
      prisma.analysisJob.findFirst.mockResolvedValue(null)

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toMatchObject({ ttl: { liveStatus: 'ACTIVE' } })
    })

    it('EXPIRED when ttlExpiresAt is in the past and the plan was never accepted', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ generationStatus: 'COMPLETED', version: 1, lifecycleStatus: 'CCR_REVIEW', sourceCohortDecisionVersion: 1, sourcePathwayDecisionVersion: 1, ttlExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), planTtlDays: 45, actions: [], conditions: [] })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision({ version: 1 }))
      pathwayEngineService.getForLead.mockResolvedValue(completedPathwayDecision({ version: 1 }))
      prisma.analysisJob.findFirst.mockResolvedValue(null)

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toMatchObject({ ttl: { liveStatus: 'EXPIRED' } })
    })

    it('ACCEPTED_NO_EXPIRY once the plan has progressed to EXECUTION_READY, even past the TTL expiry date', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ generationStatus: 'COMPLETED', version: 1, lifecycleStatus: 'EXECUTION_READY', sourceCohortDecisionVersion: 1, sourcePathwayDecisionVersion: 1, ttlExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), planTtlDays: 45, actions: [], conditions: [] })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision({ version: 1 }))
      pathwayEngineService.getForLead.mockResolvedValue(completedPathwayDecision({ version: 1 }))
      prisma.analysisJob.findFirst.mockResolvedValue(null)

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toMatchObject({ ttl: { liveStatus: 'ACCEPTED_NO_EXPIRY' } })
    })
  })

  describe('updateActionStatus (v3.0 §11.2)', () => {
    it('allows the legal PENDING -> IN_PROGRESS transition', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ id: 'plan-1', generationStatus: 'COMPLETED' })
      prisma.bbsPlanAction.findFirst.mockResolvedValue({ id: 'action-1', status: 'PENDING' })
      prisma.bbsPlanAction.update.mockResolvedValue({})

      const result = await service.updateActionStatus('BBS-LD-100001', 'CA-001', 'IN_PROGRESS')

      expect(result).toEqual({ updated: true, status: 'IN_PROGRESS' })
      expect(prisma.bbsPlanAction.update).toHaveBeenCalledWith({ where: { id: 'action-1' }, data: { status: 'IN_PROGRESS' } })
    })

    it('CRITICAL: refuses an illegal transition (COMPLETE -> IN_PROGRESS — COMPLETE is terminal) rather than silently applying it', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ id: 'plan-1', generationStatus: 'COMPLETED' })
      prisma.bbsPlanAction.findFirst.mockResolvedValue({ id: 'action-1', status: 'COMPLETE' })
      prisma.bbsPlanAction.update.mockResolvedValue({})

      const result = await service.updateActionStatus('BBS-LD-100001', 'CA-001', 'IN_PROGRESS')

      expect(result.updated).toBe(false)
      expect(prisma.bbsPlanAction.update).not.toHaveBeenCalled()
    })

    it('throws NotFoundException for an unknown actionId on the current plan', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ id: 'plan-1', generationStatus: 'COMPLETED' })
      prisma.bbsPlanAction.findFirst.mockResolvedValue(null)

      await expect(service.updateActionStatus('BBS-LD-100001', 'CA-999', 'IN_PROGRESS')).rejects.toThrow(NotFoundException)
    })
  })

  describe('updateConditionStatus (v3.0 §13.3)', () => {
    it('allows the legal PENDING -> MET transition and records the verifying actor', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ id: 'plan-1', generationStatus: 'COMPLETED' })
      prisma.bbsPlanCondition.findFirst.mockResolvedValue({ id: 'cond-1', state: 'PENDING', verificationEvidence: null })
      prisma.bbsPlanCondition.update.mockResolvedValue({})

      const result = await service.updateConditionStatus('BBS-LD-100001', 'std-income-verified', { newState: 'MET', verificationEvidence: 'Salary slip confirmed.' }, { userId: 'user-1' })

      expect(result).toEqual({ updated: true, state: 'MET' })
      expect(prisma.bbsPlanCondition.update).toHaveBeenCalledWith({ where: { id: 'cond-1' }, data: { state: 'MET', verificationStatus: 'VERIFIED', verificationEvidence: 'Salary slip confirmed.', verifiedById: 'user-1' } })
    })

    it('CRITICAL: refuses to transition a NOT_APPLICABLE condition (no live product/lender integration exists to verify it)', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.bbsPlan.findFirst.mockResolvedValue({ id: 'plan-1', generationStatus: 'COMPLETED' })
      prisma.bbsPlanCondition.findFirst.mockResolvedValue({ id: 'cond-1', state: 'NOT_APPLICABLE' })
      prisma.bbsPlanCondition.update.mockResolvedValue({})

      const result = await service.updateConditionStatus('BBS-LD-100001', 'std-product-available', { newState: 'MET' }, { userId: 'user-1' })

      expect(result.updated).toBe(false)
      expect(prisma.bbsPlanCondition.update).not.toHaveBeenCalled()
    })
  })
})
