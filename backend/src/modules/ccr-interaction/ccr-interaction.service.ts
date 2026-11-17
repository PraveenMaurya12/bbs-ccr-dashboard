import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, type CcrAnswer, type Lead, type Role } from '@prisma/client'

import { PrismaService } from '@/common/prisma/prisma.service'
import { DebtAnalysisService } from '@/modules/debt-analysis/debt-analysis.service'
import { CohortEngineService } from '@/modules/cohort-engine/cohort-engine.service'
import { FinancialAnalysisService } from '@/modules/financial-analysis/financial-analysis.service'
import { MasterProfileService } from '@/modules/master-profile/master-profile.service'
import { PathwayEngineService } from '@/modules/pathway-engine/pathway-engine.service'
import { PlanEngineService } from '@/modules/plan-engine/plan-engine.service'
import { explainBlock, type BlockExplanation } from './block-explanation'
import { buildDataRequirements, type DataRequirement } from './data-requirements'
import { buildCcrQuestions, type CcrFieldKey, type CcrQuestion } from './ccr-questions'
import type { CcrAnswerInputDto, SaveCcrAnswersDto } from './dto/save-answers.dto'

export interface CcrActor {
  id: string
  role: Role
}

interface ResolvedAnswer {
  responseStatus: CcrAnswer['responseStatus']
  answerText: string | null
  answerAmount: Prisma.Decimal | null
  answerBoolean: boolean | null
}

/** Plan states that are still internal CCR work, so a fresh DRAFT version can safely replace them as the latest. */
const REFRESHABLE_PLAN_STATES: ReadonlySet<string> = new Set(['DRAFT', 'CCR_REVIEW', 'SPECIALIST_REVIEW', 'REASSESSMENT_REQUIRED'])

/** Rounds to paise so a value read back from NUMERIC(14,2) compares equal to what the CCR typed. */
const toPaise = (value: number): number => Math.round(value * 100)

/**
 * The CCR's verification Q&A for one lead. Questions are generated live from
 * the lead's own L1 (Debt Analysis discovery agenda) and L2 (Financial
 * Analysis CCR brief) output — never stored — so what is persisted here is
 * only the CCR's answers, each bound to exactly one (lead, question) pair.
 */
@Injectable()
export class CcrInteractionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly debtAnalysisService: DebtAnalysisService,
    private readonly financialAnalysisService: FinancialAnalysisService,
    private readonly masterProfileService: MasterProfileService,
    private readonly cohortEngineService: CohortEngineService,
    private readonly pathwayEngineService: PathwayEngineService,
    private readonly planEngineService: PlanEngineService,
  ) {}

  private log(event: string, details: Record<string, string | number | undefined>): void {
    const parts = Object.entries(details)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
    console.log(`[CcrInteraction] ${event} ${parts.join(' ')}`)
  }

  private async requireLead(bbsLeadId: string): Promise<Lead> {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) throw new NotFoundException(`Lead ${bbsLeadId} was not found`)
    return lead
  }

  /**
   * A CCR may only record answers on a lead that is assigned to them (or not
   * yet assigned to anyone); supervisors and admins may act on any lead.
   * Reads stay open to every authenticated role, like the rest of the lead.
   */
  private assertMayWrite(lead: Lead, actor: CcrActor): void {
    if (actor.role === 'CCR' && lead.assignedCcrId !== null && lead.assignedCcrId !== actor.id) {
      throw new ForbiddenException('This lead is assigned to a different CCR')
    }
  }

  /** The questions currently generated for this lead, plus why none are available when that's the case. */
  private async loadQuestions(bbsLeadId: string): Promise<{ questions: CcrQuestion[]; unavailableReason: string | null }> {
    const [l1, l2] = await Promise.all([this.debtAnalysisService.getCallBriefForLead(bbsLeadId), this.financialAnalysisService.getForLead(bbsLeadId)])

    const l1Questions = l1.reportAvailable && 'status' in l1 && l1.status === 'COMPLETED' && 'discoveryAgenda' in l1 ? l1.discoveryAgenda : []
    // The L2 CCR brief is persisted inside the score row's `extendedAnalysis` Json column.
    const l2Extended =
      l2.reportAvailable && 'status' in l2 && l2.status === 'COMPLETED' ? (l2.score?.extendedAnalysis as { ccrBrief?: { suggestedDiscoveryQuestions?: unknown } } | null | undefined) : undefined
    const rawL2Questions = l2Extended?.ccrBrief?.suggestedDiscoveryQuestions
    const l2Questions = Array.isArray(rawL2Questions) ? rawL2Questions.filter((q): q is string => typeof q === 'string') : []

    // The Master Profile's own P1 items are what actually hold a lead at the CCR-first gate, so they are asked too.
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId }, select: { id: true } })
    const latestMaster = lead ? await this.prisma.masterProfile.findFirst({ where: { leadId: lead.id, status: 'COMPLETED' }, orderBy: { version: 'desc' }, include: { missingInformation: { where: { priority: 'P1' } } } }) : null
    const masterQuestions = (latestMaster?.missingInformation ?? []).map((i) => i.itemText)

    const questions = buildCcrQuestions(l1Questions, l2Questions, masterQuestions)
    if (questions.length > 0) return { questions, unavailableReason: null }

    return {
      questions,
      unavailableReason: 'No CCR questions are available yet — the L1 Credit Profile and L2 Financial Profile analyses must complete first.',
    }
  }

  async getForLead(bbsLeadId: string) {
    const lead = await this.requireLead(bbsLeadId)
    const [{ questions, unavailableReason }, interaction] = await Promise.all([
      this.loadQuestions(bbsLeadId),
      this.prisma.ccrInteraction.findUnique({ where: { leadId: lead.id }, include: { answers: true } }),
    ])

    const answersByKey = new Map((interaction?.answers ?? []).map((a) => [a.questionKey, a]))
    const currentKeys = new Set(questions.map((q) => q.key))
    const present = (a: CcrAnswer) => ({
      responseStatus: a.responseStatus,
      answerText: a.answerText,
      answerAmount: a.answerAmount?.toNumber() ?? null,
      answerBoolean: a.answerBoolean,
      appliedTo: a.appliedTo,
      conflictNote: a.conflictNote,
      answeredAt: a.updatedAt.toISOString(),
    })

    const items = questions.map((q) => {
      const a = answersByKey.get(q.key)
      return { ...q, answer: a ? present(a) : null }
    })
    const answered = items.filter((i) => i.answer !== null).length

    return {
      bbsLeadId: lead.bbsLeadId,
      questionsAvailable: questions.length > 0,
      unavailableReason,
      // SUBMITTED only while every current question still has a response: a question that appeared after the
      // last submit (e.g. a new blocking item from a regenerated Master Profile) makes it an open draft again.
      status: interaction?.status === 'SUBMITTED' && answered === items.length ? ('SUBMITTED' as const) : ('DRAFT' as const),
      submittedAt: interaction?.submittedAt?.toISOString() ?? null,
      progress: { total: items.length, answered, remaining: items.length - answered },
      canSubmit: items.length > 0 && answered === items.length && interaction?.status !== 'SUBMITTED',
      questions: items,
      // Answers recorded earlier for a question the lead's analyses no longer generate.
      retiredAnswers: (interaction?.answers ?? []).filter((a) => !currentKeys.has(a.questionKey)).map((a) => ({ questionKey: a.questionKey, source: a.source, questionText: a.questionText, ...present(a) })),
    }
  }

  private resolveAnswer(question: CcrQuestion, input: CcrAnswerInputDto): ResolvedAnswer {
    if (input.responseStatus !== 'ANSWERED') {
      // DECLINED / NOT_KNOWN carry no value — any value sent alongside would be unverifiable noise.
      return { responseStatus: input.responseStatus, answerText: input.answerText?.trim() || null, answerAmount: null, answerBoolean: null }
    }

    if (question.answerType === 'AMOUNT') {
      if (input.answerAmount === undefined) throw new BadRequestException(`An amount is required for: "${question.text}"`)
      return { responseStatus: 'ANSWERED', answerText: input.answerText?.trim() || null, answerAmount: new Prisma.Decimal(input.answerAmount), answerBoolean: null }
    }
    if (question.answerType === 'YES_NO') {
      if (input.answerBoolean === undefined) throw new BadRequestException(`A yes/no answer is required for: "${question.text}"`)
      return { responseStatus: 'ANSWERED', answerText: input.answerText?.trim() || null, answerAmount: null, answerBoolean: input.answerBoolean }
    }
    const text = input.answerText?.trim()
    if (!text) throw new BadRequestException(`An answer is required for: "${question.text}"`)
    return { responseStatus: 'ANSWERED', answerText: text, answerAmount: null, answerBoolean: null }
  }

  /**
   * Upserts the given answers. Every questionKey must belong to a question
   * currently generated for THIS lead — a key from another lead's agenda is
   * rejected, so an answer can never be attached to the wrong lead/question.
   * Editing a SUBMITTED interaction reopens it to DRAFT: downstream
   * modules must never keep consuming answers that have since changed.
   */
  async saveAnswers(bbsLeadId: string, dto: SaveCcrAnswersDto, actor: CcrActor) {
    const lead = await this.requireLead(bbsLeadId)
    this.assertMayWrite(lead, actor)

    const { questions } = await this.loadQuestions(bbsLeadId)
    const byKey = new Map(questions.map((q) => [q.key, q]))

    const seen = new Set<string>()
    const resolved = dto.answers.map((input) => {
      const question = byKey.get(input.questionKey)
      if (!question) throw new BadRequestException(`Question ${input.questionKey} does not belong to lead ${bbsLeadId}`)
      if (seen.has(input.questionKey)) throw new BadRequestException(`Question ${input.questionKey} was sent more than once`)
      seen.add(input.questionKey)
      return { question, value: this.resolveAnswer(question, input) }
    })

    const reopened = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.ccrInteraction.findUnique({ where: { leadId: lead.id } })
      const interaction = await tx.ccrInteraction.upsert({
        where: { leadId: lead.id },
        create: { leadId: lead.id },
        update: existing?.status === 'SUBMITTED' ? { status: 'DRAFT', submittedAt: null, submittedById: null } : {},
      })

      for (const { question, value } of resolved) {
        const data = { ...value, source: question.source, questionText: question.text, fieldKey: question.fieldKey, answeredById: actor.id, appliedTo: null, conflictNote: null }
        await tx.ccrAnswer.upsert({
          where: { leadId_questionKey: { leadId: lead.id, questionKey: question.key } },
          create: { interactionId: interaction.id, leadId: lead.id, questionKey: question.key, ...data },
          update: data,
        })
      }

      await tx.auditLog.create({
        data: { actorId: actor.id, leadId: lead.id, action: 'CCR_ANSWERS_SAVED', entityType: 'CcrInteraction', entityId: interaction.id, metadata: { answerCount: resolved.length, reopened: existing?.status === 'SUBMITTED' } },
      })
      return existing?.status === 'SUBMITTED'
    })

    this.log('ANSWERS_SAVED', { bbsLeadId, count: resolved.length, reopened: reopened ? 'yes' : 'no' })
    return this.getForLead(bbsLeadId)
  }

  /**
   * After Master Profile has been regenerated, brings Cohort, Pathway and Plan
   * up to date IN DEPENDENCY ORDER — each only if the lead already has one (a
   * stage the CCR has never run is left for the CCR to start), and each only
   * if the stage before it succeeded, because every engine refuses to run on a
   * stale upstream version. A plan is regenerated as a fresh DRAFT version;
   * nothing is ever submitted, accepted, approved or activated here.
   */
  private async refreshDownstream(bbsLeadId: string, leadId: string, options: { createMissing?: boolean; onlyIfStale?: boolean } = {}) {
    type Outcome = { generated: boolean; reason?: string } | { skipped: true; reason: string }
    const skipped = (reason: string): Outcome => ({ skipped: true, reason })
    const run = async (fn: () => Promise<{ generated: boolean; reason?: string }>): Promise<Outcome> => {
      try {
        return await fn()
      } catch (error) {
        return { generated: false, reason: error instanceof Error ? error.message : 'Recalculation failed' }
      }
    }
    const ok = (o: Outcome) => !('skipped' in o) && o.generated

    const [hasCohort, hasPathway, latestPlan] = await Promise.all([
      this.prisma.cohortDecision.count({ where: { leadId } }),
      this.prisma.pathwayDecision.count({ where: { leadId } }),
      this.prisma.bbsPlan.findFirst({ where: { leadId }, orderBy: { version: 'desc' }, select: { lifecycleStatus: true } }),
    ])
    // A plan the customer has been offered, accepted or started is never silently superseded here; that needs an explicit Reassess.
    const planStillInReview = latestPlan !== null && REFRESHABLE_PLAN_STATES.has(latestPlan.lifecycleStatus ?? '')

    // After a CCR submit only stages that already exist are refreshed; an explicit "recalculate everything" also starts missing ones.
    const createMissing = options.createMissing === true
    // A cohort set by a person's override is kept: re-running the rules would silently replace it. Pathway and Plan
    // still refresh from it.
    const latestCohort = hasCohort > 0 ? await this.prisma.cohortDecision.findFirst({ where: { leadId }, orderBy: { version: 'desc' }, select: { id: true } }) : null
    const keepsOverride = latestCohort !== null && (await this.prisma.cohortOverride.count({ where: { newDecisionId: latestCohort.id } })) > 0
    // With onlyIfStale (the Master Profile was already current) a stage is only run when it is missing, stale, or its
    // upstream stage just changed — cohort/pathway are free, but plan and Master Profile each cost an AI call, so
    // nothing is regenerated for no reason.
    const onlyIfStale = options.onlyIfStale === true
    const upToDate = skipped('Already up to date.')
    const cohortState = onlyIfStale && hasCohort > 0 ? await this.cohortEngineService.getForLead(bbsLeadId) : null
    const cohortNeeded = !onlyIfStale || hasCohort === 0 || (cohortState !== null && cohortState.decisionAvailable && cohortState.isStale)
    const cohort: Outcome = keepsOverride
      ? { generated: true, reason: 'Kept the cohort set by override — re-evaluate it explicitly from the Cohort section to discard it.' }
      : !cohortNeeded
        ? upToDate
        : hasCohort > 0 || createMissing
          ? await run(() => this.cohortEngineService.evaluate(bbsLeadId))
          : skipped('No Cohort Decision exists yet — run it from the Final Profile tab.')
    const cohortSatisfied = ok(cohort) || cohort === upToDate

    const cohortRan = !keepsOverride && !('skipped' in cohort) && cohort.generated
    const pathwayState = onlyIfStale && hasPathway > 0 ? await this.pathwayEngineService.getForLead(bbsLeadId) : null
    const pathwayNeeded = !onlyIfStale || hasPathway === 0 || cohortRan || (pathwayState !== null && pathwayState.decisionAvailable && pathwayState.isStale)
    const pathway: Outcome = !pathwayNeeded
      ? upToDate
      : hasPathway > 0 || createMissing
        ? cohortSatisfied
          ? await run(() => this.pathwayEngineService.evaluate(bbsLeadId))
          : skipped('Cohort Decision was not refreshed.')
        : skipped('No Pathway Decision exists yet.')
    const pathwaySatisfied = ok(pathway) || pathway === upToDate

    const pathwayRan = !('skipped' in pathway) && pathway.generated
    const planState = onlyIfStale && latestPlan !== null ? await this.planEngineService.getForLead(bbsLeadId) : null
    const planNeeded = !onlyIfStale || latestPlan === null || pathwayRan || (planState !== null && planState.planAvailable !== false && (planState as { isStale?: boolean }).isStale === true)
    let plan: Outcome
    if (!planNeeded) plan = upToDate
    else if (latestPlan === null && !createMissing) plan = skipped('No Plan exists yet.')
    else if (latestPlan !== null && !planStillInReview) plan = skipped(`The plan is ${latestPlan.lifecycleStatus} — use Reassess on the Plan to change it.`)
    else if (!pathwaySatisfied) plan = skipped('Pathway Decision was not refreshed.')
    else plan = await run(() => this.planEngineService.generate(bbsLeadId))
    return { cohort, pathway, plan }
  }

  /** What the lead still needs, derived from the persisted Master Profile and the CCR question progress. */
  async getDataRequirements(bbsLeadId: string): Promise<{ requirements: DataRequirement[]; blocked: boolean; headline: string | null; profileAvailable: boolean; blockExplanation: BlockExplanation | null }> {
    const lead = await this.requireLead(bbsLeadId)
    const [master, creditReport, bankStatement, ccr] = await Promise.all([
      this.masterProfileService.getForLead(bbsLeadId),
      this.prisma.creditReport.findUnique({ where: { leadId: lead.id }, select: { processingStatus: true } }),
      this.prisma.bankStatementAnalysis.findFirst({ where: { leadId: lead.id, status: 'COMPLETED' }, select: { id: true } }),
      this.getForLead(bbsLeadId),
    ])
    const hasCreditReport = creditReport?.processingStatus === 'COMPLETED'
    const hasBankStatement = bankStatement !== null

    if (!master.profileAvailable || master.status !== 'COMPLETED') {
      const requirements = buildDataRequirements({
        hasCreditReport, hasBankStatement, l1DataAsOf: null, l2DataAsOf: null, dataQualityBand: null, dataQualityFlags: [], readinessOutcome: null, alignmentState: null,
        complianceHold: false, complianceReason: null, postStatementDebt: null, unresolvedP1Count: 0, unansweredCcrQuestions: ccr.progress.remaining,
      })
      return { requirements, blocked: requirements.some((r) => r.severity === 'BLOCKING'), headline: requirements.length > 0 ? 'The Master Profile can’t be built yet.' : null, profileAvailable: false, blockExplanation: null }
    }

    const unresolvedP1 = master.missingInformation.filter((i) => i.priority === 'P1' && !i.resolved).length
    const requirements = buildDataRequirements({
      hasCreditReport,
      hasBankStatement,
      l1DataAsOf: master.l1DataAsOf,
      l2DataAsOf: master.l2DataAsOf,
      dataQualityBand: master.dataQuality?.band ?? null,
      dataQualityFlags: master.dataQuality?.flags ?? [],
      readinessOutcome: master.readinessGate?.outcome ?? null,
      alignmentState: master.alignmentState,
      complianceHold: master.complianceRouting.complianceHold,
      complianceReason: master.complianceRouting.reason,
      postStatementDebt: master.postStatementDebt ? { detected: (master.postStatementDebt as { detected: boolean }).detected, accountCount: (master.postStatementDebt as { accountCount: number }).accountCount } : null,
      unresolvedP1Count: unresolvedP1,
      unansweredCcrQuestions: ccr.progress.remaining,
    })
    const blocked = master.readinessGate?.outcome !== 'READY' || master.alignmentState === null
    const blockExplanation = await this.explainCurrentBlock(bbsLeadId, master.dataQuality?.flags ?? [], unresolvedP1)
    return {
      requirements,
      blocked: blocked || blockExplanation !== null,
      blockExplanation,
      headline: blocked ? 'The profile can’t be fully classified yet — here is what is missing.' : null,
      profileAvailable: true,
    }
  }

  /** Why the latest (non-stale) cohort/pathway has no pathway, in plain language, from its persisted rule evidence. */
  private async explainCurrentBlock(bbsLeadId: string, dataQualityFlags: string[], p1Open: number): Promise<BlockExplanation | null> {
    const cohort = await this.cohortEngineService.getForLead(bbsLeadId)
    if (!cohort.decisionAvailable || cohort.status !== 'COMPLETED') return null
    const pathway = await this.pathwayEngineService.getForLead(bbsLeadId)
    const blockCode = cohort.primaryState === 'BLOCKED' ? cohort.primaryReasonCode : cohort.primaryCohort === 'X1' ? 'INSUFFICIENT_DATA' : pathway.decisionAvailable && pathway.status === 'COMPLETED' && pathway.pathwayStatus !== 'READY' ? (pathway.blockingReason ?? null) : null
    const ruleEvidence = Object.fromEntries(cohort.ruleResults.map((r) => [r.ruleId, { matched: r.matched, evidence: r.evidence as Record<string, unknown> }]))
    const secondaryFlagKeys = ((cohort.secondaryFlags as { key: string }[] | null) ?? []).map((f) => f.key)
    return explainBlock({ blockCode, secondaryFlagKeys, ruleEvidence, dataQualityFlags, p1Open })
  }

  /**
   * One-click "calculate everything": regenerates the Master Profile and then
   * runs Cohort, Pathway and Plan in dependency order, creating any stage the
   * lead has not run yet. Reports each stage's real outcome; the plan is
   * produced as an internal draft and is never approved or activated.
   */
  async recalculateAll(bbsLeadId: string, actor: CcrActor) {
    const lead = await this.requireLead(bbsLeadId)
    this.assertMayWrite(lead, actor)

    // Regenerating the Master Profile costs an AI call, so it is only rebuilt when it is missing or out of date.
    const current = await this.masterProfileService.getForLead(bbsLeadId)
    const masterCurrent = current.profileAvailable && current.status === 'COMPLETED' && !current.isStale
    let masterProfile: { generated: boolean; reason?: string }
    if (masterCurrent) {
      masterProfile = { generated: true, reason: 'Already up to date.' }
    } else {
      try {
        masterProfile = await this.masterProfileService.generate(bbsLeadId)
      } catch (error) {
        masterProfile = { generated: false, reason: error instanceof Error ? error.message : 'Master Profile regeneration failed' }
      }
    }
    const stages = masterProfile.generated ? await this.refreshDownstream(bbsLeadId, lead.id, { createMissing: true, onlyIfStale: masterCurrent }) : null
    await this.prisma.auditLog.create({ data: { actorId: actor.id, leadId: lead.id, action: 'RECALCULATE_ALL', entityType: 'Lead', entityId: lead.id, metadata: { masterGenerated: masterProfile.generated } } })
    this.log('RECALCULATE_ALL', { bbsLeadId, master: masterProfile.generated ? 'ok' : 'failed' })

    return { masterProfile, stages, requirements: await this.getDataRequirements(bbsLeadId) }
  }

  /**
   * Completes the interaction. Requires a recorded response (an answer,
   * "declined" or "not known") for every current question, then — in one
   * transaction — feeds structured answers onto the lead's profile fields and
   * marks the interaction SUBMITTED. Master Profile is regenerated afterwards
   * so it reflects the answers; Cohort/Pathway/Plan stay CCR-triggered and
   * simply report themselves stale. This never approves a plan.
   */
  async submit(bbsLeadId: string, actor: CcrActor) {
    const lead = await this.requireLead(bbsLeadId)
    this.assertMayWrite(lead, actor)

    const { questions, unavailableReason } = await this.loadQuestions(bbsLeadId)
    if (questions.length === 0) throw new BadRequestException(unavailableReason ?? 'There are no questions to submit')

    const interaction = await this.prisma.ccrInteraction.findUnique({ where: { leadId: lead.id }, include: { answers: true } })
    const answersByKey = new Map((interaction?.answers ?? []).map((a) => [a.questionKey, a]))
    const unanswered = questions.filter((q) => !answersByKey.has(q.key))
    if (!interaction || unanswered.length > 0) {
      throw new BadRequestException(`${unanswered.length} of ${questions.length} question(s) still need a response before this can be submitted`)
    }

    if (interaction.status === 'SUBMITTED') throw new ConflictException('This interaction has already been submitted — edit an answer to reopen it')

    const applied: { fieldKey: CcrFieldKey; appliedTo: string | null; conflictNote: string | null }[] = []
    await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { leadId: lead.id } })

      for (const question of questions) {
        const answer = answersByKey.get(question.key)!
        if (question.fieldKey !== 'MONTHLY_INCOME' || answer.responseStatus !== 'ANSWERED' || answer.answerAmount === null) continue

        // The only structured answer with a direct Lead Details home today.
        // Never overwrites an existing value: a difference is recorded on the
        // answer instead, so the CCR sees the conflict rather than losing data.
        const declared = answer.answerAmount
        const existing = customer?.monthlySalary ?? null
        let appliedTo: string | null = null
        let conflictNote: string | null = null
        if (existing === null) {
          await tx.customer.upsert({ where: { leadId: lead.id }, create: { leadId: lead.id, monthlySalary: declared }, update: { monthlySalary: declared } })
          appliedTo = 'Customer.monthlySalary'
        } else if (toPaise(existing.toNumber()) === toPaise(declared.toNumber())) {
          appliedTo = 'Customer.monthlySalary (already matched)'
        } else {
          conflictNote = `CCR-declared monthly income ₹${declared.toFixed(2)} differs from the existing Lead Details monthly salary ₹${existing.toFixed(2)}; the existing value was kept.`
        }
        await tx.ccrAnswer.update({ where: { id: answer.id }, data: { appliedTo, conflictNote } })
        applied.push({ fieldKey: question.fieldKey, appliedTo, conflictNote })
      }

      await tx.ccrInteraction.update({ where: { id: interaction.id }, data: { status: 'SUBMITTED', submittedAt: new Date(), submittedById: actor.id } })
      await tx.auditLog.create({
        data: { actorId: actor.id, leadId: lead.id, action: 'CCR_INTERACTION_SUBMITTED', entityType: 'CcrInteraction', entityId: interaction.id, metadata: { questionCount: questions.length, applied } as unknown as Prisma.InputJsonValue },
      })
    })

    this.log('INTERACTION_SUBMITTED', { bbsLeadId, questions: questions.length })

    // Outside the transaction: the submit itself is durable even if
    // regeneration fails or its prerequisites aren't met, and the CCR is told which.
    let masterProfile: { generated: boolean; reason?: string }
    try {
      masterProfile = await this.masterProfileService.generate(bbsLeadId)
    } catch (error) {
      masterProfile = { generated: false, reason: error instanceof Error ? error.message : 'Master Profile regeneration failed' }
    }

    const recalculated = masterProfile.generated ? await this.refreshDownstream(bbsLeadId, lead.id) : null

    return { ...(await this.getForLead(bbsLeadId)), downstream: { applied, masterProfile, recalculated } }
  }
}
