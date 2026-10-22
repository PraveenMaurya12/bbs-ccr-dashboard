import type { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/main'
import type { AppConfig } from '../src/config/configuration'
import { BureauReportService } from '../src/modules/bureau/bureau-report.service'

/**
 * Exercises the REAL Master Profile pipeline end-to-end: a real (mock-
 * provider) bureau pull for a brand-new lead (producing a real, persisted
 * CreditReport + CreditAccount), a real CSV bank statement processed
 * through the actual Financial Analysis pipeline, then real Master Profile
 * generation reconciling the two. Deliberately never reuses the shared dev
 * seed lead (BBS-LD-900001, read-only elsewhere in this suite) — every
 * scenario here creates its own fresh lead so the test is idempotent across
 * repeated runs against a database that isn't reset between e2e files.
 * force-mock-providers.setup.ts guarantees the AI insights job uses
 * MockAiProvider here, never a real Gemini call.
 */
describe('Master Profile (e2e)', () => {
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
        .send({ fullName, phone: randomPhone(), email: 'master-profile.e2e@example.test', city: 'Bengaluru', source: 'ONLINE' }),
    )
    return { bbsLeadId: res.body.data.bbsLeadId as string, leadId: res.body.data.id as string }
  }

  async function pollDebtAnalysisCompleted(bbsLeadId: string, timeoutMs = 10000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/debt-analysis`))
      const data = res.body.data
      if (data.reportAvailable && data.status === 'COMPLETED') return
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    throw new Error('Debt Analysis never reached COMPLETED within the timeout')
  }

  async function pollFinancialAnalysisCompleted(bbsLeadId: string, timeoutMs = 15000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/financial-analysis`))
      const data = res.body.data
      if (data.reportAvailable && data.status === 'COMPLETED') return
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    throw new Error('Financial Analysis never reached COMPLETED within the timeout')
  }

  async function pollMasterProfile(bbsLeadId: string, timeoutMs = 15000): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutMs
    let last: Record<string, unknown> = {}
    while (Date.now() < deadline) {
      const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/master-profile`))
      last = res.body.data
      if (last.profileAvailable && last.status !== 'GENERATING') return last
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    return last
  }

  // The mock CreditReportProvider always produces exactly one real tradeline
  // — Personal Loan, lender "Mock Dev Bank", monthlyEmiAmount 6500, ACTIVE
  // (see mock-credit-report.provider.ts). This statement's recurring EMI
  // narration/amount is chosen to token-match that lender and amount
  // exactly, so correlation produces a real, non-fabricated MATCHED row.
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
    const { bbsLeadId } = await createLead('Auth Check Lead')
    const res = await request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/master-profile`)
    expect(res.status).toBe(401)
  })

  it('404s for a lead that does not exist', async () => {
    const res = await auth(request(app.getHttpServer()).get('/api/leads/BBS-LD-DOES-NOT-EXIST/master-profile'))
    expect(res.status).toBe(404)
  })

  it('reports profileAvailable:false with upstream readiness for a brand-new lead with neither upstream module complete', async () => {
    const { bbsLeadId } = await createLead('No Upstream Lead')
    const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/master-profile`))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ profileAvailable: false, debtAnalysisReady: false, financialAnalysisReady: false })
  })

  it('refuses to generate when only Debt Analysis has completed (Financial Analysis still missing)', async () => {
    const { bbsLeadId, leadId } = await createLead('Debt Only Lead')
    await app.get(BureauReportService).triggerForLead({ leadId, bbsLeadId, fullName: 'Debt Only Lead', phone: randomPhone() })
    await pollDebtAnalysisCompleted(bbsLeadId)

    const res = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/master-profile/generate`))
    expect(res.status).toBe(201)
    expect(res.body.data.generated).toBe(false)
    expect(res.body.data.reason).toMatch(/Financial Analysis/)
  })

  it('generates a real COMPLETED Master Profile reconciling a real Debt Analysis against a real Financial Analysis run', async () => {
    const { bbsLeadId, leadId } = await createLead('Full Pipeline Lead')
    await app.get(BureauReportService).triggerForLead({ leadId, bbsLeadId, fullName: 'Full Pipeline Lead', phone: randomPhone() })
    await pollDebtAnalysisCompleted(bbsLeadId)

    await auth(
      request(app.getHttpServer())
        .post(`/api/leads/${bbsLeadId}/documents`)
        .field('documentType', 'BANK_STATEMENT')
        .attach('file', Buffer.from(CSV_STATEMENT), { filename: 'statement.csv', contentType: 'text/csv' }),
    )
    await pollFinancialAnalysisCompleted(bbsLeadId)

    const generateRes = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/master-profile/generate`))
    expect(generateRes.status).toBe(201)
    expect(generateRes.body.data.generated).toBe(true)

    const data = await pollMasterProfile(bbsLeadId)

    expect(data.status).toBe('COMPLETED')
    expect(data.version).toBe(1)
    // BBS Master Profile Module v3.0 §12.1's 5-state model — null is a
    // legitimate 6th possibility (insufficient evidence to classify; v3.0
    // removed the old named DATA_CONFLICT_VALIDATION_REQUIRED state for
    // this exact case, see classifyAlignment's own doc comment).
    expect(['ALIGNED_HEALTHY', 'CREDIT_STRONG_FINANCIAL_STRESSED', 'CREDIT_STRESSED_FINANCIAL_STRONG', 'BOTH_STRESSED', 'COMPLIANCE_HOLD', null]).toContain(data.alignmentState)
    expect(data.isStale).toBe(false)
    expect(data.insights).toBeTruthy()
    expect(Array.isArray(data.strengths)).toBe(true)
    expect(data.cohortAttributes).toBeTruthy()

    // The one real, bureau-reported tradeline ("Mock Dev Bank", EMI 6500)
    // genuinely matched a real recurring bank repayment — never fabricated.
    const rows = data.reconciliationRows as Array<{ lender: string; reportedEmi: string | number | null; matchStatus: string }>
    const match = rows.find((r) => r.lender === 'Mock Dev Bank')
    expect(match).toBeDefined()
    expect(Number(match!.reportedEmi)).toBe(6500)
    expect(match!.matchStatus).toBe('MATCHED')

    // A second, explicit regenerate appends a new version rather than overwriting the first.
    const regenerateRes = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/master-profile/generate`))
    expect(regenerateRes.body.data.generated).toBe(true)
    const regenerated = await pollMasterProfile(bbsLeadId)
    expect(regenerated.version).toBe(2)
  }, 30000)

  it('does not leak one lead\'s master profile onto another', async () => {
    const { bbsLeadId } = await createLead('Isolation Check Lead')
    const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/master-profile`))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ profileAvailable: false, debtAnalysisReady: false, financialAnalysisReady: false })
  })
})
