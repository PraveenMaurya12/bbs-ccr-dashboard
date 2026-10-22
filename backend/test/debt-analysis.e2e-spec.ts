import type { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/main'
import type { AppConfig } from '../src/config/configuration'

/**
 * Exercises the real Debt Analysis endpoint end-to-end. `BBS-LD-900001` is
 * the dev seed's canonical lead — its CreditReport is the real captured
 * Signzy fixture (33 CreditAccount rows + 3 CreditEnquiry rows) run through
 * the real mapper (see prisma/seed.ts) — used here to exercise the fully
 * populated response path without fabricating anything in the test itself.
 * Every number asserted below was computed by actually running
 * buildDebtAnalysisSummary against the real mapped fixture, never guessed.
 */
describe('Debt Analysis (e2e)', () => {
  let app: NestExpressApplication
  let accessToken: string
  const seededBbsLeadId = 'BBS-LD-900001'

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

  it('rejects unauthenticated requests', async () => {
    const res = await request(app.getHttpServer()).get(`/api/leads/${seededBbsLeadId}/debt-analysis`)
    expect(res.status).toBe(401)
  })

  it('404s for a lead that does not exist', async () => {
    const res = await auth(request(app.getHttpServer()).get('/api/leads/BBS-LD-DOES-NOT-EXIST/debt-analysis'))
    expect(res.status).toBe(404)
  })

  it('returns reportAvailable: false (never mock data) for a brand new lead with no credit report', async () => {
    const lead = await auth(
      request(app.getHttpServer()).post('/api/leads').send({
        fullName: 'Debt Analysis E2E Test Lead',
        phone: `+91 9${Math.floor(100000000 + Math.random() * 900000000)}`,
        email: 'debt-analysis.e2e@example.test',
        city: 'Chennai',
        source: 'ONLINE',
      }),
    )
    const bbsLeadId = lead.body.data.bbsLeadId

    const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/debt-analysis`))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ reportAvailable: false })
  })

  describe('for a lead with a real, populated credit report', () => {
    let data: any

    beforeAll(async () => {
      const res = await auth(request(app.getHttpServer()).get(`/api/leads/${seededBbsLeadId}/debt-analysis`))
      expect(res.status).toBe(200)
      data = res.body.data
    })

    it('reports the credit report as available and COMPLETED, with its bureau metadata', () => {
      expect(data.reportAvailable).toBe(true)
      expect(data.status).toBe('COMPLETED')
      expect(data.meta.bureau).toBe('Signzy Experian Lite')
      expect(typeof data.meta.reportDate).toBe('string')
    })

    it('reports a real completed AI insights job for the seed lead', () => {
      // This seed lead's AnalysisJob history is no longer empty: a real
      // reprocess() call made during a later QA pass (to empirically prove
      // the closedOn mapper fix against real data) fired a genuine AI
      // insights job as an unavoidable side effect (applyMappedResult()
      // always fires DEBT_ANALYSIS_INSIGHTS after a successful reprocess —
      // see BureauReportService). That job is now a real, permanent fact
      // about this dev-seed lead, not a fabricated test value.
      expect(data.insights).not.toBeNull()
      expect(data.insights.status).toBe('COMPLETED')
      expect(typeof data.insights.modelVersion).toBe('string')
    })

    it('CRITICAL: the real served HTTP response includes the additive scoreStructureDivergence field — proves it survives the full service→controller→JSON path, not just the calculation layer in isolation', () => {
      expect(data.scoreStructureDivergence).toBeDefined()
      expect(data.scoreStructureDivergence).toHaveProperty('available')
    })

    it('sums the 33 real Signzy tradelines into the financial summary strip', () => {
      expect(data.summary.totalOutstanding).toBe(946114)
      expect(data.summary.totalOverdue).toBe(0)
      // None of the 33 real accounts in this fixture carry a reported EMI
      // amount — honestly null, never fabricated to fill the field.
      expect(data.summary.monthlyEmi).toBeNull()
      expect(data.summary.totalLenders).toBe(21)
    })

    it('reflects the pre-existing report-level credit profile fields', () => {
      expect(data.creditProfile.creditScore).toBe(748)
      expect(data.creditProfile.scoreBand).toBe('good')
      expect(data.creditProfile.totalAccounts).toBe(33)
      expect(data.creditProfile.activeAccounts).toBe(5)
      expect(data.creditProfile.closedAccounts).toBe(28)
      expect(data.creditProfile.defaultedAccounts).toBe(0)
    })

    it('distributes the 33 real tradelines across their real account types', () => {
      expect(data.accountDistribution.totalAccounts).toBe(33)
      const types = data.accountDistribution.slices.map((s: { accountType: string }) => s.accountType).sort()
      expect(types).toEqual([
        'CONSUMER LOAN',
        'CREDIT CARD',
        'Loan on Credit Card',
        'PERSONAL LOAN',
        'Secured Credit Card',
        'Short Term Personal Loan [Unsecured]',
        'TWO-WHEELER LOAN',
      ])
    })

    it('computes utilization across only the real ACTIVE revolving (credit-card) tradelines — excluding 2 closed cards that still carry a reported limit', () => {
      // CRITICAL fix: this used to include every account with a credit
      // limit regardless of lifecycle status (208160/60084/29%), silently
      // diluting the figure with 2 closed, zero-balance cards. The BBS
      // spec's own §9.1 table is explicit: "sum valid limits for ACTIVE
      // cards." Only 3 of this lead's 5 revolving accounts are ACTIVE.
      expect(data.utilization.available).toBe(true)
      expect(data.utilization.totalCreditLimit).toBe(124000)
      expect(data.utilization.currentUtilization).toBe(60084)
      expect(data.utilization.utilizationPercent).toBe(48)
      expect(data.utilization.cards.map((c: { lender: string }) => c.lender).sort()).toEqual(['Axis Bank', 'HDFC Bank Ltd', 'HSBC'])
    })

    it('computes lender concentration across the real 21 distinct lenders', () => {
      expect(data.debtBurden.numbersOfLenders).toBe(21)
      // Bajaj Finance Limited alone holds ~94% of the real outstanding balance.
      expect(data.debtBurden.top3LendersSharePercent).toBe(100)
    })

    it('preserves CURRENT vs HISTORICAL max DPD as distinct figures (real 27-day historical late payment, zero current delinquency)', () => {
      expect(data.delinquency.buckets.zeroToSixty).toBe(33)
      expect(data.delinquency.maxHistoricalDpd).toBe(27)
      expect(data.delinquency.currentMaxDpd).toBe(0)
    })

    it('surfaces the 3 real seeded credit enquiries', () => {
      expect(data.enquiry.available).toBe(true)
      expect(data.enquiry.totalEnquiries).toBe(3)
    })

    it('never fabricates a risk score — only returns flags traceable to real figures', () => {
      expect(Array.isArray(data.riskFlags)).toBe(true)
      for (const flag of data.riskFlags) {
        expect(['High', 'Medium', 'Low']).toContain(flag.severity)
        expect(typeof flag.detail).toBe('string')
        expect(flag.detail.length).toBeGreaterThan(0)
        expect(flag.source).toBe('deterministic')
        expect(flag.evidence).toBeTruthy()
      }
    })

    it('also exposes the same data as BBS Level 1 Credit Intelligence (creditPosition/debtInventory/riskSignals) — a regrouping, not a second calculation', () => {
      expect(data.level1.creditPosition.creditScore).toBe(data.creditProfile.creditScore)
      expect(data.level1.creditPosition.totalOutstanding).toBe(data.creditProfile.totalOutstanding)
      expect(data.level1.debtInventory.totalActiveDebt).toBe(data.debtBurden.totalActiveDebt)
      expect(data.level1.debtInventory.accounts).toHaveLength(33)
      expect(data.level1.riskSignals).toEqual(data.riskFlags)
      expect(data.level1.aiInsights).toEqual(data.insights)
    })
  })

  describe('the CCR call brief', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app.getHttpServer()).get(`/api/leads/${seededBbsLeadId}/debt-analysis/call-brief`)
      expect(res.status).toBe(401)
    })

    it('404s for a lead that does not exist', async () => {
      const res = await auth(request(app.getHttpServer()).get('/api/leads/BBS-LD-DOES-NOT-EXIST/debt-analysis/call-brief'))
      expect(res.status).toBe(404)
    })

    it('projects the same Level 1 data into a CCR-facing brief for a lead with no credit report yet', async () => {
      const lead = await auth(
        request(app.getHttpServer()).post('/api/leads').send({
          fullName: 'Call Brief E2E Test Lead',
          phone: `+91 9${Math.floor(100000000 + Math.random() * 900000000)}`,
          email: 'call-brief.e2e@example.test',
          city: 'Hyderabad',
          source: 'ONLINE',
        }),
      )
      const res = await auth(request(app.getHttpServer()).get(`/api/leads/${lead.body.data.bbsLeadId}/debt-analysis/call-brief`))
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ who: expect.objectContaining({ fullName: 'Call Brief E2E Test Lead' }), reportAvailable: false })
    })

    it('projects credit position, debt inventory summary, delinquency, and risk signals for the seeded populated lead', async () => {
      const res = await auth(request(app.getHttpServer()).get(`/api/leads/${seededBbsLeadId}/debt-analysis/call-brief`))
      expect(res.status).toBe(200)
      const brief = res.body.data

      expect(brief.who.bbsLeadId).toBe(seededBbsLeadId)
      expect(brief.reportAvailable).toBe(true)
      expect(brief.status).toBe('COMPLETED')
      expect(brief.creditPosition.creditScore).toBe(748)
      expect(brief.debtInventorySummary.accountCount).toBe(33)
      expect(brief.debtInventorySummary.numbersOfLenders).toBe(21)
      expect(Array.isArray(brief.riskSignals)).toBe(true)
      expect(Array.isArray(brief.keyQuestionsForCcr)).toBe(true)
      expect(Array.isArray(brief.dataGaps)).toBe(true)
      // A real AI insights job now exists for this seed lead (see the main
      // endpoint's own "reports a real completed AI insights job" test
      // above for why) — aiObservations is populated from that same real,
      // completed job, never a fabricated observation.
      expect(brief.aiObservations).not.toBeNull()
      expect(typeof brief.aiObservations.summary).toBe('string')
      // §18.1's deterministic header/discoveryAgenda/accountsNeedingValidation
      // are always present regardless of whether the AI job happened to run.
      expect(brief.header.customerName).toBeTruthy()
      expect(Array.isArray(brief.discoveryAgenda)).toBe(true)
      expect(brief.discoveryAgenda.length).toBeGreaterThan(0)
      expect(Array.isArray(brief.accountsNeedingValidation)).toBe(true)
    })
  })

  it('does not leak one lead\'s debt analysis onto another', async () => {
    const otherLead = await auth(
      request(app.getHttpServer()).post('/api/leads').send({
        fullName: 'Isolation Check Lead',
        phone: `+91 9${Math.floor(100000000 + Math.random() * 900000000)}`,
        email: 'isolation-check.e2e@example.test',
        city: 'Kolkata',
        source: 'ONLINE',
      }),
    )
    const otherBbsLeadId = otherLead.body.data.bbsLeadId

    const res = await auth(request(app.getHttpServer()).get(`/api/leads/${otherBbsLeadId}/debt-analysis`))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ reportAvailable: false })
  })
})
