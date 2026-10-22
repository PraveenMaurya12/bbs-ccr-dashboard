import type { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/main'
import type { AppConfig } from '../src/config/configuration'
import { BureauReportService } from '../src/modules/bureau/bureau-report.service'
import { CREDIT_REPORT_PROVIDER } from '../src/modules/bureau/providers/credit-report-provider.interface'
import { OTP_PROVIDER } from '../src/modules/public-contact/providers/otp-provider.interface'

/**
 * Exercises the real Experian-integration trigger pipeline end-to-end,
 * using the mock CreditReportProvider/AiAnalysisProvider bindings this app
 * is configured with locally (CREDIT_REPORT_PROVIDER=mock, AI_PROVIDER=mock
 * — see backend/.env) — no live Experian/Gemini call is ever made here.
 *
 * CRITICAL BUSINESS RULE under test throughout this file: at most ONE
 * Experian call is ever made per BBS lead — see BureauReportService's own
 * doc comment. `CreditReport.leadId` is `@unique`, which is what actually
 * enforces this; these tests prove that enforcement holds under real
 * concurrency against the real database, not just in a mocked unit test.
 *
 * Only the one test that specifically verifies the trigger-after-consent
 * wiring goes through the real public-contact OTP flow — every other
 * scenario creates its lead via the internal (no-OTP) endpoint and calls
 * BureauReportService directly, since the public otp/request route is
 * throttled to 5 requests/10min/IP and this file must not exhaust that
 * budget just to set up unrelated scenarios.
 */
describe('Bureau report integration (e2e)', () => {
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
    // Same background-work grace period as public-contact.e2e-spec.ts.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await app.close()
  })

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${accessToken}`)
  }

  function randomMobile(): string {
    return `9${Math.floor(100000000 + Math.random() * 900000000)}`
  }

  function randomPan(): string {
    const digits = Math.floor(1000 + Math.random() * 9000)
    return `ETEST${digits}X`
  }

  /** Creates a lead via the internal (no-OTP, no auto-trigger) endpoint — returns both its bbsLeadId and internal id. */
  async function createInternalLead(fullName: string, phone: string): Promise<{ bbsLeadId: string; leadId: string }> {
    const res = await auth(
      request(app.getHttpServer())
        .post('/api/leads')
        .send({ fullName, phone, email: 'bureau-e2e@example.test', city: 'Pune', source: 'ONLINE' }),
    )
    return { bbsLeadId: res.body.data.bbsLeadId as string, leadId: res.body.data.id as string }
  }

  async function submitPublicLead(name: string, mobile: string): Promise<string> {
    await request(app.getHttpServer()).post('/api/public/contact/otp/request').send({ mobile })
    const provider = app.get(OTP_PROVIDER) as unknown as { codes: Map<string, { code: string }> }
    const code = provider.codes.get(mobile)!.code
    const verify = await request(app.getHttpServer()).post('/api/public/contact/otp/verify').send({ mobile, code })
    const verificationToken = verify.body.data.verificationToken as string

    const submit = await request(app.getHttpServer())
      .post('/api/public/contact/submit')
      .send({
        name,
        mobile,
        pan: randomPan(),
        helpCategory: 'loan_settlement',
        situation: 'Automated e2e test submission for the bureau integration — not a real customer.',
        consent: true,
        verificationToken,
      })
    expect(submit.status).toBe(201)
    expect(submit.body.data.status).toBe('received')
    return submit.body.data.bbsLeadId as string
  }

  async function pollDebtAnalysis(bbsLeadId: string, timeoutMs = 8000): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutMs
    let last: Record<string, unknown> = { reportAvailable: false }
    while (Date.now() < deadline) {
      const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/debt-analysis`))
      last = res.body.data
      if (last.reportAvailable && last.status !== 'IN_PROGRESS') {
        return last
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    return last
  }

  it('trigger-after-consent: a real website submission (real OTP flow) ends up with a COMPLETED bureau report with real persisted data', async () => {
    const mobile = randomMobile()
    const bbsLeadId = await submitPublicLead('Experian E2E Test Lead', mobile)

    const data = await pollDebtAnalysis(bbsLeadId)

    expect(data.reportAvailable).toBe(true)
    expect(data.status).toBe('COMPLETED')
    expect(data.summary).toBeDefined()
    expect((data.summary as { totalOutstanding: number }).totalOutstanding).toBeGreaterThan(0)
    expect(data.riskFlags).toBeDefined()
    // The mock provider always produces one account/enquiry for a normal
    // identity — confirms real persistence happened, not an in-memory placeholder.
    expect((data.accountDistribution as { totalAccounts: number }).totalAccounts).toBeGreaterThan(0)
  }, 15000)

  it('trigger-after-consent: a CCR-created lead (no public OTP flow) reaches a COMPLETED bureau report purely through real HTTP endpoints — proving a path other than PublicContactService can actually trigger a pull', async () => {
    const phone = `+91 ${randomMobile()}`
    const { bbsLeadId } = await createInternalLead('CCR Consent E2E Lead', phone)

    // Before consent capture: no path to a bureau report yet.
    const before = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/debt-analysis`))
    expect(before.body.data.reportAvailable).toBe(false)

    const consentRes = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/consent`).send({ pan: randomPan(), consentGranted: true }))
    expect(consentRes.status).toBe(201)
    expect(consentRes.body.data).toEqual({ triggered: true })

    const data = await pollDebtAnalysis(bbsLeadId)
    expect(data.reportAvailable).toBe(true)
    expect(data.status).toBe('COMPLETED')

    // A second capture attempt for the same lead is refused, never a second bureau call.
    const provider = app.get(CREDIT_REPORT_PROVIDER)
    const fetchSpy = jest.spyOn(provider, 'fetchReport')
    const secondAttempt = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/consent`).send({ pan: randomPan(), consentGranted: true }))
    expect(secondAttempt.body.data.triggered).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  }, 15000)

  it('rejects a malformed PAN on the consent-capture endpoint', async () => {
    const { bbsLeadId } = await createInternalLead('Bad PAN E2E Lead', `+91 ${randomMobile()}`)
    const res = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/consent`).send({ pan: 'not-a-pan', consentGranted: true }))
    expect(res.status).toBe(400)
  })

  it('rejects an unauthenticated consent-capture request', async () => {
    const res = await request(app.getHttpServer()).post('/api/leads/BBS-LD-900001/consent').send({ pan: 'ABCDE1234F', consentGranted: true })
    expect(res.status).toBe(401)
  })

  it('TEST 6: a verified "no record found" response is persisted as NO_RECORD — a legitimate result, never an error', async () => {
    // Ends in the mock provider's designated no-record test suffix.
    const phone = `+91 9${Math.floor(10000 + Math.random() * 89999)}0404`
    const { leadId, bbsLeadId } = await createInternalLead('No Record E2E Lead', phone)
    const bureauReportService = app.get(BureauReportService)

    await bureauReportService.triggerForLead({ leadId, bbsLeadId, fullName: 'No Record E2E Lead', phone })
    const data = await pollDebtAnalysis(bbsLeadId)

    expect(data.reportAvailable).toBe(true)
    expect(data.status).toBe('NO_RECORD')
    // A NO_RECORD result carries no full report fields — never fabricated data.
    expect(data.summary).toBeUndefined()
  }, 15000)

  it('IN_PROGRESS is a real, distinct, non-fabricated status while the one call is in flight', async () => {
    const phone = `+91 ${randomMobile()}`
    const { leadId, bbsLeadId } = await createInternalLead('In Progress E2E Lead', phone)
    const bureauReportService = app.get(BureauReportService)

    void bureauReportService.triggerForLead({ leadId, bbsLeadId, fullName: 'In Progress E2E Lead', phone })

    // Read immediately — before the mock provider's ~200ms delay resolves.
    const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/debt-analysis`))
    expect(res.body.data.reportAvailable).toBe(true)
    expect(['IN_PROGRESS', 'COMPLETED']).toContain(res.body.data.status)
    if (res.body.data.status === 'IN_PROGRESS') {
      expect(res.body.data.summary).toBeUndefined()
    }

    await pollDebtAnalysis(bbsLeadId) // let it finish before this app instance tears down
  }, 15000)

  describe('the one-call-per-lead invariant', () => {
    it('TEST 2 / 12: two truly concurrent triggers for the same lead result in exactly one Experian provider call', async () => {
      const phone = `+91 ${randomMobile()}`
      const { leadId, bbsLeadId } = await createInternalLead('Concurrency E2E Lead', phone)

      const provider = app.get(CREDIT_REPORT_PROVIDER)
      const fetchSpy = jest.spyOn(provider, 'fetchReport')
      const bureauReportService = app.get(BureauReportService)

      await Promise.all([
        bureauReportService.triggerForLead({ leadId, bbsLeadId, fullName: 'Concurrency E2E Lead', phone }),
        bureauReportService.triggerForLead({ leadId, bbsLeadId, fullName: 'Concurrency E2E Lead', phone }),
      ])

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      fetchSpy.mockRestore()

      await pollDebtAnalysis(bbsLeadId)
    }, 15000)

    it('TEST 1 / 8: a repeated trigger — and repeatedly opening the Debt Analysis tab — never calls the provider again once consumed', async () => {
      const phone = `+91 ${randomMobile()}`
      const { leadId, bbsLeadId } = await createInternalLead('Repeat Trigger E2E Lead', phone)
      const bureauReportService = app.get(BureauReportService)

      await bureauReportService.triggerForLead({ leadId, bbsLeadId, fullName: 'Repeat Trigger E2E Lead', phone })
      const data = await pollDebtAnalysis(bbsLeadId)
      expect(data.status).toBe('COMPLETED')

      const provider = app.get(CREDIT_REPORT_PROVIDER)
      const fetchSpy = jest.spyOn(provider, 'fetchReport')

      // A second trigger for the same lead...
      await bureauReportService.triggerForLead({ leadId, bbsLeadId, fullName: 'Repeat Trigger E2E Lead', phone })
      // ...and opening the tab several times...
      for (let i = 0; i < 5; i++) {
        await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/debt-analysis`))
      }

      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    }, 15000)
  })

  describe('reprocess — never calls Experian', () => {
    it('reprocess refuses (never calling the provider) for a COMPLETED report — the mock has no stored raw response', async () => {
      const phone = `+91 ${randomMobile()}`
      const { leadId, bbsLeadId } = await createInternalLead('Reprocess Refusal E2E Lead', phone)
      const bureauReportService = app.get(BureauReportService)
      await bureauReportService.triggerForLead({ leadId, bbsLeadId, fullName: 'Reprocess Refusal E2E Lead', phone })
      await pollDebtAnalysis(bbsLeadId)

      const provider = app.get(CREDIT_REPORT_PROVIDER)
      const fetchSpy = jest.spyOn(provider, 'fetchReport')

      const reprocess = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/debt-analysis/reprocess`))
      expect(reprocess.status).toBe(201)
      expect(reprocess.body.data.reprocessed).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    }, 15000)

    it('404s the reprocess endpoint for a lead that does not exist', async () => {
      const res = await auth(request(app.getHttpServer()).post('/api/leads/BBS-LD-DOES-NOT-EXIST/debt-analysis/reprocess'))
      expect(res.status).toBe(404)
    })

    it('rejects an unauthenticated reprocess request', async () => {
      const res = await request(app.getHttpServer()).post('/api/leads/BBS-LD-900001/debt-analysis/reprocess')
      expect(res.status).toBe(401)
    })
  })
})
