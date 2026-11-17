import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Prisma } from '@prisma/client'

import { PrismaService } from '@/common/prisma/prisma.service'
import { DebtAnalysisService } from '@/modules/debt-analysis/debt-analysis.service'
import { FinancialAnalysisService } from '@/modules/financial-analysis/financial-analysis.service'
import { CohortEngineService } from '@/modules/cohort-engine/cohort-engine.service'
import { MasterProfileService } from '@/modules/master-profile/master-profile.service'
import { PathwayEngineService } from '@/modules/pathway-engine/pathway-engine.service'
import { PlanEngineService } from '@/modules/plan-engine/plan-engine.service'
import { CcrInteractionService } from './ccr-interaction.service'
import { buildQuestionKey } from './ccr-questions'
import type { SaveCcrAnswersDto } from './dto/save-answers.dto'

const L1_INCOME = 'What is your current monthly income?'
const L1_CAN_SERVICE = 'Are you able to comfortably service all current EMIs?'
const L1_FREE = 'What is your primary financial concern right now?'
const L2_FREE = 'Can you provide statements for any other bank accounts you hold?'
const key = (source: 'L1_DEBT_ANALYSIS' | 'L2_FINANCIAL_ANALYSIS', text: string) => buildQuestionKey(source, text)

describe('CcrInteractionService', () => {
  let service: CcrInteractionService
  let prisma: {
    lead: { findUnique: jest.Mock }
    customer: { findUnique: jest.Mock; upsert: jest.Mock }
    ccrInteraction: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock }
    ccrAnswer: { upsert: jest.Mock; update: jest.Mock }
    masterProfile: { findFirst: jest.Mock }
    cohortDecision: { count: jest.Mock; findFirst: jest.Mock }
    cohortOverride: { count: jest.Mock }
    pathwayDecision: { count: jest.Mock }
    bbsPlan: { findFirst: jest.Mock }
    creditReport: { findUnique: jest.Mock }
    bankStatementAnalysis: { findFirst: jest.Mock }
    auditLog: { create: jest.Mock }
    $transaction: jest.Mock
  }
  let debt: { getCallBriefForLead: jest.Mock }
  let financial: { getForLead: jest.Mock }
  let master: { generate: jest.Mock; getForLead: jest.Mock }
  let cohort: { evaluate: jest.Mock; getForLead: jest.Mock }
  let pathway: { evaluate: jest.Mock; getForLead: jest.Mock }
  let plan: { generate: jest.Mock; getForLead: jest.Mock }

  const lead = { id: 'lead-1', bbsLeadId: 'BBS-LD-1', assignedCcrId: null as string | null }
  const ccr = { id: 'ccr-1', role: 'CCR' as const }
  const supervisor = { id: 'sup-1', role: 'SUPERVISOR' as const }

  const answerRow = (over: Record<string, unknown>) => ({
    id: 'a-x',
    leadId: 'lead-1',
    fieldKey: null,
    responseStatus: 'ANSWERED',
    answerText: 'text',
    answerAmount: null,
    answerBoolean: null,
    appliedTo: null,
    conflictNote: null,
    updatedAt: new Date('2026-10-22T10:00:00Z'),
    ...over,
  })

  beforeEach(async () => {
    prisma = {
      lead: { findUnique: jest.fn().mockResolvedValue(lead) },
      customer: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
      ccrInteraction: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({ id: 'int-1' }), update: jest.fn() },
      ccrAnswer: { upsert: jest.fn(), update: jest.fn() },
      masterProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      cohortDecision: { count: jest.fn().mockResolvedValue(0), findFirst: jest.fn().mockResolvedValue({ id: 'cd-1' }) },
      cohortOverride: { count: jest.fn().mockResolvedValue(0) },
      pathwayDecision: { count: jest.fn().mockResolvedValue(0) },
      bbsPlan: { findFirst: jest.fn().mockResolvedValue(null) },
      creditReport: { findUnique: jest.fn().mockResolvedValue({ processingStatus: 'COMPLETED' }) },
      bankStatementAnalysis: { findFirst: jest.fn().mockResolvedValue({ id: 'bsa-1' }) },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    }
    debt = { getCallBriefForLead: jest.fn().mockResolvedValue({ reportAvailable: true, status: 'COMPLETED', discoveryAgenda: [L1_INCOME, L1_CAN_SERVICE, L1_FREE] }) }
    financial = { getForLead: jest.fn().mockResolvedValue({ reportAvailable: true, status: 'COMPLETED', score: { extendedAnalysis: { ccrBrief: { suggestedDiscoveryQuestions: [L2_FREE] } } } }) }
    master = { generate: jest.fn().mockResolvedValue({ generated: true }), getForLead: jest.fn().mockResolvedValue({ profileAvailable: false }) }
    cohort = { evaluate: jest.fn().mockResolvedValue({ generated: true }), getForLead: jest.fn().mockResolvedValue({ decisionAvailable: false }) }
    pathway = { evaluate: jest.fn().mockResolvedValue({ generated: true }), getForLead: jest.fn().mockResolvedValue({ decisionAvailable: false }) }
    plan = { generate: jest.fn().mockResolvedValue({ generated: true }), getForLead: jest.fn().mockResolvedValue({ planAvailable: true, isStale: false }) }

    const moduleRef = await Test.createTestingModule({
      providers: [
        CcrInteractionService,
        { provide: PrismaService, useValue: prisma },
        { provide: DebtAnalysisService, useValue: debt },
        { provide: FinancialAnalysisService, useValue: financial },
        { provide: MasterProfileService, useValue: master },
        { provide: CohortEngineService, useValue: cohort },
        { provide: PathwayEngineService, useValue: pathway },
        { provide: PlanEngineService, useValue: plan },
      ],
    }).compile()
    service = moduleRef.get(CcrInteractionService)
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  describe('getForLead', () => {
    it('merges L1 and L2 questions with no answers yet', async () => {
      const result = await service.getForLead('BBS-LD-1')
      expect(result.questions.map((q) => q.text)).toEqual([L1_INCOME, L1_CAN_SERVICE, L1_FREE, L2_FREE])
      expect(result.progress).toEqual({ total: 4, answered: 0, remaining: 4 })
      expect(result.canSubmit).toBe(false)
      expect(result.status).toBe('DRAFT')
    })

    it('reports an empty state with a reason when neither analysis has completed', async () => {
      debt.getCallBriefForLead.mockResolvedValue({ reportAvailable: false })
      financial.getForLead.mockResolvedValue({ reportAvailable: false })
      const result = await service.getForLead('BBS-LD-1')
      expect(result.questionsAvailable).toBe(false)
      expect(result.unavailableReason).toMatch(/L1 Credit Profile and L2 Financial Profile/)
    })

    it("returns saved answers against the right question and surfaces an answer whose question is no longer generated as retired", async () => {
      prisma.ccrInteraction.findUnique.mockResolvedValue({
        status: 'DRAFT',
        submittedAt: null,
        answers: [
          answerRow({ questionKey: key('L1_DEBT_ANALYSIS', L1_FREE), source: 'L1_DEBT_ANALYSIS', questionText: L1_FREE, answerText: 'Medical bills' }),
          answerRow({ questionKey: 'L1-000000000000', source: 'L1_DEBT_ANALYSIS', questionText: 'Old question?', answerText: 'Old answer' }),
        ],
      })
      const result = await service.getForLead('BBS-LD-1')
      expect(result.questions.find((q) => q.text === L1_FREE)?.answer?.answerText).toBe('Medical bills')
      expect(result.questions.find((q) => q.text === L1_INCOME)?.answer).toBeNull()
      expect(result.retiredAnswers).toHaveLength(1)
      expect(result.retiredAnswers[0].questionText).toBe('Old question?')
    })

    it('reads L2 questions from score.extendedAnalysis.ccrBrief and tolerates a missing or malformed brief', async () => {
      financial.getForLead.mockResolvedValue({ reportAvailable: true, status: 'COMPLETED', score: { extendedAnalysis: null } })
      expect((await service.getForLead('BBS-LD-1')).questions.map((q) => q.source)).not.toContain('L2_FINANCIAL_ANALYSIS')

      financial.getForLead.mockResolvedValue({ reportAvailable: true, status: 'COMPLETED', score: { extendedAnalysis: { ccrBrief: { suggestedDiscoveryQuestions: [L2_FREE, 42, null] } } } })
      const questions = (await service.getForLead('BBS-LD-1')).questions
      expect(questions.filter((q) => q.source === 'L2_FINANCIAL_ANALYSIS').map((q) => q.text)).toEqual([L2_FREE])
    })

    it("asks the Master Profile's own P1 items (what actually holds the lead at the CCR-first gate) as MASTER_PROFILE questions", async () => {
      const itemText = 'Purpose of borrowing: Bajaj Finance Limited (opened 2026-08-12, post-statement)'
      prisma.masterProfile.findFirst.mockResolvedValue({ missingInformation: [{ itemText }] })
      const result = await service.getForLead('BBS-LD-1')
      const q = result.questions.find((x) => x.source === 'MASTER_PROFILE')
      expect(q).toMatchObject({ text: itemText, answerType: 'TEXT', fieldKey: null })
      expect(q!.key).toMatch(/^MP-[0-9a-f]{12}$/)
      expect(prisma.masterProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { leadId: 'lead-1', status: 'COMPLETED' } }))
    })

    it('shows a previously submitted interaction as an open DRAFT when a new question has appeared since, and as SUBMITTED once every question is answered', async () => {
      const answered = [L1_INCOME, L1_CAN_SERVICE, L1_FREE].map((text, i) => answerRow({ questionKey: key('L1_DEBT_ANALYSIS', text), source: 'L1_DEBT_ANALYSIS', questionText: text, id: `a${i}` }))
      prisma.ccrInteraction.findUnique.mockResolvedValue({ status: 'SUBMITTED', submittedAt: new Date(), answers: answered })
      // L2_FREE is a fourth, unanswered question.
      expect(await service.getForLead('BBS-LD-1')).toMatchObject({ status: 'DRAFT', progress: { remaining: 1 }, canSubmit: false })

      prisma.ccrInteraction.findUnique.mockResolvedValue({ status: 'SUBMITTED', submittedAt: new Date(), answers: [...answered, answerRow({ questionKey: key('L2_FINANCIAL_ANALYSIS', L2_FREE), source: 'L2_FINANCIAL_ANALYSIS', questionText: L2_FREE, id: 'a9' })] })
      expect(await service.getForLead('BBS-LD-1')).toMatchObject({ status: 'SUBMITTED', progress: { remaining: 0 } })
    })

    it('throws NotFound for an unknown lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(null)
      await expect(service.getForLead('nope')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('saveAnswers', () => {
    const save = (answers: SaveCcrAnswersDto['answers'], actor: { id: string; role: 'CCR' | 'SUPERVISOR' } = ccr) => service.saveAnswers('BBS-LD-1', { answers }, actor)

    it('upserts each answer keyed by (lead, question) and audits the save', async () => {
      await save([{ questionKey: key('L1_DEBT_ANALYSIS', L1_FREE), responseStatus: 'ANSWERED' as never, answerText: '  Job loss  ' }])
      expect(prisma.ccrAnswer.upsert).toHaveBeenCalledTimes(1)
      const call = prisma.ccrAnswer.upsert.mock.calls[0][0]
      expect(call.where).toEqual({ leadId_questionKey: { leadId: 'lead-1', questionKey: key('L1_DEBT_ANALYSIS', L1_FREE) } })
      expect(call.create).toMatchObject({ leadId: 'lead-1', answerText: 'Job loss', answeredById: 'ccr-1', source: 'L1_DEBT_ANALYSIS' })
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'CCR_ANSWERS_SAVED', leadId: 'lead-1' }) }))
    })

    it("rejects a questionKey that belongs to a different lead's agenda", async () => {
      await expect(save([{ questionKey: key('L1_DEBT_ANALYSIS', 'What was the SBI debt used for?'), responseStatus: 'ANSWERED' as never, answerText: 'x' }])).rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.ccrAnswer.upsert).not.toHaveBeenCalled()
    })

    it('rejects a duplicate questionKey in one request', async () => {
      const k = key('L1_DEBT_ANALYSIS', L1_FREE)
      await expect(save([{ questionKey: k, responseStatus: 'ANSWERED' as never, answerText: 'a' }, { questionKey: k, responseStatus: 'ANSWERED' as never, answerText: 'b' }])).rejects.toThrow(/more than once/)
    })

    it('requires a value that matches the question type when ANSWERED', async () => {
      await expect(save([{ questionKey: key('L1_DEBT_ANALYSIS', L1_FREE), responseStatus: 'ANSWERED' as never }])).rejects.toThrow(/An answer is required/)
      await expect(save([{ questionKey: key('L1_DEBT_ANALYSIS', L1_INCOME), responseStatus: 'ANSWERED' as never, answerText: 'a lot' }])).rejects.toThrow(/amount is required/)
      await expect(save([{ questionKey: key('L1_DEBT_ANALYSIS', L1_CAN_SERVICE), responseStatus: 'ANSWERED' as never }])).rejects.toThrow(/yes\/no/)
    })

    it('lets a customer decline or not know without inventing a value, and drops any stray typed value', async () => {
      await save([{ questionKey: key('L1_DEBT_ANALYSIS', L1_INCOME), responseStatus: 'CUSTOMER_DECLINED' as never, answerAmount: 99999 }])
      expect(prisma.ccrAnswer.upsert.mock.calls[0][0].create).toMatchObject({ responseStatus: 'CUSTOMER_DECLINED', answerAmount: null, answerBoolean: null })
    })

    it('reopens a SUBMITTED interaction to DRAFT when an answer is edited, and clears any previous field-application note', async () => {
      prisma.ccrInteraction.findUnique.mockResolvedValue({ id: 'int-1', status: 'SUBMITTED', answers: [] })
      await save([{ questionKey: key('L1_DEBT_ANALYSIS', L1_FREE), responseStatus: 'ANSWERED' as never, answerText: 'changed' }])
      expect(prisma.ccrInteraction.upsert.mock.calls[0][0].update).toEqual({ status: 'DRAFT', submittedAt: null, submittedById: null })
      expect(prisma.ccrAnswer.upsert.mock.calls[0][0].update).toMatchObject({ appliedTo: null, conflictNote: null })
    })

    it('forbids a CCR from writing to a lead assigned to someone else, but allows the assignee and supervisors', async () => {
      prisma.lead.findUnique.mockResolvedValue({ ...lead, assignedCcrId: 'someone-else' })
      const a = [{ questionKey: key('L1_DEBT_ANALYSIS', L1_FREE), responseStatus: 'ANSWERED' as never, answerText: 'x' }]
      await expect(save(a)).rejects.toBeInstanceOf(ForbiddenException)
      await expect(save(a, supervisor)).resolves.toBeDefined()
      prisma.lead.findUnique.mockResolvedValue({ ...lead, assignedCcrId: 'ccr-1' })
      await expect(save(a)).resolves.toBeDefined()
    })
  })

  describe('recalculateAll', () => {
    it('regenerates Master, then creates and runs Cohort, Pathway and Plan in order even if none existed, and audits it', async () => {
      const order: string[] = []
      master.generate.mockImplementation(async () => (order.push('master'), { generated: true }))
      cohort.evaluate.mockImplementation(async () => (order.push('cohort'), { generated: true }))
      pathway.evaluate.mockImplementation(async () => (order.push('pathway'), { generated: true }))
      plan.generate.mockImplementation(async () => (order.push('plan'), { generated: true }))

      const result = await service.recalculateAll('BBS-LD-1', ccr)

      expect(order).toEqual(['master', 'cohort', 'pathway', 'plan'])
      expect(result.stages).toEqual({ cohort: { generated: true }, pathway: { generated: true }, plan: { generated: true } })
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'RECALCULATE_ALL' }) }))
    })

    describe('when the Master Profile is already current (saves AI credits: Master and Plan each cost a call)', () => {
      const currentMaster = { profileAvailable: true, status: 'COMPLETED', isStale: false, missingInformation: [], dataQuality: { band: 'MODERATE', flags: [] }, complianceRouting: { complianceHold: false, reason: null }, readinessGate: { outcome: 'READY' }, alignmentState: 'ALIGNED_HEALTHY', l1DataAsOf: null, l2DataAsOf: null, postStatementDebt: null }
      beforeEach(() => {
        master.getForLead.mockResolvedValue(currentMaster)
        prisma.cohortDecision.count.mockResolvedValue(2)
        prisma.pathwayDecision.count.mockResolvedValue(2)
        prisma.bbsPlan.findFirst.mockResolvedValue({ lifecycleStatus: 'DRAFT' })
        cohort.getForLead.mockResolvedValue({ decisionAvailable: true, isStale: false })
        pathway.getForLead.mockResolvedValue({ decisionAvailable: true, isStale: false })
        plan.getForLead.mockResolvedValue({ planAvailable: true, isStale: false })
      })

      it('regenerates and re-runs nothing when everything is current', async () => {
        const result = await service.recalculateAll('BBS-LD-1', ccr)
        expect(master.generate).not.toHaveBeenCalled()
        expect(cohort.evaluate).not.toHaveBeenCalled()
        expect(pathway.evaluate).not.toHaveBeenCalled()
        expect(plan.generate).not.toHaveBeenCalled()
        expect(result.masterProfile).toEqual({ generated: true, reason: 'Already up to date.' })
        expect(result.stages).toMatchObject({ cohort: { skipped: true }, pathway: { skipped: true }, plan: { skipped: true } })
      })

      it('re-runs a stale Cohort and everything after it, but not Master', async () => {
        cohort.getForLead.mockResolvedValue({ decisionAvailable: true, isStale: true })
        await service.recalculateAll('BBS-LD-1', ccr)
        expect(master.generate).not.toHaveBeenCalled()
        expect(cohort.evaluate).toHaveBeenCalledTimes(1)
        expect(pathway.evaluate).toHaveBeenCalledTimes(1)
        expect(plan.generate).toHaveBeenCalledTimes(1)
      })

      it('re-runs a stale Pathway and the Plan only — not Cohort', async () => {
        pathway.getForLead.mockResolvedValue({ decisionAvailable: true, isStale: true })
        await service.recalculateAll('BBS-LD-1', ccr)
        expect(cohort.evaluate).not.toHaveBeenCalled()
        expect(pathway.evaluate).toHaveBeenCalledTimes(1)
        expect(plan.generate).toHaveBeenCalledTimes(1)
      })

      it('re-runs only the Plan when only the Plan is stale', async () => {
        plan.getForLead.mockResolvedValue({ planAvailable: true, isStale: true })
        await service.recalculateAll('BBS-LD-1', ccr)
        expect(pathway.evaluate).not.toHaveBeenCalled()
        expect(plan.generate).toHaveBeenCalledTimes(1)
      })

      it('starts any stage the lead has never run', async () => {
        prisma.bbsPlan.findFirst.mockResolvedValue(null)
        await service.recalculateAll('BBS-LD-1', ccr)
        expect(plan.generate).toHaveBeenCalledTimes(1)
        expect(cohort.evaluate).not.toHaveBeenCalled()
      })
    })

    it('runs nothing downstream when the Master Profile could not be rebuilt, and says why', async () => {
      master.generate.mockResolvedValue({ generated: false, reason: 'Financial Analysis has not completed for this lead yet.' })
      const result = await service.recalculateAll('BBS-LD-1', ccr)
      expect(cohort.evaluate).not.toHaveBeenCalled()
      expect(result.stages).toBeNull()
      expect(result.masterProfile.reason).toMatch(/Financial Analysis/)
    })

    it('stops at the first stage that fails and never generates a plan on a stale pathway', async () => {
      pathway.evaluate.mockResolvedValue({ generated: false, reason: 'Cohort Decision is stale' })
      const result = await service.recalculateAll('BBS-LD-1', ccr)
      expect(plan.generate).not.toHaveBeenCalled()
      expect(result.stages).toMatchObject({ pathway: { generated: false }, plan: { skipped: true } })
    })

    it('leaves a plan the customer has accepted or started alone', async () => {
      prisma.bbsPlan.findFirst.mockResolvedValue({ lifecycleStatus: 'ACTIVE' })
      const result = await service.recalculateAll('BBS-LD-1', ccr)
      expect(plan.generate).not.toHaveBeenCalled()
      expect(result.stages?.plan).toMatchObject({ skipped: true })
    })

    it('forbids a CCR from recalculating a lead assigned to someone else', async () => {
      prisma.lead.findUnique.mockResolvedValue({ ...lead, assignedCcrId: 'someone-else' })
      await expect(service.recalculateAll('BBS-LD-1', ccr)).rejects.toBeInstanceOf(ForbiddenException)
      expect(master.generate).not.toHaveBeenCalled()
    })
  })

  describe('submit', () => {
    const allAnswers = (incomeAmount: number | null = 60000) => [
      answerRow({ id: 'a1', questionKey: key('L1_DEBT_ANALYSIS', L1_INCOME), fieldKey: 'MONTHLY_INCOME', answerAmount: incomeAmount === null ? null : new Prisma.Decimal(incomeAmount), responseStatus: incomeAmount === null ? 'NOT_KNOWN' : 'ANSWERED' }),
      answerRow({ id: 'a2', questionKey: key('L1_DEBT_ANALYSIS', L1_CAN_SERVICE), fieldKey: 'CAN_SERVICE_EMIS', answerBoolean: true }),
      answerRow({ id: 'a3', questionKey: key('L1_DEBT_ANALYSIS', L1_FREE) }),
      answerRow({ id: 'a4', questionKey: key('L2_FINANCIAL_ANALYSIS', L2_FREE) }),
    ]

    it('refuses to submit while any question lacks a response', async () => {
      prisma.ccrInteraction.findUnique.mockResolvedValue({ id: 'int-1', status: 'DRAFT', answers: allAnswers().slice(0, 2) })
      await expect(service.submit('BBS-LD-1', ccr)).rejects.toThrow(/2 of 4 question\(s\) still need a response/)
      expect(prisma.ccrInteraction.update).not.toHaveBeenCalled()
      expect(master.generate).not.toHaveBeenCalled()
    })

    it('refuses to submit when no questions exist yet', async () => {
      debt.getCallBriefForLead.mockResolvedValue({ reportAvailable: false })
      financial.getForLead.mockResolvedValue({ reportAvailable: false })
      await expect(service.submit('BBS-LD-1', ccr)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects a second submit of an already-submitted interaction', async () => {
      prisma.ccrInteraction.findUnique.mockResolvedValue({ id: 'int-1', status: 'SUBMITTED', answers: allAnswers() })
      await expect(service.submit('BBS-LD-1', ccr)).rejects.toBeInstanceOf(ConflictException)
    })

    it('copies the declared monthly income onto an empty Lead Details salary, marks SUBMITTED, and regenerates the Master Profile', async () => {
      prisma.ccrInteraction.findUnique.mockResolvedValue({ id: 'int-1', status: 'DRAFT', answers: allAnswers(60000) })
      const result = await service.submit('BBS-LD-1', ccr)

      expect(prisma.customer.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { leadId: 'lead-1', monthlySalary: expect.any(Prisma.Decimal) } }))
      expect(prisma.ccrAnswer.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { appliedTo: 'Customer.monthlySalary', conflictNote: null } })
      expect(prisma.ccrInteraction.update).toHaveBeenCalledWith({ where: { id: 'int-1' }, data: expect.objectContaining({ status: 'SUBMITTED', submittedById: 'ccr-1' }) })
      expect(master.generate).toHaveBeenCalledWith('BBS-LD-1')
      expect(result.downstream.masterProfile).toEqual({ generated: true })
    })

    it('keeps a conflicting existing salary and records the conflict instead of overwriting', async () => {
      prisma.customer.findUnique.mockResolvedValue({ monthlySalary: new Prisma.Decimal(40000) })
      prisma.ccrInteraction.findUnique.mockResolvedValue({ id: 'int-1', status: 'DRAFT', answers: allAnswers(60000) })
      const result = await service.submit('BBS-LD-1', ccr)

      expect(prisma.customer.upsert).not.toHaveBeenCalled()
      const update = prisma.ccrAnswer.update.mock.calls[0][0]
      expect(update.data.appliedTo).toBeNull()
      expect(update.data.conflictNote).toMatch(/existing value was kept/)
      expect(result.downstream.applied[0].conflictNote).not.toBeNull()
    })

    it('does not touch the profile when the income was answered "not known"', async () => {
      prisma.ccrInteraction.findUnique.mockResolvedValue({ id: 'int-1', status: 'DRAFT', answers: allAnswers(null) })
      await service.submit('BBS-LD-1', ccr)
      expect(prisma.customer.upsert).not.toHaveBeenCalled()
      expect(prisma.ccrInteraction.update).toHaveBeenCalled()
    })

    it('keeps the submit durable and reports why when Master Profile regeneration is not possible', async () => {
      master.generate.mockResolvedValue({ generated: false, reason: 'Financial Analysis has not completed for this lead yet.' })
      prisma.ccrInteraction.findUnique.mockResolvedValue({ id: 'int-1', status: 'DRAFT', answers: allAnswers() })
      const result = await service.submit('BBS-LD-1', ccr)
      expect(prisma.ccrInteraction.update).toHaveBeenCalled()
      expect(result.downstream.masterProfile).toEqual({ generated: false, reason: 'Financial Analysis has not completed for this lead yet.' })
    })

    it('reports a thrown regeneration error rather than failing the submit', async () => {
      master.generate.mockRejectedValue(new Error('boom'))
      prisma.ccrInteraction.findUnique.mockResolvedValue({ id: 'int-1', status: 'DRAFT', answers: allAnswers() })
      const result = await service.submit('BBS-LD-1', ccr)
      expect(result.downstream.masterProfile).toEqual({ generated: false, reason: 'boom' })
    })

    describe('downstream refresh after the Master Profile is regenerated', () => {
      beforeEach(() => {
        prisma.ccrInteraction.findUnique.mockResolvedValue({ id: 'int-1', status: 'DRAFT', answers: allAnswers() })
      })

      it('re-evaluates Cohort, then Pathway, then Plan, in that order, for a lead that already has all three', async () => {
        const order: string[] = []
        cohort.evaluate.mockImplementation(async () => (order.push('cohort'), { generated: true }))
        pathway.evaluate.mockImplementation(async () => (order.push('pathway'), { generated: true }))
        plan.generate.mockImplementation(async () => (order.push('plan'), { generated: true }))
        prisma.cohortDecision.count.mockResolvedValue(2)
        prisma.pathwayDecision.count.mockResolvedValue(1)
        prisma.bbsPlan.findFirst.mockResolvedValue({ lifecycleStatus: 'CCR_REVIEW' })

        const result = await service.submit('BBS-LD-1', ccr)

        expect(order).toEqual(['cohort', 'pathway', 'plan'])
        expect(result.downstream.recalculated).toEqual({ cohort: { generated: true }, pathway: { generated: true }, plan: { generated: true } })
      })

      it('does not start a stage the CCR has never run', async () => {
        const result = await service.submit('BBS-LD-1', ccr)
        expect(cohort.evaluate).not.toHaveBeenCalled()
        expect(pathway.evaluate).not.toHaveBeenCalled()
        expect(plan.generate).not.toHaveBeenCalled()
        expect(result.downstream.recalculated).toMatchObject({ cohort: { skipped: true }, pathway: { skipped: true }, plan: { skipped: true } })
      })

      it('never runs Pathway or Plan on a stale upstream when Cohort could not be refreshed', async () => {
        prisma.cohortDecision.count.mockResolvedValue(1)
        prisma.pathwayDecision.count.mockResolvedValue(1)
        prisma.bbsPlan.findFirst.mockResolvedValue({ lifecycleStatus: 'DRAFT' })
        cohort.evaluate.mockResolvedValue({ generated: false, reason: 'Master Profile is stale' })

        const result = await service.submit('BBS-LD-1', ccr)

        expect(pathway.evaluate).not.toHaveBeenCalled()
        expect(plan.generate).not.toHaveBeenCalled()
        expect(result.downstream.recalculated).toMatchObject({ cohort: { generated: false, reason: 'Master Profile is stale' }, pathway: { skipped: true }, plan: { skipped: true } })
      })

      it('reports a thrown engine error instead of failing the submit', async () => {
        prisma.cohortDecision.count.mockResolvedValue(1)
        cohort.evaluate.mockRejectedValue(new Error('boom'))
        const result = await service.submit('BBS-LD-1', ccr)
        expect(prisma.ccrInteraction.update).toHaveBeenCalledWith({ where: { id: 'int-1' }, data: expect.objectContaining({ status: 'SUBMITTED' }) })
        expect(result.downstream.recalculated).toMatchObject({ cohort: { generated: false, reason: 'boom' } })
      })

      it('never silently supersedes a plan the customer has been offered, accepted or started', async () => {
        prisma.cohortDecision.count.mockResolvedValue(1)
        prisma.pathwayDecision.count.mockResolvedValue(1)
        for (const lifecycleStatus of ['CUSTOMER_ACCEPTANCE_PENDING', 'EXECUTION_READY', 'ACTIVE']) {
          plan.generate.mockClear()
          prisma.bbsPlan.findFirst.mockResolvedValue({ lifecycleStatus })
          prisma.ccrInteraction.findUnique.mockResolvedValue({ id: 'int-1', status: 'DRAFT', answers: allAnswers() })
          const result = await service.submit('BBS-LD-1', ccr)
          expect(plan.generate).not.toHaveBeenCalled()
          expect(result.downstream.recalculated?.plan).toMatchObject({ skipped: true })
        }
      })

      it("keeps a cohort a person set by override instead of re-running the rules over it, and still refreshes Pathway and Plan from it", async () => {
        prisma.cohortDecision.count.mockResolvedValue(3)
        prisma.pathwayDecision.count.mockResolvedValue(1)
        prisma.bbsPlan.findFirst.mockResolvedValue({ lifecycleStatus: 'CCR_REVIEW' })
        prisma.cohortOverride.count.mockResolvedValue(1)

        const result = await service.submit('BBS-LD-1', ccr)

        expect(cohort.evaluate).not.toHaveBeenCalled()
        expect(pathway.evaluate).toHaveBeenCalledTimes(1)
        expect(plan.generate).toHaveBeenCalledTimes(1)
        expect(result.downstream.recalculated?.cohort).toMatchObject({ generated: true, reason: expect.stringMatching(/Kept the cohort set by override/) })
      })

      it('does not refresh anything when the Master Profile was not regenerated', async () => {
        master.generate.mockResolvedValue({ generated: false, reason: 'nope' })
        prisma.cohortDecision.count.mockResolvedValue(1)
        const result = await service.submit('BBS-LD-1', ccr)
        expect(cohort.evaluate).not.toHaveBeenCalled()
        expect(result.downstream.recalculated).toBeNull()
      })
    })

    it('forbids a CCR from submitting a lead assigned to someone else', async () => {
      prisma.lead.findUnique.mockResolvedValue({ ...lead, assignedCcrId: 'someone-else' })
      await expect(service.submit('BBS-LD-1', ccr)).rejects.toBeInstanceOf(ForbiddenException)
    })
  })
})
