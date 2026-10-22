import { NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { PathwayEngineService } from './pathway-engine.service'

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })
}

function pathwayEngineConfig() {
  return {
    ruleVersion: 'BBS_PATHWAY_V3.0',
    ttlDaysByPathway: { OPTIMISE: 90, STABILISE: 30, CONSOLIDATE: 45, RESTRUCTURE: 45, RESOLVE: 60, RECOVER: 180 },
    confidenceCapByDqBand: { HIGH: 'HIGH', MODERATE: 'MEDIUM', LOW_MODERATE: 'LOW', LOW: 'LOW', INSUFFICIENT: 'UNRESOLVED' },
  }
}

function cohortEngineConfig() {
  return { p1ForceBlockThreshold: 4, exceptionSpecialistThreshold: 5, exceptionManualReviewThreshold: 8 }
}

function completedCohortDecision(overrides: Record<string, unknown> = {}) {
  return {
    decisionAvailable: true as const,
    status: 'COMPLETED' as const,
    version: 1,
    isStale: false,
    generatedAt: '2026-10-08T00:00:00.000Z',
    primaryCohort: 'C3',
    primaryState: 'C3',
    primaryReasonCode: null,
    secondaryFlags: [],
    capacityBand: 'STRESSED',
    archetype: 'CIRCUMSTANTIAL',
    confidence: 'HIGH',
    complianceHold: false,
    complianceReason: null,
    specialistReviewRequired: false,
    manualReviewRequired: false,
    lifecycleState: 'CCR_REVIEW',
    missingData: [],
    ruleResults: [
      { ruleId: 'R006', matched: false, evidence: {} },
      { ruleId: 'R008', matched: false, evidence: { currentOverdue: 0 } },
      { ruleId: 'R009', matched: false, evidence: {} },
      { ruleId: 'R010', matched: false, evidence: {} },
      { ruleId: 'R012', matched: true, evidence: { activeAccounts: 3 } },
      { ruleId: 'R021', matched: false, evidence: { tier: 'NONE', exceptionCount: 0 } },
    ],
    ...overrides,
  }
}

function completedMasterProfile(overrides: Record<string, unknown> = {}) {
  return {
    profileAvailable: true as const,
    status: 'COMPLETED' as const,
    version: 1,
    isStale: false,
    generatedAt: '2026-10-08T00:00:00.000Z',
    resolutionCapacity: 'STRONG',
    bureauDsrPercent: 30,
    bankDsrPercent: 28,
    masterDsrPercent: 45,
    dataQuality: { band: 'HIGH', flags: [] },
    missingInformation: [],
    dimensionConfidences: { INCOME_CASH_FLOW: 'HIGH', ALIGNMENT_CAPACITY: 'HIGH' },
    ...overrides,
  }
}

describe('PathwayEngineService', () => {
  let prisma: {
    lead: { findUnique: jest.Mock }
    cohortDecision: { findFirst: jest.Mock }
    pathwayDecision: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock }
    pathwayRuleResult: { createMany: jest.Mock }
    $transaction: jest.Mock
  }
  let cohortEngineService: { getForLead: jest.Mock }
  let masterProfileService: { getForLead: jest.Mock }
  let service: PathwayEngineService

  beforeEach(() => {
    prisma = {
      lead: { findUnique: jest.fn() },
      cohortDecision: { findFirst: jest.fn() },
      pathwayDecision: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      pathwayRuleResult: { createMany: jest.fn() },
      $transaction: jest.fn().mockImplementation((arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]))),
    }
    cohortEngineService = { getForLead: jest.fn() }
    masterProfileService = { getForLead: jest.fn() }
    service = new PathwayEngineService(prisma as never, { get: () => ({ pathwayEngine: pathwayEngineConfig(), cohortEngine: cohortEngineConfig() }) } as never, cohortEngineService as never, masterProfileService as never)
  })

  describe('evaluate', () => {
    it('throws NotFoundException for an unknown lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(null)
      await expect(service.evaluate('BBS-LD-000000')).rejects.toThrow(NotFoundException)
    })

    it('CRITICAL: never persists a decision when no Cohort Decision exists yet', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      cohortEngineService.getForLead.mockResolvedValue({ decisionAvailable: false, masterProfileReady: false })

      const result = await service.evaluate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(prisma.pathwayDecision.create).not.toHaveBeenCalled()
    })

    it('refuses to evaluate against a stale Cohort Decision', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision({ isStale: true }))

      const result = await service.evaluate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(result.reason).toMatch(/stale/)
    })

    it('generates a COMPLETED decision — a clean C3/Stressed lead resolves to RESTRUCTURE', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1 })
      prisma.pathwayDecision.findFirst.mockResolvedValue(null)
      prisma.pathwayDecision.create.mockResolvedValue({ id: 'pd-1', version: 1 })

      const result = await service.evaluate('BBS-LD-100001')

      expect(result.generated).toBe(true)
      const updateCall = prisma.pathwayDecision.update.mock.calls[0][0]
      expect(updateCall.data.primaryPathway).toBe('RESTRUCTURE')
      expect(updateCall.data.pathwayStatus).toBe('READY')
      expect(updateCall.data.pathwayVariant).toBe('STANDARD')
      const ruleResultsCall = prisma.pathwayRuleResult.createMany.mock.calls[0][0]
      expect(ruleResultsCall.data.length).toBeGreaterThan(0)
      expect(ruleResultsCall.data.some((r: { ruleId: string }) => r.ruleId === 'P019')).toBe(true)
    })

    it('CRITICAL: a BLOCKED Cohort Decision produces a null pathway with the inherited reason — never a fabricated real pathway', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision({ primaryCohort: 'COMPLIANCE_HOLD', primaryState: 'BLOCKED', primaryReasonCode: 'COMPLIANCE_HOLD', complianceHold: true }))
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1 })
      prisma.pathwayDecision.findFirst.mockResolvedValue(null)
      prisma.pathwayDecision.create.mockResolvedValue({ id: 'pd-1', version: 1 })

      await service.evaluate('BBS-LD-100001')

      const updateCall = prisma.pathwayDecision.update.mock.calls[0][0]
      expect(updateCall.data.primaryPathway).toBeNull()
      expect(updateCall.data.pathwayStatus).toBe('BLOCKED')
      expect(updateCall.data.blockingReason).toBe('COMPLIANCE_HOLD')
    })

    it('never auto-selects the 90-day variant, even for a STABILISE primary pathway (§11 PROPOSED, never auto-selected)', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision({ primaryCohort: 'C5', primaryState: 'C5', capacityBand: 'TIGHT' }))
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1 })
      prisma.pathwayDecision.findFirst.mockResolvedValue(null)
      prisma.pathwayDecision.create.mockResolvedValue({ id: 'pd-1', version: 1 })

      await service.evaluate('BBS-LD-100001')

      const updateCall = prisma.pathwayDecision.update.mock.calls[0][0]
      expect(updateCall.data.primaryPathway).toBe('STABILISE')
      expect(updateCall.data.pathwayVariant).toBe('STANDARD')
    })

    it('appends a new version rather than overwriting a prior decision', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1 })
      prisma.pathwayDecision.findFirst.mockResolvedValue({ id: 'pd-prev', version: 2, status: 'COMPLETED', primaryPathway: 'STABILISE' })
      prisma.pathwayDecision.create.mockResolvedValue({ id: 'pd-3', version: 3 })

      await service.evaluate('BBS-LD-100001')

      expect(prisma.pathwayDecision.create).toHaveBeenCalledWith({ data: { leadId: 'lead-1', version: 3, status: 'GENERATING', ruleVersion: 'BBS_PATHWAY_V3.0' } })
    })

    it('marks the decision FAILED (never silently swallowed) when persistence throws', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      prisma.cohortDecision.findFirst.mockResolvedValue({ id: 'cd-1', version: 1 })
      prisma.pathwayDecision.findFirst.mockResolvedValue(null)
      prisma.pathwayDecision.create.mockResolvedValue({ id: 'pd-1', version: 1 })
      prisma.$transaction.mockRejectedValueOnce(new Error('db exploded'))

      const result = await service.evaluate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(prisma.pathwayDecision.update).toHaveBeenCalledWith({ where: { id: 'pd-1' }, data: { status: 'FAILED', errorMessage: 'db exploded' } })
    })

    it('CRITICAL: a concurrent evaluate() race returns a clean reason, never an unhandled 500', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())
      masterProfileService.getForLead.mockResolvedValue(completedMasterProfile())
      prisma.pathwayDecision.findFirst.mockResolvedValue(null)
      prisma.pathwayDecision.create.mockRejectedValue(uniqueViolation())

      const result = await service.evaluate('BBS-LD-100001')

      expect(result).toEqual({ generated: false, reason: 'A pathway evaluation is already in progress for this lead — refresh and retry.' })
    })
  })

  describe('getForLead', () => {
    it('reports decisionAvailable:false with cohortDecisionReady when no decision exists yet', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.pathwayDecision.findFirst.mockResolvedValue(null)
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision())

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toEqual({ decisionAvailable: false, cohortDecisionReady: true })
    })

    it('CRITICAL: reports isStale:true when the Cohort Decision has moved to a newer version since this decision', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.pathwayDecision.findFirst.mockResolvedValue({ status: 'COMPLETED', version: 1, sourceCohortDecisionVersion: 1, ruleResults: [] })
      cohortEngineService.getForLead.mockResolvedValue(completedCohortDecision({ version: 2 }))

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toMatchObject({ isStale: true })
    })
  })
})
