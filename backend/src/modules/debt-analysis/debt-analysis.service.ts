import { Injectable, NotFoundException } from '@nestjs/common'
import type { AnalysisResult, CreditAccount, CreditEnquiry, CreditReport } from '@prisma/client'

import { PrismaService } from '@/common/prisma/prisma.service'
import { buildDebtAnalysisSummary, toLevel1CreditIntelligence } from './debt-analysis.calculations'
import type { CreditAccountInput, CreditReportInput, PaymentHistoryEntry } from './debt-analysis.types'

type CreditReportRow = CreditReport & { accounts: CreditAccount[]; enquiries: CreditEnquiry[] }

export function toAccountInput(account: CreditAccount): CreditAccountInput {
  return {
    accountType: account.accountType,
    lender: account.lender,
    openedOn: account.openedOn,
    sanctionedAmount: account.sanctionedAmount.toNumber(),
    currentBalance: account.currentBalance.toNumber(),
    paymentStatus: account.paymentStatus,
    overdueAmount: account.overdueAmount.toNumber(),
    currentDpdDays: account.currentDpdDays,
    maxDpdDays: account.maxDpdDays,
    monthlyEmiAmount: account.monthlyEmiAmount?.toNumber() ?? null,
    creditLimit: account.creditLimit?.toNumber() ?? null,
    isSecured: account.isSecured,
    lifecycleStatus: account.lifecycleStatus,
    closedOn: account.closedOn,
    // Stored as Prisma Json — cast at this one boundary, trusting that
    // nothing but this feature's own upload path ever writes this column.
    paymentHistoryGrid: (account.paymentHistoryGrid as unknown as PaymentHistoryEntry[] | null) ?? null,
  }
}

export function toReportInput(report: CreditReportRow): CreditReportInput {
  return {
    bureau: report.bureau,
    pulledAt: report.pulledAt,
    creditScore: report.creditScore,
    scoreBand: report.scoreBand,
    totalActiveAccounts: report.totalActiveAccounts,
    totalOutstandingBalance: report.totalOutstandingBalance.toNumber(),
    delinquentAccounts: report.delinquentAccounts,
    willfulDefaultFlag: report.willfulDefaultFlag,
    accounts: report.accounts.map(toAccountInput),
    enquiries: report.enquiries.map((e) => ({
      enquiryDate: e.enquiryDate,
      purpose: e.purpose,
      memberName: e.memberName,
    })),
  }
}

function toInsights(result: AnalysisResult | null) {
  if (!result) return null
  return {
    findings: result.findings as Record<string, unknown>,
    confidence: result.confidence,
    modelVersion: result.modelVersion,
    generatedAt: result.createdAt.toISOString(),
  }
}

@Injectable()
export class DebtAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  async getForLead(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) {
      throw new NotFoundException(`Lead ${bbsLeadId} was not found`)
    }

    // CreditReport.leadId is @unique — at most one row per lead, ever (see
    // BureauReportService's one-Experian-call-per-lead business rule).
    // Absence of a row means no call was ever attempted (NOT_ATTEMPTED —
    // reported as reportAvailable:false, same convention as before).
    const report = await this.prisma.creditReport.findUnique({
      where: { leadId: lead.id },
      include: { accounts: true, enquiries: true },
    })

    if (!report) {
      return { reportAvailable: false as const }
    }

    if (report.processingStatus === 'IN_PROGRESS') {
      return { reportAvailable: true as const, status: 'IN_PROGRESS' as const }
    }
    if (report.processingStatus === 'NO_RECORD') {
      // A legitimate, verified terminal result — Experian affirmatively
      // found no bureau record for this identity. Never an error, never
      // retried.
      return { reportAvailable: true as const, status: 'NO_RECORD' as const }
    }
    if (report.processingStatus === 'FAILED') {
      // The call itself never completed (transport/timeout/SOAP fault) —
      // no raw response exists, so there is nothing to reprocess either.
      return { reportAvailable: true as const, status: 'FAILED' as const, errorMessage: report.errorMessage }
    }
    if (report.processingStatus === 'REQUIRES_REVIEW') {
      // A real response was received but doesn't match the one verified
      // mapping — the raw response is stored (never exposed here) so a
      // developer can fix the mapper and reprocess it without another call.
      return { reportAvailable: true as const, status: 'REQUIRES_REVIEW' as const, errorMessage: report.errorMessage }
    }

    const insightsJob = await this.prisma.analysisJob.findFirst({
      where: { leadId: lead.id, jobType: 'DEBT_ANALYSIS_INSIGHTS' },
      orderBy: { createdAt: 'desc' },
      include: { result: true },
    })
    const insights = insightsJob ? { status: insightsJob.status, ...toInsights(insightsJob.result) } : null

    // Rule 7/18 (EMI burden, DTI) activate only when real income is on file
    // — a missing Customer row, or a Customer with no monthlySalary, both
    // correctly fall through to debtServiceRatio/debtToIncome's own
    // NOT_REPORTED state (never a fabricated 0 income).
    const customer = await this.prisma.customer.findUnique({ where: { leadId: lead.id } })
    const monthlyIncome = customer?.monthlySalary?.toNumber() ?? null

    const reportInput = toReportInput(report)
    const summary = buildDebtAnalysisSummary(reportInput, monthlyIncome)

    return {
      reportAvailable: true as const,
      status: 'COMPLETED' as const,
      ...summary,
      // Never persisted binaries — only the metadata already on the report row.
      documentId: report.documentId,
      insights,
      // BBS Level 1 Credit Intelligence — the same values above, regrouped
      // into creditPosition/debtInventory/riskSignals/aiInsights (see
      // toLevel1CreditIntelligence's own doc comment). Additive: every
      // field the Debt Analysis tab already reads above is untouched.
      level1: { ...toLevel1CreditIntelligence(reportInput, summary), aiInsights: insights },
    }
  }

  /**
   * A read-only projection of the exact same Level 1 Credit Intelligence
   * `getForLead` already computed — never a second analysis engine. Built
   * specifically to help a CCR prepare for a call: who they're calling,
   * their credit position/debt inventory/delinquency at a glance, the risk
   * signals worth raising, and (when Gemini succeeded) the specific
   * questions it suggested verifying and the data gaps it noticed. Never
   * invents a question/gap when Gemini's findings don't have one — falls
   * back to an empty list.
   */
  async getCallBriefForLead(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) {
      throw new NotFoundException(`Lead ${bbsLeadId} was not found`)
    }

    // The lead funnel status shown elsewhere (e.g. the Lead Header badge)
    // is derived client-side from several raw fields (see the frontend's
    // deriveFunnelStatus) — deliberately not duplicated here.
    const who = {
      bbsLeadId: lead.bbsLeadId,
      fullName: lead.fullName,
      helpCategory: lead.helpCategory,
      situation: lead.situation,
    }

    const analysis = await this.getForLead(bbsLeadId)

    if (!analysis.reportAvailable) {
      return { who, reportAvailable: false as const }
    }
    if (analysis.status !== 'COMPLETED') {
      return {
        who,
        reportAvailable: true as const,
        status: analysis.status,
        errorMessage: 'errorMessage' in analysis ? analysis.errorMessage : null,
      }
    }

    // Reads the new DebtDiagnosisFindings contract (see
    // modules/analysis/providers/debt-diagnosis.types.ts) — the equivalent
    // of the old flat questionsForCcr/dataGaps/summary/keyObservations/
    // concerns fields this endpoint read before the full Debt Analysis
    // Module rebuild.
    type FindingLike = Partial<{ statement: string }>
    const findings = analysis.insights?.findings as
      | Partial<{
          executiveSummary: string
          currentPosition: string
          primaryConcerns: FindingLike[]
          secondaryConcerns: FindingLike[]
          dataGaps: string[]
          actionPlan: Partial<{ verify: string[] }>
        }>
      | undefined
    const stringArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [])
    const findingStatements = (value: unknown): string[] =>
      Array.isArray(value)
        ? value
            .map((f) => (f && typeof f === 'object' && typeof (f as FindingLike).statement === 'string' ? (f as FindingLike).statement! : null))
            .filter((s): s is string => s !== null)
        : []

    const deterministicDataGaps = [
      analysis.utilization.available ? null : analysis.utilization.unavailableReason,
      analysis.debtBurden.securedUnsecuredAvailable ? null : 'Secured/unsecured split is not available.',
      analysis.repaymentBehavior.available ? null : 'No month-by-month payment history was reported.',
    ].filter((x): x is string => x !== null)

    return {
      who,
      reportAvailable: true as const,
      status: 'COMPLETED' as const,
      creditPosition: analysis.level1.creditPosition,
      debtInventorySummary: {
        totalActiveDebt: analysis.level1.debtInventory.totalActiveDebt,
        monthlyEmi: analysis.level1.debtInventory.monthlyEmi,
        numbersOfLenders: analysis.level1.debtInventory.numbersOfLenders,
        top3LendersSharePercent: analysis.level1.debtInventory.top3LendersSharePercent,
        accountCount: analysis.level1.debtInventory.accounts.length,
      },
      delinquency: analysis.level1.debtInventory.delinquency,
      riskSignals: analysis.level1.riskSignals,
      keyQuestionsForCcr: stringArray(findings?.actionPlan?.verify),
      dataGaps: [...stringArray(findings?.dataGaps), ...deterministicDataGaps],
      aiObservations: findings
        ? {
            summary: typeof findings.executiveSummary === 'string' ? findings.executiveSummary : null,
            keyObservations: typeof findings.currentPosition === 'string' && findings.currentPosition ? [findings.currentPosition] : [],
            concerns: [...findingStatements(findings.primaryConcerns), ...findingStatements(findings.secondaryConcerns)],
          }
        : null,
      // --- §18.1's fixed CCR Brief template — additive, never replacing the
      // fields above (keyQuestionsForCcr/dataGaps/aiObservations stay
      // AI-sourced and untouched for any existing consumer). This section is
      // entirely deterministic: the discovery agenda is templated from real
      // computed findings, never generated by an LLM, so it's reproducible
      // and never invents a question about data that isn't actually present.
      header: {
        caseId: lead.bbsLeadId,
        customerName: lead.fullName,
        score: analysis.creditProfile.creditScore,
        scoreBand: analysis.creditProfile.scoreBand,
        mobile: lead.phone,
        email: lead.email,
        dataQuality: analysis.dataQuality ? `${analysis.dataQuality.total}/100 (${analysis.dataQuality.band})` : null,
      },
      discoveryAgenda: buildCcrDiscoveryAgenda(analysis),
      accountsNeedingValidation: buildAccountsNeedingValidation(analysis),
    }
  }
}

/**
 * §18.1's "CCR discovery agenda" — a fixed set of structural questions L1
 * can never itself answer (mirroring the Missing Information Register's own
 * "always true at L1" categories), plus specific questions templated from
 * this lead's own real findings (top lender/account, highest card
 * utilisation, unconverted enquiries) — never a generic question about a
 * lender/amount that doesn't actually appear in this report.
 */
function buildCcrDiscoveryAgenda(analysis: Extract<Awaited<ReturnType<DebtAnalysisService['getForLead']>>, { status: 'COMPLETED' }>): string[] {
  const questions: string[] = []
  const topLender = analysis.debtBurden.lenderConcentration[0]
  if (topLender) questions.push(`What was the ${topLender.lender} debt (${topLender.sharePercent}% of outstanding) used for?`)

  const highestCard = analysis.utilization.highestUtilizedCard
  if (highestCard && highestCard.utilizationPercent > 70) {
    questions.push(`Why is the ${highestCard.lender} card at ${highestCard.utilizationPercent}% utilisation — temporary or ongoing?`)
  }

  questions.push('What is your current monthly income?', 'What are your essential monthly expenses?', 'What are the EMI amounts on your active loans?', 'Are you able to comfortably service all current EMIs?')

  if (analysis.scoreStructureDivergence?.divergenceFlag) {
    questions.push('Your debt structure has changed recently even though your bureau score hasn\'t — what changed?')
  }

  questions.push(
    'Do you have any other loans or informal borrowing?',
    'What is your primary financial concern right now?',
    'Do you have any disputes with any lender?',
    'What is your employment status?',
    'Are there any family, medical, or business obligations affecting repayment?',
    'Do you have any other bureau reports we should pull?',
  )
  return questions
}

/**
 * §18.1's "accounts needing validation" — every real account from this
 * lead's own tradeline data that a data-quality or utilisation flag
 * actually applies to, never a fabricated or generic entry.
 */
function buildAccountsNeedingValidation(
  analysis: Extract<Awaited<ReturnType<DebtAnalysisService['getForLead']>>, { status: 'COMPLETED' }>,
): Array<{ lender: string; accountType: string; issue: string; action: string }> {
  const items: Array<{ lender: string; accountType: string; issue: string; action: string }> = []

  for (const account of analysis.level1.debtInventory.accounts) {
    if (account.lifecycleStatus === 'ACTIVE' && account.monthlyEmiAmount === null) {
      items.push({ lender: account.lender, accountType: account.accountType, issue: 'EMI blank', action: 'Confirm EMI amount' })
    }
  }
  for (const card of analysis.utilization.cards) {
    if (card.utilizationPercent > 70) {
      items.push({ lender: card.lender, accountType: 'Credit facility', issue: `${card.utilizationPercent}% utilisation`, action: 'Confirm if temporary' })
    }
  }
  if (analysis.settlement.writtenOffCount > 0 || analysis.settlement.settledCount > 0) {
    items.push({
      lender: 'Multiple',
      accountType: 'Written-off / settled',
      issue: `${analysis.settlement.writtenOffCount} written-off, ${analysis.settlement.settledCount} settled`,
      action: 'Confirm settlement status',
    })
  }
  return items
}
