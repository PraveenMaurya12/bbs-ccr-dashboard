import type { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/main'
import type { AppConfig } from '../src/config/configuration'
import { PrismaService } from '../src/common/prisma/prisma.service'

/**
 * Exercises the CCR verification Q&A against the REAL L1 -> L2 -> CCR ->
 * Master Profile -> Cohort -> Pathway -> Plan chain: a mock-provider bureau
 * pull and a real CSV statement produce real questions; answers persist in
 * Postgres; submitting applies the structured income answer, regenerates the
 * Master Profile, and leaves the downstream engines stale until a CCR
 * recalculates them. Every scenario creates its own fresh leads, so it is
 * re-runnable against a database that is never reset. force-mock-providers
 * guarantees no live bureau or AI call is made.
 */
describe('CCR interaction (e2e)', () => {
  let app: NestExpressApplication
  let prisma: PrismaService
  let ccrToken: string
  let supervisorToken: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication<NestExpressApplication>()
    configureApp(app, app.get(ConfigService).get<AppConfig>('app')!)
    await app.init()
    prisma = app.get(PrismaService)

    const login = async (email: string, password: string) => {
      const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password })
      return res.body.data.accessToken as string
    }
    ccrToken = await login('ccr.dev@bbs.example.test', 'DevOnly-Passw0rd-2026')
    const supervisorEmail = process.env.DEV_SEED_SUPERVISOR_EMAIL ?? 'supervisor.dev@bbs.example.test'
    const supervisorPassword = process.env.DEV_SEED_SUPERVISOR_PASSWORD ?? 'DevOnly-Passw0rd-2026'
    supervisorToken = await login(supervisorEmail, supervisorPassword)
  })

  afterAll(async () => {
    await app.close()
  })

  const as = (token: string, req: request.Test) => req.set('Authorization', `Bearer ${token}`)
  const ccr = (req: request.Test) => as(ccrToken, req)
  const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26))
  const randomPan = () => `${letter()}${letter()}${letter()}${letter()}${letter()}${Math.floor(1000 + Math.random() * 9000)}${letter()}`
  const randomPhone = () => `+91 9${Math.floor(100000000 + Math.random() * 900000000)}`

  async function createLead(fullName: string): Promise<{ bbsLeadId: string; leadId: string }> {
    const res = await ccr(request(app.getHttpServer()).post('/api/leads').send({ fullName, phone: randomPhone(), email: 'ccr-interaction.e2e@example.test', city: 'Pune', source: 'ONLINE' }))
    return { bbsLeadId: res.body.data.bbsLeadId as string, leadId: res.body.data.id as string }
  }

  async function pollUntil<T>(fn: () => Promise<T>, ready: (v: T) => boolean, timeoutMs = 20000): Promise<T> {
    const deadline = Date.now() + timeoutMs
    let last: T
    do {
      last = await fn()
      if (ready(last)) return last
      await new Promise((resolve) => setTimeout(resolve, 150))
    } while (Date.now() < deadline)
    return last
  }

  // Same statement shape the Master Profile e2e uses: one recurring EMI that matches the mock bureau tradeline.
  const CSV_STATEMENT = [
    'Date,Narration,Debit,Credit,Balance',
    '05/01/2026,SALARY CREDIT ABC CORP,,55000.00,60000.00',
    '10/01/2026,EMI AUTO DEBIT MOCK DEV BANK,6500.00,,53500.00',
    '05/02/2026,SALARY CREDIT ABC CORP,,55000.00,108500.00',
    '10/02/2026,EMI AUTO DEBIT MOCK DEV BANK,6500.00,,102000.00',
    '05/03/2026,SALARY CREDIT ABC CORP,,55000.00,157000.00',
    '10/03/2026,EMI AUTO DEBIT MOCK DEV BANK,6500.00,,150500.00',
  ].join('\n')

  /** A lead with both L1 and L2 completed. */
  async function createReadyLead(fullName: string, statementCsv: string = CSV_STATEMENT): Promise<{ bbsLeadId: string; leadId: string }> {
    const lead = await createLead(fullName)
    // Real CCR-attested consent + PAN capture (mock bureau provider): gives the lead consent/KYC so the engines can reach a real cohort.
    const consent = await ccr(request(app.getHttpServer()).post(`/api/leads/${lead.bbsLeadId}/consent`).send({ pan: randomPan(), consentGranted: true }))
    expect(consent.body.data).toEqual({ triggered: true })
    await pollUntil(
      async () => (await ccr(request(app.getHttpServer()).get(`/api/leads/${lead.bbsLeadId}/debt-analysis`))).body.data,
      (d) => d.reportAvailable && d.status === 'COMPLETED',
    )
    await ccr(request(app.getHttpServer()).post(`/api/leads/${lead.bbsLeadId}/documents`).field('documentType', 'BANK_STATEMENT').attach('file', Buffer.from(statementCsv), { filename: 'statement.csv', contentType: 'text/csv' }))
    await pollUntil(
      async () => (await ccr(request(app.getHttpServer()).get(`/api/leads/${lead.bbsLeadId}/financial-analysis`))).body.data,
      (d) => d.reportAvailable && d.status === 'COMPLETED',
    )
    return lead
  }

  type Question = { key: string; source: string; text: string; answerType: string; fieldKey: string | null; answer: { responseStatus: string; answerText: string | null; answerAmount: number | null; answerBoolean: boolean | null } | null }
  const getState = async (bbsLeadId: string, token = ccrToken) => (await as(token, request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/ccr-interaction`))).body.data
  const answerAll = (questions: Question[], tag: string, income = 48000) =>
    questions.map((q) => {
      if (q.fieldKey === 'MONTHLY_INCOME') return { questionKey: q.key, responseStatus: 'ANSWERED', answerAmount: income }
      if (q.answerType === 'AMOUNT') return { questionKey: q.key, responseStatus: 'ANSWERED', answerAmount: 10000 }
      if (q.answerType === 'YES_NO') return { questionKey: q.key, responseStatus: 'ANSWERED', answerBoolean: true }
      return { questionKey: q.key, responseStatus: 'ANSWERED', answerText: `${tag}: ${q.text.slice(0, 40)}` }
    })

  describe('access control', () => {
    it('rejects unauthenticated reads, writes and submits', async () => {
      const { bbsLeadId } = await createLead('CCR Auth Lead')
      const base = `/api/leads/${bbsLeadId}/ccr-interaction`
      expect((await request(app.getHttpServer()).get(base)).status).toBe(401)
      expect((await request(app.getHttpServer()).put(`${base}/answers`).send({ answers: [] })).status).toBe(401)
      expect((await request(app.getHttpServer()).post(`${base}/submit`)).status).toBe(401)
    })

    it('404s for a lead that does not exist', async () => {
      expect((await ccr(request(app.getHttpServer()).get('/api/leads/BBS-LD-DOES-NOT-EXIST/ccr-interaction'))).status).toBe(404)
    })
  })

  describe('empty state', () => {
    it('reports no questions, with a reason, for a lead whose L1/L2 have not completed — and refuses to submit', async () => {
      const { bbsLeadId } = await createLead('CCR Empty Lead')
      const state = await getState(bbsLeadId)
      expect(state).toMatchObject({ questionsAvailable: false, status: 'DRAFT', questions: [], progress: { total: 0, answered: 0, remaining: 0 }, canSubmit: false })
      expect(state.unavailableReason).toMatch(/L1 Credit Profile and L2 Financial Profile/)
      expect((await ccr(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/ccr-interaction/submit`))).status).toBe(400)
    })
  })

  describe('full workflow on real L1 + L2 output', () => {
    it('generates questions from both L1 and L2, validates answers, persists, edits, submits, and recalculates downstream', async () => {
      const { bbsLeadId, leadId } = await createReadyLead('CCR Workflow Lead')
      const base = `/api/leads/${bbsLeadId}/ccr-interaction`

      // Questions come from BOTH modules.
      const initial = await getState(bbsLeadId)
      expect(initial.questionsAvailable).toBe(true)
      const questions: Question[] = initial.questions
      expect(questions.some((q) => q.source === 'L1_DEBT_ANALYSIS')).toBe(true)
      expect(questions.some((q) => q.source === 'L2_FINANCIAL_ANALYSIS')).toBe(true)
      expect(initial.progress.answered).toBe(0)
      const income = questions.find((q) => q.fieldKey === 'MONTHLY_INCOME')!
      const canService = questions.find((q) => q.fieldKey === 'CAN_SERVICE_EMIS')!
      expect(income.answerType).toBe('AMOUNT')
      expect(canService.answerType).toBe('YES_NO')

      // Validation.
      const put = (answers: unknown[]) => ccr(request(app.getHttpServer()).put(`${base}/answers`).send({ answers }))
      expect((await put([])).status).toBe(400)
      expect((await put([{ questionKey: income.key, responseStatus: 'ANSWERED' }])).status).toBe(400) // amount missing
      expect((await put([{ questionKey: income.key, responseStatus: 'ANSWERED', answerAmount: -1 }])).status).toBe(400)
      expect((await put([{ questionKey: canService.key, responseStatus: 'ANSWERED' }])).status).toBe(400) // boolean missing
      expect((await put([{ questionKey: 'L1-000000000000', responseStatus: 'ANSWERED', answerText: 'x' }])).status).toBe(400) // not this lead's question
      expect((await put([{ questionKey: 'bogus', responseStatus: 'ANSWERED', answerText: 'x' }])).status).toBe(400)
      expect((await ccr(request(app.getHttpServer()).post(`${base}/submit`))).status).toBe(400) // nothing answered yet

      // Partial save persists, bound to the right questions, and a reload shows it.
      const partial = answerAll(questions.slice(0, 2), 'partial')
      expect((await put(partial)).status).toBe(200)
      const reloaded: { questions: Question[]; progress: { answered: number } } = await getState(bbsLeadId)
      expect(reloaded.progress.answered).toBe(2)
      for (const a of partial) expect(reloaded.questions.find((q) => q.key === a.questionKey)!.answer?.responseStatus).toBe('ANSWERED')
      expect((await ccr(request(app.getHttpServer()).post(`${base}/submit`))).status).toBe(400) // still incomplete

      // Edit an existing answer: no duplicate row, new value shown.
      const incomeEdit = await put([{ questionKey: income.key, responseStatus: 'ANSWERED', answerAmount: 41000 }])
      expect(incomeEdit.status).toBe(200)
      const incomeWasAlreadyAnswered = partial.some((p) => p.questionKey === income.key)
      expect(incomeEdit.body.data.progress.answered).toBe(reloaded.progress.answered + (incomeWasAlreadyAnswered ? 0 : 1))
      expect(incomeEdit.body.data.questions.find((q: Question) => q.key === income.key).answer.answerAmount).toBe(41000)
      expect(await prisma.ccrAnswer.count({ where: { leadId, questionKey: income.key } })).toBe(1)

      // Complete the set (income finally 48000; one "not known" is a valid completion and stores nothing).
      const rest = answerAll(questions, 'final', 48000)
      rest[rest.length - 1] = { questionKey: questions[questions.length - 1].key, responseStatus: 'NOT_KNOWN' } as never
      const full = await put(rest)
      expect(full.status).toBe(200)
      expect(full.body.data.progress.remaining).toBe(0)
      expect(full.body.data.canSubmit).toBe(true)
      expect(full.body.data.questions[questions.length - 1].answer).toMatchObject({ responseStatus: 'NOT_KNOWN', answerText: null, answerAmount: null, answerBoolean: null })

      // Master Profile v1 exists BEFORE submit (from an explicit generate), so we can prove submit regenerates it.
      expect((await ccr(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/master-profile/generate`))).body.data.generated).toBe(true)
      const before = await pollUntil(async () => (await ccr(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/master-profile`))).body.data, (d) => d.profileAvailable && d.status !== 'GENERATING')
      expect(before.version).toBe(1)

      // Submit.
      const submit = await ccr(request(app.getHttpServer()).post(`${base}/submit`))
      expect(submit.status).toBe(200)
      expect(submit.body.data.status).toBe('SUBMITTED')
      expect(submit.body.data.downstream.masterProfile).toEqual({ generated: true })
      expect(submit.body.data.downstream.applied).toEqual([{ fieldKey: 'MONTHLY_INCOME', appliedTo: 'Customer.monthlySalary', conflictNote: null }])
      expect((await ccr(request(app.getHttpServer()).post(`${base}/submit`))).status).toBe(409)

      // Persisted answers reopen intact; income reached Lead Details; Master Profile regenerated and fresh.
      const reopened = await getState(bbsLeadId)
      expect(reopened.status).toBe('SUBMITTED')
      expect(reopened.progress.remaining).toBe(0)
      const customer = await prisma.customer.findUnique({ where: { leadId } })
      expect(customer?.monthlySalary?.toNumber()).toBe(48000)
      const master = await pollUntil(async () => (await ccr(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/master-profile`))).body.data, (d) => d.version === 2 && d.status !== 'GENERATING')
      expect(master.version).toBe(2)
      expect(master.isStale).toBe(false)
      // The declared income (48000) is within tolerance of the 55000 statement salary, so it must NOT invent a conflict.
      expect((master.validationRequired as { item: string }[]).some((v) => v.item.startsWith('CCR-declared income'))).toBe(false)

      // Cohort -> Pathway -> Plan, each from this lead's own Master Profile; nothing is approved automatically.
      expect((await ccr(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/cohort/evaluate`))).body.data.generated).toBe(true)
      expect((await ccr(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/pathway/evaluate`))).body.data.generated).toBe(true)
      expect((await ccr(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/plan/generate`))).body.data.generated).toBe(true)
      const cohort = (await ccr(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/cohort`))).body.data
      const pathway = (await ccr(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/pathway`))).body.data
      const plan = (await ccr(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/plan`))).body.data
      expect([cohort.isStale, pathway.isStale, plan.isStale]).toEqual([false, false, false])
      // With consent + KYC on file the lead gets a real cohort decision (not a consent/KYC block) and a plan built on it.
      expect(cohort.primaryCohort).not.toMatch(/^(CONSENT_PENDING|KYC_PENDING)$/)
      expect(plan.cohort).toBe(cohort.primaryCohort)
      expect(String(plan.lifecycleStatus)).not.toMatch(/APPROVED|ACTIVE|ACCEPTED/)

      // Editing a submitted answer reopens it, and a changed CCR answer regenerates Master -> downstream goes stale.
      const edit = await put([{ questionKey: income.key, responseStatus: 'ANSWERED', answerAmount: 90000 }])
      expect(edit.body.data.status).toBe('DRAFT')
      expect(edit.body.data.submittedAt).toBeNull()
      const resubmit = await ccr(request(app.getHttpServer()).post(`${base}/submit`))
      expect(resubmit.status).toBe(200)
      // 90000 declared vs 55000 observed (> 25%): salary already set to 48000 -> conflict recorded, NOT overwritten.
      expect(resubmit.body.data.downstream.applied[0].conflictNote).toMatch(/existing value was kept/)
      expect((await prisma.customer.findUnique({ where: { leadId } }))?.monthlySalary?.toNumber()).toBe(48000)
      const master3 = await pollUntil(async () => (await ccr(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/master-profile`))).body.data, (d) => d.version === 3 && d.status !== 'GENERATING')
      expect((master3.validationRequired as { item: string }[]).some((v) => v.item.startsWith('CCR-declared income differs'))).toBe(true)
      // The submit itself brought Cohort, Pathway and Plan up to date, in order, against the new Master Profile.
      expect(resubmit.body.data.downstream.recalculated).toEqual({ cohort: { generated: true }, pathway: { generated: true }, plan: { generated: true } })
      for (const stage of ['cohort', 'pathway', 'plan']) {
        expect((await ccr(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/${stage}`))).body.data.isStale).toBe(false)
      }
    }, 90000)

    it("never mixes two leads' answers, even though their generic questions share the same keys", async () => {
      const a = await createReadyLead('CCR Isolation A')
      const b = await createReadyLead('CCR Isolation B')
      const stateA: { questions: Question[] } = await getState(a.bbsLeadId)
      const stateB: { questions: Question[] } = await getState(b.bbsLeadId)
      const sharedKey = stateA.questions.find((q) => q.answerType === 'TEXT' && stateB.questions.some((x) => x.key === q.key))
      expect(sharedKey).toBeDefined()

      const res = await ccr(request(app.getHttpServer()).put(`/api/leads/${a.bbsLeadId}/ccr-interaction/answers`).send({ answers: [{ questionKey: sharedKey!.key, responseStatus: 'ANSWERED', answerText: 'ONLY FOR LEAD A' }] }))
      expect(res.status).toBe(200)

      const afterB: { questions: Question[]; progress: { answered: number } } = await getState(b.bbsLeadId)
      expect(afterB.progress.answered).toBe(0)
      expect(afterB.questions.find((q) => q.key === sharedKey!.key)!.answer).toBeNull()
      expect(await prisma.ccrAnswer.count({ where: { leadId: b.leadId } })).toBe(0)
      expect(await prisma.ccrAnswer.count({ where: { leadId: a.leadId, answerText: 'ONLY FOR LEAD A' } })).toBe(1)
    }, 60000)
  })

  describe('blocker resolution (the CCR_REQUIRED / No pathway / stale-decision chain)', () => {
    // The mock tradeline opened ~18 months ago; this statement ENDS well before that, so the account is
    // "post-statement debt": L2 cannot observe its repayment, Master raises a P1 "purpose of borrowing" item,
    // the readiness gate says CCR_FIRST, the cohort is CCR_REQUIRED and the pathway is BLOCKED.
    const OLD_STATEMENT = [
      'Date,Narration,Debit,Credit,Balance',
      '05/01/2024,SALARY CREDIT ABC CORP,,55000.00,60000.00',
      '10/01/2024,GROCERY STORE,6500.00,,53500.00',
      '05/02/2024,SALARY CREDIT ABC CORP,,55000.00,108500.00',
      '10/02/2024,GROCERY STORE,6500.00,,102000.00',
      '05/03/2024,SALARY CREDIT ABC CORP,,55000.00,157000.00',
      '10/03/2024,GROCERY STORE,6500.00,,150500.00',
    ].join('\n')

    const get = async (path: string) => (await ccr(request(app.getHttpServer()).get(path))).body.data
    const post = async (path: string) => (await ccr(request(app.getHttpServer()).post(path))).body.data

    async function blockedLead(name: string) {
      const lead = await createReadyLead(name, OLD_STATEMENT)
      expect((await post(`/api/leads/${lead.bbsLeadId}/master-profile/generate`)).generated).toBe(true)
      await pollUntil(() => get(`/api/leads/${lead.bbsLeadId}/master-profile`), (d) => d.profileAvailable && d.status !== 'GENERATING')
      expect((await post(`/api/leads/${lead.bbsLeadId}/cohort/evaluate`)).generated).toBe(true)
      expect((await post(`/api/leads/${lead.bbsLeadId}/pathway/evaluate`)).generated).toBe(true)
      return lead
    }

    it('reproduces the block: post-statement debt -> P1 item -> CCR_FIRST -> CCR_REQUIRED cohort -> BLOCKED pathway', async () => {
      const { bbsLeadId } = await blockedLead('CCR Blocked Lead')
      const master = await get(`/api/leads/${bbsLeadId}/master-profile`)
      expect(master.readinessGate.outcome).toBe('CCR_FIRST')
      const p1 = (master.missingInformation as { priority: string; resolved: boolean; itemText: string }[]).filter((i) => i.priority === 'P1')
      expect(p1.length).toBeGreaterThan(0)
      expect(p1.every((i) => !i.resolved && /post-statement/.test(i.itemText))).toBe(true)
      expect((await get(`/api/leads/${bbsLeadId}/cohort`)).primaryCohort).toBe('CCR_REQUIRED')
      expect(await get(`/api/leads/${bbsLeadId}/pathway`)).toMatchObject({ primaryPathway: null, pathwayStatus: 'BLOCKED', blockingReason: 'CCR_REQUIRED' })
    }, 90000)

    it('asks the blocking P1 items as questions, and answering them resolves the block through Master -> Cohort -> Pathway, all fresh', async () => {
      const { bbsLeadId, leadId } = await blockedLead('CCR Resolve Lead')
      const base = `/api/leads/${bbsLeadId}/ccr-interaction`
      const state: { questions: Question[] } = await getState(bbsLeadId)
      const masterQs = state.questions.filter((q) => q.source === 'MASTER_PROFILE')
      expect(masterQs.length).toBeGreaterThan(0)
      expect(masterQs.every((q) => /post-statement/.test(q.text))).toBe(true)

      const answers = answerAll(state.questions, 'resolve')
      const put = await ccr(request(app.getHttpServer()).put(`${base}/answers`).send({ answers }))
      expect(put.status).toBe(200)
      const submit = await ccr(request(app.getHttpServer()).post(`${base}/submit`))
      expect(submit.status).toBe(200)
      expect(submit.body.data.downstream.masterProfile).toEqual({ generated: true })
      // Cohort and Pathway already existed, so both were refreshed in order; there was no plan to refresh.
      expect(submit.body.data.downstream.recalculated).toMatchObject({ cohort: { generated: true }, pathway: { generated: true }, plan: { skipped: true } })

      const master = await pollUntil(() => get(`/api/leads/${bbsLeadId}/master-profile`), (d) => d.version === 2 && d.status !== 'GENERATING')
      const p1 = (master.missingInformation as { priority: string; resolved: boolean; resolutionSource: string | null }[]).filter((i) => i.priority === 'P1')
      expect(p1.length).toBeGreaterThan(0)
      expect(p1.every((i) => i.resolved && i.resolutionSource === 'CCR_DECLARED')).toBe(true)
      expect(master.readinessGate.outcome).not.toBe('CCR_FIRST')
      // The underlying fact is NOT treated as verified: the post-statement flag stays on the profile.
      expect(master.postStatementDebt.detected).toBe(true)
      expect(master.dataQuality.flags).toContain('L1_DEBT_POST_STATEMENT')

      const cohort = await get(`/api/leads/${bbsLeadId}/cohort`)
      const pathway = await get(`/api/leads/${bbsLeadId}/pathway`)
      expect(cohort.primaryCohort).not.toBe('CCR_REQUIRED')
      expect(cohort.isStale).toBe(false)
      expect(pathway.isStale).toBe(false)
      expect(pathway.blockingReason).not.toBe('CCR_REQUIRED')
      // Pathway ran against exactly the cohort and master versions that are now current.
      expect(pathway.l4Reference.cohortDecisionId).toBeTruthy()
      expect(await prisma.pathwayDecision.count({ where: { leadId, sourceCohortDecisionVersion: cohort.version } })).toBeGreaterThan(0)
      expect(await prisma.cohortDecision.count({ where: { leadId, sourceMasterProfileVersion: master.version } })).toBeGreaterThan(0)
    }, 120000)

    it('keeps the block when the CCR records "not known" for the P1 items — nothing was learned, so nothing is resolved', async () => {
      const { bbsLeadId } = await blockedLead('CCR Unknown Lead')
      const base = `/api/leads/${bbsLeadId}/ccr-interaction`
      const state: { questions: Question[] } = await getState(bbsLeadId)
      const answers = answerAll(state.questions, 'unknown').map((a) => (state.questions.find((q) => q.key === a.questionKey)!.source === 'MASTER_PROFILE' ? { questionKey: a.questionKey, responseStatus: 'NOT_KNOWN' } : a))
      expect((await ccr(request(app.getHttpServer()).put(`${base}/answers`).send({ answers }))).status).toBe(200)
      expect((await ccr(request(app.getHttpServer()).post(`${base}/submit`))).status).toBe(200)

      const master = await pollUntil(() => get(`/api/leads/${bbsLeadId}/master-profile`), (d) => d.version === 2 && d.status !== 'GENERATING')
      expect((master.missingInformation as { priority: string; resolved: boolean }[]).filter((i) => i.priority === 'P1').every((i) => !i.resolved)).toBe(true)
      expect(master.readinessGate.outcome).toBe('CCR_FIRST')
      expect((await get(`/api/leads/${bbsLeadId}/cohort`)).primaryCohort).toBe('CCR_REQUIRED')
      expect(await get(`/api/leads/${bbsLeadId}/pathway`)).toMatchObject({ primaryPathway: null, blockingReason: 'CCR_REQUIRED', isStale: false })
    }, 120000)

    it('names the missing data, accepts a current bank statement, and one recalculate-all call produces fresh Master, Cohort, Pathway and an unapproved Plan', async () => {
      const { bbsLeadId, leadId } = await blockedLead('CCR Data Needed Lead')
      const reqUrl = `/api/leads/${bbsLeadId}/data-requirements`

      // 1. The panel's data: the SPECIFIC reasons, each with the action that supplies it.
      const before = await get(reqUrl)
      expect(before.blocked).toBe(true)
      const byCode = Object.fromEntries((before.requirements as { code: string; action: { type: string }; severity: string; detail?: { needed?: string } }[]).map((r) => [r.code, r]))
      expect(byCode.STATEMENT_NOT_CURRENT).toMatchObject({ severity: 'BLOCKING', action: { type: 'UPLOAD_BANK_STATEMENT' } })
      expect(byCode.STATEMENT_NOT_CURRENT.detail?.needed).toMatch(/2024-03-10/)
      expect(byCode.POST_STATEMENT_DEBT.action.type).toBe('ANSWER_CCR_QUESTIONS')

      // 2. Supply the data: a CURRENT statement through the normal upload path.
      const today = new Date()
      const d = (monthsAgo: number, day: number) => {
        const x = new Date(today.getFullYear(), today.getMonth() - monthsAgo, day)
        return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`
      }
      const current = ['Date,Narration,Debit,Credit,Balance']
      let bal = 60000
      for (const m of [3, 2, 1, 0]) {
        bal += 55000
        current.push(`${d(m, 2)},SALARY CREDIT ABC CORP,,55000.00,${bal.toFixed(2)}`)
        bal -= 6500
        current.push(`${d(m, 3)},EMI AUTO DEBIT MOCK DEV BANK,6500.00,,${bal.toFixed(2)}`)
      }
      await ccr(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/documents`).field('documentType', 'BANK_STATEMENT').attach('file', Buffer.from(current.join('\n')), { filename: 'current.csv', contentType: 'text/csv' }))
      await pollUntil(
        async () => prisma.bankStatementAnalysis.count({ where: { leadId, status: 'COMPLETED' } }),
        (n) => n >= 2,
      )

      // 3. One call recalculates everything, in order, and reports each stage.
      const res = await ccr(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/recalculate-all`))
      expect(res.status).toBe(200)
      expect(res.body.data.masterProfile.generated).toBe(true)
      expect(res.body.data.stages).toMatchObject({ cohort: { generated: true }, pathway: { generated: true }, plan: { generated: true } })

      // 4. The date-gap blocker is gone, everything is fresh, and nothing was approved.
      const after = res.body.data.requirements
      expect((after.requirements as { code: string }[]).map((r) => r.code)).not.toContain('STATEMENT_NOT_CURRENT')
      const master = await get(`/api/leads/${bbsLeadId}/master-profile`)
      expect(new Date(master.l2DataAsOf).getTime()).toBeGreaterThan(Date.now() - 40 * 86400000)
      expect(master.isStale).toBe(false)
      for (const stage of ['cohort', 'pathway', 'plan']) expect((await get(`/api/leads/${bbsLeadId}/${stage}`)).isStale).toBe(false)
      const plan = await get(`/api/leads/${bbsLeadId}/plan`)
      expect(String(plan.lifecycleStatus)).not.toMatch(/APPROVED|ACTIVE|ACCEPTED|EXECUTION_READY/)
    }, 150000)

    it('protects the new endpoints: 401 without a token, 404 for an unknown lead, 403 for a CCR on someone else\'s lead', async () => {
      const { bbsLeadId } = await createLead('CCR Endpoint Guard Lead')
      expect((await request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/data-requirements`)).status).toBe(401)
      expect((await request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/recalculate-all`)).status).toBe(401)
      expect((await ccr(request(app.getHttpServer()).get('/api/leads/BBS-LD-DOES-NOT-EXIST/data-requirements'))).status).toBe(404)
      const supervisor = await prisma.user.findFirstOrThrow({ where: { role: 'SUPERVISOR' } })
      await as(supervisorToken, request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/assign`).send({ ccrUserId: supervisor.id }))
      expect((await ccr(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/recalculate-all`))).status).toBe(403)
    }, 60000)

    it('flags Cohort/Pathway stale when Master has moved on, and Pathway refuses to run until Cohort is refreshed first', async () => {
      const { bbsLeadId } = await blockedLead('CCR Stale Lead')
      expect((await post(`/api/leads/${bbsLeadId}/master-profile/generate`)).generated).toBe(true)
      await pollUntil(() => get(`/api/leads/${bbsLeadId}/master-profile`), (d) => d.version === 2 && d.status !== 'GENERATING')
      expect((await get(`/api/leads/${bbsLeadId}/cohort`)).isStale).toBe(true)
      expect(await post(`/api/leads/${bbsLeadId}/pathway/evaluate`)).toMatchObject({ generated: false, reason: expect.stringMatching(/Cohort Decision is stale/) })
      expect((await post(`/api/leads/${bbsLeadId}/cohort/evaluate`)).generated).toBe(true)
      expect((await post(`/api/leads/${bbsLeadId}/pathway/evaluate`)).generated).toBe(true)
      expect((await get(`/api/leads/${bbsLeadId}/pathway`)).isStale).toBe(false)
    }, 120000)
  })

  describe('cohort override flows through to Pathway (regression: "I overrode it to C1 but nothing changed")', () => {
    it('an override is not stale, Pathway can run on it, and a later recalculate-all keeps it instead of re-running the rules over it', async () => {
      const lead = await createReadyLead('CCR Override Lead')
      const { bbsLeadId, leadId } = lead
      const post = async (path: string, body?: object) => (await ccr(request(app.getHttpServer()).post(path).send(body ?? {}))).body.data
      const get = async (path: string) => (await ccr(request(app.getHttpServer()).get(path))).body.data

      expect((await post(`/api/leads/${bbsLeadId}/master-profile/generate`)).generated).toBe(true)
      await pollUntil(() => get(`/api/leads/${bbsLeadId}/master-profile`), (d) => d.profileAvailable && d.status !== 'GENERATING')
      expect((await post(`/api/leads/${bbsLeadId}/cohort/evaluate`)).generated).toBe(true)
      const before = await get(`/api/leads/${bbsLeadId}/cohort`)
      expect(before.primaryCohort).not.toBe('C1')
      expect((await post(`/api/leads/${bbsLeadId}/pathway/evaluate`)).generated).toBe(true)
      expect((await get(`/api/leads/${bbsLeadId}/pathway`)).primaryPathway).toBeNull()

      // The supervisor overrides to C1 (maker-checker: a second, different approver).
      const approver = await prisma.user.findFirstOrThrow({ where: { role: 'CCR' } })
      const override = await as(supervisorToken, request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/cohort/override`).send({ newPrimaryCohort: 'C1', reason: 'Specialist reviewed the case and cleared it.', approverId: approver.id }))
      expect(override.status).toBe(201)

      // 1. The override is the current decision and is NOT stale.
      const overridden = await get(`/api/leads/${bbsLeadId}/cohort`)
      expect(overridden.primaryCohort).toBe('C1')
      expect(overridden.isStale).toBe(false)

      // 2. Pathway can now run on it (it used to refuse: "Cohort Decision is stale").
      const evaluate = await post(`/api/leads/${bbsLeadId}/pathway/evaluate`)
      expect(evaluate.generated).toBe(true)
      const pathway = await get(`/api/leads/${bbsLeadId}/pathway`)
      expect(pathway.isStale).toBe(false)
      expect(pathway.l4Reference.primaryState).not.toBe('BLOCKED')
      expect(pathway.blockingReason).not.toBe(before.primaryReasonCode)

      // 3. recalculate-all does not discard the override by re-running the cohort rules over it.
      const versionBefore = overridden.version
      const recalc = await ccr(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/recalculate-all`))
      expect(recalc.status).toBe(200)
      expect(recalc.body.data.stages.cohort.reason).toMatch(/Kept the cohort set by override/)
      const after = await get(`/api/leads/${bbsLeadId}/cohort`)
      expect(after.primaryCohort).toBe('C1')
      expect(after.version).toBe(versionBefore)
      expect(await prisma.cohortOverride.count({ where: { newDecision: { leadId } } })).toBe(1)

      // 4. An explicit re-evaluate is still available and does replace it (the CCR chose that).
      expect((await post(`/api/leads/${bbsLeadId}/cohort/evaluate`)).generated).toBe(true)
      expect((await get(`/api/leads/${bbsLeadId}/cohort`)).primaryCohort).not.toBe('C1')
    }, 150000)
  })

  describe('roles and assignment', () => {
    it('lets a supervisor read and write, and stops a CCR writing to a lead assigned to someone else', async () => {
      const { bbsLeadId, leadId } = await createReadyLead('CCR Assignment Lead')
      const base = `/api/leads/${bbsLeadId}/ccr-interaction`
      const questions: Question[] = (await getState(bbsLeadId)).questions
      const text = questions.find((q) => q.answerType === 'TEXT')!
      const body = { answers: [{ questionKey: text.key, responseStatus: 'ANSWERED', answerText: 'noted' }] }

      const supervisor = await prisma.user.findFirstOrThrow({ where: { role: 'SUPERVISOR' } })
      const assign = await as(supervisorToken, request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/assign`).send({ ccrUserId: supervisor.id }))
      expect(assign.status).toBe(201)

      expect((await ccr(request(app.getHttpServer()).put(`${base}/answers`).send(body))).status).toBe(403)
      expect((await ccr(request(app.getHttpServer()).post(`${base}/submit`))).status).toBe(403)
      expect((await as(supervisorToken, request(app.getHttpServer()).put(`${base}/answers`).send(body))).status).toBe(200)
      expect((await getState(bbsLeadId)).progress.answered).toBe(1) // CCR can still read
      expect(await prisma.ccrAnswer.count({ where: { leadId } })).toBe(1)
    }, 60000)
  })
})
