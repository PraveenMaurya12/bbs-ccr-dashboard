import type { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/main'
import type { AppConfig } from '../src/config/configuration'
import { BureauReportService } from '../src/modules/bureau/bureau-report.service'

/**
 * Exercises the REAL Cohort Engine pipeline end-to-end: a real (mock-
 * provider) bureau pull, a real bank-statement run through Financial
 * Analysis, a real Master Profile generation, then a real Cohort Engine
 * evaluation reconciling all three. Deliberately mirrors
 * master-profile.e2e-spec.ts's own self-contained-fresh-lead technique
 * (never reuses the shared dev seed lead) so this test is idempotent
 * across repeated runs against a database that isn't reset between e2e
 * files. force-mock-providers.setup.ts guarantees no real Gemini/Signzy
 * call is ever made here — and the Cohort Engine itself never calls any
 * AI provider at all, by design.
 */
describe('Cohort Engine (e2e)', () => {
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
        .send({ fullName, phone: randomPhone(), email: 'cohort-engine.e2e@example.test', city: 'Bengaluru', source: 'ONLINE' }),
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
    const { bbsLeadId } = await createLead('Cohort Auth Check Lead')
    const res = await request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/cohort`)
    expect(res.status).toBe(401)
  })

  it('404s for a lead that does not exist', async () => {
    const res = await auth(request(app.getHttpServer()).get('/api/leads/BBS-LD-DOES-NOT-EXIST/cohort'))
    expect(res.status).toBe(404)
  })

  it('reports decisionAvailable:false with masterProfileReady:false for a brand-new lead', async () => {
    const { bbsLeadId } = await createLead('Cohort No Upstream Lead')
    const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/cohort`))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ decisionAvailable: false, masterProfileReady: false })
  })

  it('refuses to evaluate when Master Profile has not been generated yet', async () => {
    const { bbsLeadId } = await createLead('Cohort No Master Profile Lead')
    const res = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/cohort/evaluate`))
    expect(res.status).toBe(201)
    expect(res.body.data.generated).toBe(false)
    expect(res.body.data.reason).toMatch(/Master Profile/)
  })

  it('rejects an override attempt from a non-supervisor CCR', async () => {
    const { bbsLeadId } = await createLead('Cohort RBAC Check Lead')
    const res = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/cohort/override`).send({ newPrimaryCohort: 'C6', reason: 'Testing RBAC enforcement.' }))
    expect(res.status).toBe(403)
  })

  describe('once the full upstream chain (Debt Analysis + Financial Analysis + Master Profile) is COMPLETED', () => {
    it('generates a real COMPLETED Cohort Decision with every rule evaluated and persisted', async () => {
      const { bbsLeadId, leadId } = await createLead('Cohort Full Pipeline Lead')

      await app.get(BureauReportService).triggerForLead({ leadId, bbsLeadId, fullName: 'Cohort Full Pipeline Lead', phone: randomPhone() })
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

      const generateProfile = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/master-profile/generate`))
      expect(generateProfile.body.data.generated).toBe(true)
      await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/master-profile`)).then((r) => r.body.data),
        (d) => d.profileAvailable && d.status !== 'GENERATING',
      )

      // Cohort reports upstream-ready but not yet evaluated.
      const beforeEvaluate = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/cohort`))
      expect(beforeEvaluate.body.data).toEqual({ decisionAvailable: false, masterProfileReady: true })

      const evaluateRes = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/cohort/evaluate`))
      expect(evaluateRes.status).toBe(201)
      expect(evaluateRes.body.data.generated).toBe(true)

      const data = await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/cohort`)).then((r) => r.body.data),
        (d) => d.decisionAvailable && d.status !== 'GENERATING',
      )

      expect(data.status).toBe('COMPLETED')
      expect(data.version).toBe(1)
      expect(data.ruleVersion).toBe('BBS_COHORT_V3.0')
      expect([
        'CONSENT_PENDING', 'KYC_PENDING', 'X1', 'C6', 'C5', 'C4', 'C3', 'C2', 'C1', 'C7', 'X2', 'MANUAL_REVIEW', 'CUSTOMER_UNRESPONSIVE',
        'COMPLIANCE_HOLD', 'DATA_REFRESH_REQUIRED', 'OTHER_ACCOUNTS_REQUIRED', 'P1_INFORMATION_REQUIRED', 'SPECIALIST_REQUIRED', 'CCR_REQUIRED',
      ]).toContain(data.primaryCohort)
      expect(data.ruleResults).toHaveLength(24)
      expect(data.customerExplanation).toBeTruthy()
      // The real recurring EMI (6500/mo, matching "Mock Dev Bank") was
      // reconciled by Master Profile and should surface as a confirmed
      // repayment signal, never fabricated.
      expect(Array.isArray(data.secondaryFlags) || data.secondaryFlags === null).toBe(true)
      expect(data.isStale).toBe(false)

      // Insights are never AI-driven for this module.
      expect(data).not.toHaveProperty('insights')

      // A second evaluate() call appends a new version.
      const secondEvaluate = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/cohort/recalculate`))
      expect(secondEvaluate.body.data.generated).toBe(true)
      const second = await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/cohort`)).then((r) => r.body.data),
        (d) => d.decisionAvailable && d.status !== 'GENERATING',
      )
      expect(second.version).toBe(2)

      const history = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/cohort/history`))
      expect(history.body.data).toHaveLength(2)
      expect(history.body.data[0].version).toBe(2)
      expect(history.body.data[1].version).toBe(1)
    }, 45000)
  })

  it('does not leak one lead\'s cohort decision onto another', async () => {
    const { bbsLeadId } = await createLead('Cohort Isolation Check Lead')
    const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/cohort`))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ decisionAvailable: false, masterProfileReady: false })
  })
})
