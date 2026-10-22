import type { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/main'
import type { AppConfig } from '../src/config/configuration'
import { OTP_PROVIDER } from '../src/modules/public-contact/providers/otp-provider.interface'

/**
 * Exercises the real public-contact flow end-to-end against the app's
 * configured (local dev) database, the same way test/health.e2e-spec.ts
 * does. Each test uses its own randomly generated mobile number so the
 * "already submitted" duplicate check from earlier test runs never
 * interferes with a later run.
 */
describe('Public Contact (e2e)', () => {
  let app: NestExpressApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication<NestExpressApplication>()
    configureApp(app, app.get(ConfigService).get<AppConfig>('app')!)
    await app.init()
  })

  afterAll(async () => {
    // A successful submitLead kicks off a fire-and-forget bureau-fetch +
    // Gemini-insights background pipeline (mock providers here — see
    // BureauReportService.triggerForLead) that must never block the
    // request, but also must not still be running when this test file's
    // own Prisma connection is torn down below — a real production
    // process never closes its DB connection while a request it already
    // answered is still doing background work, but this short-lived test
    // process does, so it gets a brief grace period first.
    await new Promise((resolve) => setTimeout(resolve, 3000))
    await app.close()
  })

  function randomMobile(): string {
    // Always starts with 9 to satisfy the ^[6-9]\d{9}$ format; last 9 digits
    // are randomized so concurrent/repeated test runs never collide.
    return `9${Math.floor(100000000 + Math.random() * 900000000)}`
  }

  async function requestAndReadOtp(mobile: string): Promise<void> {
    const res = await request(app.getHttpServer())
      .post('/api/public/contact/otp/request')
      .send({ mobile })
    expect(res.status).toBe(200)
  }

  // The mock provider never returns the code in the API response (by
  // design — see providers/mock-otp.provider.ts) so tests reach into the
  // provider instance directly, exactly as a real integration would reach
  // into a test double for an SMS gateway.
  function readMockedCode(mobile: string): string {
    const provider = app.get(OTP_PROVIDER) as unknown as { codes: Map<string, { code: string }> }
    const stored = provider.codes.get(mobile)
    if (!stored) throw new Error(`No mock OTP code stored for ${mobile}`)
    return stored.code
  }

  async function verifiedTicket(mobile: string): Promise<string> {
    await requestAndReadOtp(mobile)
    const code = readMockedCode(mobile)
    const res = await request(app.getHttpServer())
      .post('/api/public/contact/otp/verify')
      .send({ mobile, code })
    expect(res.status).toBe(200)
    expect(res.body.data.verified).toBe(true)
    return res.body.data.verificationToken as string
  }

  function randomPan(): string {
    // Matches ^[A-Za-z]{5}[0-9]{4}[A-Za-z]$ with a randomized middle digit
    // block, so distinct test cases never collide with each other or with
    // leads created by earlier manual/e2e runs via the panRef duplicate check.
    const digits = Math.floor(1000 + Math.random() * 9000)
    return `ETEST${digits}X`
  }

  function submitBody(overrides: Record<string, unknown> = {}) {
    return {
      name: 'E2E Test Lead',
      mobile: randomMobile(),
      pan: randomPan(),
      helpCategory: 'loan_settlement',
      situation: 'Automated e2e test submission — not a real customer.',
      consent: true,
      ...overrides,
    }
  }

  it('creates a persisted Website-source lead after genuine OTP verification and consent', async () => {
    const mobile = randomMobile()
    const pan = randomPan()
    const verificationToken = await verifiedTicket(mobile)

    const res = await request(app.getHttpServer())
      .post('/api/public/contact/submit')
      .send(submitBody({ mobile, pan, verificationToken }))

    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('received')
    expect(res.body.data.bbsLeadId).toMatch(/^BBS-LD-\d{6}$/)

    // Never echoes the raw PAN or the OTP back in the response.
    expect(JSON.stringify(res.body)).not.toContain(pan)
  })

  it('reports already_received and does not create a second lead on a duplicate phone/PAN', async () => {
    const mobile = randomMobile()
    const pan = randomPan()

    const token1 = await verifiedTicket(mobile)
    const first = await request(app.getHttpServer())
      .post('/api/public/contact/submit')
      .send(submitBody({ mobile, pan, verificationToken: token1 }))
    expect(first.body.data.status).toBe('received')
    const bbsLeadId = first.body.data.bbsLeadId

    const token2 = await verifiedTicket(mobile)
    const second = await request(app.getHttpServer())
      .post('/api/public/contact/submit')
      .send(submitBody({ mobile, pan, verificationToken: token2 }))

    expect(second.status).toBe(201)
    expect(second.body.data).toEqual({ status: 'already_received', bbsLeadId })
  })

  it('rejects a submission without genuine consent', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/public/contact/submit')
      .send(submitBody({ consent: false, verificationToken: 'irrelevant' }))

    expect(res.status).toBe(400)
  })

  // Invalid PAN format (and other per-field DTO rules) are covered by
  // submit-lead.dto's own validator decorators, exercised directly in
  // public-contact.service.spec.ts — this file's job is proving the real
  // HTTP pipeline wiring (ValidationPipe is genuinely applied end-to-end),
  // which the consent-false case above already establishes, without
  // spending more of this app instance's shared /submit rate-limit budget.

  it('reports verified:false for a wrong OTP code without issuing a ticket', async () => {
    const mobile = randomMobile()
    await requestAndReadOtp(mobile)

    const res = await request(app.getHttpServer())
      .post('/api/public/contact/otp/verify')
      .send({ mobile, code: '000000' })

    expect(res.status).toBe(200)
    expect(res.body.data.verified).toBe(false)
    expect(res.body.data.verificationToken).toBeUndefined()
  })

  it('rejects a submission whose verification token was never genuinely issued', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/public/contact/submit')
      .send(submitBody({ verificationToken: 'forged-token' }))

    expect(res.status).toBe(401)
  })

  it('still requires a valid CCR JWT on the internal leads endpoints (no regression)', async () => {
    const list = await request(app.getHttpServer()).get('/api/leads')
    expect(list.status).toBe(401)

    const create = await request(app.getHttpServer())
      .post('/api/leads')
      .send({ fullName: 'Should Be Rejected', phone: '9000000000', source: 'ONLINE' })
    expect(create.status).toBe(401)
  })
})
