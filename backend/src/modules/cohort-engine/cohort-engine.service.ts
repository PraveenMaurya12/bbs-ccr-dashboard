import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, type Role } from '@prisma/client'

import { PrismaService } from '@/common/prisma/prisma.service'
import type { AppConfig } from '@/config/configuration'
import { DebtAnalysisService } from '@/modules/debt-analysis/debt-analysis.service'
import { FinancialAnalysisService } from '@/modules/financial-analysis/financial-analysis.service'
import { MasterProfileService } from '@/modules/master-profile/master-profile.service'
import { debtComplexityBand, deriveArchetype } from './calculations/archetype-and-complexity'
import { computeCaseAging } from './calculations/case-aging'
import { slaHoursForReason, computeComplianceAging } from './calculations/compliance-lifecycle'
import { buildCustomerExplanation, buildCustomerReasons, buildInternalReasons } from './calculations/customer-explanation'
import { assessMissingDataAndDocuments, type MasterProfileMissingItem } from './calculations/missing-data'
import { average, buildCohortInput } from './calculations/normalize-input'
import type { NormalizeInputParams } from './calculations/normalize-input'
import { resolvePrecedence } from './calculations/precedence'
import { inspectRefreshTriggers, REFRESH_TRIGGER_TAXONOMY } from './calculations/refresh-triggers'
import { evaluateAllRules } from './calculations/rules'
import type { CohortComplianceActionType, CohortEngineConfig, CohortLifecycleState, CohortPathway, CohortPlanEligibility, CohortPrimaryState } from './cohort-engine.types'
import { isBlockedReasonCode, toPrimaryStateAndReasonCode } from './cohort-engine.types'

type DebtAnalysisCompleted = Extract<Awaited<ReturnType<DebtAnalysisService['getForLead']>>, { status: 'COMPLETED' }>
type FinancialAnalysisCompleted = Extract<Awaited<ReturnType<FinancialAnalysisService['getForLead']>>, { status: 'COMPLETED' }>
type MasterProfileCompleted = Extract<Awaited<ReturnType<MasterProfileService['getForLead']>>, { status: 'COMPLETED' }>

/**
 * `financial.score.extendedAnalysis` is a raw Prisma Json column — never a
 * top-level typed field on FinancialAnalysisService.getForLead()'s return
 * (same reasoning as master-profile.service.ts's own identical
 * `FinancialExtendedAnalysisFields` cast). Only the two v3.0 fields this
 * module actually reads are declared; `transitionMonth` round-trips
 * through Json storage as an ISO string, never a Date instance.
 */
interface FinancialExtendedAnalysisForCohort {
  eventProfile?: {
    incomeTransition?: { detected: boolean; transitionMonth: string | null; deltaPercent: number | null }
    medicalEvents?: { monthlyEntries: Array<{ incomeSharePercent: number | null }>; shockMonths: unknown[]; chronic: boolean }
  }
}

function toNum(value: unknown): number {
  return typeof value === 'object' && value !== null && 'toNumber' in value ? (value as { toNumber(): number }).toNumber() : Number(value)
}

/** Output Schema's `recommended_pathway` mapping — hoisted to module scope so both evaluate() and override() use the exact same mapping for whichever cohort currently applies, never a stale one left over from a prior cohort. BLOCKED reason codes never have a pathway (null) — a pathway only exists once a real Type-A cohort is assigned. */
const PATHWAY_BY_COHORT: Record<CohortPrimaryState, CohortPathway | null> = {
  C1: 'STABILISE',
  C2: 'CONSOLIDATE',
  C3: 'RESTRUCTURE',
  C4: 'RESOLVE',
  C5: 'STABILISE',
  C6: null,
  C7: 'RECOVER',
  X1: null,
  X2: null,
  CONSENT_PENDING: null,
  KYC_PENDING: null,
  MANUAL_REVIEW: null,
  CUSTOMER_UNRESPONSIVE: null,
  COMPLIANCE_HOLD: null,
  DATA_REFRESH_REQUIRED: null,
  OTHER_ACCOUNTS_REQUIRED: null,
  P1_INFORMATION_REQUIRED: null,
  SPECIALIST_REQUIRED: null,
  CCR_REQUIRED: null,
}

const PLAN_ELIGIBILITY_BY_COHORT: Record<CohortPrimaryState, CohortPlanEligibility> = {
  C1: 'DRAFT',
  C2: 'DRAFT',
  C3: 'DRAFT',
  C4: 'DRAFT',
  C5: 'DRAFT',
  C6: 'SPECIALIST',
  C7: 'DRAFT',
  X1: 'INSUFFICIENT_DATA',
  X2: 'OUT_OF_SCOPE',
  CONSENT_PENDING: 'INSUFFICIENT_DATA',
  KYC_PENDING: 'INSUFFICIENT_DATA',
  MANUAL_REVIEW: 'CCR_REVIEW',
  CUSTOMER_UNRESPONSIVE: 'INSUFFICIENT_DATA',
  COMPLIANCE_HOLD: 'INSUFFICIENT_DATA',
  DATA_REFRESH_REQUIRED: 'INSUFFICIENT_DATA',
  OTHER_ACCOUNTS_REQUIRED: 'INSUFFICIENT_DATA',
  P1_INFORMATION_REQUIRED: 'INSUFFICIENT_DATA',
  SPECIALIST_REQUIRED: 'SPECIALIST',
  CCR_REQUIRED: 'CCR_REVIEW',
}

/** v3.0 §19.2: maker-checker required for an override landing on C1, C4, or C6 — the actor approving it must be a different person from whoever requested it. */
const MAKER_CHECKER_COHORTS: ReadonlySet<CohortPrimaryState> = new Set(['C1', 'C4', 'C6'])

/** The 9 real Type-A terminal cohorts — used by `clearCompliance()` to find the next-highest REAL candidate in a decision's own `secondaryFlags` (which also contains non-cohort rule flags like `FCF_UNRECONCILED_CAP`/`ESCALATING_DPD` that are never a valid `primaryCohort` value). */
const REAL_COHORT_KEYS: ReadonlySet<string> = new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'X1', 'X2'])

/**
 * Orchestrates the BBS Cohort Engine (spec's own §2 Algorithmic Flow): load
 * Master Profile (must be COMPLETED and not stale) + Debt Analysis +
 * Financial Analysis + consent records -> validate the L3 handoff/readiness
 * gate (§3.2) -> normalize -> evaluate every rule (R001-R024) -> resolve
 * precedence (§6.1) -> apply the readiness-gate override (§3.2, never
 * overridden by the internal 24-rule precedence) -> persist every rule
 * result + the one primary decision as a new, immutable, versioned row.
 * Never calls an AI provider — the cohort decision itself is always
 * deterministic (spec's own first product principle, "Rules over
 * free-form AI").
 */
@Injectable()
export class CohortEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly debtAnalysisService: DebtAnalysisService,
    private readonly financialAnalysisService: FinancialAnalysisService,
    private readonly masterProfileService: MasterProfileService,
  ) {}

  private get config(): CohortEngineConfig {
    return this.configService.get<AppConfig>('app')!.cohortEngine
  }

  private log(event: string, details: Record<string, string | number | undefined>): void {
    const parts = Object.entries(details)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
    console.log(`[CohortEngine] ${event} ${parts.join(' ')}`)
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  }

  private buildNormalizeParams(leadId: string, helpCategory: string | null, situation: string | null, leadPanAvailable: boolean, customerPanAvailable: boolean, consentGranted: boolean, consentVersion: string | null, debt: DebtAnalysisCompleted | null, financial: FinancialAnalysisCompleted | null, masterProfile: MasterProfileCompleted | null): NormalizeInputParams {
    const monthlyFacts = financial
      ? {
          normalizedIncome: financial.months.map((m) => toNum(m.normalizedIncome)),
          essentialExpenses: financial.months.map((m) => toNum(m.essentialExpenses)),
          mandatoryDebtPayments: financial.months.map((m) => toNum(m.mandatoryDebtPayments)),
        }
      : null

    const otherAccountsFlag = financial?.riskFlags.find((f) => f.key === 'OTHER_ACCOUNTS_LIKELY')
    const otherAccountsEvidence = otherAccountsFlag?.evidence as { selfTransferIncomeSharePercent?: number } | undefined

    // `extendedAnalysis` is a raw Prisma Json column (see
    // master-profile.service.ts's own identical `FinancialExtendedAnalysisFields`
    // cast for the same reason) — eventProfile isn't a top-level typed
    // field on getForLead()'s return, so it must be cast explicitly here.
    // Dates round-trip through Json storage as ISO strings, never Date instances.
    const extended = financial?.score?.extendedAnalysis as unknown as FinancialExtendedAnalysisForCohort | undefined
    const incomeTransition = extended?.eventProfile?.incomeTransition
    const monthsSinceTransition =
      incomeTransition?.detected && incomeTransition.transitionMonth && financial
        ? financial.months.filter((m) => new Date(m.periodMonth).getTime() > new Date(incomeTransition.transitionMonth!).getTime()).length
        : null

    const medicalEvents = extended?.eventProfile?.medicalEvents
    const maxMedicalIncomeSharePercent = medicalEvents?.monthlyEntries.length ? Math.max(...medicalEvents.monthlyEntries.map((e) => e.incomeSharePercent ?? 0)) : null

    const cohortAttributes = masterProfile?.cohortAttributes as
      | { liquidityBand?: string; incomeStability?: 'STABLE' | 'VOLATILE' | 'UNKNOWN'; recentBorrowingLevel?: 'NONE' | 'MODERATE' | 'ELEVATED' | 'UNKNOWN'; repaymentObserved?: boolean | null; totalDebtBand?: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'UNKNOWN' }
      | null
      | undefined

    const dataQualityFlags = masterProfile?.dataQuality?.flags ?? []
    const missingInformation = masterProfile?.missingInformation ?? []
    // `postStatementDebt` is also a raw Prisma Json column on MasterProfile's
    // response (master-profile.service.ts passes `profile.postStatementDebt`
    // straight through, never reconstructing it as a typed object) — cast here.
    const postStatementDebt = masterProfile?.postStatementDebt as unknown as { detected: boolean; accountCount: number; totalAmount: number; repaymentUnverified: boolean } | undefined

    return {
      leadId,
      helpCategory,
      situation,
      leadPanAvailable,
      customerPanAvailable,
      consentGranted,
      consentVersion,
      debtAnalysis: debt
        ? {
            complete: true,
            creditScore: debt.creditProfile.creditScore,
            scoreBand: debt.creditProfile.scoreBand,
            totalOverdue: debt.summary.totalOverdue,
            currentMaxDpd: debt.delinquency.currentMaxDpd,
            maxHistoricalDpd: debt.delinquency.maxHistoricalDpd,
            writtenOffCount: debt.settlement.writtenOffCount,
            settledCount: debt.settlement.settledCount,
            suitFiledCount: debt.settlement.suitFiledCount,
            arcAssignedCount: debt.settlement.arcAssignedCount,
            willfulDefault: debt.settlement.willfulDefault,
            monthlyDelinquencyTrend: debt.creditHistory.monthlyDelinquencyTrend,
            enquiries30d: debt.enquiryDetail.windows.find((w) => w.windowLabel === '30d')?.enquiryCount ?? null,
            recentEnquiries: debt.creditProfile.recentEnquiries,
            totalOutstanding: debt.summary.totalOutstanding,
            unsecuredPercent: debt.debtBurden.unsecuredPercent,
            activeAccounts: debt.creditProfile.activeAccounts,
            numbersOfLenders: debt.debtBurden.numbersOfLenders,
            totalActiveDebt: debt.debtBurden.totalActiveDebt,
            clusterDetected: debt.borrowing.clusterDetected,
            newAccountsPerYear: debt.borrowing.windows.find((w) => w.windowLabel === '12mo')?.newAccountCount ?? null,
            distinctAccountTypeCount: debt.accountDistribution.slices.length,
          }
        : null,
      financialAnalysis: financial
        ? {
            complete: true,
            averageNormalizedIncome: average(monthlyFacts!.normalizedIncome),
            averageEssentialExpenses: average(monthlyFacts!.essentialExpenses),
            averageMandatoryDebtPayments: average(monthlyFacts!.mandatoryDebtPayments),
            borrowingDependencyPatternDetected: financial.riskFlags.some((f) => f.key === 'BORROWING_DEPENDENCY_PATTERN'),
            otherAccountsLikely: otherAccountsFlag !== undefined,
            otherAccountsIncomeSharePercent: otherAccountsEvidence?.selfTransferIncomeSharePercent ?? null,
            incomeTransitionDetected: incomeTransition?.detected ?? false,
            incomeTransitionDeltaPercent: incomeTransition?.deltaPercent ?? null,
            incomeTransitionMonthsSinceTransition: monthsSinceTransition,
            medicalShockMonthCount: medicalEvents?.shockMonths.length ?? 0,
            medicalShockChronic: medicalEvents?.chronic ?? false,
            medicalShockMaxIncomeSharePercent: maxMedicalIncomeSharePercent,
          }
        : null,
      masterProfile: masterProfile
        ? {
            stale: false, // caller already refused to proceed when stale — see generate()
            alignmentState: masterProfile.alignmentState,
            overallConfidence: masterProfile.overallConfidence,
            resolutionCapacity: masterProfile.resolutionCapacity,
            liquidityBand: cohortAttributes?.liquidityBand ?? 'UNKNOWN',
            incomeStability: cohortAttributes?.incomeStability ?? 'UNKNOWN',
            recentBorrowingLevel: cohortAttributes?.recentBorrowingLevel ?? 'UNKNOWN',
            repaymentObserved: cohortAttributes?.repaymentObserved ?? null,
            totalDebtBand: cohortAttributes?.totalDebtBand ?? 'UNKNOWN',
            readinessOutcome: masterProfile.readinessGate?.outcome ?? null,
            complianceHold: masterProfile.complianceRouting?.complianceHold ?? false,
            complianceReason: masterProfile.complianceRouting?.reason ?? null,
            complianceMatchedEntity: masterProfile.complianceRouting?.matchedEntity ?? null,
            complianceSince: masterProfile.complianceRouting?.since ?? null,
            complianceSlaHours: masterProfile.complianceRouting?.slaHours ?? null,
            complianceEscalationHours: masterProfile.complianceRouting?.escalationHours ?? null,
            postStatementDetected: postStatementDebt?.detected ?? false,
            postStatementAccountCount: postStatementDebt?.accountCount ?? 0,
            postStatementTotalAmount: postStatementDebt?.totalAmount ?? 0,
            postStatementRepaymentUnverified: postStatementDebt?.repaymentUnverified ?? false,
            missingInformationP1Count: missingInformation.filter((i) => i.priority === 'P1' && !i.resolved).length,
            missingInformationP2Count: missingInformation.filter((i) => i.priority === 'P2' && !i.resolved).length,
            dataQualityBand: masterProfile.dataQuality?.band ?? null,
            dataQualityExceptionCount: dataQualityFlags.length,
            dataQualityFlags,
          }
        : null,
    }
  }

  /** v3.0 §3.2: Master Profile's own already-computed readiness-gate outcome always wins over the internal 24-rule precedence — Cohort Engine never overrides it. Returns the forced cohort, or null when no override applies (readinessOutcome is READY, absent/legacy, or REGENERATE — REGENERATE is handled as an earlier refusal in evaluate(), never reaching this function). */
  private applyReadinessGateOverride(readinessOutcome: string | null, internalPrimaryCohort: CohortPrimaryState): CohortPrimaryState {
    if (readinessOutcome === 'CCR_FIRST') return 'CCR_REQUIRED'
    if (readinessOutcome === 'COMPLIANCE_HOLD') return 'COMPLIANCE_HOLD'
    if (readinessOutcome === 'SPECIALIST_REVIEW') return 'SPECIALIST_REQUIRED'
    if (readinessOutcome === 'X1_CANDIDATE') return 'X1'
    return internalPrimaryCohort
  }

  async evaluate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const masterProfile = await this.masterProfileService.getForLead(bbsLeadId)
    if (!masterProfile.profileAvailable) {
      return { generated: false, reason: 'Master Profile has not been generated for this lead yet.' }
    }
    if (masterProfile.status !== 'COMPLETED') {
      return { generated: false, reason: 'Master Profile has not completed for this lead yet.' }
    }
    if (masterProfile.isStale) {
      return { generated: false, reason: 'Master Profile is stale — regenerate it before running the Cohort Engine.' }
    }
    // §3.2: REGENERATE means Master Profile itself could not produce a
    // usable readiness verdict — reject the handoff outright rather than
    // attempting a decision on an admittedly-unusable profile.
    if (masterProfile.readinessGate?.outcome === 'REGENERATE') {
      return { generated: false, reason: 'Master Profile readiness gate returned REGENERATE — regenerate the Master Profile before running the Cohort Engine.' }
    }

    const [debtAnalysis, financialAnalysis, customer, consentRecords] = await Promise.all([
      this.debtAnalysisService.getForLead(bbsLeadId),
      this.financialAnalysisService.getForLead(bbsLeadId),
      this.prisma.customer.findUnique({ where: { leadId: lead.id } }),
      this.prisma.consentRecord.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: 'desc' } }),
    ])

    if (!debtAnalysis.reportAvailable || debtAnalysis.status !== 'COMPLETED') {
      return { generated: false, reason: 'Debt Analysis has not completed for this lead yet.' }
    }
    if (!financialAnalysis.reportAvailable || financialAnalysis.status !== 'COMPLETED') {
      return { generated: false, reason: 'Financial Analysis has not completed for this lead yet.' }
    }

    const grantedConsent = consentRecords.find((c) => c.status === 'GRANTED' && c.revokedAt === null)

    const previousVersion = await this.prisma.cohortDecision.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    const version = (previousVersion?.version ?? 0) + 1

    let decision: { id: string }
    try {
      decision = await this.prisma.cohortDecision.create({
        data: { leadId: lead.id, version, status: 'GENERATING', ruleVersion: this.config.ruleVersion },
      })
    } catch (error) {
      // The read-then-create above is not transactional — two
      // near-simultaneous evaluate() calls for the same lead can both read
      // the same previousVersion and race to create() the same (leadId,
      // version) pair. The @@unique constraint safely prevents a
      // duplicate row either way; this just turns the loser's unique-
      // violation into a clean, specific reason instead of a generic
      // unhandled 500.
      if (this.isUniqueViolation(error)) {
        return { generated: false, reason: 'A cohort evaluation is already in progress for this lead — refresh and retry.' }
      }
      throw error
    }

    try {
      const normalizeParams = this.buildNormalizeParams(bbsLeadId, lead.helpCategory, lead.situation, lead.panRef !== null, customer?.panRef !== null, grantedConsent !== undefined, grantedConsent?.version ?? null, debtAnalysis as DebtAnalysisCompleted, financialAnalysis as FinancialAnalysisCompleted, masterProfile as MasterProfileCompleted)

      const input = buildCohortInput(normalizeParams, this.config)
      const ruleResults = evaluateAllRules(input, this.config)
      const precedence = resolvePrecedence(ruleResults, input, this.config)

      // §3.2: the readiness-gate override always wins over the internal
      // 24-rule precedence table — applied AFTER precedence resolves so
      // `resolvePrecedence` itself stays a pure, independently-testable
      // function over rule results alone.
      const finalPrimaryCohort = this.applyReadinessGateOverride(input.readiness.readinessOutcome, precedence.primaryCohort)
      const blocked = isBlockedReasonCode(finalPrimaryCohort)

      // v3.0 §5.5's own archetype table lists its Debt Spiral trigger as
      // THREE independent conditions: "Borrowing-to-repay (R009) OR
      // stacking index >15/year OR enquiry burst" — note this is narrower
      // than R010's own cohort-precedence `matched` value, which ALSO
      // fires from a real account-opening cluster alone
      // (`recentStackingClusterDetected`), a signal §5.5's own archetype
      // table never lists at all. An earlier version of this derivation
      // reused R010's broader `matched` directly, which silently widened
      // the archetype's own Debt Spiral trigger beyond what §5.5 actually
      // specifies — found and fixed by tracing a real discrepancy against
      // the attached reference report's own stated archetype (see
      // cohort-scenarios.spec.ts's Praveenkumar case and the parity
      // matrix's own corrected-discrepancy entry).
      const r010Evidence = ruleResults.find((r) => r.ruleId === 'R010')?.evidence
      const debtCycleSignal = ruleResults.some((r) => r.ruleId === 'R009' && r.matched) || Boolean(r010Evidence?.stackingIndexHigh) || Boolean(r010Evidence?.enquiryBurstHigh)
      const adverseCircumstance = ruleResults.some((r) => (r.ruleId === 'R023' || r.ruleId === 'R024') && r.matched)
      const escalatingDpd = ruleResults.some((r) => r.ruleId === 'R007' && r.matched)

      const archetype = deriveArchetype(debtCycleSignal, adverseCircumstance, escalatingDpd)
      const complexityBand = debtComplexityBand(input.debt.lenderCount, normalizeParams.masterProfile?.totalDebtBand ?? 'UNKNOWN', normalizeParams.debtAnalysis?.distinctAccountTypeCount ?? null)

      const masterProfileMissingItems: MasterProfileMissingItem[] = (masterProfile.missingInformation ?? []) as MasterProfileMissingItem[]
      const { missingData, requiredDocuments } = assessMissingDataAndDocuments(input, masterProfileMissingItems)

      const customerExplanation = buildCustomerExplanation(finalPrimaryCohort)
      const customerReasons = buildCustomerReasons(finalPrimaryCohort, requiredDocuments)
      const internalReasons = buildInternalReasons(ruleResults)

      // §7: compliance aging, computed on read from Master Profile's own
      // `since` timestamp — never a cron job. Falls back to "now" only
      // when Master Profile's own hold has no `since` yet (a brand-new
      // hold this same generation cycle).
      let complianceSlaHours: number | null = null
      let complianceAgingState: 'COMPLIANCE_HOLD' | 'COMPLIANCE_AGING' | 'COMPLIANCE_ESCALATED' | null = null
      let complianceEscalationAt: Date | null = null
      if (input.compliance.hold) {
        complianceSlaHours = input.compliance.slaHours ?? slaHoursForReason(input.compliance.reason, this.config)
        const holdSince = input.compliance.since ? new Date(input.compliance.since) : new Date()
        const aging = computeComplianceAging(holdSince, complianceSlaHours)
        complianceAgingState = aging.agingState as 'COMPLIANCE_HOLD' | 'COMPLIANCE_AGING' | 'COMPLIANCE_ESCALATED'
        complianceEscalationAt = aging.escalationAt
      }

      // §4.3: lifecycle_state only applies once a real cohort (not a
      // BLOCKED reason) has been assigned — starts at CCR_REVIEW, the
      // first Plan Engine handoff checkpoint.
      const lifecycleState: CohortLifecycleState | null = blocked ? null : 'CCR_REVIEW'

      const dataProvenance = [
        { field: 'credit.score', source: 'DEBT_ANALYSIS', asOf: null, verified: true, confidence: 'HIGH' },
        { field: 'financial.sustainableSurplus', source: 'CALCULATED', asOf: null, verified: true, confidence: input.financial.sustainableSurplus !== null ? 'HIGH' : 'LOW' },
        { field: 'reconciliation.creditBankAlignment', source: 'MASTER_PROFILE', asOf: null, verified: true, confidence: 'MEDIUM' },
        { field: 'compliance.hold', source: 'MASTER_PROFILE', asOf: input.compliance.since, verified: true, confidence: 'HIGH' },
      ]

      await this.prisma.$transaction([
        this.prisma.cohortRuleResult.createMany({
          data: ruleResults.map((r) => ({
            decisionId: decision.id,
            ruleId: r.ruleId,
            ruleVersion: r.ruleVersion,
            evaluated: r.evaluated,
            matched: r.matched,
            severity: r.severity,
            evidence: r.evidence as Prisma.InputJsonValue,
            evidenceLevel: r.evidenceLevel,
            reason: r.reason,
            sourceFields: r.sourceFields as unknown as Prisma.InputJsonValue,
          })),
        }),
        this.prisma.cohortDecision.update({
          where: { id: decision.id },
          data: {
            status: 'COMPLETED',
            generatedAt: new Date(),
            sourceMasterProfileVersion: masterProfile.version,
            sourceMasterProfileGeneratedAt: masterProfile.generatedAt ? new Date(masterProfile.generatedAt) : null,
            sourceDebtAnalysisCompletedAt: new Date(debtAnalysis.meta.reportDate),
            sourceFinancialAnalysisCompletedAt: financialAnalysis.statement.generatedAt ? new Date(financialAnalysis.statement.generatedAt) : null,
            primaryCohort: finalPrimaryCohort,
            lifecycleState,
            secondaryFlags: precedence.secondaryFlags as unknown as Prisma.InputJsonValue,
            archetype,
            pathway: PATHWAY_BY_COHORT[finalPrimaryCohort],
            capacityBand: input.financial.capacityBand,
            capacityRatio: input.financial.capacityRatio,
            sustainableCashFlow: input.financial.sustainableSurplus,
            debtComplexityBand: complexityBand,
            planEligibility: PLAN_ELIGIBILITY_BY_COHORT[finalPrimaryCohort],
            customerExplanation,
            customerReasons: customerReasons as unknown as Prisma.InputJsonValue,
            internalReasons: internalReasons as unknown as Prisma.InputJsonValue,
            missingData: missingData as unknown as Prisma.InputJsonValue,
            requiredDocuments: requiredDocuments as unknown as Prisma.InputJsonValue,
            specialistReviewRequired: precedence.specialistReviewRequired,
            specialistReviewReason: precedence.specialistReviewReason,
            manualReviewRequired: precedence.manualReviewRequired,
            confidence: input.readiness.overallConfidence,
            dataProvenance: dataProvenance as unknown as Prisma.InputJsonValue,
            consentVersion: grantedConsent?.version ?? null,
            complianceHold: input.compliance.hold,
            complianceReason: input.compliance.reason,
            complianceMatchedEntity: input.compliance.matchedEntity,
            complianceSlaHours,
            complianceEscalationAt,
            complianceAgingState,
            nextReviewEvent: { scheduledDaysFromNow: [30, 60, 90], eventTriggers: ['missed_payment', 'income_shock', 'new_borrowing', 'dpd_change', 'new_overdue', 'lender_decline', 'legal_status_change', 'material_data_change'] } as unknown as Prisma.InputJsonValue,
          },
        }),
      ])

      this.log('DECISION_GENERATED', { bbsLeadId, decisionId: decision.id, version, primaryCohort: finalPrimaryCohort })
      return { generated: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown cohort-engine generation error'
      await this.prisma.cohortDecision.update({ where: { id: decision.id }, data: { status: 'FAILED', errorMessage: message } })
      this.log('DECISION_FAILED', { bbsLeadId, decisionId: decision.id, error: message })
      return { generated: false, reason: message }
    }
  }

  /** Spec's own two separate endpoints — same underlying operation; recalculate is a documented alias. */
  async recalculate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    return this.evaluate(bbsLeadId)
  }

  async getForLead(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const decision = await this.prisma.cohortDecision.findFirst({
      where: { leadId: lead.id },
      orderBy: { version: 'desc' },
      include: { ruleResults: true, complianceActionsTo: { include: { actor: { select: { name: true } } } } },
    })

    if (!decision) {
      const masterProfile = await this.masterProfileService.getForLead(bbsLeadId)
      const masterProfileReady = masterProfile.profileAvailable && masterProfile.status === 'COMPLETED' && !masterProfile.isStale
      return { decisionAvailable: false as const, masterProfileReady }
    }

    if (decision.status !== 'COMPLETED') {
      return { decisionAvailable: true as const, status: decision.status, errorMessage: decision.errorMessage }
    }

    // Has Master Profile moved to a newer version since this decision was
    // generated? Same cheap source-version-diff staleness discipline
    // MasterProfile.getForLead() itself already uses — never a silent
    // background recompute.
    const currentMasterProfile = await this.masterProfileService.getForLead(bbsLeadId)
    const isStale = currentMasterProfile.profileAvailable && currentMasterProfile.status === 'COMPLETED' && currentMasterProfile.version !== decision.sourceMasterProfileVersion

    const { primaryState, primaryReasonCode } = decision.primaryCohort ? toPrimaryStateAndReasonCode(decision.primaryCohort) : { primaryState: null, primaryReasonCode: null }

    // §14: case aging for a BLOCKED decision, computed on read from
    // `generatedAt` — a documented proxy for "when this block first
    // occurred" (no dedicated `blockedSince` column tracks the first of
    // possibly several consecutive versions sharing the same reason code;
    // see this field's own doc comment in the parity matrix).
    const caseAging = primaryState === 'BLOCKED' && primaryReasonCode && decision.generatedAt ? computeCaseAging(primaryReasonCode, decision.generatedAt, this.config) : null

    // §7.3: re-derive the compliance aging state fresh on every read
    // (never trust the persisted snapshot from generation time, since
    // time has passed) — only when the hold is still active and wasn't
    // already cleared/declined.
    let liveComplianceAgingState = decision.complianceAgingState
    if (decision.complianceHold && !decision.complianceClearedAt && !decision.complianceDeclinedAt && decision.generatedAt && decision.complianceSlaHours !== null) {
      liveComplianceAgingState = computeComplianceAging(decision.generatedAt, decision.complianceSlaHours).agingState
    }

    // §7.4/§19.1: if THIS decision version is itself the result of a
    // compliance clear/decline action, surface who did it and why —
    // real auditability, not just the resulting primaryCohort change.
    const linkedComplianceAction = (decision.complianceActionsTo ?? [])[0]
    const complianceAction = linkedComplianceAction
      ? { action: linkedComplianceAction.action, reason: linkedComplianceAction.reason, actorName: linkedComplianceAction.actor.name, createdAt: linkedComplianceAction.createdAt.toISOString() }
      : null

    return {
      decisionAvailable: true as const,
      status: 'COMPLETED' as const,
      version: decision.version,
      ruleVersion: decision.ruleVersion,
      isStale,
      generatedAt: decision.generatedAt?.toISOString() ?? null,
      decidedAt: decision.decidedAt?.toISOString() ?? null,
      primaryCohort: decision.primaryCohort,
      primaryState,
      primaryReasonCode,
      lifecycleState: decision.lifecycleState,
      secondaryFlags: decision.secondaryFlags,
      archetype: decision.archetype,
      pathway: decision.pathway,
      capacityBand: decision.capacityBand,
      capacityRatio: decision.capacityRatio,
      sustainableCashFlow: decision.sustainableCashFlow?.toNumber() ?? null,
      stabilisationCoverage: decision.stabilisationCoverage,
      debtComplexityBand: decision.debtComplexityBand,
      planEligibility: decision.planEligibility,
      customerExplanation: decision.customerExplanation,
      customerReasons: decision.customerReasons,
      internalReasons: decision.internalReasons,
      missingData: decision.missingData,
      requiredDocuments: decision.requiredDocuments,
      specialistReviewRequired: decision.specialistReviewRequired,
      specialistReviewReason: decision.specialistReviewReason,
      manualReviewRequired: decision.manualReviewRequired,
      requiresManualOverride: decision.requiresManualOverride,
      confidence: decision.confidence,
      dataProvenance: decision.dataProvenance,
      consentVersion: decision.consentVersion,
      nextReviewEvent: decision.nextReviewEvent,
      complianceHold: decision.complianceHold,
      complianceReason: decision.complianceReason,
      complianceMatchedEntity: decision.complianceMatchedEntity,
      complianceSlaHours: decision.complianceSlaHours,
      complianceEscalationAt: decision.complianceEscalationAt?.toISOString() ?? null,
      complianceAgingState: liveComplianceAgingState,
      complianceClearedAt: decision.complianceClearedAt?.toISOString() ?? null,
      complianceDeclinedAt: decision.complianceDeclinedAt?.toISOString() ?? null,
      complianceAction,
      declinedAt: decision.declinedAt?.toISOString() ?? null,
      declineReason: decision.declineReason,
      caseAging: caseAging ? { agingState: caseAging.agingState, ttlDays: caseAging.ttlDays, ttlExpiresAt: caseAging.ttlExpiresAt?.toISOString() ?? null } : null,
      ruleResults: decision.ruleResults.map((r) => ({ ruleId: r.ruleId, evaluated: r.evaluated, matched: r.matched, severity: r.severity, evidence: r.evidence, evidenceLevel: r.evidenceLevel, reason: r.reason, sourceFields: r.sourceFields })),
    }
  }

  async getHistory(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const decisions = await this.prisma.cohortDecision.findMany({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    return decisions.map((d) => ({
      version: d.version,
      status: d.status,
      primaryCohort: d.primaryCohort,
      lifecycleState: d.lifecycleState,
      pathway: d.pathway,
      generatedAt: d.generatedAt?.toISOString() ?? null,
      decidedAt: d.decidedAt?.toISOString() ?? null,
    }))
  }

  /**
   * v3.0 §15.1's refresh-trigger taxonomy, made inspectable: the static
   * catalog of all 6 documented triggers, enriched with real, per-lead
   * applicability when a decision exists (never fabricated — honest
   * `false` when this codebase cannot mechanically tell, e.g. POLICY_CHANGE).
   */
  async getRefreshTriggers(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const decision = await this.prisma.cohortDecision.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    if (!decision || decision.status !== 'COMPLETED') {
      return { triggers: REFRESH_TRIGGER_TAXONOMY, perLeadApplicability: false as const }
    }

    const currentMasterProfile = await this.masterProfileService.getForLead(bbsLeadId)
    const currentMasterProfileVersion = currentMasterProfile.profileAvailable && currentMasterProfile.status === 'COMPLETED' ? currentMasterProfile.version : null

    const triggers = inspectRefreshTriggers({
      decision: { complianceHold: decision.complianceHold, complianceClearedAt: decision.complianceClearedAt, complianceDeclinedAt: decision.complianceDeclinedAt, sourceMasterProfileVersion: decision.sourceMasterProfileVersion },
      currentMasterProfileVersion,
    })
    return { triggers, perLeadApplicability: true as const }
  }

  /**
   * CCR/supervisor override — never mutates the prior decision. Creates a
   * new, immutable decision version with the overridden cohort and a
   * linked audit row ("do not overwrite historical decisions" — the
   * spec's own explicit invariant). §19.2: an override landing on C1, C4,
   * or C6 requires a second approver distinct from the acting user —
   * enforced here, not left to the caller.
   */
  async override(bbsLeadId: string, params: { newPrimaryCohort: CohortPrimaryState; reason: string; approverId?: string }, actor: { userId: string; role: Role }) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const previous = await this.prisma.cohortDecision.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    if (!previous) throw new NotFoundException(`No cohort decision exists yet for lead ${bbsLeadId}`)

    // Checked only once we know there is a real decision to override —
    // never masks a 404 behind a maker-checker error for a lead that has
    // nothing to override in the first place.
    if (MAKER_CHECKER_COHORTS.has(params.newPrimaryCohort)) {
      if (!params.approverId) {
        throw new BadRequestException(`Overriding to ${params.newPrimaryCohort} requires a second approver (maker-checker, §19.2) — approverId was not provided.`)
      }
      if (params.approverId === actor.userId) {
        throw new BadRequestException(`Overriding to ${params.newPrimaryCohort} requires an approver distinct from the acting user (maker-checker, §19.2).`)
      }
    }

    const version = previous.version + 1
    const blocked = isBlockedReasonCode(params.newPrimaryCohort)

    const [, newDecision] = await this.prisma.$transaction([
      this.prisma.cohortDecision.update({ where: { id: previous.id }, data: { requiresManualOverride: true, decidedById: actor.userId, decidedAt: new Date() } }),
      this.prisma.cohortDecision.create({
        data: {
          leadId: lead.id,
          version,
          status: 'COMPLETED',
          ruleVersion: previous.ruleVersion,
          generatedAt: new Date(),
          primaryCohort: params.newPrimaryCohort,
          lifecycleState: blocked ? null : 'CCR_REVIEW',
          secondaryFlags: previous.secondaryFlags ?? undefined,
          archetype: previous.archetype,
          // CRITICAL: pathway/customerExplanation must reflect the NEW
          // cohort, never the overridden one's — otherwise a customer
          // could be shown another cohort's customer-safe explanation
          // after a CCR overrides the decision.
          pathway: PATHWAY_BY_COHORT[params.newPrimaryCohort],
          capacityBand: previous.capacityBand,
          capacityRatio: previous.capacityRatio,
          sustainableCashFlow: previous.sustainableCashFlow,
          debtComplexityBand: previous.debtComplexityBand,
          planEligibility: 'CCR_REVIEW',
          customerExplanation: buildCustomerExplanation(params.newPrimaryCohort),
          customerReasons: buildCustomerReasons(params.newPrimaryCohort, (previous.requiredDocuments as string[] | null) ?? []) as unknown as Prisma.InputJsonValue,
          internalReasons: previous.internalReasons ?? undefined,
          missingData: previous.missingData ?? undefined,
          requiredDocuments: previous.requiredDocuments ?? undefined,
          specialistReviewRequired: previous.specialistReviewRequired,
          specialistReviewReason: previous.specialistReviewReason,
          manualReviewRequired: false,
          confidence: previous.confidence,
          dataProvenance: previous.dataProvenance ?? undefined,
          consentVersion: previous.consentVersion,
        },
      }),
    ])

    const override = await this.prisma.cohortOverride.create({
      data: {
        previousDecisionId: previous.id,
        newDecisionId: newDecision.id,
        oldPrimaryCohort: previous.primaryCohort,
        newPrimaryCohort: params.newPrimaryCohort,
        reason: params.reason,
        actorId: actor.userId,
        approverId: params.approverId ?? null,
      },
    })

    this.log('DECISION_OVERRIDDEN', { bbsLeadId, previousDecisionId: previous.id, newDecisionId: newDecision.id })
    return { overridden: true, overrideId: override.id, newVersion: version }
  }

  /**
   * v3.0 §14.3: the explicit customer-decline path. Creates a new decision
   * version with `lifecycleState: CUSTOMER_DECLINED` (terminal) — never
   * mutates the prior decision, same immutability discipline as
   * `override()`.
   */
  async decline(bbsLeadId: string, reason: string | null, actor: { userId: string }) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const previous = await this.prisma.cohortDecision.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    if (!previous) throw new NotFoundException(`No cohort decision exists yet for lead ${bbsLeadId}`)

    const version = previous.version + 1
    const declinedAt = new Date()

    await this.prisma.cohortDecision.create({
      data: {
        leadId: lead.id,
        version,
        status: 'COMPLETED',
        ruleVersion: previous.ruleVersion,
        generatedAt: declinedAt,
        primaryCohort: previous.primaryCohort,
        lifecycleState: 'CUSTOMER_DECLINED',
        secondaryFlags: previous.secondaryFlags ?? undefined,
        archetype: previous.archetype,
        pathway: previous.pathway,
        capacityBand: previous.capacityBand,
        capacityRatio: previous.capacityRatio,
        sustainableCashFlow: previous.sustainableCashFlow,
        debtComplexityBand: previous.debtComplexityBand,
        planEligibility: previous.planEligibility,
        customerExplanation: previous.customerExplanation,
        customerReasons: previous.customerReasons ?? undefined,
        internalReasons: previous.internalReasons ?? undefined,
        missingData: previous.missingData ?? undefined,
        requiredDocuments: previous.requiredDocuments ?? undefined,
        specialistReviewRequired: previous.specialistReviewRequired,
        specialistReviewReason: previous.specialistReviewReason,
        manualReviewRequired: previous.manualReviewRequired,
        confidence: previous.confidence,
        dataProvenance: previous.dataProvenance ?? undefined,
        consentVersion: previous.consentVersion,
        declinedAt,
        declineReason: reason,
        decidedById: actor.userId,
        decidedAt: declinedAt,
      },
    })

    this.log('CUSTOMER_DECLINED', { bbsLeadId, previousDecisionId: previous.id })
    return { declined: true, newVersion: version }
  }

  /**
   * v3.0 §7.4's compliance feedback loop, step 1: a compliance reviewer
   * clears the hold. Never re-runs the full 24-rule evaluation (no new
   * upstream data exists to justify that — Master Profile's own
   * complianceRouting still reflects whatever triggered the hold in the
   * first place) — instead promotes the highest-priority REAL cohort
   * candidate already preserved in the prior decision's own
   * `secondaryFlags` at generation time (this module's own standing
   * "evaluate every rule, preserve every signal" discipline means that
   * list is already in §6.1 priority order), falling back to
   * MANUAL_REVIEW only when no real cohort candidate remains — the same
   * safe, non-arbitrary fallback used everywhere else in this module,
   * never a silently-invented default.
   */
  async clearCompliance(bbsLeadId: string, reason: string, actor: { userId: string }) {
    const { lead, previous } = await this.loadDecisionForComplianceAction(bbsLeadId)

    const secondaryFlags = (previous.secondaryFlags as unknown as Array<{ key: string; label: string; reason: string }> | null) ?? []
    const nextCandidate = secondaryFlags.find((f) => REAL_COHORT_KEYS.has(f.key))
    const newPrimaryCohort = (nextCandidate?.key as CohortPrimaryState | undefined) ?? 'MANUAL_REVIEW'
    const remainingSecondaryFlags = secondaryFlags.filter((f) => f.key !== newPrimaryCohort)

    return this.applyComplianceAction(bbsLeadId, lead.id, previous, newPrimaryCohort, remainingSecondaryFlags, 'CLEARED', reason, actor)
  }

  /**
   * v3.0 §7.4's compliance feedback loop, step 2: compliance declines —
   * "→ X2 with reason," per the spec's own explicit instruction (never a
   * different cohort, regardless of what else was in secondaryFlags).
   */
  async declineCompliance(bbsLeadId: string, reason: string, actor: { userId: string }) {
    const { lead, previous } = await this.loadDecisionForComplianceAction(bbsLeadId)
    const secondaryFlags = (previous.secondaryFlags as unknown as Array<{ key: string; label: string; reason: string }> | null) ?? []
    return this.applyComplianceAction(bbsLeadId, lead.id, previous, 'X2', secondaryFlags, 'DECLINED', reason, actor)
  }

  /** Shared precondition checks for both clearCompliance()/declineCompliance() — never act on a lead/decision that doesn't have an actual, unresolved compliance hold. */
  private async loadDecisionForComplianceAction(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const previous = await this.prisma.cohortDecision.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    if (!previous) throw new NotFoundException(`No cohort decision exists yet for lead ${bbsLeadId}`)
    if (!previous.complianceHold) {
      throw new BadRequestException('No compliance hold is active on the latest decision for this lead.')
    }
    if (previous.complianceClearedAt || previous.complianceDeclinedAt) {
      throw new BadRequestException('This compliance hold has already been resolved — a compliance action can only be taken once per hold.')
    }

    return { lead, previous }
  }

  /** Shared persistence for clearCompliance()/declineCompliance() — same immutable-new-version + linked-audit-row discipline as override(). */
  private async applyComplianceAction(
    bbsLeadId: string,
    leadId: string,
    previous: NonNullable<Awaited<ReturnType<CohortEngineService['loadDecisionForComplianceAction']>>>['previous'],
    newPrimaryCohort: CohortPrimaryState,
    remainingSecondaryFlags: Array<{ key: string; label: string; reason: string }>,
    action: CohortComplianceActionType,
    reason: string,
    actor: { userId: string },
  ) {
    const version = previous.version + 1
    const blocked = isBlockedReasonCode(newPrimaryCohort)
    const now = new Date()

    const [, newDecision] = await this.prisma.$transaction([
      this.prisma.cohortDecision.update({
        where: { id: previous.id },
        data: action === 'CLEARED' ? { complianceClearedAt: now } : { complianceDeclinedAt: now },
      }),
      this.prisma.cohortDecision.create({
        data: {
          leadId,
          version,
          status: 'COMPLETED',
          ruleVersion: previous.ruleVersion,
          generatedAt: now,
          primaryCohort: newPrimaryCohort,
          lifecycleState: blocked ? null : 'CCR_REVIEW',
          secondaryFlags: remainingSecondaryFlags as unknown as Prisma.InputJsonValue,
          archetype: previous.archetype,
          pathway: PATHWAY_BY_COHORT[newPrimaryCohort],
          capacityBand: previous.capacityBand,
          capacityRatio: previous.capacityRatio,
          sustainableCashFlow: previous.sustainableCashFlow as Prisma.Decimal | null,
          debtComplexityBand: previous.debtComplexityBand,
          planEligibility: PLAN_ELIGIBILITY_BY_COHORT[newPrimaryCohort],
          // CRITICAL: pathway/customerExplanation must reflect the NEW
          // cohort, never the compliance-held one's — same discipline as
          // override()'s own identical comment.
          customerExplanation: buildCustomerExplanation(newPrimaryCohort),
          customerReasons: buildCustomerReasons(newPrimaryCohort, (previous.requiredDocuments as string[] | null) ?? []) as unknown as Prisma.InputJsonValue,
          internalReasons: previous.internalReasons ?? undefined,
          missingData: previous.missingData ?? undefined,
          requiredDocuments: previous.requiredDocuments ?? undefined,
          specialistReviewRequired: previous.specialistReviewRequired,
          specialistReviewReason: previous.specialistReviewReason,
          manualReviewRequired: newPrimaryCohort === 'MANUAL_REVIEW',
          confidence: previous.confidence,
          dataProvenance: previous.dataProvenance ?? undefined,
          consentVersion: previous.consentVersion,
          // The hold itself is resolved either way — CLEARED routes to a
          // real cohort, DECLINED routes to X2 — but the compliance
          // trigger/entity/SLA facts are kept for audit, never erased.
          complianceHold: false,
          complianceReason: previous.complianceReason,
          complianceMatchedEntity: previous.complianceMatchedEntity,
          complianceSlaHours: previous.complianceSlaHours,
          complianceAgingState: action === 'CLEARED' ? 'COMPLIANCE_CLEARED' : 'COMPLIANCE_DECLINED',
          complianceClearedAt: action === 'CLEARED' ? now : null,
          complianceDeclinedAt: action === 'DECLINED' ? now : null,
        },
      }),
    ])

    await this.prisma.cohortComplianceDecision.create({
      data: {
        previousDecisionId: previous.id,
        newDecisionId: newDecision.id,
        action,
        oldPrimaryCohort: previous.primaryCohort,
        newPrimaryCohort,
        reason,
        actorId: actor.userId,
      },
    })

    this.log(action === 'CLEARED' ? 'COMPLIANCE_CLEARED' : 'COMPLIANCE_DECLINED', { bbsLeadId, previousDecisionId: previous.id, newDecisionId: newDecision.id, newPrimaryCohort })
    return { resolved: true, action, newPrimaryCohort, newVersion: version }
  }
}
