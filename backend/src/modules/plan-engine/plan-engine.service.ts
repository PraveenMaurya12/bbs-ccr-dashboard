import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, type Role } from '@prisma/client'

import { PrismaService } from '@/common/prisma/prisma.service'
import type { AppConfig } from '@/config/configuration'
import { AnalysisService } from '@/modules/analysis/analysis.service'
import { CohortEngineService } from '@/modules/cohort-engine/cohort-engine.service'
import { MasterProfileService } from '@/modules/master-profile/master-profile.service'
import { PathwayEngineService } from '@/modules/pathway-engine/pathway-engine.service'
import { buildChangeSummary } from './calculations/change-summary'
import { composePlan } from './calculations/compose-plan'
import { buildPlanInput } from './calculations/normalize-input'
import type { NormalizeInputParams } from './calculations/normalize-input'
import { evaluatePlanGate } from './calculations/rules'
import type { BbsPlanActionStatus, BbsPlanLifecycleStatus, PlanEngineConfig, PlanRuleResultOutput } from './plan-engine.types'
import { getTemplate } from './templates/registry'

/** v3.0 §11.2 — the one legal-transition table for BbsPlanAction.status, enforced on the backend (never just a UI affordance). */
const LEGAL_ACTION_TRANSITIONS: Record<BbsPlanActionStatus, BbsPlanActionStatus[]> = {
  PENDING: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED', 'COMPLETE'],
  IN_PROGRESS: ['COMPLETE', 'BLOCKED', 'FAILED', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED', 'ESCALATED'],
  FAILED: ['IN_PROGRESS', 'ESCALATED', 'CANCELLED'],
  ESCALATED: ['IN_PROGRESS', 'COMPLETE', 'CANCELLED'],
  COMPLETE: [],
  CANCELLED: [],
}

type CohortDecisionCompleted = Extract<Awaited<ReturnType<CohortEngineService['getForLead']>>, { status: 'COMPLETED' }>
type MasterProfileCompleted = Extract<Awaited<ReturnType<MasterProfileService['getForLead']>>, { status: 'COMPLETED' }>
type PathwayDecisionCompleted = Extract<Awaited<ReturnType<PathwayEngineService['getForLead']>>, { status: 'COMPLETED' }>

/**
 * Orchestrates the BBS Plan Engine: load the latest Cohort Decision +
 * Pathway Decision (BBS Pathway Engine v3.0, L5 — both must be COMPLETED
 * and not stale, the two real preconditions; see this module's own build
 * notes for why generation never refuses based on WHICH cohort/pathway
 * was decided) + Master Profile -> normalize -> resolve a template from
 * the Template Registry (now keyed on the Pathway Decision's own
 * `primaryPathway`, never Cohort Decision's own simpler static map) ->
 * compose a plan deterministically -> persist a new, immutable, versioned
 * BbsPlan + its actions/conditions -> fire the RECOVERY_PLAN_GENERATION AI
 * narrative job (best-effort, customer-safe explanation ONLY — never a
 * decision input; spec's own AI Guardrails).
 */
@Injectable()
export class PlanEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cohortEngineService: CohortEngineService,
    private readonly masterProfileService: MasterProfileService,
    private readonly pathwayEngineService: PathwayEngineService,
    private readonly analysisService: AnalysisService,
  ) {}

  private get config(): PlanEngineConfig {
    return this.configService.get<AppConfig>('app')!.planEngine
  }

  private log(event: string, details: Record<string, string | number | undefined>): void {
    const parts = Object.entries(details)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
    console.log(`[PlanEngine] ${event} ${parts.join(' ')}`)
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  }

  async generate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const cohortDecision = await this.cohortEngineService.getForLead(bbsLeadId)
    if (!cohortDecision.decisionAvailable) {
      return { generated: false, reason: 'No Cohort Decision exists yet for this lead — run the Cohort Engine first.' }
    }
    if (cohortDecision.status !== 'COMPLETED') {
      return { generated: false, reason: 'Cohort Decision has not completed for this lead yet.' }
    }
    if (cohortDecision.isStale) {
      return { generated: false, reason: 'Cohort Decision is stale — re-evaluate it before generating a Plan.' }
    }

    const pathwayDecision = await this.pathwayEngineService.getForLead(bbsLeadId)
    if (!pathwayDecision.decisionAvailable) {
      return { generated: false, reason: 'No Pathway Decision exists yet for this lead — run the Pathway Engine first.' }
    }
    if (pathwayDecision.status !== 'COMPLETED') {
      return { generated: false, reason: 'Pathway Decision has not completed for this lead yet.' }
    }
    if (pathwayDecision.isStale) {
      return { generated: false, reason: 'Pathway Decision is stale — re-evaluate it before generating a Plan.' }
    }
    const pathwayCompleted = pathwayDecision as PathwayDecisionCompleted

    // v3.0 §4.2 PL001 — the single Plan Generation Gate. GENERATE and
    // PLACEHOLDER/TERMINAL all still compose a real, thinner plan (see
    // evaluatePlanGate's own doc comment for why); only ERROR (an invalid
    // L5 state, or an expired Pathway Decision) refuses generation.
    const gate = evaluatePlanGate({
      pathwayDecisionAvailable: true,
      pathwayStatus: pathwayCompleted.pathwayStatus,
      primaryPathway: pathwayCompleted.primaryPathway,
      blockingReason: pathwayCompleted.blockingReason,
      ttlLiveStatus: pathwayCompleted.ttl?.liveStatus ?? null,
    })
    if (gate.outcome === 'ERROR') {
      return { generated: false, reason: gate.reason }
    }

    const masterProfile = await this.masterProfileService.getForLead(bbsLeadId)
    const masterProfileCompleted = masterProfile.profileAvailable && masterProfile.status === 'COMPLETED' ? (masterProfile as MasterProfileCompleted) : null
    if (masterProfileCompleted?.isStale) {
      return { generated: false, reason: 'Master Profile is stale — regenerate it before generating a Plan.' }
    }

    // CohortEngineService.getForLead() doesn't expose the underlying row's
    // own id (only version/facts) — a direct, minimal lookup for the id
    // only (never re-deriving any Cohort Engine logic), same precedent as
    // master-profile.service.ts's own direct CreditReport/
    // BankStatementAnalysis id lookups for its staleness check.
    const cohortDecisionRow = await this.prisma.cohortDecision.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    const pathwayDecisionRow = await this.prisma.pathwayDecision.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })

    const previousVersion = await this.prisma.bbsPlan.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    const version = (previousVersion?.version ?? 0) + 1

    let plan: { id: string }
    try {
      plan = await this.prisma.bbsPlan.create({
        data: { leadId: lead.id, version, generationStatus: 'GENERATING', templateId: '', templateVersion: this.config.templateRegistryVersion },
      })
    } catch (error) {
      // The read-then-create above is not transactional — two
      // near-simultaneous generate() calls for the same lead can both
      // read the same previousVersion and race to create() the same
      // (leadId, version) pair. The @@unique constraint safely prevents a
      // duplicate row either way; this just turns the loser's unique-
      // violation into a clean, specific reason instead of a generic
      // unhandled 500.
      if (this.isUniqueViolation(error)) {
        return { generated: false, reason: 'A plan generation is already in progress for this lead — refresh and retry.' }
      }
      throw error
    }

    try {
      const completed = cohortDecision as CohortDecisionCompleted
      const normalizeParams: NormalizeInputParams = {
        leadId: lead.id,
        bbsLeadId,
        customerName: lead.fullName,
        cohortDecision: {
          primaryCohort: completed.primaryCohort,
          // Authoritative pathway now comes from the Pathway Engine (L5),
          // never Cohort Decision's own simpler static cohort->pathway
          // map — see this module's own doc comment above.
          pathway: pathwayCompleted.primaryPathway,
          pathwayVariant: pathwayCompleted.pathwayVariant,
          planEligibility: completed.planEligibility,
          archetype: completed.archetype,
          specialistReviewRequired: completed.specialistReviewRequired,
          manualReviewRequired: completed.manualReviewRequired,
          confidence: completed.confidence,
          capacityBand: completed.capacityBand,
          capacityRatio: completed.capacityRatio,
          sustainableCashFlow: completed.sustainableCashFlow,
          stabilisationCoverage: completed.stabilisationCoverage,
          debtComplexityBand: completed.debtComplexityBand,
          secondaryFlags: (completed.secondaryFlags as NormalizeInputParams['cohortDecision']['secondaryFlags']) ?? [],
          missingData: (completed.missingData as NormalizeInputParams['cohortDecision']['missingData']) ?? [],
          customerExplanation: completed.customerExplanation,
        },
        pathwayRiskFlags: (pathwayCompleted.riskFlags as string[] | null) ?? [],
        masterProfile: masterProfileCompleted
          ? {
              alignmentState: masterProfileCompleted.alignmentState,
              resolutionCapacity: masterProfileCompleted.resolutionCapacity,
              overallConfidence: masterProfileCompleted.overallConfidence,
              bureauDsrPercent: masterProfileCompleted.bureauDsrPercent,
              bankDsrPercent: masterProfileCompleted.bankDsrPercent,
              masterDsrPercent: masterProfileCompleted.masterDsrPercent,
            }
          : null,
      }

      const input = buildPlanInput(normalizeParams)
      const template = getTemplate(input.cohort, input.pathway, input.pathwayVariant)
      const composition = composePlan(input, template, this.config)

      const gateRuleResult: PlanRuleResultOutput = { ruleId: 'PL001', evaluation: gate.outcome === 'GENERATE' ? 'FIRED' : 'NOT_FIRED', reason: `Gate outcome: ${gate.outcome} — ${gate.reason}`, evidence: { outcome: gate.outcome } }
      const ruleResults = [gateRuleResult, ...composition.ruleResults]

      const ttlExpiresAt = composition.planTtlDays ? new Date(Date.now() + composition.planTtlDays * 24 * 60 * 60 * 1000) : new Date(Date.now() + this.config.placeholderTtlDays * 24 * 60 * 60 * 1000)
      const planTtlDays = composition.planTtlDays ?? this.config.placeholderTtlDays

      // v3.0 §19.3/§19.6 — a best-effort, field-level change summary
      // against the immediately-prior version (if any), never a full
      // recursive diff (see this module's own parity matrix for why).
      const changeSummary = previousVersion
        ? buildChangeSummary(
            { cohort: previousVersion.cohort, pathway: previousVersion.pathway, templateId: previousVersion.templateId },
            { cohort: composition.cohort, pathway: composition.pathway, templateId: composition.templateId },
          )
        : null

      const bbsPlanFacts = {
        cohort: composition.cohort,
        pathway: composition.pathway,
        templateId: composition.templateId,
        situationAssessment: composition.situationAssessment,
        problemDefinition: composition.problemDefinition,
        financialCapacity: composition.financialCapacity,
        debtStrategy: composition.debtStrategy,
        financialTargets: composition.financialTargets,
        debtTargets: composition.debtTargets,
        risks: composition.risks,
        disclosures: composition.disclosures,
        successCriteria: composition.successCriteria,
        monitoringTriggers: composition.monitoringTriggers,
        reviewSchedule: composition.reviewSchedule,
        actions: composition.actions,
        conditions: composition.conditions,
      }

      await this.prisma.$transaction([
        this.prisma.bbsPlanAction.createMany({
          data: composition.actions.map((a) => ({
            planId: plan.id,
            actionId: a.actionId,
            ownerType: a.ownerType,
            phase: a.phase,
            description: a.description,
            owner: a.owner,
            timing: a.timing,
            dependency: a.dependency ?? null,
            evidenceRequired: a.evidenceRequired ? (a.evidenceRequired as unknown as Prisma.InputJsonValue) : undefined,
            status: a.status,
            slaDays: a.slaDays ?? null,
          })),
        }),
        this.prisma.bbsPlanCondition.createMany({
          data: composition.conditions.map((c) => ({
            planId: plan.id,
            conditionId: c.conditionId,
            description: c.description,
            state: c.state,
            source: c.source,
            verificationStatus: c.verificationStatus,
            priority: c.priority ?? null,
            escalationPath: c.escalationPath ?? null,
          })),
        }),
        this.prisma.bbsPlan.update({
          where: { id: plan.id },
          data: {
            generationStatus: 'COMPLETED',
            generatedAt: new Date(),
            lifecycleStatus: composition.lifecycleStatus,
            templateId: composition.templateId,
            templateVersion: composition.templateVersion,
            sourceCohortDecisionId: cohortDecisionRow?.id ?? null,
            sourceCohortDecisionVersion: completed.version,
            sourceCohortDecisionGeneratedAt: completed.generatedAt ? new Date(completed.generatedAt) : null,
            sourcePathwayDecisionId: pathwayDecisionRow?.id ?? null,
            sourcePathwayDecisionVersion: pathwayCompleted.version,
            sourcePathwayDecisionGeneratedAt: pathwayCompleted.generatedAt ? new Date(pathwayCompleted.generatedAt) : null,
            sourceMasterProfileVersion: masterProfileCompleted?.version ?? null,
            cohort: composition.cohort,
            pathway: composition.pathway,
            situationAssessment: composition.situationAssessment as unknown as Prisma.InputJsonValue,
            problemDefinition: composition.problemDefinition as unknown as Prisma.InputJsonValue,
            financialCapacity: composition.financialCapacity as unknown as Prisma.InputJsonValue,
            debtStrategy: composition.debtStrategy as unknown as Prisma.InputJsonValue,
            financialTargets: composition.financialTargets as unknown as Prisma.InputJsonValue,
            debtTargets: composition.debtTargets as unknown as Prisma.InputJsonValue,
            risks: composition.risks as unknown as Prisma.InputJsonValue,
            disclosures: composition.disclosures as unknown as Prisma.InputJsonValue,
            successCriteria: composition.successCriteria as unknown as Prisma.InputJsonValue,
            monitoringTriggers: composition.monitoringTriggers as unknown as Prisma.InputJsonValue,
            reviewSchedule: composition.reviewSchedule as unknown as Prisma.InputJsonValue,
            dataProvenance: composition.dataProvenance as unknown as Prisma.InputJsonValue,
            missingData: composition.missingData ? (composition.missingData as unknown as Prisma.InputJsonValue) : undefined,
            customerExplanation: composition.customerExplanation,
            specialistReviewRequired: composition.specialistReviewRequired,
            ruleResults: ruleResults as unknown as Prisma.InputJsonValue,
            planTtlDays,
            ttlExpiresAt,
            changeSummary: changeSummary ? (changeSummary as unknown as Prisma.InputJsonValue) : undefined,
          },
        }),
      ])

      this.log('PLAN_GENERATED', { bbsLeadId, planId: plan.id, version, templateId: composition.templateId })

      // Best-effort: advisory AI narrative never re-triggers generation on failure.
      await this.analysisService
        .createAndRun({ bbsLeadId, jobType: 'RECOVERY_PLAN_GENERATION', payload: { bbsPlanFacts } })
        .catch((error) => {
          this.log('NARRATIVE_JOB_FAILED_TO_START', { bbsLeadId, error: error instanceof Error ? error.message : String(error) })
        })

      return { generated: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown plan-engine generation error'
      await this.prisma.bbsPlan.update({ where: { id: plan.id }, data: { generationStatus: 'FAILED', errorMessage: message } })
      this.log('PLAN_FAILED', { bbsLeadId, planId: plan.id, error: message })
      return { generated: false, reason: message }
    }
  }

  /** Spec's own two separate endpoints — same underlying operation; reassess is a documented alias (mirrors CohortEngineService's recalculate -> evaluate). */
  async reassess(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    return this.generate(bbsLeadId)
  }

  async getForLead(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const plan = await this.prisma.bbsPlan.findFirst({
      where: { leadId: lead.id },
      orderBy: { version: 'desc' },
      include: { actions: true, conditions: true },
    })

    if (!plan) {
      const cohortDecision = await this.cohortEngineService.getForLead(bbsLeadId)
      const cohortDecisionReady = cohortDecision.decisionAvailable && cohortDecision.status === 'COMPLETED' && !cohortDecision.isStale
      return { planAvailable: false as const, cohortDecisionReady }
    }

    if (plan.generationStatus !== 'COMPLETED') {
      return { planAvailable: true as const, status: plan.generationStatus, errorMessage: plan.errorMessage }
    }

    // Has the Cohort Decision or Pathway Decision moved to a newer version
    // since this plan was generated? Same cheap source-version-diff
    // staleness discipline CohortDecision/MasterProfile's own
    // getForLead() already uses — checked against BOTH upstream sources
    // now that Plan Engine consumes Pathway Engine's output too.
    const currentCohortDecision = await this.cohortEngineService.getForLead(bbsLeadId)
    const currentPathwayDecision = await this.pathwayEngineService.getForLead(bbsLeadId)
    const cohortStale = currentCohortDecision.decisionAvailable && currentCohortDecision.status === 'COMPLETED' && currentCohortDecision.version !== plan.sourceCohortDecisionVersion
    const pathwayStale = currentPathwayDecision.decisionAvailable && currentPathwayDecision.status === 'COMPLETED' && currentPathwayDecision.version !== plan.sourcePathwayDecisionVersion
    const isStale = cohortStale || pathwayStale

    const narrativeJob = await this.prisma.analysisJob.findFirst({
      where: { leadId: lead.id, jobType: 'RECOVERY_PLAN_GENERATION' },
      orderBy: { createdAt: 'desc' },
      include: { result: true },
    })
    const narrative = narrativeJob
      ? {
          status: narrativeJob.status,
          findings: narrativeJob.result?.findings as Record<string, unknown> | undefined,
          confidence: narrativeJob.result?.confidence ?? null,
          modelVersion: narrativeJob.result?.modelVersion,
          generatedAt: narrativeJob.result?.createdAt.toISOString(),
        }
      : null

    // v3.0 §12.5 — live-computed TTL status, never trusting a stale
    // snapshot. A plan that has already progressed to EXECUTION_READY/
    // ACTIVE/COMPLETED is treated as accepted (no customer portal exists
    // to drive a separate presentedAt/acceptedAt pair here — a documented
    // limitation, same as Pathway Engine's own).
    const accepted = plan.lifecycleStatus !== null && (['EXECUTION_READY', 'ACTIVE', 'COMPLETED'] as const).includes(plan.lifecycleStatus as 'EXECUTION_READY' | 'ACTIVE' | 'COMPLETED')
    const liveTtlStatus: 'ACTIVE' | 'EXPIRED' | 'ACCEPTED_NO_EXPIRY' | 'NOT_APPLICABLE' = !plan.ttlExpiresAt ? 'NOT_APPLICABLE' : accepted ? 'ACCEPTED_NO_EXPIRY' : new Date().getTime() > plan.ttlExpiresAt.getTime() ? 'EXPIRED' : 'ACTIVE'

    return {
      planAvailable: true as const,
      status: 'COMPLETED' as const,
      version: plan.version,
      templateId: plan.templateId,
      templateVersion: plan.templateVersion,
      isStale,
      generatedAt: plan.generatedAt?.toISOString() ?? null,
      cohort: plan.cohort,
      pathway: plan.pathway,
      lifecycleStatus: plan.lifecycleStatus,
      situationAssessment: plan.situationAssessment,
      problemDefinition: plan.problemDefinition,
      financialCapacity: plan.financialCapacity,
      debtStrategy: plan.debtStrategy,
      financialTargets: plan.financialTargets,
      debtTargets: plan.debtTargets,
      risks: plan.risks,
      disclosures: plan.disclosures,
      successCriteria: plan.successCriteria,
      monitoringTriggers: plan.monitoringTriggers,
      reviewSchedule: plan.reviewSchedule,
      dataProvenance: plan.dataProvenance,
      missingData: plan.missingData,
      customerExplanation: plan.customerExplanation,
      specialistReviewRequired: plan.specialistReviewRequired,
      ruleResults: plan.ruleResults,
      changeSummary: plan.changeSummary,
      ttl: { planTtlDays: plan.planTtlDays, expiresAt: plan.ttlExpiresAt?.toISOString() ?? null, liveStatus: liveTtlStatus },
      actions: plan.actions.map((a) => ({ actionId: a.actionId, ownerType: a.ownerType, phase: a.phase, description: a.description, owner: a.owner, timing: a.timing, dependency: a.dependency, evidenceRequired: a.evidenceRequired, status: a.status, slaDays: a.slaDays })),
      conditions: plan.conditions.map((c) => ({ conditionId: c.conditionId, description: c.description, state: c.state, source: c.source, verificationStatus: c.verificationStatus, priority: c.priority, escalationPath: c.escalationPath, verificationEvidence: c.verificationEvidence, verifiedById: c.verifiedById })),
      narrative,
    }
  }

  async getHistory(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const plans = await this.prisma.bbsPlan.findMany({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    return plans.map((p) => ({
      version: p.version,
      generationStatus: p.generationStatus,
      lifecycleStatus: p.lifecycleStatus,
      cohort: p.cohort,
      pathway: p.pathway,
      templateId: p.templateId,
      generatedAt: p.generatedAt?.toISOString() ?? null,
      changeSummary: p.changeSummary,
    }))
  }

  private async transitionLifecycle(bbsLeadId: string, from: BbsPlanLifecycleStatus[], to: BbsPlanLifecycleStatus): Promise<{ updated: boolean; reason?: string; lifecycleStatus?: BbsPlanLifecycleStatus }> {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const plan = await this.prisma.bbsPlan.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    if (!plan || plan.generationStatus !== 'COMPLETED') {
      return { updated: false, reason: 'No completed Plan exists yet for this lead.' }
    }
    if (!plan.lifecycleStatus || !from.includes(plan.lifecycleStatus)) {
      return { updated: false, reason: `Plan must be in one of [${from.join(', ')}] for this action — it is currently ${plan.lifecycleStatus ?? 'unset'}.` }
    }

    await this.prisma.bbsPlan.update({ where: { id: plan.id }, data: { lifecycleStatus: to } })
    this.log('PLAN_LIFECYCLE_TRANSITIONED', { bbsLeadId, planId: plan.id, from: plan.lifecycleStatus, to })
    return { updated: true, lifecycleStatus: to }
  }

  /**
   * DRAFT -> (specialist-required ? SPECIALIST_REVIEW : CCR_REVIEW), per
   * the spec's own submit-review contract. A SPECIALIST_REVIEW plan calls
   * this endpoint a second time once the specialist has cleared it,
   * moving SPECIALIST_REVIEW -> CCR_REVIEW (a routine CCR review from
   * here) — a deliberate simplification (no separate specialist-role
   * workflow exists in this codebase yet) rather than a new endpoint. The
   * thinner templates (X1/X2/pending-resolution) already start at
   * CCR_REVIEW and so never call this endpoint at all.
   */
  async submitReview(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)
    const plan = await this.prisma.bbsPlan.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    if (!plan || plan.generationStatus !== 'COMPLETED') {
      return { updated: false, reason: 'No completed Plan exists yet for this lead.' }
    }

    if (plan.lifecycleStatus === 'DRAFT') {
      const to: BbsPlanLifecycleStatus = plan.specialistReviewRequired ? 'SPECIALIST_REVIEW' : 'CCR_REVIEW'
      await this.prisma.bbsPlan.update({ where: { id: plan.id }, data: { lifecycleStatus: to } })
      this.log('PLAN_LIFECYCLE_TRANSITIONED', { bbsLeadId, planId: plan.id, from: 'DRAFT', to })
      return { updated: true, lifecycleStatus: to }
    }
    if (plan.lifecycleStatus === 'SPECIALIST_REVIEW') {
      await this.prisma.bbsPlan.update({ where: { id: plan.id }, data: { lifecycleStatus: 'CCR_REVIEW' } })
      this.log('PLAN_LIFECYCLE_TRANSITIONED', { bbsLeadId, planId: plan.id, from: 'SPECIALIST_REVIEW', to: 'CCR_REVIEW' })
      return { updated: true, lifecycleStatus: 'CCR_REVIEW' as BbsPlanLifecycleStatus }
    }
    return { updated: false, reason: `Plan must be DRAFT or SPECIALIST_REVIEW for this action — it is currently ${plan.lifecycleStatus ?? 'unset'}.` }
  }

  /**
   * CCR-attested customer acceptance (CCR_REVIEW -> EXECUTION_READY) —
   * this dashboard has no customer-facing portal, so "the customer was
   * presented the plan and accepted it" is recorded as one CCR-attested
   * action rather than two separate steps through
   * CUSTOMER_ACCEPTANCE_PENDING (a documented, known limitation — that
   * status remains in the schema per the spec's own lifecycle vocabulary,
   * reachable only via a supervisor override in this build).
   */
  async accept(bbsLeadId: string) {
    return this.transitionLifecycle(bbsLeadId, ['CCR_REVIEW'], 'EXECUTION_READY')
  }

  async activate(bbsLeadId: string) {
    return this.transitionLifecycle(bbsLeadId, ['EXECUTION_READY'], 'ACTIVE')
  }

  /**
   * CCR/supervisor override of the current plan's lifecycle status —
   * never mutates the prior plan. Creates a new, immutable plan version
   * (copying its composed content and actions/conditions forward) with a
   * linked audit row, mirroring CohortOverride exactly.
   */
  async override(bbsLeadId: string, params: { newLifecycleStatus: BbsPlanLifecycleStatus; reason: string }, actor: { userId: string; role: Role }) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const previous = await this.prisma.bbsPlan.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' }, include: { actions: true, conditions: true } })
    if (!previous) throw new NotFoundException(`No Plan exists yet for lead ${bbsLeadId}`)

    const version = previous.version + 1

    // v3.0 §19.6/§20.5 — override impact assessment, same shared
    // materiality logic as a routine reassess(), plus the lifecycle
    // transition itself.
    const changeSummary = {
      changes: [{ field: 'lifecycleStatus', from: previous.lifecycleStatus, to: params.newLifecycleStatus }],
      materiality: 'HIGH' as const,
      overrideReason: params.reason,
    }

    const newPlan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bbsPlan.create({
        data: {
          leadId: lead.id,
          version,
          generationStatus: 'COMPLETED',
          generatedAt: new Date(),
          lifecycleStatus: params.newLifecycleStatus,
          templateId: previous.templateId,
          templateVersion: previous.templateVersion,
          sourceCohortDecisionId: previous.sourceCohortDecisionId,
          sourceCohortDecisionVersion: previous.sourceCohortDecisionVersion,
          sourceCohortDecisionGeneratedAt: previous.sourceCohortDecisionGeneratedAt,
          sourcePathwayDecisionId: previous.sourcePathwayDecisionId,
          sourcePathwayDecisionVersion: previous.sourcePathwayDecisionVersion,
          sourcePathwayDecisionGeneratedAt: previous.sourcePathwayDecisionGeneratedAt,
          sourceMasterProfileVersion: previous.sourceMasterProfileVersion,
          cohort: previous.cohort,
          pathway: previous.pathway,
          situationAssessment: previous.situationAssessment ?? undefined,
          problemDefinition: previous.problemDefinition ?? undefined,
          financialCapacity: previous.financialCapacity ?? undefined,
          debtStrategy: previous.debtStrategy ?? undefined,
          financialTargets: previous.financialTargets ?? undefined,
          debtTargets: previous.debtTargets ?? undefined,
          risks: previous.risks ?? undefined,
          disclosures: previous.disclosures ?? undefined,
          successCriteria: previous.successCriteria ?? undefined,
          monitoringTriggers: previous.monitoringTriggers ?? undefined,
          reviewSchedule: previous.reviewSchedule ?? undefined,
          dataProvenance: previous.dataProvenance ?? undefined,
          missingData: previous.missingData ?? undefined,
          customerExplanation: previous.customerExplanation,
          specialistReviewRequired: previous.specialistReviewRequired,
          ruleResults: previous.ruleResults ?? undefined,
          planTtlDays: previous.planTtlDays,
          ttlExpiresAt: previous.ttlExpiresAt,
          changeSummary: changeSummary as unknown as Prisma.InputJsonValue,
        },
      })

      await tx.bbsPlanAction.createMany({
        data: previous.actions.map((a) => ({ planId: created.id, actionId: a.actionId, ownerType: a.ownerType, phase: a.phase, description: a.description, owner: a.owner, timing: a.timing, dependency: a.dependency, evidenceRequired: a.evidenceRequired ?? undefined, status: a.status, slaDays: a.slaDays })),
      })
      await tx.bbsPlanCondition.createMany({
        data: previous.conditions.map((c) => ({ planId: created.id, conditionId: c.conditionId, description: c.description, state: c.state, source: c.source, verificationStatus: c.verificationStatus, priority: c.priority, escalationPath: c.escalationPath })),
      })

      return created
    })

    const override = await this.prisma.bbsPlanOverride.create({
      data: {
        previousPlanId: previous.id,
        newPlanId: newPlan.id,
        oldLifecycleStatus: previous.lifecycleStatus,
        newLifecycleStatus: params.newLifecycleStatus,
        reason: params.reason,
        actorId: actor.userId,
      },
    })

    this.log('PLAN_OVERRIDDEN', { bbsLeadId, previousPlanId: previous.id, newPlanId: newPlan.id })
    return { overridden: true, overrideId: override.id, newVersion: version }
  }

  /**
   * v3.0 §11.2 — the one real, DB-enforced action state machine (was
   * previously an untyped, never-transitioned free string). Operates on
   * the CURRENT (latest-version) plan's action rows only — an action
   * belongs to one immutable plan version, never retroactively rewritten
   * onto an older version.
   */
  async updateActionStatus(bbsLeadId: string, actionId: string, newStatus: BbsPlanActionStatus): Promise<{ updated: boolean; reason?: string; status?: BbsPlanActionStatus }> {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const plan = await this.prisma.bbsPlan.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    if (!plan || plan.generationStatus !== 'COMPLETED') {
      return { updated: false, reason: 'No completed Plan exists yet for this lead.' }
    }

    const action = await this.prisma.bbsPlanAction.findFirst({ where: { planId: plan.id, actionId } })
    if (!action) throw new NotFoundException(`Action ${actionId} was not found on the current Plan for lead ${bbsLeadId}`)

    const legalNextStates = LEGAL_ACTION_TRANSITIONS[action.status]
    if (!legalNextStates.includes(newStatus)) {
      return { updated: false, reason: `Action ${actionId} is ${action.status} — cannot transition directly to ${newStatus}. Legal next states: [${legalNextStates.join(', ') || 'none, terminal state'}].` }
    }

    await this.prisma.bbsPlanAction.update({ where: { id: action.id }, data: { status: newStatus } })
    this.log('PLAN_ACTION_STATUS_UPDATED', { bbsLeadId, planId: plan.id, actionId, from: action.status, to: newStatus })
    return { updated: true, status: newStatus }
  }

  /**
   * v3.0 §13.3 — the condition transition table. `evidence`/`verifiedBy`
   * are optional: a CCR flipping a condition to FAILED with a note need
   * not always cite independent verification evidence.
   */
  async updateConditionStatus(bbsLeadId: string, conditionId: string, params: { newState: 'MET' | 'PENDING' | 'FAILED' | 'UNKNOWN'; verificationEvidence?: string }, actor: { userId: string }): Promise<{ updated: boolean; reason?: string; state?: string }> {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const plan = await this.prisma.bbsPlan.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    if (!plan || plan.generationStatus !== 'COMPLETED') {
      return { updated: false, reason: 'No completed Plan exists yet for this lead.' }
    }

    const condition = await this.prisma.bbsPlanCondition.findFirst({ where: { planId: plan.id, conditionId } })
    if (!condition) throw new NotFoundException(`Condition ${conditionId} was not found on the current Plan for lead ${bbsLeadId}`)
    if (condition.state === 'NOT_APPLICABLE') {
      return { updated: false, reason: `Condition ${conditionId} is NOT_APPLICABLE and cannot be transitioned (no live product/lender integration exists to verify it).` }
    }

    // v3.0 §13.3's transition table: PENDING->MET/FAILED/UNKNOWN,
    // MET->FAILED (new evidence invalidates), FAILED->PENDING (new
    // evidence requested). UNKNOWN behaves like PENDING for this purpose
    // (no evidence yet, in either direction).
    const legalFrom: Record<string, string[]> = { PENDING: ['MET', 'FAILED', 'UNKNOWN'], UNKNOWN: ['MET', 'FAILED', 'PENDING'], MET: ['FAILED'], FAILED: ['PENDING'] }
    if (!legalFrom[condition.state]?.includes(params.newState)) {
      return { updated: false, reason: `Condition ${conditionId} is ${condition.state} — cannot transition directly to ${params.newState}.` }
    }

    await this.prisma.bbsPlanCondition.update({
      where: { id: condition.id },
      data: {
        state: params.newState,
        verificationStatus: params.newState === 'MET' || params.newState === 'FAILED' ? 'VERIFIED' : 'UNVERIFIED',
        verificationEvidence: params.verificationEvidence ?? condition.verificationEvidence,
        verifiedById: actor.userId,
      },
    })
    this.log('PLAN_CONDITION_STATE_UPDATED', { bbsLeadId, planId: plan.id, conditionId, from: condition.state, to: params.newState })
    return { updated: true, state: params.newState }
  }
}
