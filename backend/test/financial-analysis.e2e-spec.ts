import type { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/main'
import type { AppConfig } from '../src/config/configuration'

/**
 * Exercises the REAL Financial Analysis pipeline end-to-end: a genuine CSV
 * bank statement uploaded through the actual /documents endpoint (never a
 * mocked parser/classifier/scorer), through the full UPLOADED -> EXTRACTING
 * -> NORMALIZING -> CLASSIFYING -> ANALYZING -> COMPLETED lifecycle, and
 * read back via GET /leads/:bbsLeadId/financial-analysis. This is the
 * single strongest test in this module — it is the only one that proves
 * every stage's real output actually composes correctly end-to-end,
 * something no per-function unit test (mocking its neighbors) can prove.
 * force-mock-providers.setup.ts (see jest-e2e.json) guarantees the AI
 * insights job uses MockAiProvider here, never a real Gemini call.
 */
describe('Financial Analysis (e2e)', () => {
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

  async function createLead(): Promise<string> {
    const lead = await auth(
      request(app.getHttpServer())
        .post('/api/leads')
        .send({
          fullName: 'Financial Analysis E2E Test Lead',
          phone: `+91 9${Math.floor(100000000 + Math.random() * 900000000)}`,
          email: 'financial.analysis.e2e@example.test',
          city: 'Pune',
          source: 'ONLINE',
        }),
    )
    return lead.body.data.bbsLeadId
  }

  async function pollFinancialAnalysis(bbsLeadId: string, timeoutMs = 15000): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutMs
    let last: Record<string, unknown> = {}
    while (Date.now() < deadline) {
      const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/financial-analysis`))
      last = res.body.data
      if (last.reportAvailable && last.status !== undefined && !['UPLOADED', 'EXTRACTING', 'NORMALIZING', 'CLASSIFYING', 'ANALYZING'].includes(last.status as string)) {
        return last
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    return last
  }

  // 4 months of a realistic synthetic statement — real salary recurrence
  // (3+ months, required before F01 ever asserts "recurring"), a recurring
  // EMI, an ATM withdrawal, a confirmed bounce event, and a one-off large
  // discretionary purchase. Never a real customer's data.
  const CSV_STATEMENT = [
    'Date,Narration,Debit,Credit,Balance',
    '05/01/2026,SALARY CREDIT ABC CORP,,50000.00,55000.00',
    '10/01/2026,EMI AUTO DEBIT HDFC,8000.00,,47000.00',
    '15/01/2026,ATM WDL,2000.00,,45000.00',
    '05/02/2026,SALARY CREDIT ABC CORP,,50000.00,93000.00',
    '10/02/2026,EMI AUTO DEBIT HDFC,8000.00,,85000.00',
    '12/02/2026,ECS RETURN CHARGES INSUFFICIENT FUNDS,500.00,,84500.00',
    '05/03/2026,SALARY CREDIT ABC CORP,,50000.00,134500.00',
    '10/03/2026,EMI AUTO DEBIT HDFC,8000.00,,126500.00',
    '20/03/2026,AMAZON SHOPPING,45000.00,,81500.00',
    '05/04/2026,SALARY CREDIT ABC CORP,,50000.00,131500.00',
    '10/04/2026,EMI AUTO DEBIT HDFC,8000.00,,123500.00',
  ].join('\n')

  it('rejects unauthenticated requests', async () => {
    const bbsLeadId = await createLead()
    const res = await request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/financial-analysis`)
    expect(res.status).toBe(401)
  })

  it('reports reportAvailable:false for a lead with no bank statement uploaded at all', async () => {
    const bbsLeadId = await createLead()
    const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/financial-analysis`))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ reportAvailable: false })
  })

  it('processes a real CSV bank statement end-to-end to a COMPLETED, evidence-grounded result', async () => {
    const bbsLeadId = await createLead()

    const upload = await auth(
      request(app.getHttpServer())
        .post(`/api/leads/${bbsLeadId}/documents`)
        .field('documentType', 'BANK_STATEMENT')
        .attach('file', Buffer.from(CSV_STATEMENT), { filename: 'statement.csv', contentType: 'text/csv' }),
    )
    expect(upload.status).toBe(201)

    const data = await pollFinancialAnalysis(bbsLeadId)

    expect(data.status).toBe('COMPLETED')
    expect(data.months).toBeInstanceOf(Array)
    expect((data.months as unknown[]).length).toBeGreaterThanOrEqual(4)
    expect(data.transactions).toBeInstanceOf(Array)
    expect((data.transactions as unknown[]).length).toBe(11)

    // Real recurring-income/EMI detection actually ran — never fabricated.
    const score = data.score as Record<string, unknown>
    expect(score.incomeStabilityAvailability).toBe('AVAILABLE')
    expect(score.debtServicingCapacityAvailability).toBe('AVAILABLE')
    expect(typeof score.totalScore).toBe('number')

    // Financial Health Score transparency: maxAchievablePoints/componentDetails
    // are real, persisted, non-fabricated fields — never silently absent.
    expect(typeof score.maxAchievablePoints).toBe('number')
    expect(score.componentDetails).toBeTruthy()
    const componentDetails = score.componentDetails as Record<string, { maxPoints: number; available: boolean }>
    expect(componentDetails.incomeStability.available).toBe(true)
    expect(componentDetails.incomeStability.maxPoints).toBe(15)
    // A COMPLETED analysis with every component available means the
    // achievable max genuinely is the full 100 — never silently
    // mismatched against the sum of each component's own real maxPoints.
    if (!score.scorePartial) {
      const sumOfMaxPoints = Object.values(componentDetails)
        .filter((c) => c.available)
        .reduce((sum, c) => sum + c.maxPoints, 0)
      expect(score.maxAchievablePoints).toBe(sumOfMaxPoints)
    }

    // The confirmed bounce event (ECS RETURN) produced a real, non-fabricated risk flag.
    const riskFlags = data.riskFlags as Array<{ key: string }>
    expect(riskFlags.some((f) => f.key === 'CONFIRMED_ECS_BOUNCE')).toBe(true)

    // The large AMAZON SHOPPING transaction was flagged.
    expect(riskFlags.some((f) => f.key === 'LARGE_TRANSACTION')).toBe(true)

    // Advisory AI insights (MockAiProvider, per force-mock-providers.setup.ts) completed too.
    expect(data.insights).toBeTruthy()
  })

  it('rejects a PDF-but-garbage-bytes bank statement with a FAILED status, never silently fabricating a result', async () => {
    const bbsLeadId = await createLead()

    await auth(
      request(app.getHttpServer())
        .post(`/api/leads/${bbsLeadId}/documents`)
        .field('documentType', 'BANK_STATEMENT')
        .attach('file', Buffer.from('this is not a real PDF file at all'), { filename: 'fake.pdf', contentType: 'application/pdf' }),
    )

    const data = await pollFinancialAnalysis(bbsLeadId)
    expect(data.status).toBe('FAILED')
    expect(data.errorMessage).toBeTruthy()
  })

  it('reprocess-financial-analysis re-runs the pipeline against the already-stored bytes without a new upload', async () => {
    const bbsLeadId = await createLead()
    const upload = await auth(
      request(app.getHttpServer())
        .post(`/api/leads/${bbsLeadId}/documents`)
        .field('documentType', 'BANK_STATEMENT')
        .attach('file', Buffer.from(CSV_STATEMENT), { filename: 'statement.csv', contentType: 'text/csv' }),
    )
    const documentId = upload.body.data.id
    await pollFinancialAnalysis(bbsLeadId)

    const reprocess = await auth(
      request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/documents/${documentId}/reprocess-financial-analysis`),
    )
    expect(reprocess.status).toBe(201)
    expect(reprocess.body.data.reprocessed).toBe(true)

    const data = await pollFinancialAnalysis(bbsLeadId)
    expect(data.status).toBe('COMPLETED')
  })
})
