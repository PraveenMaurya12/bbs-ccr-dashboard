import { NotFoundException } from '@nestjs/common'
import { AnalysisJobStatus } from '@prisma/client'

import { AnalysisService } from './analysis.service'

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('AnalysisService', () => {
  let prisma: {
    lead: { findUnique: jest.Mock }
    analysisJob: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock }
    analysisResult: { create: jest.Mock }
    $transaction: jest.Mock
  }
  let aiProvider: { providerName: string; analyze: jest.Mock }
  let service: AnalysisService

  beforeEach(() => {
    prisma = {
      lead: { findUnique: jest.fn() },
      analysisJob: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
      analysisResult: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation((ops: Array<Promise<unknown>>) => Promise.all(ops)),
    }
    aiProvider = { providerName: 'MOCK', analyze: jest.fn() }
    service = new AnalysisService(prisma as never, aiProvider as never)
  })

  describe('onModuleInit', () => {
    it('reconciles stale RUNNING jobs left behind by a prior process, never a job that is still genuinely in flight', async () => {
      prisma.analysisJob.updateMany.mockResolvedValue({ count: 3 })
      await service.onModuleInit()
      const call = prisma.analysisJob.updateMany.mock.calls[0][0]
      expect(call.where.status).toBe(AnalysisJobStatus.RUNNING)
      expect(call.where.startedAt.lt).toBeInstanceOf(Date)
      expect(call.data.status).toBe(AnalysisJobStatus.FAILED)
      expect(call.data.errorMessage).toMatch(/orphaned/i)
    })
  })

  describe('createAndRun', () => {
    it('throws NotFoundException for an unknown lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(null)
      await expect(service.createAndRun({ bbsLeadId: 'BBS-LD-000000', jobType: 'MASTER_PROFILE_INSIGHTS', payload: {} } as never)).rejects.toThrow(NotFoundException)
    })

    it('returns the created job immediately without waiting for the background run to finish', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.analysisJob.create.mockResolvedValue({ id: 'job-1' })
      prisma.analysisJob.update.mockResolvedValue({})
      // analyze() never resolves within this test — if createAndRun waited
      // on it, this test would hang/time out instead of returning promptly.
      aiProvider.analyze.mockReturnValue(new Promise(() => {}))

      const job = await service.createAndRun({ bbsLeadId: 'BBS-LD-100001', jobType: 'MASTER_PROFILE_INSIGHTS', payload: {} } as never)

      expect(job).toEqual({ id: 'job-1' })
    })

    it('CRITICAL: never produces an unhandled rejection, even when the background run\'s own FAILED-status write also throws', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.analysisJob.create.mockResolvedValue({ id: 'job-1' })
      // First update() call is the initial RUNNING transition; second is
      // the catch-block's own FAILED write — both fail, simulating a lost
      // DB connection mid-job (the exact scenario that previously crashed
      // a real process with an unhandled PrismaClientUnknownRequestError).
      prisma.analysisJob.update.mockRejectedValue(new Error('Engine is not yet connected'))
      aiProvider.analyze.mockRejectedValue(new Error('provider exploded'))

      const unhandledRejections: unknown[] = []
      const handler = (reason: unknown) => unhandledRejections.push(reason)
      process.on('unhandledRejection', handler)
      try {
        await service.createAndRun({ bbsLeadId: 'BBS-LD-100001', jobType: 'MASTER_PROFILE_INSIGHTS', payload: {} } as never)
        await flushMicrotasks()
        await flushMicrotasks()
      } finally {
        process.off('unhandledRejection', handler)
      }

      expect(unhandledRejections).toHaveLength(0)
    })

    it('marks the job COMPLETED with its result when the provider succeeds', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.analysisJob.create.mockResolvedValue({ id: 'job-1' })
      prisma.analysisJob.update.mockResolvedValue({})
      aiProvider.analyze.mockResolvedValue({ findings: { a: 1 }, confidence: 0.5, modelVersion: 'mock-v1' })

      await service.createAndRun({ bbsLeadId: 'BBS-LD-100001', jobType: 'MASTER_PROFILE_INSIGHTS', payload: {} } as never)
      await flushMicrotasks()
      await flushMicrotasks()

      expect(prisma.analysisResult.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ jobId: 'job-1' }) }))
      const completedCall = prisma.analysisJob.update.mock.calls.find((c) => c[0].data.status === AnalysisJobStatus.COMPLETED)
      expect(completedCall).toBeDefined()
    })

    it('marks the job FAILED (never silently swallowed) when the provider throws', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.analysisJob.create.mockResolvedValue({ id: 'job-1' })
      prisma.analysisJob.update.mockResolvedValue({})
      aiProvider.analyze.mockRejectedValue(new Error('provider exploded'))

      await service.createAndRun({ bbsLeadId: 'BBS-LD-100001', jobType: 'MASTER_PROFILE_INSIGHTS', payload: {} } as never)
      await flushMicrotasks()
      await flushMicrotasks()

      const failedCall = prisma.analysisJob.update.mock.calls.find((c) => c[0].data.status === AnalysisJobStatus.FAILED)
      expect(failedCall).toBeDefined()
      expect(failedCall![0].data.errorMessage).toBe('provider exploded')
    })
  })
})
