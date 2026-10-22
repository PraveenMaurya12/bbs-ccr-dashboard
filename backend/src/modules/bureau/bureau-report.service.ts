import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, type CreditReport } from '@prisma/client'

import { PrismaService } from '@/common/prisma/prisma.service'
import { buildDebtAnalysisSummary } from '@/modules/debt-analysis/debt-analysis.calculations'
import { AnalysisService } from '@/modules/analysis/analysis.service'
import { type BureauIdentity, splitFullName, toBareMobile } from './identity'
import { mapInProfileResponseXml } from './providers/experian-response.mapper'
import { mapSignzyExperianLiteResponse } from './providers/signzy-response.mapper'
import {
  CREDIT_REPORT_PROVIDER,
  CreditReportProviderError,
  CreditReportUnmappedResponseError,
  type CreditReportProvider,
  type RawCreditReportData,
} from './providers/credit-report-provider.interface'

export interface TriggerBureauRequestParams {
  leadId: string
  bbsLeadId: string
  fullName: string
  /** Whatever format Lead.phone is stored in (e.g. "+91 9000010001") — normalized internally. */
  phone: string
  /**
   * The lead's real, raw PAN — required by Signzy, irrelevant to the
   * legacy Experian SOAP provider (which ignores it). In-memory only,
   * never persisted (see PublicContactService.hashPan) — omit for any
   * caller that doesn't have it (e.g. reprocessing, which never reaches
   * the provider anyway).
   */
  pan?: string | null
  /** The lead's real GRANTED ConsentRecord evidence — see BureauIdentity's own doc comment. */
  consent?: { grantedAt: Date; granted: boolean; ipAddress: string | null } | null
}

type LeadBureauStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'REQUIRES_REVIEW'

/**
 * CRITICAL BUSINESS RULE, enforced throughout this service: at most ONE
 * Experian HTTP call is ever made per BBS lead. Every real call costs the
 * business money, so once a call has been attempted for a lead — success,
 * no-record, timeout, HTTP error, SOAP fault, or an unmapped response —
 * that lead's allowance is permanently consumed. There is no monthly
 * refresh, no report-expiry window, and no automatic or manual retry that
 * re-calls the provider. See CreditReport.leadId's `@unique` constraint
 * (prisma/schema.prisma) — that is the actual database-level enforcement;
 * this service's own logic never needs to (and must never try to)
 * re-derive that guarantee from application state alone.
 *
 * The only two entry points that ever call `this.provider.fetchReport`
 * are `triggerForLead` (the one-time, post-consent trigger from
 * PublicContactService) and nothing else. `reprocessStoredResponse`
 * exists for the REQUIRES_REVIEW case and deliberately never touches the
 * provider — it only re-runs the mapper against the already-stored raw
 * response.
 */
@Injectable()
export class BureauReportService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CREDIT_REPORT_PROVIDER) private readonly provider: CreditReportProvider,
    private readonly analysisService: AnalysisService,
  ) {}

  // Guards against a double-click/concurrent-tab POST to the reprocess
  // endpoint re-running the mapper (and firing a second
  // DEBT_ANALYSIS_INSIGHTS job) for the same report while the first call
  // is still in flight. In-memory only — correct for this app's documented
  // single-instance deployment (see LocalDiskStorageProvider's own doc
  // comment on the same assumption); a multi-instance deployment would need
  // a DB-backed lock instead.
  private readonly reprocessingLeadIds = new Set<string>()

  private buildIdentity(params: TriggerBureauRequestParams): BureauIdentity {
    const { firstName, surname } = splitFullName(params.fullName)
    return {
      firstName,
      surname,
      mobilePhone: toBareMobile(params.phone),
      pan: params.pan ?? null,
      consent: params.consent ?? null,
    }
  }

  /** Never logs XMLUser/XMLPassword/PAN/raw request-response/a full mobile number — only IDs, statuses, and error codes. */
  private log(event: string, details: Record<string, string | number | undefined>): void {
    const parts = Object.entries(details)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
    console.log(`[Bureau] ${event} ${parts.join(' ')}`)
  }

  /**
   * Fire-and-forget entry point — callers (PublicContactService) must never
   * `await` this on the request path; it deliberately never throws.
   */
  async triggerForLead(params: TriggerBureauRequestParams): Promise<void> {
    try {
      await this.run(params)
    } catch (error) {
      // Defense in depth only — `run` already catches and persists its own
      // failures. Anything reaching here (e.g. a DB outage mid-write) is
      // logged, never rethrown, since this is always called detached from
      // a request/response cycle. Only the error's own message is logged
      // (via the same sanitizing log() helper used everywhere else in this
      // service), never the raw error object — a thrown error could in
      // principle carry an embedded raw provider response/PII on a
      // non-standard property.
      this.log('TRIGGER_FAILED_UNEXPECTEDLY', { bbsLeadId: params.bbsLeadId, error: error instanceof Error ? error.message : String(error) })
    }
  }

  private async run(params: TriggerBureauRequestParams): Promise<void> {
    const identity = this.buildIdentity(params)

    let reportRow: CreditReport
    try {
      reportRow = await this.prisma.creditReport.create({
        data: {
          leadId: params.leadId,
          bureau: this.provider.providerName,
          // Placeholder values overwritten once the real fetch completes —
          // never read as real data because callers gate on
          // processingStatus first (see DebtAnalysisService.getForLead).
          maskedIdNumber: 'PENDING',
          pulledAt: new Date(),
          creditScore: null,
          scoreBand: 'pending',
          totalActiveAccounts: 0,
          totalOutstandingBalance: 0,
          delinquentAccounts: 0,
          processingStatus: 'IN_PROGRESS',
        },
      })
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        // The one-call-per-lead invariant already has a row for this lead
        // (in flight, or already terminal) — the unique constraint on
        // leadId made a second attempt structurally impossible. This is
        // the guard working as designed, not an error.
        this.log('EXPERIAN_CALL_ALREADY_CONSUMED', { bbsLeadId: params.bbsLeadId })
        return
      }
      throw error
    }

    this.log('EXPERIAN_CALL_RESERVED', { bbsLeadId: params.bbsLeadId, reportId: reportRow.id })
    await this.updateLeadBureauStatus(params.leadId, 'IN_PROGRESS')

    this.log('EXPERIAN_CALL_STARTED', { bbsLeadId: params.bbsLeadId, reportId: reportRow.id })
    try {
      const { data, rawResponse } = await this.provider.fetchReport(identity)
      await this.applyMappedResult(reportRow.id, params, data, rawResponse)
    } catch (error) {
      await this.applyFailure(reportRow.id, params, error)
    }
  }

  /**
   * Re-runs the mapper against an already-stored raw response for a
   * REQUIRES_REVIEW report — used after a developer fixes a mapping bug.
   * NEVER calls the Experian provider; if no raw response was ever stored
   * (a pure transport-level failure has none), there is nothing to
   * reprocess and this is reported back honestly rather than falling back
   * to a live call.
   */
  async reprocessStoredResponse(bbsLeadId: string): Promise<{ reprocessed: boolean; reason?: string }> {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) {
      throw new NotFoundException(`Lead ${bbsLeadId} was not found`)
    }

    // Reject a second concurrent reprocess for the same lead instead of
    // letting two overlapping calls both clear+recreate tradelines and
    // both fire a fresh DEBT_ANALYSIS_INSIGHTS job. The check-and-set must
    // happen synchronously, with no `await` between them, or two calls that
    // both pass the `.has()` check before either reaches `.add()` would
    // both proceed — see this guard's own regression test for the exact
    // interleaving that caught this the first time.
    if (this.reprocessingLeadIds.has(lead.id)) {
      return { reprocessed: false, reason: 'A reprocess is already in progress for this lead — please wait for it to finish.' }
    }
    this.reprocessingLeadIds.add(lead.id)

    try {
      const report = await this.prisma.creditReport.findUnique({ where: { leadId: lead.id } })
      if (!report) {
        return { reprocessed: false, reason: 'No Experian call has ever been attempted for this lead.' }
      }
      if (!report.rawResponse) {
        return {
          reprocessed: false,
          reason:
            'No raw bureau response is stored for this lead — the original call failed before a response was ' +
            'ever received, so there is nothing to reprocess.',
        }
      }

      const params: TriggerBureauRequestParams = {
        leadId: lead.id,
        bbsLeadId: lead.bbsLeadId,
        fullName: lead.fullName,
        phone: lead.phone,
      }

      try {
        const identity = this.buildIdentity(params)
        // Provider-agnostic dispatch: which mapper applies depends on which
        // provider actually produced this stored response (recorded on the
        // report itself at fetch time), never on whichever provider happens
        // to be configured right now — reprocessing must reproduce the same
        // mapping regardless of any later provider switch.
        const data = this.mapStoredResponse(report.bureau, report.rawResponse, identity)
        await this.applyMappedResult(report.id, params, data, report.rawResponse)
        return { reprocessed: true }
      } catch (error) {
        await this.applyFailure(report.id, params, error)
        return {
          reprocessed: false,
          reason: `Mapping still fails: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    } finally {
      this.reprocessingLeadIds.delete(lead.id)
    }
  }

  /**
   * Picks the mapper matching whichever provider actually produced this
   * stored response (`CreditReport.bureau`, set from the provider's own
   * `providerName` at the time the response was received) — never the
   * currently-configured provider, which may have changed since. Add a
   * new branch here whenever a new bureau provider is introduced.
   */
  private mapStoredResponse(bureau: string, rawResponse: string, identity: BureauIdentity): RawCreditReportData {
    if (bureau === 'Signzy Experian Lite') {
      return mapSignzyExperianLiteResponse(rawResponse, identity)
    }
    // Experian is the default/legacy case — every response stored before
    // Signzy existed has `bureau === 'Experian'`.
    return mapInProfileResponseXml(rawResponse, identity)
  }

  private async applyMappedResult(
    reportId: string,
    params: TriggerBureauRequestParams,
    data: RawCreditReportData,
    rawResponse: string | null,
  ): Promise<void> {
    // The mapper's own convention for the verified "no bureau record
    // found" outcome (see experian-response.mapper.ts) — a legitimate
    // terminal result, never an error.
    const isNoRecord = data.scoreBand === 'not_found' && data.creditScore === null
    const status: LeadBureauStatus = 'COMPLETED'

    await this.persistFetchedReport(reportId, data, rawResponse, isNoRecord ? 'NO_RECORD' : 'COMPLETED')
    this.log(isNoRecord ? 'EXPERIAN_NO_RECORD' : 'EXPERIAN_CALL_COMPLETED', {
      bbsLeadId: params.bbsLeadId,
      reportId,
    })

    if (!isNoRecord) {
      // Best-effort: Gemini insights are advisory (see AnalysisResult's doc
      // comment) and never re-trigger a bureau call on failure or retry.
      await this.analysisService
        .createAndRun({
          bbsLeadId: params.bbsLeadId,
          jobType: 'DEBT_ANALYSIS_INSIGHTS',
          payload: { debtAnalysis: buildDebtAnalysisSummary(data) },
        })
        .catch((error) => {
          this.log('INSIGHTS_JOB_FAILED_TO_START', { bbsLeadId: params.bbsLeadId, error: error instanceof Error ? error.message : String(error) })
        })
    }

    await this.updateLeadBureauStatus(params.leadId, status)
  }

  private async applyFailure(reportId: string, params: TriggerBureauRequestParams, error: unknown): Promise<void> {
    if (error instanceof CreditReportUnmappedResponseError) {
      await this.prisma.creditReport.update({
        where: { id: reportId },
        data: {
          processingStatus: 'REQUIRES_REVIEW',
          errorMessage: error.message,
          errorCode: error.code,
          rawResponse: error.rawResponse,
          completedAt: new Date(),
        },
      })
      this.log('EXPERIAN_MAPPING_REQUIRES_REVIEW', { bbsLeadId: params.bbsLeadId, reportId, errorCode: error.code })
      await this.updateLeadBureauStatus(params.leadId, 'REQUIRES_REVIEW')
      return
    }

    const message = error instanceof Error ? error.message : 'Unknown bureau error'
    const code = error instanceof CreditReportProviderError ? error.code : 'UNKNOWN'
    await this.prisma.creditReport.update({
      where: { id: reportId },
      data: { processingStatus: 'FAILED', errorMessage: message, errorCode: code, completedAt: new Date() },
    })
    this.log('EXPERIAN_CALL_FAILED', { bbsLeadId: params.bbsLeadId, reportId, errorCode: code })
    await this.updateLeadBureauStatus(params.leadId, 'FAILED')
  }

  private async persistFetchedReport(
    reportId: string,
    raw: RawCreditReportData,
    rawResponse: string | null,
    status: 'COMPLETED' | 'NO_RECORD',
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.creditReport.update({
        where: { id: reportId },
        data: {
          bureau: raw.bureau,
          maskedIdNumber: raw.maskedIdNumber,
          pulledAt: raw.pulledAt,
          creditScore: raw.creditScore,
          scoreBand: raw.scoreBand,
          totalActiveAccounts: raw.totalActiveAccounts,
          totalOutstandingBalance: raw.totalOutstandingBalance,
          delinquentAccounts: raw.delinquentAccounts,
          willfulDefaultFlag: raw.willfulDefaultFlag,
          processingStatus: status,
          errorMessage: null,
          errorCode: null,
          rawResponse,
          completedAt: new Date(),
        },
      }),
      // Reprocessing (see reprocessStoredResponse) can call this a second
      // time for the same report — clear any previously-persisted
      // tradelines/enquiries first so a corrected mapping never appends
      // duplicates alongside stale ones.
      this.prisma.creditAccount.deleteMany({ where: { creditReportId: reportId } }),
      this.prisma.creditEnquiry.deleteMany({ where: { creditReportId: reportId } }),
      ...raw.accounts.map((account) =>
        this.prisma.creditAccount.create({
          data: {
            creditReportId: reportId,
            accountType: account.accountType,
            lender: account.lender,
            openedOn: account.openedOn,
            sanctionedAmount: account.sanctionedAmount,
            currentBalance: account.currentBalance,
            paymentStatus: account.paymentStatus,
            overdueAmount: account.overdueAmount,
            currentDpdDays: account.currentDpdDays,
            maxDpdDays: account.maxDpdDays,
            monthlyEmiAmount: account.monthlyEmiAmount,
            creditLimit: account.creditLimit,
            isSecured: account.isSecured,
            lifecycleStatus: account.lifecycleStatus,
            closedOn: account.closedOn,
            ...(account.paymentHistoryGrid
              ? { paymentHistoryGrid: account.paymentHistoryGrid as unknown as Prisma.InputJsonValue }
              : {}),
          },
        }),
      ),
      ...raw.enquiries.map((enquiry) =>
        this.prisma.creditEnquiry.create({
          data: {
            creditReportId: reportId,
            enquiryDate: enquiry.enquiryDate,
            purpose: enquiry.purpose,
            memberName: enquiry.memberName,
          },
        }),
      ),
    ])
  }

  private async updateLeadBureauStatus(leadId: string, status: LeadBureauStatus): Promise<void> {
    await this.prisma.lead.update({ where: { id: leadId }, data: { bureauReportStatus: status } })
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  }
}
