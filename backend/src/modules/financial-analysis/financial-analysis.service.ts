import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { BankStatementAnalysis, Prisma } from '@prisma/client'

import { PrismaService } from '@/common/prisma/prisma.service'
import type { AppConfig } from '@/config/configuration'
import { AnalysisService } from '@/modules/analysis/analysis.service'
import { detectBorrowingDependencyPattern } from './classification/borrowing-pattern-detector'
import { detectBounceEvidence, summarizeBounces } from './classification/bounce-detector'
import { classifyAllTransactions } from './classification/classify-transaction'
import { detectFamilyNetwork } from './classification/family-network-detector'
import { detectLargeTransactions } from './classification/large-transaction-detector'
import { parseAllNarrationDetails } from './classification/narration-detail-parser'
import { detectP2PCounterparties } from './classification/p2p-detector'
import { detectRecurringDebtPayments } from './classification/recurring-debt-detector'
import { detectRecurringIncome } from './classification/recurring-income-detector'
import { detectRoundTrips } from './classification/round-trip-detector'
import { detectSelfTransfer } from './classification/self-transfer-detector'
import { detectTransactionModes } from './classification/transaction-mode-detector'
import { correlateWithCreditReport } from './correlation/credit-correlation'
import type {
  CreditAccountCorrelationInput,
  FinancialAnalysisConfig,
  MonthlyFinancialAggregateInput,
  NormalizedTransactionInput,
} from './financial-analysis.types'
import { aggregateMonthly } from './aggregation/monthly-aggregator'
import { normalizeTransactions } from './normalization/normalize-transactions'
import { parseCsvStatement } from './parsers/csv-statement-parser'
import { parsePdfStatement } from './parsers/pdf-statement-parser'
import { StatementParseError, type StatementMetadata } from './parsers/types'
import { parseXlsxStatement } from './parsers/xlsx-statement-parser'
import {
  borrowingDependencyScore,
  cashFlowStrengthScore,
  creditPaymentBehaviourScore,
  debtServicingCapacityScore,
  expenseBehaviourScore,
  financialStressIndicator,
  incomeStabilityScore,
  liquidityScore,
  stressSignalsScore,
  transactionAccountBehaviourScore,
} from './scoring/financial-health-scoring'
import { buildFinancialRiskFlags } from './scoring/financial-risk-flags'
import {
  buildDataQualityScore,
  buildEventProfile,
  buildExtendedRiskFlags,
  buildMissingInformationRegister,
  buildTransferProfile,
  checkBalanceReconciliation,
  computeDsrBreakdown,
  computeFcfReconciliation,
  computeScoreCashflowDivergence,
} from './calculations/extended-metrics'
import {
  detectBonuses,
  detectBusinessPersonalMixing,
  detectIncomeTransition,
  detectMedicalEvents,
  detectRelatedPartyEmployer,
} from './calculations/behavioural-event-detectors'
import { buildCcrBrief, buildCohortSignalPackage } from './calculations/handoff-contracts'
import { buildIncomeProfile, computeDaysToNextIncome } from './calculations/income-profile'
import { buildFinalSummary, buildReviewChecklist, buildWhatL2CannotDecide } from './calculations/final-summary'

const MIME_TO_FORMAT: Record<string, 'PDF' | 'XLSX' | 'CSV'> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/csv': 'CSV',
}

interface RunParams {
  analysisId: string
  leadId: string
  bbsLeadId: string
  buffer: Buffer
  format: 'PDF' | 'XLSX' | 'CSV'
}

const BANK_STATEMENT_ANALYSIS_INCLUDE = {
  score: true,
  riskFlags: true,
  months: { orderBy: { periodMonth: 'asc' } },
  transactions: { orderBy: { transactionDate: 'asc' } },
} satisfies Prisma.BankStatementAnalysisInclude

type CompletedBankStatementAnalysis = Prisma.BankStatementAnalysisGetPayload<{ include: typeof BANK_STATEMENT_ANALYSIS_INCLUDE }>

/**
 * Orchestrates the BBS Financial Analysis pipeline: UPLOADED -> EXTRACTING
 * -> NORMALIZING -> CLASSIFYING -> ANALYZING -> COMPLETED/FAILED (the
 * spec's own exact lifecycle). Every stage transition is persisted as it
 * happens (not just at the end), mirroring BureauReportService's own
 * reserve-before-work discipline — `documentId @unique` on
 * BankStatementAnalysis is what actually prevents a document from being
 * processed twice concurrently.
 */
@Injectable()
export class FinancialAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly analysisService: AnalysisService,
  ) {}

  private get config(): FinancialAnalysisConfig {
    return this.configService.get<AppConfig>('app')!.financialAnalysis
  }

  private log(event: string, details: Record<string, string | number | undefined>): void {
    const parts = Object.entries(details)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
    console.log(`[FinancialAnalysis] ${event} ${parts.join(' ')}`)
  }

  private resolveFormat(mimeType: string): 'PDF' | 'XLSX' | 'CSV' {
    const format = MIME_TO_FORMAT[mimeType]
    if (!format) {
      throw new StatementParseError(`Unsupported bank statement file type "${mimeType}".`, 'UNSUPPORTED_LAYOUT')
    }
    return format
  }

  /**
   * Fire-and-forget entry point, called from DocumentsService.upload() —
   * callers must never `await` this on the request path; it deliberately
   * never throws (same contract as BureauReportService.triggerForLead).
   */
  async createAndRun(params: { leadId: string; bbsLeadId: string; documentId: string; buffer: Buffer; mimeType: string }): Promise<void> {
    try {
      const format = this.resolveFormat(params.mimeType)

      let analysis: BankStatementAnalysis
      try {
        analysis = await this.prisma.bankStatementAnalysis.create({
          data: { leadId: params.leadId, documentId: params.documentId, status: 'UPLOADED', sourceFileFormat: format },
        })
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          this.log('ANALYSIS_ALREADY_RESERVED', { bbsLeadId: params.bbsLeadId, documentId: params.documentId })
          return
        }
        throw error
      }

      this.log('ANALYSIS_RESERVED', { bbsLeadId: params.bbsLeadId, analysisId: analysis.id })
      void this.run({ analysisId: analysis.id, leadId: params.leadId, bbsLeadId: params.bbsLeadId, buffer: params.buffer, format })
    } catch (error) {
      this.log('TRIGGER_FAILED_UNEXPECTEDLY', { bbsLeadId: params.bbsLeadId, error: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Re-runs the full pipeline against an already-uploaded document's bytes — used by the Documents reprocess endpoint. Never re-reads/re-uploads a new file. */
  async reprocessFromBuffer(bbsLeadId: string, documentId: string, buffer: Buffer, mimeType: string): Promise<{ reprocessed: boolean; reason?: string }> {
    const existing = await this.prisma.bankStatementAnalysis.findUnique({ where: { documentId } })
    if (!existing) {
      return { reprocessed: false, reason: 'No financial analysis record exists yet for this document.' }
    }

    const format = this.resolveFormat(mimeType)
    await this.prisma.bankStatementAnalysis.update({
      where: { id: existing.id },
      data: { status: 'UPLOADED', errorMessage: null, errorCode: null, sourceFileFormat: format },
    })
    void this.run({ analysisId: existing.id, leadId: existing.leadId, bbsLeadId, buffer, format })
    return { reprocessed: true }
  }

  private async run(params: RunParams): Promise<void> {
    const { analysisId } = params
    try {
      await this.prisma.bankStatementAnalysis.update({ where: { id: analysisId }, data: { status: 'EXTRACTING' } })
      const parser = params.format === 'CSV' ? parseCsvStatement : params.format === 'XLSX' ? parseXlsxStatement : parsePdfStatement
      const parseResult = await parser(params.buffer)

      await this.prisma.bankStatementAnalysis.update({ where: { id: analysisId }, data: { status: 'NORMALIZING' } })
      const { transactions: normalized, warnings: normalizeWarnings } = normalizeTransactions(
        parseResult.rows,
        { isPdfSource: params.format === 'PDF' },
        this.config,
      )

      await this.prisma.bankStatementAnalysis.update({ where: { id: analysisId }, data: { status: 'CLASSIFYING' } })
      // Fetched before recurring-income detection (not after, as before)
      // so a recurring credit with no income keyword can be cross-checked
      // against real bureau lenders before ever being considered for
      // promotion to income — see detectRecurringIncome's own doc comment.
      const creditAccounts = await this.readCreditAccountsForCorrelation(params.leadId)
      // The CRM's own record of the customer's name — used ONLY as a
      // stronger self-transfer/family-surname signal (detectSelfTransfer's
      // own `accountHolderName` parameter already supported this; it was
      // simply never wired up before). NEVER mixed into the statement's own
      // extracted identity fields (metadata.accountHolderName) — those stay
      // a separate, statement-header-only concept (see buildSummary).
      const lead = await this.prisma.lead.findUnique({ where: { id: params.leadId }, select: { fullName: true } })
      const otherStatementsOnFileCount = await this.prisma.bankStatementAnalysis.count({
        where: { leadId: params.leadId, status: 'COMPLETED', id: { not: analysisId } },
      })

      let transactions: NormalizedTransactionInput[] = classifyAllTransactions(normalized)
      transactions = detectTransactionModes(transactions)
      transactions = parseAllNarrationDetails(transactions)
      transactions = detectSelfTransfer(transactions, lead?.fullName ?? null)
      const roundTripResult = detectRoundTrips(transactions)
      transactions = roundTripResult.transactions
      const p2pResult = detectP2PCounterparties(transactions)
      transactions = p2pResult.transactions
      const recurringIncome = detectRecurringIncome(transactions, this.config, creditAccounts)
      transactions = recurringIncome.transactions
      const bonusResult = detectBonuses(transactions, recurringIncome.sources, this.config)
      transactions = bonusResult.transactions
      const recurringDebt = detectRecurringDebtPayments(transactions, this.config)
      transactions = recurringDebt.transactions
      transactions = detectBounceEvidence(transactions)

      await this.prisma.bankStatementAnalysis.update({ where: { id: analysisId }, data: { status: 'ANALYZING' } })
      const months = aggregateMonthly(transactions, this.config)
      const { openingBalance, closingBalance } = this.deriveBalances(transactions)

      const summary = this.buildSummary({
        bbsLeadId: params.bbsLeadId,
        transactions,
        months,
        creditAccounts,
        recurringIncomeSources: recurringIncome.sources,
        recurringDebtPayments: recurringDebt.payments,
        p2pResult,
        roundTripPairs: roundTripResult.pairs,
        bonuses: bonusResult.bonuses,
        accountHolderName: lead?.fullName ?? null,
        otherStatementsOnFileCount,
        openingBalance,
        closingBalance,
        metadata: parseResult.metadata,
      })

      await this.persistResults(analysisId, params.leadId, transactions, months, summary, normalizeWarnings.concat(parseResult.warnings), parseResult.metadata, openingBalance, closingBalance)

      this.log('ANALYSIS_COMPLETED', { bbsLeadId: params.bbsLeadId, analysisId })

      // Best-effort: advisory AI insights never re-trigger reprocessing on failure.
      await this.analysisService
        .createAndRun({ bbsLeadId: params.bbsLeadId, jobType: 'FINANCIAL_ANALYSIS_INSIGHTS', payload: { financialAnalysis: summary } })
        .catch((error) => {
          this.log('INSIGHTS_JOB_FAILED_TO_START', { bbsLeadId: params.bbsLeadId, error: error instanceof Error ? error.message : String(error) })
        })
    } catch (error) {
      const code = error instanceof StatementParseError ? error.code : 'UNKNOWN'
      const message = error instanceof Error ? error.message : 'Unknown financial-analysis error'
      await this.prisma.bankStatementAnalysis.update({
        where: { id: analysisId },
        data: { status: 'FAILED', errorCode: code, errorMessage: message, completedAt: new Date() },
      })
      this.log('ANALYSIS_FAILED', { bbsLeadId: params.bbsLeadId, analysisId, errorCode: code })
    }
  }

  private async readCreditAccountsForCorrelation(leadId: string): Promise<CreditAccountCorrelationInput[]> {
    const report = await this.prisma.creditReport.findUnique({
      where: { leadId },
      include: { accounts: { select: { lender: true, monthlyEmiAmount: true, lifecycleStatus: true, openedOn: true } } },
    })
    if (!report) return []
    return report.accounts.map((a) => ({
      lender: a.lender,
      monthlyEmiAmount: a.monthlyEmiAmount?.toNumber() ?? null,
      lifecycleStatus: a.lifecycleStatus,
      openedOn: a.openedOn,
    }))
  }

  /**
   * Shared by buildSummary() (for the reconciliation check) and
   * persistResults() (for the persisted BankStatementAnalysis row) — a
   * single real derivation, never computed twice independently (which
   * previously risked the two call sites silently drifting).
   */
  private deriveBalances(transactions: NormalizedTransactionInput[]): { openingBalance: number | null; closingBalance: number | null } {
    const byDateAsc = [...transactions].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime())
    const firstWithBalance = byDateAsc.find((t) => t.balance !== null)
    const lastWithBalance = [...byDateAsc].reverse().find((t) => t.balance !== null)
    const openingBalance = firstWithBalance
      ? firstWithBalance.balance! - (firstWithBalance.direction === 'CREDIT' ? firstWithBalance.amount : -firstWithBalance.amount)
      : null
    const closingBalance = lastWithBalance?.balance ?? null
    return { openingBalance, closingBalance }
  }

  private buildSummary(params: {
    bbsLeadId: string
    transactions: NormalizedTransactionInput[]
    months: MonthlyFinancialAggregateInput[]
    creditAccounts: CreditAccountCorrelationInput[]
    recurringIncomeSources: ReturnType<typeof detectRecurringIncome>['sources']
    recurringDebtPayments: ReturnType<typeof detectRecurringDebtPayments>['payments']
    p2pResult: ReturnType<typeof detectP2PCounterparties>
    roundTripPairs: ReturnType<typeof detectRoundTrips>['pairs']
    bonuses: ReturnType<typeof detectBonuses>['bonuses']
    accountHolderName: string | null
    otherStatementsOnFileCount: number
    openingBalance: number | null
    closingBalance: number | null
    metadata: StatementMetadata
  }) {
    const {
      transactions,
      months,
      creditAccounts,
      recurringIncomeSources,
      recurringDebtPayments,
      p2pResult,
      roundTripPairs,
      bonuses,
      accountHolderName,
      otherStatementsOnFileCount,
      openingBalance,
      closingBalance,
      metadata,
    } = params
    const recurringIncomeSourceCount = recurringIncomeSources.length
    const referenceDate = transactions.length > 0 ? transactions[transactions.length - 1].transactionDate : new Date()
    const bounceSummary = summarizeBounces(transactions, referenceDate)
    const activeLenderCount = new Set(creditAccounts.map((a) => a.lender)).size || null

    const incomeStability = incomeStabilityScore(months, recurringIncomeSourceCount)
    const cashFlowStrength = cashFlowStrengthScore(months)
    const debtServicing = debtServicingCapacityScore(months, activeLenderCount)
    const liquidity = liquidityScore(months, this.config.lowBalanceThresholdRupees)
    const expenseBehaviour = expenseBehaviourScore(months)
    const borrowingDependency = borrowingDependencyScore(months)
    const creditPaymentBehaviour = creditPaymentBehaviourScore(months)
    const transactionBehaviour = transactionAccountBehaviourScore(transactions, months)

    const stressInputs = {
      months,
      confirmedBounceCount: bounceSummary.confirmedCount,
      activeLenderCount,
      dsrPercent: (debtServicing.evidence.dsrPercent as number) ?? null,
      borrowingDependencyPercent: (borrowingDependency.evidence.dependencyPercent as number) ?? null,
      creditPaymentIntensityPercent: (creditPaymentBehaviour.evidence.intensityPercent as number) ?? null,
    }
    const stressSignals = stressSignalsScore(stressInputs)
    const stressIndicator = financialStressIndicator(stressInputs)

    const components = { incomeStability, cashFlowStrength, debtServicing, liquidity, expenseBehaviour, borrowingDependency, creditPaymentBehaviour, transactionBehaviour, stressSignals }
    const availableScores = Object.values(components)
      .map((c) => c.score)
      .filter((s): s is number => s !== null)
    const totalScore = availableScores.length > 0 ? availableScores.reduce((a, b) => a + b, 0) : null
    const scorePartial = Object.values(components).some((c) => c.availability !== 'AVAILABLE')
    // "62 of 85 assessable points," never a misleading "62 / 100" — only
    // components that actually contributed to totalScore count toward the
    // achievable max (never converts an unavailable component into 0).
    const maxAchievablePoints = Object.values(components)
      .filter((c) => c.availability === 'AVAILABLE')
      .reduce((sum, c) => sum + c.maxPoints, 0)
    const componentDetails = Object.fromEntries(
      Object.entries(components).map(([key, c]) => [key, { available: c.availability === 'AVAILABLE', earnedPoints: c.score, maxPoints: c.maxPoints, reason: c.detail, availability: c.availability }]),
    )

    const largeTransactions = detectLargeTransactions(transactions, this.config)
    const borrowingDependencyPatternDetected = detectBorrowingDependencyPattern(transactions, this.config)

    const reconciliation = checkBalanceReconciliation(openingBalance, closingBalance, months, this.config.balanceReconciliationToleranceRupees)
    const fcfReconciliation = computeFcfReconciliation(months, this.config.fcfUnreconciledGapPercentThreshold)
    const dsrBreakdown = computeDsrBreakdown(months)

    const familyNetwork = detectFamilyNetwork(p2pResult.counterparties, accountHolderName)
    const incomeTransition = detectIncomeTransition(months, this.config)
    const medicalEvents = detectMedicalEvents(transactions, months, this.config)
    const relatedPartyEmployer = detectRelatedPartyEmployer(recurringIncomeSources, transactions, this.config)
    const businessPersonalMixed = detectBusinessPersonalMixing(transactions)

    const extendedRiskFlags = buildExtendedRiskFlags({
      months,
      incomeStability,
      reconciliation,
      fcfReconciliation,
      config: this.config,
      normalizedTransactions: transactions,
      p2pCounterparties: p2pResult.counterparties,
      roundTripPairCount: roundTripPairs.length,
      familyNetworkEntryCount: familyNetwork.length,
      businessPersonalMixed,
      incomeTransition,
      medicalEvents,
      relatedPartyEmployer,
      bonusCount: bonuses.length,
    })

    const riskFlags = [
      ...buildFinancialRiskFlags({
        transactions,
        months,
        incomeStability,
        cashFlowStrength,
        debtServicing,
        liquidity,
        expenseBehaviour,
        borrowingDependency,
        creditPaymentBehaviour,
        transactionBehaviour,
        bounceSummary,
        recurringP2pCounterpartyCount: p2pResult.counterparties.filter((c) => c.recurring).length,
        unclassifiedP2pCount: p2pResult.unclassifiedP2pCount,
        largeTransactionCount: largeTransactions.length,
        borrowingDependencyPatternDetected,
      }),
      ...correlateWithCreditReport(recurringDebtPayments, creditAccounts, this.config).flags,
      ...extendedRiskFlags,
    ]

    const otherAccountsLikelyFlag = extendedRiskFlags.find((f) => f.key === 'OTHER_ACCOUNTS_LIKELY')
    const scoreCashflowDivergence = computeScoreCashflowDivergence(totalScore, months, liquidity, fcfReconciliation.unreconciled, riskFlags)
    const statementHeaderFieldsPresent = [
      metadata.bankName,
      metadata.accountNumberMasked,
      metadata.statementPeriodStart,
      metadata.statementPeriodEnd,
      metadata.accountHolderName,
      metadata.ifscCode,
    ].filter((v) => v !== null && v !== undefined).length
    const dataQuality = buildDataQualityScore({
      monthsCovered: months.length,
      idealMonthsCovered: 12,
      reconciliation,
      transactions,
      statementHeaderFieldsPresent,
      statementHeaderFieldsTotal: 6,
      otherAccountsLikely: otherAccountsLikelyFlag ? true : false,
      fcfUnreconciled: fcfReconciliation.unreconciled,
      businessPersonalMixed,
      config: this.config,
    })
    const unclassifiedSharePercent = transactions.length > 0 ? (transactions.filter((t) => t.category === 'UNCLASSIFIED').length / transactions.length) * 100 : 0
    const missingInformationRegister = buildMissingInformationRegister({
      hasAnyBalanceData: months.some((m) => m.closingBalance !== null),
      hasAccountHolderName: metadata.accountHolderName !== null,
      hasIfscOrAccountType: metadata.ifscCode !== null || metadata.accountType !== null,
      otherStatementsOnFileCount,
      familyNetworkEntryCount: familyNetwork.length,
      businessPersonalMixed,
    })

    const transferProfile = buildTransferProfile(transactions, p2pResult.counterparties, roundTripPairs, familyNetwork, p2pResult.unclassifiedP2pCount, this.config)
    const eventProfile = buildEventProfile(incomeTransition, bonuses, medicalEvents, relatedPartyEmployer, otherAccountsLikelyFlag ? true : false)
    const scoreBand = this.financialHealthScoreBand(totalScore)
    // Computed here (not after ccrBrief/cohortSignalPackage, as before) so
    // both handoff contracts can carry the real tenure/confidence instead of
    // a placeholder string.
    const incomeProfile = buildIncomeProfile(recurringIncomeSources)

    const ccrBrief = buildCcrBrief({
      caseId: params.bbsLeadId,
      statementPeriodStart: metadata.statementPeriodStart,
      statementPeriodEnd: metadata.statementPeriodEnd,
      banks: [metadata.bankName].filter((b): b is string => !!b),
      accountsMasked: [metadata.accountNumberMasked].filter((a): a is string => !!a),
      monthsCovered: months.length,
      transactionCount: transactions.length,
      reconciliation,
      totalScore,
      scoreBand,
      components,
      dataQuality,
      months,
      incomeStability,
      debtServicing,
      dsrBreakdown,
      activeLenderCount,
      fcfReconciliation,
      liquidity,
      transactionBehaviour,
      transferProfile,
      eventProfile,
      riskFlags,
      missingInformationRegister,
      incomeProfile,
    })
    const cohortSignalPackage = buildCohortSignalPackage({
      months,
      recurringIncomeSourceCount,
      incomeStability,
      dsrBreakdown,
      activeLenderCount,
      fcfReconciliation,
      borrowingDependency,
      liquidity,
      confirmedBounceCount: bounceSummary.confirmedCount,
      possibleBounceCount: bounceSummary.possibleCount,
      transactionBehaviour,
      riskFlags,
      transferProfile,
      eventProfile,
      businessPersonalMixed,
      unclassifiedSharePercent,
      totalScore,
      scoreBand,
      dataQuality,
      missingInformationRegister,
      incomeProfile,
    })

    const primaryIncomeSource = recurringIncomeSources[0] ?? null
    const daysToNextIncome = computeDaysToNextIncome(transactions, primaryIncomeSource, referenceDate, this.config)
    const narrationParsedCount = transactions.filter(
      (t) => t.narrationDetail && (t.narrationDetail.referenceNumber || t.narrationDetail.counterpartyRaw || t.narrationDetail.purpose || t.narrationDetail.counterpartyBank),
    ).length

    const whatL2CannotDecide = buildWhatL2CannotDecide()
    const reviewChecklist = buildReviewChecklist({
      monthsCovered: months.length,
      transactionCount: transactions.length,
      narrationParsedCount,
      reconciliation,
      transferProfile,
      incomeStability,
      eventProfile,
      expenseBehaviour,
      activeLenderCount,
      dsrBreakdown,
      fcfReconciliation,
      liquidity,
      totalScore,
      scoreBand,
      stressBand: stressIndicator.band,
      dataQuality,
      missingInformationRegister,
    })
    const finalSummary = buildFinalSummary({
      incomeStability,
      eventProfile,
      transferProfile,
      fcfReconciliation,
      debtServicing,
      liquidity,
      borrowingDependency,
      creditPaymentBehaviour,
      businessPersonalMixed,
      totalScore,
      scoreBand,
      stressBand: stressIndicator.band,
      stressValue: stressIndicator.value,
      dataQuality,
      divergent: scoreCashflowDivergence.divergent,
      riskFlags,
    })

    return {
      components,
      totalScore,
      scorePartial,
      maxAchievablePoints,
      componentDetails,
      stressIndicator,
      riskFlags,
      largeTransactions,
      bounceSummary,
      recurringIncomeSources: recurringIncomeSourceCount,
      extendedAnalysis: {
        reconciliation,
        fcfReconciliation,
        dsrBreakdown,
        scoreCashflowDivergence,
        dataQuality,
        missingInformationRegister,
        transferProfile,
        eventProfile,
        ccrBrief,
        cohortSignalPackage,
        incomeProfile,
        daysToNextIncome,
        whatL2CannotDecide,
        reviewChecklist,
        finalSummary,
      },
    }
  }

  /**
   * Descriptive bands only — reuses the v4.0 spec's own 100-point band
   * boundaries (§14.2: 80-100/60-79/40-59/20-39/0-19) purely as a label for
   * the EXISTING 9-component totalScore. This is NOT the spec's 5-component
   * formula (see this module's own README note on the 9-vs-5-component
   * fork) — only the band NAMES/boundaries are reused, since they're a
   * sensible partition of any 100-point score, not specific to which
   * formula filled it.
   */
  private financialHealthScoreBand(totalScore: number | null): string {
    if (totalScore === null) return 'Not available'
    if (totalScore >= 80) return 'Healthy'
    if (totalScore >= 60) return 'Stable'
    if (totalScore >= 40) return 'Under Pressure'
    if (totalScore >= 20) return 'Stressed'
    return 'Critical'
  }

  private async persistResults(
    analysisId: string,
    leadId: string,
    transactions: NormalizedTransactionInput[],
    months: MonthlyFinancialAggregateInput[],
    summary: ReturnType<typeof this.buildSummary>,
    parserWarnings: string[],
    metadata: StatementMetadata,
    openingBalance: number | null,
    closingBalance: number | null,
  ): Promise<void> {
    const c = summary.components
    const byDateAsc = [...transactions].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime())

    // Statement period: prefer the document's own explicit period line
    // (statement-metadata-extractor.ts); fall back to the actual earliest/
    // latest transaction dates only when no such line was found — never a
    // guessed/assumed span (e.g. never assumed to be exactly 12 months).
    const statementPeriodStart = metadata.statementPeriodStart ?? (byDateAsc.length > 0 ? byDateAsc[0].transactionDate : null)
    const statementPeriodEnd = metadata.statementPeriodEnd ?? (byDateAsc.length > 0 ? byDateAsc[byDateAsc.length - 1].transactionDate : null)

    await this.prisma.$transaction([
      // Reprocess-safety: delete-then-recreate, never an in-place partial patch (same discipline as BureauReportService.persistFetchedReport for CreditAccount rows).
      this.prisma.normalizedTransaction.deleteMany({ where: { analysisId } }),
      this.prisma.monthlyFinancialAggregate.deleteMany({ where: { analysisId } }),
      this.prisma.financialRiskFlag.deleteMany({ where: { analysisId } }),
      this.prisma.financialHealthScore.deleteMany({ where: { analysisId } }),
      this.prisma.normalizedTransaction.createMany({
        data: transactions.map((t) => ({
          analysisId,
          leadId,
          sourceDocumentId: analysisId, // the one document this analysis was created from — see BankStatementAnalysis.documentId
          transactionDate: t.transactionDate,
          valueDate: t.valueDate,
          narration: t.narration,
          amount: t.amount,
          direction: t.direction,
          balance: t.balance,
          counterparty: t.counterparty,
          transactionType: t.transactionType,
          category: t.category,
          subcategory: t.subcategory,
          lender: t.lender,
          confidence: t.confidence,
          evidenceLevel: t.evidenceLevel,
          bounceEvidence: t.bounceEvidence,
          sourceRowRef: t.sourceRowRef,
          narrationDetail: t.narrationDetail as unknown as Prisma.InputJsonValue,
        })),
      }),
      this.prisma.monthlyFinancialAggregate.createMany({
        data: months.map((m) => ({ analysisId, leadId, ...m })),
      }),
      this.prisma.financialHealthScore.create({
        data: {
          analysisId,
          incomeStabilityScore: c.incomeStability.score,
          incomeStabilityAvailability: c.incomeStability.availability,
          cashFlowStrengthScore: c.cashFlowStrength.score,
          cashFlowStrengthAvailability: c.cashFlowStrength.availability,
          debtServicingCapacityScore: c.debtServicing.score,
          debtServicingCapacityAvailability: c.debtServicing.availability,
          liquidityScore: c.liquidity.score,
          liquidityAvailability: c.liquidity.availability,
          expenseBehaviourScore: c.expenseBehaviour.score,
          expenseBehaviourAvailability: c.expenseBehaviour.availability,
          borrowingDependencyScore: c.borrowingDependency.score,
          borrowingDependencyAvailability: c.borrowingDependency.availability,
          creditPaymentBehaviourScore: c.creditPaymentBehaviour.score,
          creditPaymentBehaviourAvailability: c.creditPaymentBehaviour.availability,
          transactionBehaviourScore: c.transactionBehaviour.score,
          transactionBehaviourAvailability: c.transactionBehaviour.availability,
          stressSignalsScore: c.stressSignals.score,
          stressSignalsAvailability: c.stressSignals.availability,
          totalScore: summary.totalScore,
          scorePartial: summary.scorePartial,
          maxAchievablePoints: summary.maxAchievablePoints,
          componentDetails: summary.componentDetails as unknown as Prisma.InputJsonValue,
          stressIndicator0to100: summary.stressIndicator.value,
          stressBand: summary.stressIndicator.band,
          extendedAnalysis: summary.extendedAnalysis as unknown as Prisma.InputJsonValue,
        },
      }),
      ...(summary.riskFlags.length > 0
        ? [
            this.prisma.financialRiskFlag.createMany({
              data: summary.riskFlags.map((f) => ({
                analysisId,
                key: f.key,
                severity: f.severity,
                detail: f.detail,
                evidence: f.evidence as Prisma.InputJsonValue,
              })),
            }),
          ]
        : []),
      this.prisma.bankStatementAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'COMPLETED',
          transactionCount: transactions.length,
          monthsCovered: months.length,
          bankName: metadata.bankName,
          accountNumberMasked: metadata.accountNumberMasked,
          accountHolderName: metadata.accountHolderName,
          ifscCode: metadata.ifscCode,
          accountType: metadata.accountType,
          statementPeriodStart,
          statementPeriodEnd,
          openingBalance,
          closingBalance,
          parserWarnings: parserWarnings.length > 0 ? parserWarnings : undefined,
          completedAt: new Date(),
        },
      }),
    ])
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002'
  }

  /** Read-assembly for GET /leads/:bbsLeadId/financial-analysis — never recomputes from scratch; reads the persisted result of the last completed run. */
  async getForLead(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const analysis = await this.prisma.bankStatementAnalysis.findFirst({
      where: { leadId: lead.id },
      orderBy: { createdAt: 'desc' },
      include: BANK_STATEMENT_ANALYSIS_INCLUDE,
    })

    if (!analysis) return { reportAvailable: false as const }
    if (analysis.status !== 'COMPLETED' && analysis.status !== 'FAILED') {
      return { reportAvailable: true as const, status: analysis.status }
    }
    if (analysis.status === 'FAILED') {
      // The newest upload attempt failed — but it must never silently
      // shadow a genuinely COMPLETED earlier analysis for this lead (e.g.
      // a bad re-upload after an already-successful one). If one exists,
      // it is still returned as the primary report (so the CCR, and every
      // downstream consumer of getForLead(), keeps seeing the last
      // known-good data) with the failed attempt surfaced alongside via
      // `latestUploadFailed` — never hidden, so this is never "quietly
      // showing an old report as if it were new."
      const lastCompleted = await this.prisma.bankStatementAnalysis.findFirst({
        where: { leadId: lead.id, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        include: BANK_STATEMENT_ANALYSIS_INCLUDE,
      })
      if (lastCompleted) {
        const completed = await this.buildCompletedResponse(lead.id, lastCompleted)
        return {
          ...completed,
          latestUploadFailed: {
            documentId: analysis.documentId,
            errorMessage: analysis.errorMessage,
            errorCode: analysis.errorCode,
            uploadedAt: analysis.createdAt.toISOString(),
          },
        }
      }
      // documentId travels with a FAILED result specifically so the UI can
      // offer a "reprocess" action without a second round-trip to look it up.
      return {
        reportAvailable: true as const,
        status: 'FAILED' as const,
        errorMessage: analysis.errorMessage,
        errorCode: analysis.errorCode,
        documentId: analysis.documentId,
      }
    }

    return this.buildCompletedResponse(lead.id, analysis)
  }

  private async buildCompletedResponse(leadId: string, analysis: CompletedBankStatementAnalysis) {
    const insightsJob = await this.prisma.analysisJob.findFirst({
      where: { leadId, jobType: 'FINANCIAL_ANALYSIS_INSIGHTS' },
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
      reportAvailable: true as const,
      status: 'COMPLETED' as const,
      statement: {
        bankName: analysis.bankName,
        accountNumberMasked: analysis.accountNumberMasked,
        accountHolderName: analysis.accountHolderName,
        ifscCode: analysis.ifscCode,
        accountType: analysis.accountType,
        statementPeriodStart: analysis.statementPeriodStart?.toISOString() ?? null,
        statementPeriodEnd: analysis.statementPeriodEnd?.toISOString() ?? null,
        transactionCount: analysis.transactionCount,
        monthsCovered: analysis.monthsCovered,
        sourceFileFormat: analysis.sourceFileFormat,
        extractionConfidence: analysis.extractionConfidence,
        documentId: analysis.documentId,
        generatedAt: analysis.completedAt?.toISOString() ?? null,
      },
      score: analysis.score,
      riskFlags: analysis.riskFlags,
      // CRITICAL: every Decimal field below serializes to a STRING over
      // JSON (Prisma's Decimal.toJSON()) — returning the raw rows let the
      // frontend's own arithmetic (e.g. averaging normalizedIncome across
      // months) silently do STRING CONCATENATION instead of addition,
      // producing a wildly corrupted-looking currency figure. Converted to
      // real numbers here, exactly like the transactions mapping below
      // already does for amount/balance.
      months: analysis.months.map((m) => ({
        ...m,
        totalInflow: m.totalInflow.toNumber(),
        totalOutflow: m.totalOutflow.toNumber(),
        netCashFlow: m.netCashFlow.toNumber(),
        normalizedIncome: m.normalizedIncome.toNumber(),
        essentialExpenses: m.essentialExpenses.toNumber(),
        financialExpenses: m.financialExpenses.toNumber(),
        discretionaryExpenses: m.discretionaryExpenses.toNumber(),
        mandatoryDebtPayments: m.mandatoryDebtPayments.toNumber(),
        creditCardPayments: m.creditCardPayments.toNumber(),
        loanInflows: m.loanInflows.toNumber(),
        transferInflows: m.transferInflows.toNumber(),
        transferOutflows: m.transferOutflows.toNumber(),
        cashWithdrawals: m.cashWithdrawals.toNumber(),
        cashDeposits: m.cashDeposits.toNumber(),
        closingBalance: m.closingBalance?.toNumber() ?? null,
        minBalance: m.minBalance?.toNumber() ?? null,
      })),
      transactions: analysis.transactions.map((t) => ({
        ...t,
        amount: t.amount.toNumber(),
        balance: t.balance?.toNumber() ?? null,
      })),
      insights,
      latestUploadFailed: null as { documentId: string; errorMessage: string | null; errorCode: string | null; uploadedAt: string } | null,
    }
  }
}
