import { Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { PrismaService } from '@/common/prisma/prisma.service'
import { AnalysisService } from '@/modules/analysis/analysis.service'
import { DebtAnalysisService } from '@/modules/debt-analysis/debt-analysis.service'
import { FinancialAnalysisService } from '@/modules/financial-analysis/financial-analysis.service'
import { assessOverallConfidence, buildCohortAttributeVector, computeResolutionCapacity } from './calculations/resolution-and-cohort'
import { classifyAlignment } from './calculations/alignment'
import { buildComplianceRouting } from './calculations/compliance-routing'
import { computeDataQualityBand } from './calculations/data-quality'
import { assessDimensionConfidences } from './calculations/dimensions'
import { buildFamilyNetworkVerification } from './calculations/family-network-verification'
import { buildMissingInformationRegister } from './calculations/missing-information-register'
import { detectPostStatementDebt } from './calculations/post-statement-debt'
import { evaluateReadinessGate } from './calculations/readiness-gate'
import { assessValidationRequired, detectPossibleCauses, detectStrengthsConcernsOpportunities } from './calculations/signals'
import { compareDebtServicing } from './calculations/debt-servicing'
import { detectDateAlignment } from './calculations/date-alignment'
import { reconcileIdentity } from './calculations/identity'
import { buildReconciliationRows } from './calculations/reconciliation'
import { synthesizeFinancialStress } from './calculations/stress'
import type { CustomerIdentityFact, DebtAccountFact, DebtAnalysisFacts, FinancialAnalysisFacts, LeadIdentityFact, MonthlyFact, ReadinessConditionResult } from './master-profile.types'

type DebtAnalysisCompleted = Extract<Awaited<ReturnType<DebtAnalysisService['getForLead']>>, { status: 'COMPLETED' }>
type FinancialAnalysisCompleted = Extract<Awaited<ReturnType<FinancialAnalysisService['getForLead']>>, { status: 'COMPLETED' }>

function toNum(value: unknown): number {
  return typeof value === 'object' && value !== null && 'toNumber' in value ? (value as { toNumber(): number }).toNumber() : Number(value)
}

function toDebtAccountFacts(accounts: DebtAnalysisCompleted['level1']['debtInventory']['accounts']): DebtAccountFact[] {
  return accounts.map((a) => ({
    lender: a.lender,
    accountType: a.accountType,
    openedOn: a.openedOn,
    currentBalance: a.currentBalance,
    monthlyEmiAmount: a.monthlyEmiAmount,
    lifecycleStatus: a.lifecycleStatus,
  }))
}

function toDebtAnalysisFacts(debt: DebtAnalysisCompleted): DebtAnalysisFacts {
  const { level1 } = debt
  // securedPercent/unsecuredPercent live on the flat `debtBurden` spread
  // (debt-analysis.service.ts's getForLead spreads buildDebtAnalysisSummary's
  // output directly), not inside `level1` itself — level1.debtInventory only
  // carries the absolute secured/unsecured amounts, not the percent.
  const { securedPercent, unsecuredPercent } = debt.debtBurden
  return {
    dataQualityTotal: debt.dataQuality?.total ?? 0,
    dataQualityFlagCodes: debt.dataQuality?.flags?.map((f) => f.code) ?? [],
    missingInformationItems: (debt.missingInformation ?? []).map((i) => ({ category: i.category, description: i.whatL1CannotDetermine })),
    creditScore: level1.creditPosition.creditScore,
    scoreBand: level1.creditPosition.scoreBand,
    totalAccounts: level1.creditPosition.totalAccounts,
    activeAccounts: level1.creditPosition.activeAccounts,
    totalOutstanding: level1.creditPosition.totalOutstanding,
    totalOverdue: level1.creditPosition.totalOverdue,
    monthlyEmi: level1.debtInventory.monthlyEmi,
    numbersOfLenders: level1.debtInventory.numbersOfLenders,
    top3LendersSharePercent: level1.debtInventory.top3LendersSharePercent,
    securedPercent,
    unsecuredPercent,
    currentMaxDpd: level1.debtInventory.delinquency.currentMaxDpd,
    maxHistoricalDpd: level1.debtInventory.delinquency.maxHistoricalDpd,
    writtenOffCount: level1.debtInventory.statusIndicators.writtenOffCount,
    settledCount: level1.debtInventory.statusIndicators.settledCount,
    suitFiledCount: level1.debtInventory.statusIndicators.suitFiledCount,
    restructuredCount: level1.debtInventory.statusIndicators.restructuredCount,
    willfulDefault: level1.debtInventory.statusIndicators.willfulDefault,
    recentEnquiries: level1.creditPosition.recentEnquiries,
    substantialRecentConcentration: level1.debtStructure.recency.substantialRecentConcentration,
    borrowingClusterDetected: level1.debtBehaviour.borrowing.clusterDetected,
    debtServiceRatio: { availability: level1.repaymentCapacity.debtServiceRatio.availability, debtServiceRatioPercent: level1.repaymentCapacity.debtServiceRatio.debtServiceRatioPercent, monthlyIncome: level1.repaymentCapacity.debtServiceRatio.monthlyIncome },
    debtToIncome: { availability: level1.repaymentCapacity.debtToIncome.availability, dtiPercent: level1.repaymentCapacity.debtToIncome.dtiPercent },
    stressLevel: level1.stressAnalysis.level,
    stressSignals: level1.stressAnalysis.signals,
    accounts: toDebtAccountFacts(level1.debtInventory.accounts),
  }
}

function toMonthlyFacts(months: FinancialAnalysisCompleted['months']): MonthlyFact[] {
  return months.map((m) => ({
    periodMonth: m.periodMonth,
    totalInflow: toNum(m.totalInflow),
    totalOutflow: toNum(m.totalOutflow),
    netCashFlow: toNum(m.netCashFlow),
    normalizedIncome: toNum(m.normalizedIncome),
    essentialExpenses: toNum(m.essentialExpenses),
    financialExpenses: toNum(m.financialExpenses),
    discretionaryExpenses: toNum(m.discretionaryExpenses),
    mandatoryDebtPayments: toNum(m.mandatoryDebtPayments),
    creditCardPayments: toNum(m.creditCardPayments),
    loanInflows: toNum(m.loanInflows),
    transferInflows: toNum(m.transferInflows),
    transferOutflows: toNum(m.transferOutflows),
    cashWithdrawals: toNum(m.cashWithdrawals),
    cashDeposits: toNum(m.cashDeposits),
    closingBalance: m.closingBalance !== null ? toNum(m.closingBalance) : null,
    minBalance: m.minBalance !== null ? toNum(m.minBalance) : null,
    lowBalanceDays: m.lowBalanceDays,
    observedDays: m.observedDays,
    hadNegativeBalance: m.hadNegativeBalance,
    transactionCount: m.transactionCount,
    isExceptionalMonth: m.isExceptionalMonth,
    exceptionalMonthReason: m.exceptionalMonthReason,
  }))
}

/**
 * `score.extendedAnalysis` is a `Json` column — Prisma's generated type for
 * it is the generic JsonValue union, not this specific shape. This local
 * interface names only the fields this module actually reads, cast via
 * `as unknown as` (the same convention used wherever this codebase reads a
 * Json column back into a specific shape) rather than widening Financial
 * Analysis's own public return type for one downstream consumer.
 */
interface FinancialExtendedAnalysisFields {
  dataQuality?: { finalScore: number }
  eventProfile?: { relatedPartyEmployer?: { detected: boolean; matchedName: string | null } }
  transferProfile?: { familyNetwork?: FinancialAnalysisFacts['familyNetwork'] }
  fcfReconciliation?: { availability: string; unreconciled: boolean }
  missingInformationRegister?: Array<{ category: string; description: string }>
}

function toFinancialAnalysisFacts(financial: FinancialAnalysisCompleted): FinancialAnalysisFacts {
  const extended = financial.score?.extendedAnalysis as unknown as FinancialExtendedAnalysisFields | undefined
  return {
    statementPeriodStart: financial.statement.statementPeriodStart ? new Date(financial.statement.statementPeriodStart) : null,
    statementPeriodEnd: financial.statement.statementPeriodEnd ? new Date(financial.statement.statementPeriodEnd) : null,
    bankName: financial.statement.bankName,
    accountNumberMasked: financial.statement.accountNumberMasked,
    months: toMonthlyFacts(financial.months),
    riskFlags: financial.riskFlags.map((f) => ({ key: f.key, severity: f.severity, detail: f.detail, evidence: f.evidence as Record<string, unknown>, relatedMonth: f.relatedMonth })),
    totalScore: financial.score?.totalScore ?? null,
    scorePartial: financial.score?.scorePartial ?? true,
    stressIndicator0to100: financial.score?.stressIndicator0to100 ?? 0,
    stressBand: financial.score?.stressBand ?? 'LOW',
    dataQualityTotal: extended?.dataQuality?.finalScore ?? 0,
    relatedPartyEmployer: extended?.eventProfile?.relatedPartyEmployer ?? { detected: false, matchedName: null },
    familyNetwork: extended?.transferProfile?.familyNetwork ?? [],
    fcfReconciliationAvailable: extended?.fcfReconciliation?.availability === 'AVAILABLE',
    fcfUnreconciled: extended?.fcfReconciliation?.unreconciled ?? false,
    missingInformationItems: (extended?.missingInformationRegister ?? []).map((i) => ({ category: i.category, description: i.description })),
  }
}

/**
 * Orchestrates the BBS Master Profile synthesis pipeline (spec Part 52):
 * load both upstream modules' already-COMPLETED output -> validate
 * availability -> align dates -> run deterministic reconciliation -> build
 * facts -> calculate deterministic master attributes -> send normalized
 * facts to AI -> persist -> mark COMPLETED. Never reparses a credit report
 * or bank statement, never recalculates a ratio/score either sibling module
 * already computed.
 */
@Injectable()
export class MasterProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly debtAnalysisService: DebtAnalysisService,
    private readonly financialAnalysisService: FinancialAnalysisService,
    private readonly analysisService: AnalysisService,
  ) {}

  private log(event: string, details: Record<string, string | number | undefined>): void {
    const parts = Object.entries(details)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
    console.log(`[MasterProfile] ${event} ${parts.join(' ')}`)
  }

  /**
   * CCR-initiated generation (first run or explicit "Regenerate") —
   * deliberately never triggered automatically on tab open (spec Part 53).
   * Always appends a new version (same append-only discipline as
   * CustomerProfile) rather than mutating a prior row in place.
   */
  async generate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const [debtAnalysis, financialAnalysis] = await Promise.all([
      this.debtAnalysisService.getForLead(bbsLeadId),
      this.financialAnalysisService.getForLead(bbsLeadId),
    ])

    if (!debtAnalysis.reportAvailable) {
      return { generated: false, reason: 'Debt Analysis has not completed for this lead yet.' }
    }
    if (debtAnalysis.status !== 'COMPLETED') {
      return { generated: false, reason: 'Debt Analysis has not completed for this lead yet.' }
    }
    if (!financialAnalysis.reportAvailable) {
      return { generated: false, reason: 'Financial Analysis has not completed for this lead yet.' }
    }
    if (financialAnalysis.status !== 'COMPLETED') {
      return { generated: false, reason: 'Financial Analysis has not completed for this lead yet.' }
    }

    const customer = await this.prisma.customer.findUnique({ where: { leadId: lead.id } })
    const creditReportRow = await this.prisma.creditReport.findUnique({ where: { leadId: lead.id } })
    // Filtered to COMPLETED — never the unfiltered newest row. financialAnalysis
    // (above) is FinancialAnalysisService.getForLead()'s own result, which
    // itself never lets a later FAILED upload attempt shadow a genuinely
    // COMPLETED analysis; this provenance pointer must reference that SAME
    // completed row, not a newer failed attempt, or sourceBankStatementId/
    // CompletedAt would silently point at data this profile never actually used.
    const bankStatementRow = await this.prisma.bankStatementAnalysis.findFirst({
      where: { leadId: lead.id, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    })

    const previousVersion = await this.prisma.masterProfile.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    const version = (previousVersion?.version ?? 0) + 1

    const profile = await this.prisma.masterProfile.create({
      data: { leadId: lead.id, version, status: 'GENERATING' },
    })

    try {
      const debtFacts = toDebtAnalysisFacts(debtAnalysis)
      const financialFacts = toFinancialAnalysisFacts(financialAnalysis)

      const leadIdentity: LeadIdentityFact = { fullName: lead.fullName, phone: lead.phone, email: lead.email, city: lead.city, panAvailable: lead.panRef !== null, panRef: lead.panRef }
      const customerIdentity: CustomerIdentityFact | null = customer
        ? {
            fullName: customer.fullName,
            phone: customer.phone,
            email: customer.email,
            city: customer.city,
            dateOfBirth: customer.dateOfBirth,
            gender: customer.gender,
            occupation: customer.occupation,
            employmentType: customer.employmentType,
            companyName: customer.companyName,
            designation: customer.designation,
            monthlySalary: customer.monthlySalary?.toNumber() ?? null,
            panAvailable: customer.panRef !== null,
            panRef: customer.panRef,
          }
        : null

      const now = new Date()
      const identitySnapshot = reconcileIdentity(leadIdentity, customerIdentity)
      const dateAlignment = detectDateAlignment(new Date(debtAnalysis.meta.reportDate), financialFacts.statementPeriodStart, financialFacts.statementPeriodEnd)
      const reconciliationRows = buildReconciliationRows(debtFacts.accounts, financialFacts.riskFlags)

      const activeLenderCount = new Set(debtFacts.accounts.filter((a) => a.lifecycleStatus === null || a.lifecycleStatus === 'ACTIVE').map((a) => a.lender)).size || null
      const dsrComparison = compareDebtServicing(debtFacts, financialFacts.months, activeLenderCount, reconciliationRows)
      const stressProfile = synthesizeFinancialStress(debtFacts, financialFacts)
      const complianceRouting = buildComplianceRouting(financialFacts.relatedPartyEmployer, now)
      const postStatementDebt = detectPostStatementDebt(debtFacts.accounts, financialFacts.statementPeriodEnd)
      const familyNetworkVerification = buildFamilyNetworkVerification(financialFacts.familyNetwork)

      const l3Flags = [
        identitySnapshot.panRefConflict ? 'IDENTITY_MISMATCH' : null,
        dateAlignment.warning !== null ? 'DATE_ALIGNMENT_WARNING' : null,
        postStatementDebt.detected ? 'L1_DEBT_POST_STATEMENT' : null,
        'SINGLE_SNAPSHOT', // always true in this architecture — exactly one L1 pull and one current L2 statement are ever reconciled per profile version (v3.0 §4.4.2's own L3-specific flag).
        complianceRouting.complianceHold ? 'COMPLIANCE_HOLD' : null,
      ].filter((f): f is string => f !== null)
      const dataQuality = computeDataQualityBand(debtFacts.dataQualityTotal, financialFacts.dataQualityTotal, debtFacts.dataQualityFlagCodes, financialFacts.riskFlags.map((f) => f.key), l3Flags)

      const alignmentState = classifyAlignment(debtFacts, financialFacts, dsrComparison, stressProfile, dateAlignment, complianceRouting)
      const overallConfidence = assessOverallConfidence(alignmentState, stressProfile, dsrComparison)
      const avgMonthlyIncome = financialFacts.months.length > 0 ? financialFacts.months.reduce((t, m) => t + m.normalizedIncome, 0) / financialFacts.months.length : null
      const avgEssentialExpenses = financialFacts.months.length > 0 ? financialFacts.months.reduce((t, m) => t + m.essentialExpenses, 0) / financialFacts.months.length : 0
      // §16.3's own "inferred family support" monthly estimate — a simple
      // average of the net flow magnitude across every inferred family
      // counterparty, never a fabricated fixed figure.
      const familyNetworkMonthlyEstimate = financialFacts.familyNetwork.length > 0 && financialFacts.months.length > 0 ? financialFacts.familyNetwork.reduce((t, f) => t + Math.abs(f.netFlow ?? 0), 0) / financialFacts.months.length : 0
      const resolutionCapacityResult = computeResolutionCapacity(
        avgMonthlyIncome,
        dsrComparison.masterDsr.availability === 'AVAILABLE' ? dsrComparison.masterDsr.confirmedMonthlyObligations : null,
        avgEssentialExpenses,
        familyNetworkMonthlyEstimate,
        financialFacts.fcfReconciliationAvailable ? !financialFacts.fcfUnreconciled : null,
      )
      const dimensionConfidences = assessDimensionConfidences(identitySnapshot, dataQuality.band, dsrComparison, financialFacts.months.length > 0 ? financialFacts.months.length : null)
      const cohortAttributes = buildCohortAttributeVector(debtFacts, financialFacts.months, dsrComparison, stressProfile, alignmentState, resolutionCapacityResult.level, overallConfidence)
      const { strengths, concerns, opportunitySignals } = detectStrengthsConcernsOpportunities(debtFacts, financialFacts.months, dsrComparison, reconciliationRows)
      const possibleCauses = detectPossibleCauses(debtFacts, financialFacts.months)
      const validationRequired = assessValidationRequired(dsrComparison, reconciliationRows)
      const missingInformation = buildMissingInformationRegister(debtFacts.missingInformationItems, financialFacts.missingInformationItems, complianceRouting, postStatementDebt, familyNetworkVerification)
      const p1Count = missingInformation.filter((i) => i.priority === 'P1').length
      const readinessGate = evaluateReadinessGate(true, dataQuality.band, l3Flags.length, complianceRouting, p1Count, true)

      const masterProfileFacts = {
        identitySnapshot,
        dateAlignment,
        dsrComparison,
        reconciliationRows,
        stressProfile,
        alignmentState,
        resolutionCapacity: resolutionCapacityResult,
        dataQuality,
        complianceRouting,
        postStatementDebt,
        familyNetworkVerification,
        readinessGate,
        dimensionConfidences,
        strengths,
        concerns,
        opportunitySignals,
        possibleCauses,
        validationRequired,
        missingInformation,
        cohortAttributes,
      }

      await this.prisma.$transaction([
        this.prisma.masterProfileReconciliationRow.deleteMany({ where: { masterProfileId: profile.id } }),
        this.prisma.masterProfileReconciliationRow.createMany({
          data: reconciliationRows.map((r) => ({
            masterProfileId: profile.id,
            lender: r.lender,
            product: r.product,
            reportedOutstanding: r.reportedOutstanding,
            reportedEmi: r.reportedEmi,
            observedPayment: r.observedPayment,
            observedFrequencyMonths: r.observedFrequencyMonths,
            matchStatus: r.matchStatus,
            confidence: r.confidence,
            explanation: r.explanation,
          })),
        }),
        this.prisma.masterMissingInformationItem.deleteMany({ where: { masterProfileId: profile.id } }),
        this.prisma.masterMissingInformationItem.createMany({
          data: missingInformation.map((i) => ({ masterProfileId: profile.id, itemText: i.itemText, sourceModule: i.sourceModule, priority: i.priority })),
        }),
        this.prisma.masterProfile.update({
          where: { id: profile.id },
          data: {
            status: 'COMPLETED',
            generatedAt: now,
            l1DataAsOf: new Date(debtAnalysis.meta.reportDate),
            l2DataAsOf: financialFacts.statementPeriodEnd,
            sourceCreditReportId: creditReportRow?.id ?? null,
            sourceCreditReportCompletedAt: creditReportRow?.completedAt ?? null,
            sourceBankStatementAnalysisId: bankStatementRow?.id ?? null,
            sourceBankStatementCompletedAt: bankStatementRow?.completedAt ?? null,
            alignmentState,
            resolutionCapacity: resolutionCapacityResult.level,
            overallConfidence,
            bureauDsrPercent: dsrComparison.bureauDsr.percent,
            bankDsrPercent: dsrComparison.bankDsr.percent,
            masterDsrPercent: dsrComparison.masterDsr.percent,
            dataQualityBand: dataQuality.band,
            dataQualityFlags: dataQuality.flags as unknown as Prisma.InputJsonValue,
            complianceHold: complianceRouting.complianceHold,
            complianceHoldReason: complianceRouting.reason,
            complianceHoldMatchedEntity: complianceRouting.matchedEntity,
            complianceHoldSince: complianceRouting.since ? new Date(complianceRouting.since) : null,
            complianceSlaHours: complianceRouting.slaHours,
            complianceEscalationHours: complianceRouting.escalationHours,
            exceptionStates: l3Flags as unknown as Prisma.InputJsonValue,
            readinessOutcome: readinessGate.outcome,
            readinessConditions: { conditions: readinessGate.conditions, blockingFactors: readinessGate.blockingFactors } as unknown as Prisma.InputJsonValue,
            postStatementDebt: postStatementDebt as unknown as Prisma.InputJsonValue,
            familyNetworkVerification: familyNetworkVerification as unknown as Prisma.InputJsonValue,
            dimensionConfidences: dimensionConfidences as unknown as Prisma.InputJsonValue,
            identitySnapshot: identitySnapshot as unknown as Prisma.InputJsonValue,
            stressProfile: stressProfile as unknown as Prisma.InputJsonValue,
            strengths: strengths as unknown as Prisma.InputJsonValue,
            concerns: concerns as unknown as Prisma.InputJsonValue,
            opportunitySignals: opportunitySignals as unknown as Prisma.InputJsonValue,
            possibleCauses: possibleCauses as unknown as Prisma.InputJsonValue,
            validationRequired: validationRequired as unknown as Prisma.InputJsonValue,
            cohortAttributes: cohortAttributes as unknown as Prisma.InputJsonValue,
          },
        }),
      ])

      this.log('PROFILE_GENERATED', { bbsLeadId, profileId: profile.id, version })

      // Best-effort: advisory AI synthesis never re-triggers generation on failure.
      await this.analysisService
        .createAndRun({ bbsLeadId, jobType: 'MASTER_PROFILE_INSIGHTS', payload: { masterProfileFacts } })
        .catch((error) => {
          this.log('INSIGHTS_JOB_FAILED_TO_START', { bbsLeadId, error: error instanceof Error ? error.message : String(error) })
        })

      return { generated: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown master-profile generation error'
      await this.prisma.masterProfile.update({ where: { id: profile.id }, data: { status: 'FAILED', errorMessage: message } })
      this.log('PROFILE_FAILED', { bbsLeadId, profileId: profile.id, error: message })
      return { generated: false, reason: message }
    }
  }

  async getForLead(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const profile = await this.prisma.masterProfile.findFirst({
      where: { leadId: lead.id },
      orderBy: { version: 'desc' },
      include: { reconciliationRows: true, missingInformation: true },
    })

    if (!profile) {
      const [debtAnalysis, financialAnalysis] = await Promise.all([
        this.debtAnalysisService.getForLead(bbsLeadId),
        this.financialAnalysisService.getForLead(bbsLeadId),
      ])
      const debtReady = debtAnalysis.reportAvailable && debtAnalysis.status === 'COMPLETED'
      const financialReady = financialAnalysis.reportAvailable && financialAnalysis.status === 'COMPLETED'
      return { profileAvailable: false as const, debtAnalysisReady: debtReady, financialAnalysisReady: financialReady }
    }

    if (profile.status !== 'COMPLETED') {
      return { profileAvailable: true as const, status: profile.status, errorMessage: profile.errorMessage }
    }

    const [currentCreditReport, currentBankStatement] = await Promise.all([
      this.prisma.creditReport.findUnique({ where: { leadId: lead.id } }),
      // Same COMPLETED filter as generate()'s own provenance capture — a
      // newer FAILED upload attempt must never flip this profile to "stale"
      // on its own; only a genuinely newer COMPLETED analysis should.
      this.prisma.bankStatementAnalysis.findFirst({ where: { leadId: lead.id, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } }),
    ])
    const isStale =
      (currentCreditReport?.completedAt?.getTime() ?? null) !== (profile.sourceCreditReportCompletedAt?.getTime() ?? null) ||
      (currentBankStatement?.completedAt?.getTime() ?? null) !== (profile.sourceBankStatementCompletedAt?.getTime() ?? null)

    const insightsJob = await this.prisma.analysisJob.findFirst({
      where: { leadId: lead.id, jobType: 'MASTER_PROFILE_INSIGHTS' },
      orderBy: { createdAt: 'desc' },
      include: { result: true },
    })
    const insights = insightsJob
      ? {
          status: insightsJob.status,
          findings: insightsJob.result?.findings as Record<string, unknown> | undefined,
          confidence: insightsJob.result?.confidence ?? null,
          modelVersion: insightsJob.result?.modelVersion,
          generatedAt: insightsJob.result?.createdAt.toISOString(),
        }
      : null

    return {
      profileAvailable: true as const,
      status: 'COMPLETED' as const,
      version: profile.version,
      generatedAt: profile.generatedAt?.toISOString() ?? null,
      isStale,
      alignmentState: profile.alignmentState,
      resolutionCapacity: profile.resolutionCapacity,
      overallConfidence: profile.overallConfidence,
      bureauDsrPercent: profile.bureauDsrPercent,
      bankDsrPercent: profile.bankDsrPercent,
      masterDsrPercent: profile.masterDsrPercent,
      identitySnapshot: profile.identitySnapshot,
      stressProfile: profile.stressProfile,
      strengths: profile.strengths,
      concerns: profile.concerns,
      opportunitySignals: profile.opportunitySignals,
      possibleCauses: profile.possibleCauses,
      validationRequired: profile.validationRequired,
      cohortAttributes: profile.cohortAttributes,
      l1DataAsOf: profile.l1DataAsOf?.toISOString() ?? null,
      l2DataAsOf: profile.l2DataAsOf?.toISOString() ?? null,
      dataQuality: profile.dataQualityBand ? { band: profile.dataQualityBand, flags: (profile.dataQualityFlags as string[] | null) ?? [] } : undefined,
      complianceRouting: {
        complianceHold: profile.complianceHold,
        reason: profile.complianceHoldReason,
        matchedEntity: profile.complianceHoldMatchedEntity,
        since: profile.complianceHoldSince?.toISOString() ?? null,
        slaHours: profile.complianceSlaHours,
        escalationHours: profile.complianceEscalationHours,
      },
      postStatementDebt: profile.postStatementDebt ?? undefined,
      readinessGate: profile.readinessOutcome
        ? {
            conditions: (profile.readinessConditions as unknown as { conditions: ReadinessConditionResult[]; blockingFactors: string[] } | null)?.conditions ?? [],
            outcome: profile.readinessOutcome,
            blockingFactors: (profile.readinessConditions as unknown as { conditions: ReadinessConditionResult[]; blockingFactors: string[] } | null)?.blockingFactors ?? [],
          }
        : undefined,
      dimensionConfidences: profile.dimensionConfidences ?? undefined,
      familyNetworkVerification: profile.familyNetworkVerification ?? undefined,
      missingInformation: profile.missingInformation.map((i) => ({ itemText: i.itemText, sourceModule: i.sourceModule, priority: i.priority, resolved: i.resolved })),
      // Decimal -> number at this boundary, matching Debt/Financial
      // Analysis's own convention — never a raw Prisma Decimal reaching the API.
      reconciliationRows: profile.reconciliationRows.map((r) => ({
        lender: r.lender,
        product: r.product,
        reportedOutstanding: r.reportedOutstanding?.toNumber() ?? null,
        reportedEmi: r.reportedEmi?.toNumber() ?? null,
        observedPayment: r.observedPayment?.toNumber() ?? null,
        observedFrequencyMonths: r.observedFrequencyMonths,
        matchStatus: r.matchStatus,
        confidence: r.confidence,
        explanation: r.explanation,
      })),
      insights,
    }
  }
}
