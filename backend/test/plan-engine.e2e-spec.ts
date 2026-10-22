import type { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/main'
import type { AppConfig } from '../src/config/configuration'
import { BureauReportService } from '../src/modules/bureau/bureau-report.service'

/**
 * Exercises the REAL Plan Engine pipeline end-to-end: a real (mock-
 * provider) bureau pull, a real bank-statement run through Financial
 * Analysis, a real Master Profile generation, a real Cohort Engine
 * evaluation, then a real Plan Engine generation consuming ONLY that
 * Cohort Decision + Master Profile. Mirrors cohort-engine.e2e-spec.ts's
 * own self-contained-fresh-lead technique (never reuses the shared dev
 * seed lead) so this test is idempotent across repeated runs.
 * force-mock-providers.setup.ts guarantees no real Gemini/Signzy call is
 * ever made here.
 */
describe('Plan Engine (e2e)', () => {
  let app: NestExpressApplication
  let accessToken: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication<NestExpressApplication>()
    configureApp(app, app.get(ConfigService).get<AppConfig>('app')!)
    await app.init()

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ccr.dev@bbs.example.test', password: 'DevOnly-Passw0rd-2026' })
    accessToken = login.body.data.accessToken
  })

  afterAll(async () => {
    await app.close()
  })

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${accessToken}`)
  }

  function randomPhone(): string {
    return `+91 9${Math.floor(100000000 + Math.random() * 900000000)}`
  }

  async function createLead(fullName: string): Promise<{ bbsLeadId: string; leadId: string }> {
    const res = await auth(
      request(app.getHttpServer())
        .post('/api/leads')
        .send({ fullName, phone: randomPhone(), email: 'plan-engine.e2e@example.test', city: 'Bengaluru', source: 'ONLINE' }),
    )
    return { bbsLeadId: res.body.data.bbsLeadId as string, leadId: res.body.data.id as string }
  }

  async function pollUntil<T>(fn: () => Promise<T>, isReady: (v: T) => boolean, timeoutMs = 15000): Promise<T> {
    const deadline = Date.now() + timeoutMs
    let last: T
    do {
      last = await fn()
      if (isReady(last)) return last
      await new Promise((resolve) => setTimeout(resolve, 150))
    } while (Date.now() < deadline)
    return last
  }

  const CSV_STATEMENT = [
    'Date,Narration,Debit,Credit,Balance',
    '05/01/2026,SALARY CREDIT ABC CORP,,55000.00,60000.00',
    '10/01/2026,EMI AUTO DEBIT MOCK DEV BANK,6500.00,,53500.00',
    '05/02/2026,SALARY CREDIT ABC CORP,,55000.00,108500.00',
    '10/02/2026,EMI AUTO DEBIT MOCK DEV BANK,6500.00,,102000.00',
    '05/03/2026,SALARY CREDIT ABC CORP,,55000.00,157000.00',
    '10/03/2026,EMI AUTO DEBIT MOCK DEV BANK,6500.00,,150500.00',
  ].join('\n')

  it('rejects unauthenticated requests', async () => {
    const { bbsLeadId } = await createLead('Plan Auth Check Lead')
    const res = await request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/plan`)
    expect(res.status).toBe(401)
  })

  it('404s for a lead that does not exist', async () => {
    const res = await auth(request(app.getHttpServer()).get('/api/leads/BBS-LD-DOES-NOT-EXIST/plan'))
    expect(res.status).toBe(404)
  })

  it('reports planAvailable:false with cohortDecisionReady:false for a brand-new lead', async () => {
    const { bbsLeadId } = await createLead('Plan No Upstream Lead')
    const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/plan`))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ planAvailable: false, cohortDecisionReady: false })
  })

  it('refuses to generate when no Cohort Decision exists yet', async () => {
    const { bbsLeadId } = await createLead('Plan No Cohort Decision Lead')
    const res = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/plan/generate`))
    expect(res.status).toBe(201)
    expect(res.body.data.generated).toBe(false)
    expect(res.body.data.reason).toMatch(/Cohort Decision/)
  })

  it('rejects an override attempt from a non-supervisor CCR', async () => {
    const { bbsLeadId } = await createLead('Plan RBAC Check Lead')
    const res = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/plan/override`).send({ newLifecycleStatus: 'CANCELLED', reason: 'Testing RBAC enforcement.' }))
    expect(res.status).toBe(403)
  })

  describe('once the full upstream chain (Debt Analysis + Financial Analysis + Master Profile + Cohort Decision) is COMPLETED', () => {
    it('generates a real COMPLETED BBS Plan, supports the full lifecycle, and never overwrites a prior version', async () => {
      const { bbsLeadId, leadId } = await createLead('Plan Full Pipeline Lead')

      await app.get(BureauReportService).triggerForLead({ leadId, bbsLeadId, fullName: 'Plan Full Pipeline Lead', phone: randomPhone() })
      await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/debt-analysis`)).then((r) => r.body.data),
        (d) => d.reportAvailable && d.status === 'COMPLETED',
      )

      await auth(
        request(app.getHttpServer())
          .post(`/api/leads/${bbsLeadId}/documents`)
          .field('documentType', 'BANK_STATEMENT')
          .attach('file', Buffer.from(CSV_STATEMENT), { filename: 'statement.csv', contentType: 'text/csv' }),
      )
      await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/financial-analysis`)).then((r) => r.body.data),
        (d) => d.reportAvailable && d.status === 'COMPLETED',
      )

      await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/master-profile/generate`))
      await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/master-profile`)).then((r) => r.body.data),
        (d) => d.profileAvailable && d.status !== 'GENERATING',
      )

      await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/cohort/evaluate`))
      const cohortDecision = await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/cohort`)).then((r) => r.body.data),
        (d) => d.decisionAvailable && d.status !== 'GENERATING',
      )
      expect(cohortDecision.status).toBe('COMPLETED')

      // BBS Pathway Engine (L5) — a new precondition for Plan Engine as of
      // this pass: Plan Engine now consumes the Pathway Decision's own
      // primaryPathway, never Cohort Decision's own simpler static map.
      await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/pathway/evaluate`))
      const pathwayDecision = await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/pathway`)).then((r) => r.body.data),
        (d) => d.decisionAvailable && d.status !== 'GENERATING',
      )
      expect(pathwayDecision.status).toBe('COMPLETED')

      // Plan reports upstream-ready but not yet generated.
      const beforeGenerate = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/plan`))
      expect(beforeGenerate.body.data).toEqual({ planAvailable: false, cohortDecisionReady: true })

      const generateRes = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/plan/generate`))
      expect(generateRes.status).toBe(201)
      expect(generateRes.body.data.generated).toBe(true)

      const plan = await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/plan`)).then((r) => r.body.data),
        (d) => d.planAvailable && d.status !== 'GENERATING',
      )

      expect(plan.status).toBe('COMPLETED')
      expect(plan.version).toBe(1)
      expect(plan.templateVersion).toBe('BBS_PLAN_V3.0')
      // This e2e lead never goes through a consent-granting step (same as
      // cohort-engine.e2e-spec.ts's own full-chain test), so the Cohort
      // Decision legitimately lands on CONSENT_PENDING here — the Template
      // Registry still resolves it to a real (thinner) plan rather than
      // refusing, which is exactly the behaviour under test.
      expect([
        'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'X1', 'X2',
        'CONSENT_PENDING', 'KYC_PENDING', 'MANUAL_REVIEW', 'CUSTOMER_UNRESPONSIVE', null,
      ]).toContain(plan.cohort)
      expect(plan.templateId).toBeTruthy()
      expect(Array.isArray(plan.actions)).toBe(true)
      expect(plan.actions.length).toBeGreaterThan(0)
      expect(Array.isArray(plan.conditions)).toBe(true)
      expect(plan.customerExplanation).toBeTruthy()
      expect(plan.isStale).toBe(false)
      expect(['DRAFT', 'CCR_REVIEW', 'SPECIALIST_REVIEW']).toContain(plan.lifecycleStatus)

      // Full lifecycle progression — every transition is an explicit CCR
      // action. This e2e lead lands on a thinner template (see above),
      // which already starts at CCR_REVIEW, so submit-review is a no-op
      // here (asserted explicitly) rather than DRAFT -> CCR_REVIEW; the
      // DRAFT -> CCR_REVIEW/SPECIALIST_REVIEW branch itself is covered by
      // plan-engine.service.spec.ts's own unit tests.
      if (plan.lifecycleStatus === 'DRAFT') {
        const submitReview = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/plan/submit-review`))
        expect(submitReview.body.data).toEqual({ updated: true, lifecycleStatus: 'CCR_REVIEW' })
      } else {
        const submitReview = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/plan/submit-review`))
        expect(submitReview.body.data.updated).toBe(false)
      }

      const accept = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/plan/accept`))
      expect(accept.body.data).toEqual({ updated: true, lifecycleStatus: 'EXECUTION_READY' })

      const activate = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/plan/activate`))
      expect(activate.body.data).toEqual({ updated: true, lifecycleStatus: 'ACTIVE' })

      // A second generate()/reassess() call appends a new version rather than mutating history.
      const reassessRes = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/plan/reassess`))
      expect(reassessRes.body.data.generated).toBe(true)
      const second = await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/plan`)).then((r) => r.body.data),
        (d) => d.planAvailable && d.status !== 'GENERATING' && d.version === 2,
      )
      expect(second.version).toBe(2)
      // The reassessed version starts a fresh lifecycle from the template's own initial status, never inheriting ACTIVE.
      expect(['DRAFT', 'CCR_REVIEW', 'SPECIALIST_REVIEW']).toContain(second.lifecycleStatus)

      const history = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/plan/history`))
      expect(history.body.data).toHaveLength(2)
      expect(history.body.data[0].version).toBe(2)
      expect(history.body.data[1].version).toBe(1)
    }, 60000)
  })

  it('does not leak one lead\'s plan onto another', async () => {
    const { bbsLeadId } = await createLead('Plan Isolation Check Lead')
    const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/plan`))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ planAvailable: false, cohortDecisionReady: false })
  })
})
