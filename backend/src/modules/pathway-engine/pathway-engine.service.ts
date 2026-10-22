import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'

import { PrismaService } from '@/common/prisma/prisma.service'
import type { AppConfig } from '@/config/configuration'
import { CohortEngineService } from '@/modules/cohort-engine/cohort-engine.service'
import { MasterProfileService } from '@/modules/master-profile/master-profile.service'
import { computeAlternativePathways } from './calculations/alternatives'
import { buildSequencingHint, buildCustomerReasons, buildInternalReasons, buildNextActions } from './calculations/customer-explanation'
import { resolvePathwayConfidence } from './calculations/confidence'
import { buildPathwayInput, type NormalizeInputParams } from './calculations/normalize-input'
import { resolvePathwayPrecedence } from './calculations/precedence'
import {
  p001GateAndBlockInheritance,
  p002CohortToPathwayMapping,
  p003CapacityBandToPathway,
  p004ArchetypeInfluence,
  p005FcfReconciliationGate,
  p006ComplianceGate,
  p007SpecialistReviewGate,
  p008PostStatementDebtGate,
  p009OtherAccountsGate,
  p010ResolutionCapacityInheritance,
  p011ProductAvailabilityCheck,
  p012LenderApprovalRequirement,
  p013DataQualityBandCap,
  p014DimensionConfidenceCap,
  p015ExceptionCountThreshold,
  p016P1MissingInfoThreshold,
  p017SequentialPathwayLogic,
  p018NinetyDayEligibility,
  p019PathwayPrecedence,
  p020AlternativePathwayDetermination,
} from './calculations/rules'
import { computePathwayTtl, computeLiveTtlStatus } from './calculations/ttl'
import type { PathwayEngineConfig, PathwayInput, PathwayRuleResultOutput } from './pathway-engine.types'

type CohortDecisionCompleted = Extract<Awaited<ReturnType<CohortEngineService['getForLead']>>, { status: 'COMPLETED' }>
type MasterProfileCompleted = Extract<Awaited<ReturnType<MasterProfileService['getForLead']>>, { status: 'COMPLETED' }>

/**
 * Orchestrates the BBS Pathway Engine (L5): load the latest Cohort
 * Decision (must be COMPLETED and not stale) + Master Profile -> build
 * PathwayInput from their already-computed output only -> evaluate P001-
 * P020 -> resolve §7's precedence table (with §9.3/§9.4 C1/C7
 * disambiguation) -> compute confidence/alternatives/TTL/customer
 * explanation -> persist a new, immutable, versioned PathwayDecision +
 * its rule results. Never recomputes an L1-L4 fact, never overrides L4's
 * primary state (spec's own explicit "Does NOT" list).
 */
@Injectable()
export class PathwayEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cohortEngineService: CohortEngineService,
    private readonly masterProfileService: MasterProfileService,
  ) {}

  private get config(): PathwayEngineConfig {
    return this.configService.get<AppConfig>('app')!.pathwayEngine
  }

  private get cohortConfig() {
    return this.configService.get<AppConfig>('app')!.cohortEngine
  }

  private log(event: string, details: Record<string, string | number | undefined>): void {
    const parts = Object.entries(details)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
    console.log(`[PathwayEngine] ${event} ${parts.join(' ')}`)
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  }

  private evaluateAllRules(input: PathwayInput, hasPriorDecision: boolean, priorPathway: string | null): PathwayRuleResultOutput[] {
    const v = this.config.ruleVersion
    const p001 = p001GateAndBlockInheritance(input, v)
    const p002 = p002CohortToPathwayMapping(input, p001, v)
    const p003 = p003CapacityBandToPathway(input, p001, v)
    const p005 = p005FcfReconciliationGate(input, v)

    // Precedence must run before P017/P018/P020 (they need the resolved
    // primary pathway), but all other rules are independent — evaluated
    // first here, then precedence, then the pathway-dependent rules.
    const preliminary = [p001, p002, p003, p004ArchetypeInfluence(input, v), p005, p006ComplianceGate(input, v), p007SpecialistReviewGate(input, v), p008PostStatementDebtGate(input, v), p009OtherAccountsGate(input, v), p010ResolutionCapacityInheritance(input, v), p011ProductAvailabilityCheck(v), p012LenderApprovalRequirement(v), p013DataQualityBandCap(input, v), p014DimensionConfidenceCap(input, v), p015ExceptionCountThreshold(input, v), p016P1MissingInfoThreshold(input, this.cohortConfig.p1ForceBlockThreshold, v)]

    const precedence = resolvePathwayPrecedence(input, preliminary)
    const p019 = p019PathwayPrecedence(precedence.matchedPriority, v)
    const p017 = p017SequentialPathwayLogic(hasPriorDecision, priorPathway, precedence.primaryPathway, v)
    const p018 = p018NinetyDayEligibility(input, precedence.primaryPathway, v)
    const alternativesCount = precedence.pathwayStatus === 'READY' ? computeAlternativePathways(precedence.primaryPathway, input).length : 0
    const p020 = p020AlternativePathwayDetermination(precedence.primaryPathway, precedence.pathwayStatus, alternativesCount, v)

    return [...preliminary, p017, p018, p019, p020]
  }

  async evaluate(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
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
      return { generated: false, reason: 'Cohort Decision is stale — re-evaluate it before running the Pathway Engine.' }
    }
    const completed = cohortDecision as CohortDecisionCompleted

    const masterProfile = await this.masterProfileService.getForLead(bbsLeadId)
    const masterProfileCompleted = masterProfile.profileAvailable && masterProfile.status === 'COMPLETED' ? (masterProfile as MasterProfileCompleted) : null
    if (masterProfileCompleted?.isStale) {
      return { generated: false, reason: 'Master Profile is stale — regenerate it before running the Pathway Engine.' }
    }

    const cohortDecisionRow = await this.prisma.cohortDecision.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    const previousVersion = await this.prisma.pathwayDecision.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    const version = (previousVersion?.version ?? 0) + 1

    let decision: { id: string }
    try {
      decision = await this.prisma.pathwayDecision.create({ data: { leadId: lead.id, version, status: 'GENERATING', ruleVersion: this.config.ruleVersion } })
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return { generated: false, reason: 'A pathway evaluation is already in progress for this lead — refresh and retry.' }
      }
      throw error
    }

    try {
      const normalizeParams: NormalizeInputParams = {
        leadId: lead.id,
        bbsLeadId,
        cohortDecision: {
          primaryCohort: completed.primaryCohort,
          primaryState: completed.primaryState,
          primaryReasonCode: completed.primaryReasonCode,
          secondaryFlags: (completed.secondaryFlags as NormalizeInputParams['cohortDecision']['secondaryFlags']) ?? [],
          capacityBand: completed.capacityBand,
          archetype: completed.archetype,
          confidence: completed.confidence,
          complianceHold: completed.complianceHold,
          complianceReason: completed.complianceReason,
          specialistReviewRequired: completed.specialistReviewRequired,
          manualReviewRequired: completed.manualReviewRequired,
          lifecycleState: completed.lifecycleState,
          version: completed.version,
          generatedAt: completed.generatedAt,
          ruleResults: completed.ruleResults.map((r) => ({ ruleId: r.ruleId, matched: r.matched, evidence: r.evidence as Record<string, unknown> })),
        },
        masterProfile: masterProfileCompleted
          ? {
              version: masterProfileCompleted.version,
              generatedAt: masterProfileCompleted.generatedAt,
              dataQualityBand: masterProfileCompleted.dataQuality?.band ?? null,
              dataQualityFlags: masterProfileCompleted.dataQuality?.flags ?? [],
              missingInformation: masterProfileCompleted.missingInformation,
              resolutionCapacity: masterProfileCompleted.resolutionCapacity,
              dimensionConfidences: masterProfileCompleted.dimensionConfidences,
              bureauDsrPercent: masterProfileCompleted.bureauDsrPercent,
              bankDsrPercent: masterProfileCompleted.bankDsrPercent,
              masterDsrPercent: masterProfileCompleted.masterDsrPercent,
            }
          : null,
      }

      const input = buildPathwayInput(normalizeParams)
      input.l4.decisionId = cohortDecisionRow?.id ?? null

      const priorCompleted = previousVersion?.status === 'COMPLETED' ? previousVersion : null
      const ruleResults = this.evaluateAllRules(input, Boolean(priorCompleted), priorCompleted?.primaryPathway ?? null)
      const precedence = resolvePathwayPrecedence(input, ruleResults)

      const { confidence, confidenceMethod } = resolvePathwayConfidence(input, this.config)
      const alternatives = precedence.pathwayStatus === 'READY' ? computeAlternativePathways(precedence.primaryPathway, input) : []
      const sequencingHint = buildSequencingHint(input, precedence.primaryPathway)
      const customerReasons = buildCustomerReasons(precedence.primaryPathway, precedence.pathwayStatus, precedence.blockingReason)
      const internalReasons = buildInternalReasons(input, precedence.matchedPriority, precedence.primaryPathway, precedence.pathwayStatus)
      const nextActions = buildNextActions(precedence.primaryPathway, precedence.pathwayStatus)
      const now = new Date()
      const ttl = computePathwayTtl(precedence.primaryPathway, now, this.config)

      const riskFlags = Array.from(new Set([...input.l4.secondaryFlags.map((f) => f.key), ...(input.l4.complianceHold ? ['COMPLIANCE_HOLD'] : []), ...(input.l3.fcfReconciled === false ? ['FCF_UNRECONCILED'] : []), ...(input.l3.p1Count > 0 ? ['P1_INFORMATION_OUTSTANDING'] : [])]))

      const requiredApprovals: Array<{ approver: string; status: 'PENDING' }> = [{ approver: 'CCR', status: 'PENDING' }]
      if (input.l4.complianceHold) requiredApprovals.push({ approver: 'Compliance', status: 'PENDING' })
      if (input.l4.specialistReviewRequired || input.l4.primaryCohort === 'C6') requiredApprovals.push({ approver: 'Specialist', status: 'PENDING' })

      const missingDataItems = (completed.missingData ?? []) as unknown as Array<{ why: string; owner: string }>
      const unresolvedQuestions = missingDataItems.map((item) => ({ question: item.why, priority: 'P1' as const, owner: item.owner }))

      const changeSummary =
        priorCompleted && priorCompleted.primaryPathway !== precedence.primaryPathway
          ? { priorDecisionId: priorCompleted.id, priorTimestamp: priorCompleted.generatedAt?.toISOString() ?? null, changes: [{ field: 'primaryPathway', from: priorCompleted.primaryPathway, to: precedence.primaryPathway, reason: precedence.precedenceExplanation }] }
          : null

      await this.prisma.$transaction([
        this.prisma.pathwayRuleResult.createMany({
          data: ruleResults.map((r) => ({ decisionId: decision.id, ruleId: r.ruleId, ruleVersion: r.ruleVersion, evaluation: r.evaluation, severity: r.severity, evidence: r.evidence as unknown as Prisma.InputJsonValue, reason: r.reason, sourceFields: r.sourceFields as unknown as Prisma.InputJsonValue })),
        }),
        this.prisma.pathwayDecision.update({
          where: { id: decision.id },
          data: {
            status: 'COMPLETED',
            generatedAt: now,
            sourceCohortDecisionId: cohortDecisionRow?.id ?? null,
            sourceCohortDecisionVersion: completed.version,
            sourceCohortDecisionGeneratedAt: completed.generatedAt ? new Date(completed.generatedAt) : null,
            sourceMasterProfileVersion: masterProfileCompleted?.version ?? null,
            primaryPathway: precedence.primaryPathway,
            pathwayVariant: 'STANDARD',
            pathwayStatus: precedence.pathwayStatus,
            blockingReason: precedence.blockingReason,
            inheritedBlocks: precedence.inheritedBlocks as unknown as Prisma.InputJsonValue,
            l4PrimaryState: input.l4.primaryCohort,
            l4PrimaryReasonCode: input.l4.primaryReasonCode,
            l4SecondaryFlags: input.l4.secondaryFlags as unknown as Prisma.InputJsonValue,
            alternatives: alternatives as unknown as Prisma.InputJsonValue,
            sequencingHint: sequencingHint as unknown as Prisma.InputJsonValue,
            confidence,
            confidenceMethod,
            dataQualityBand: input.l3.dataQualityBand,
            dimensionConfidences: { incomeCashFlow: input.l3.incomeCashFlowConfidence, alignmentCapacity: input.l3.alignmentCapacityConfidence, l4Overall: input.l4.confidence } as unknown as Prisma.InputJsonValue,
            capacityBand: input.l4.capacityBand,
            capacityCap: input.l4.capacityBand,
            resolutionCapacity: input.l3.resolutionCapacity,
            archetype: input.l4.archetype,
            archetypeConfidence: input.l4.confidence,
            suitabilityConditions: [] as unknown as Prisma.InputJsonValue,
            customerReasons: customerReasons as unknown as Prisma.InputJsonValue,
            internalReasons: internalReasons as unknown as Prisma.InputJsonValue,
            unresolvedQuestions: unresolvedQuestions as unknown as Prisma.InputJsonValue,
            riskFlags: riskFlags as unknown as Prisma.InputJsonValue,
            requiredApprovals: requiredApprovals as unknown as Prisma.InputJsonValue,
            specialistReviewRequired: input.l4.specialistReviewRequired || input.l4.primaryCohort === 'C6',
            complianceHold: input.l4.complianceHold,
            nextActions: nextActions ? (nextActions as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            pathwayTtlDays: ttl.pathwayTtlDays,
            ttlExpiresAt: ttl.ttlExpiresAt,
            reviewSchedule: { scheduled: null, eventDriven: ttl.invalidationTriggers } as unknown as Prisma.InputJsonValue,
            changeSummary: changeSummary ? (changeSummary as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            dataProvenance: [
              { field: 'l4', source: 'COHORT_ENGINE', verified: true, confidence: 'HIGH' },
              { field: 'l3', source: 'MASTER_PROFILE', verified: Boolean(masterProfileCompleted), confidence: masterProfileCompleted ? 'HIGH' : 'LOW' },
            ] as unknown as Prisma.InputJsonValue,
          },
        }),
      ])

      this.log('PATHWAY_GENERATED', { bbsLeadId, decisionId: decision.id, version, primaryPathway: precedence.primaryPathway ?? 'null', pathwayStatus: precedence.pathwayStatus })
      return { generated: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown pathway-engine generation error'
      await this.prisma.pathwayDecision.update({ where: { id: decision.id }, data: { status: 'FAILED', errorMessage: message } })
      this.log('PATHWAY_FAILED', { bbsLeadId, decisionId: decision.id, error: message })
      return { generated: false, reason: message }
    }
  }

  /** Spec's own two separate endpoints — same underlying operation; reassess is a documented alias (mirrors CohortEngineService's recalculate -> evaluate / PlanEngineService's reassess -> generate). */
  async reassess(bbsLeadId: string): Promise<{ generated: boolean; reason?: string }> {
    return this.evaluate(bbsLeadId)
  }

  async getForLead(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const decision = await this.prisma.pathwayDecision.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' }, include: { ruleResults: true } })
    if (!decision) {
      const cohortDecision = await this.cohortEngineService.getForLead(bbsLeadId)
      const cohortDecisionReady = cohortDecision.decisionAvailable && cohortDecision.status === 'COMPLETED' && !cohortDecision.isStale
      return { decisionAvailable: false as const, cohortDecisionReady }
    }

    if (decision.status !== 'COMPLETED') {
      return { decisionAvailable: true as const, status: decision.status, errorMessage: decision.errorMessage }
    }

    // Has the Cohort Decision moved to a newer version since this Pathway
    // Decision was generated? Same cheap source-version-diff staleness
    // discipline every downstream module in this codebase already uses.
    const currentCohortDecision = await this.cohortEngineService.getForLead(bbsLeadId)
    const isStale = currentCohortDecision.decisionAvailable && currentCohortDecision.status === 'COMPLETED' && currentCohortDecision.version !== decision.sourceCohortDecisionVersion

    const liveTtlStatus = computeLiveTtlStatus(decision.ttlExpiresAt, decision.presentedToCustomerAt, decision.acceptedAt, new Date())

    return {
      decisionAvailable: true as const,
      status: 'COMPLETED' as const,
      version: decision.version,
      ruleVersion: decision.ruleVersion,
      isStale,
      generatedAt: decision.generatedAt?.toISOString() ?? null,
      primaryPathway: decision.primaryPathway,
      pathwayVariant: decision.pathwayVariant,
      pathwayStatus: decision.pathwayStatus,
      blockingReason: decision.blockingReason,
      inheritedBlocks: decision.inheritedBlocks,
      l4Reference: { cohortDecisionId: decision.sourceCohortDecisionId, primaryState: decision.l4PrimaryState, primaryReasonCode: decision.l4PrimaryReasonCode, secondaryFlags: decision.l4SecondaryFlags },
      alternatives: decision.alternatives,
      sequencingHint: decision.sequencingHint,
      confidence: decision.confidence,
      confidenceMethod: decision.confidenceMethod,
      dataQualityBand: decision.dataQualityBand,
      dimensionConfidences: decision.dimensionConfidences,
      capacityBand: decision.capacityBand,
      capacityCap: decision.capacityCap,
      resolutionCapacity: decision.resolutionCapacity,
      archetype: decision.archetype,
      archetypeConfidence: decision.archetypeConfidence,
      customerReasons: decision.customerReasons,
      internalReasons: decision.internalReasons,
      unresolvedQuestions: decision.unresolvedQuestions,
      riskFlags: decision.riskFlags,
      requiredApprovals: decision.requiredApprovals,
      specialistReviewRequired: decision.specialistReviewRequired,
      complianceHold: decision.complianceHold,
      nextActions: decision.nextActions,
      ttl: { pathwayTtlDays: decision.pathwayTtlDays, expiresAt: decision.ttlExpiresAt?.toISOString() ?? null, liveStatus: liveTtlStatus },
      reviewSchedule: decision.reviewSchedule,
      changeSummary: decision.changeSummary,
      dataProvenance: decision.dataProvenance,
      ruleResults: decision.ruleResults.map((r) => ({ ruleId: r.ruleId, evaluation: r.evaluation, severity: r.severity, evidence: r.evidence, reason: r.reason, sourceFields: r.sourceFields })),
    }
  }

  async getHistory(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)

    const decisions = await this.prisma.pathwayDecision.findMany({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    return decisions.map((d) => ({
      version: d.version,
      status: d.status,
      primaryPathway: d.primaryPathway,
      pathwayStatus: d.pathwayStatus,
      confidence: d.confidence,
      generatedAt: d.generatedAt?.toISOString() ?? null,
    }))
  }
}
