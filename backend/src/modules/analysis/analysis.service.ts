import { Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common'
import { AnalysisJobStatus, type Prisma } from '@prisma/client'

import { PrismaService } from '@/common/prisma/prisma.service'
import type { CreateAnalysisJobDto } from './dto/create-analysis-job.dto'
import { AI_ANALYSIS_PROVIDER, type AiAnalysisProvider, type AnalysisRequest } from './providers/ai-provider.interface'

/** A RUNNING job older than this with no completion is almost certainly orphaned by a process restart/crash mid-flight (no persistent queue exists in this codebase) rather than a real multi-hour AI call. */
const STALE_RUNNING_JOB_THRESHOLD_MS = 60 * 60 * 1000

@Injectable()
export class AnalysisService implements OnModuleInit {
  private readonly logger = new Logger(AnalysisService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_ANALYSIS_PROVIDER) private readonly aiProvider: AiAnalysisProvider,
  ) {}

  /**
   * Startup reconciliation: every `run()` call is fire-and-forget
   * in-memory (see createAndRun's own doc comment) — if the process
   * restarts or crashes while a job is mid-flight, its row is abandoned at
   * RUNNING forever, with no way for a CCR to ever retry it (confirmed via
   * live dev-DB inspection: real rows stuck this way). This sweep runs
   * once per process start and closes out anything left behind by a PRIOR
   * process, never a job genuinely in flight in THIS one (new jobs are
   * always created fresh after this point).
   */
  async onModuleInit() {
    const staleBefore = new Date(Date.now() - STALE_RUNNING_JOB_THRESHOLD_MS)
    const { count } = await this.prisma.analysisJob.updateMany({
      where: { status: AnalysisJobStatus.RUNNING, startedAt: { lt: staleBefore } },
      data: { status: AnalysisJobStatus.FAILED, completedAt: new Date(), errorMessage: 'Orphaned on a process restart before this job completed — never retried automatically.' },
    })
    if (count > 0) {
      this.logger.warn(`Reconciled ${count} AnalysisJob row(s) stuck in RUNNING from a prior process.`)
    }
  }

  /**
   * Creates the job record, then runs it. Deliberately structured as
   * create-then-run (rather than one write) so a real deployment can swap
   * the "run" half for a queue dispatch without touching job creation or
   * the status-read path.
   */
  async createAndRun(dto: CreateAnalysisJobDto) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId: dto.bbsLeadId } })
    if (!lead) {
      throw new NotFoundException(`Lead ${dto.bbsLeadId} was not found`)
    }

    const job = await this.prisma.analysisJob.create({
      data: {
        leadId: lead.id,
        jobType: dto.jobType,
        provider: this.aiProvider.providerName,
        status: AnalysisJobStatus.QUEUED,
        requestPayload: dto.payload as Prisma.InputJsonValue,
      },
    })

    // Fire-and-forget by design (see this method's own doc comment) — but
    // "forgotten" must never mean "can crash the process." `run()` already
    // guards its own internals; this `.catch()` is defense in depth for
    // anything outside that (e.g. its own opening RUNNING-status write).
    this.run(job.id, { jobType: dto.jobType, leadId: lead.id, ...dto.payload } as AnalysisRequest).catch((error) => {
      this.logger.error(`Unhandled error running AnalysisJob ${job.id}`, error instanceof Error ? error.stack : String(error))
    })

    return job
  }

  private async run(jobId: string, request: AnalysisRequest) {
    await this.prisma.analysisJob.update({
      where: { id: jobId },
      data: { status: AnalysisJobStatus.RUNNING, startedAt: new Date() },
    })

    try {
      const response = await this.aiProvider.analyze(request)

      await this.prisma.$transaction([
        this.prisma.analysisResult.create({
          data: {
            jobId,
            findings: response.findings as Prisma.InputJsonValue,
            confidence: response.confidence,
            modelVersion: response.modelVersion,
          },
        }),
        this.prisma.analysisJob.update({
          where: { id: jobId },
          data: { status: AnalysisJobStatus.COMPLETED, completedAt: new Date() },
        }),
      ])
    } catch (error) {
      // CRITICAL: this method is always invoked fire-and-forget (`void
      // this.run(...)`, never awaited by its caller) — if THIS recovery
      // write itself throws (e.g. a transient DB/connection error), there
      // is no surrounding try/catch anywhere up the call chain, which
      // previously meant an unhandled promise rejection (confirmed: this
      // crashed a real test run with a PrismaClientUnknownRequestError
      // thrown from exactly this line). Swallowed and logged instead —
      // the job row is simply left at RUNNING for onModuleInit's own
      // startup sweep to reconcile later, rather than crashing the process.
      try {
        await this.prisma.analysisJob.update({
          where: { id: jobId },
          data: {
            status: AnalysisJobStatus.FAILED,
            completedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : 'Unknown analysis error',
          },
        })
      } catch (updateError) {
        this.logger.error(`Failed to record AnalysisJob ${jobId} as FAILED after an analysis error`, updateError instanceof Error ? updateError.stack : String(updateError))
      }
    }
  }

  async getStatus(jobId: string) {
    const job = await this.prisma.analysisJob.findUnique({
      where: { id: jobId },
      include: { result: true },
    })

    if (!job) {
      throw new NotFoundException(`Analysis job ${jobId} was not found`)
    }

    return job
  }
}
