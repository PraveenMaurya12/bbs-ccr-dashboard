import type { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/main'
import type { AppConfig } from '../src/config/configuration'
import { PrismaService } from '../src/common/prisma/prisma.service'

/**
 * Proves the COMPLETE BBS customer journey against ONE canonical, data-rich
 * customer — never a collection of disconnected per-module fixtures:
 *
 *   Lead -> Consent/KYC -> Signzy Credit Report -> Debt Analysis ->
 *   Financial Analysis -> Master Profile -> Cohort Engine -> BBS Plan
 *
 * `BBS-LD-900001` is the dev seed's canonical lead (prisma/seed.ts) — a real
 * GRANTED ConsentRecord, a real panRef (KYC-complete), and a real CreditReport
 * mapped from the actual captured Signzy fixture (33 accounts, score 748,
 * see signzy-response.mapper.spec.ts for the same verified figures) already
 * exist for it before this spec ever runs. This is the SAME literal id every
 * frontend mock service already keys its own rich fixture on — unifying the
 * two fixture universes that a prior QA pass found disconnected.
 *
 * This spec only drives the pipeline FORWARD from that point (bank-statement
 * upload -> Financial Analysis -> Master Profile -> Cohort Engine -> BBS
 * Plan) and asserts real, non-fabricated data flows correctly end-to-end —
 * it never hand-writes a Master Profile, Cohort Decision, or Plan. Every
 * number asserted for the bureau side was computed by actually running the
 * real mapper + buildDebtAnalysisSummary against the real fixture (see
 * debt-analysis.e2e-spec.ts for the full breakdown); this spec focuses on
 * cross-stage identity/version consistency and the financial-side journey.
 *
 * Re-runnable: every stage here is append-only/versioned, so repeated runs
 * against a database that isn't reset between e2e files just add new
 * versions — this spec never hardcodes an absolute version number, only
 * relative progression (version increases, isStale remains false).
 */
describe('Canonical Rich Customer Journey (e2e)', () => {
  let app: NestExpressApplication
  let prisma: PrismaService
  let accessToken: string
  const bbsLeadId = 'BBS-LD-900001'

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication<NestExpressApplication>()
    configureApp(app, app.get(ConfigService).get<AppConfig>('app')!)
    await app.init()
    prisma = app.get(PrismaService)

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

  // 6 months (Apr-Sep 2026), 49 real transactions exercising every category
  // Phase 3 of the canonical-journey QA pass asked for: recurring income
  // (SALARY, keyworded), essential expenses (RENT, ELECTRICITY), a
  // discretionary purchase every month, a recurring EMI AND a recurring
  // credit-card payment each narrated to token-match a REAL lender from the
  // seeded Signzy fixture ("Bajaj Finance Limited", "HDFC Bank Ltd") for a
  // genuine (never fabricated) credit-bank correlation, ATM/cash
  // withdrawals, a CONFIRMED self-transfer pair (explicit "OWN ACCOUNT"
  // keyword), a recurring UNKEYWORDED credit matching a real bureau lender
  // with a zero balance ("NAVI FINSERV LIMITED") that must be reclassified
  // to BORROWING rather than auto-promoted to income, a confirmed ECS
  // bounce, and one large/unusual one-off transaction. The fixture's own
  // transactions drive every calculation below — nothing here is asserted
  // merely to force a desired conclusion.
  const CANONICAL_CSV_STATEMENT = [
    'Date,Narration,Debit,Credit,Balance',
    '05/04/2026,SALARY CREDIT TECHNOVA SOLUTIONS PVT LTD,,65000.00,565000.00',
    '07/04/2026,RENT PAYMENT LANDLORD NEFT,15000.00,,550000.00',
    '10/04/2026,BAJAJ FINANCE EMI AUTODEBIT,12000.00,,538000.00',
    '12/04/2026,HDFC BANK EMI AUTODEBIT,5000.00,,533000.00',
    '14/04/2026,BESCOM ELECTRICITY BILL PAYMENT,1200.00,,531800.00',
    '16/04/2026,ATM CASH WDL,3000.00,,528800.00',
    '18/04/2026,SWIGGY ORDER PAYMENT,1450.00,,527350.00',
    '20/04/2026,NAVI FINSERV LIMITED,,8000.00,535350.00',
    '05/05/2026,SALARY CREDIT TECHNOVA SOLUTIONS PVT LTD,,65000.00,600350.00',
    '07/05/2026,RENT PAYMENT LANDLORD NEFT,15000.00,,585350.00',
    '10/05/2026,BAJAJ FINANCE EMI AUTODEBIT,12000.00,,573350.00',
    '12/05/2026,HDFC BANK EMI AUTODEBIT,5000.00,,568350.00',
    '14/05/2026,BESCOM ELECTRICITY BILL PAYMENT,1200.00,,567150.00',
    '16/05/2026,ATM CASH WDL,3000.00,,564150.00',
    '18/05/2026,AMAZON SHOPPING,3200.00,,560950.00',
    '20/05/2026,NAVI FINSERV LIMITED,,8000.00,568950.00',
    '05/06/2026,SALARY CREDIT TECHNOVA SOLUTIONS PVT LTD,,65000.00,633950.00',
    '07/06/2026,RENT PAYMENT LANDLORD NEFT,15000.00,,618950.00',
    '10/06/2026,BAJAJ FINANCE EMI AUTODEBIT,12000.00,,606950.00',
    '12/06/2026,HDFC BANK EMI AUTODEBIT,5000.00,,601950.00',
    '14/06/2026,BESCOM ELECTRICITY BILL PAYMENT,1200.00,,600750.00',
    '16/06/2026,ATM CASH WDL,3000.00,,597750.00',
    '18/06/2026,ZOMATO ORDER PAYMENT,980.00,,596770.00',
    '20/06/2026,NAVI FINSERV LIMITED,,8000.00,604770.00',
    '22/06/2026,TRANSFER TO OWN ACCOUNT XXXX1234,20000.00,,584770.00',
    '22/06/2026,TRANSFER FROM OWN ACCOUNT XXXX5678,,20000.00,604770.00',
    '05/07/2026,SALARY CREDIT TECHNOVA SOLUTIONS PVT LTD,,65000.00,669770.00',
    '07/07/2026,RENT PAYMENT LANDLORD NEFT,15000.00,,654770.00',
    '10/07/2026,BAJAJ FINANCE EMI AUTODEBIT,12000.00,,642770.00',
    '12/07/2026,HDFC BANK EMI AUTODEBIT,5000.00,,637770.00',
    '14/07/2026,BESCOM ELECTRICITY BILL PAYMENT,1200.00,,636570.00',
    '16/07/2026,ATM CASH WDL,3000.00,,633570.00',
    '18/07/2026,MYNTRA SHOPPING,2650.00,,630920.00',
    '24/07/2026,ECS RETURN CHARGES INSUFFICIENT FUNDS,500.00,,630420.00',
    '05/08/2026,SALARY CREDIT TECHNOVA SOLUTIONS PVT LTD,,65000.00,695420.00',
    '07/08/2026,RENT PAYMENT LANDLORD NEFT,15000.00,,680420.00',
    '10/08/2026,BAJAJ FINANCE EMI AUTODEBIT,12000.00,,668420.00',
    '12/08/2026,HDFC BANK EMI AUTODEBIT,5000.00,,663420.00',
    '14/08/2026,BESCOM ELECTRICITY BILL PAYMENT,1200.00,,662220.00',
    '16/08/2026,ATM CASH WDL,3000.00,,659220.00',
    '18/08/2026,BOOKMYSHOW TICKETS,1200.00,,658020.00',
    '26/08/2026,LUXURY WATCH BOUTIQUE PURCHASE,85000.00,,573020.00',
    '05/09/2026,SALARY CREDIT TECHNOVA SOLUTIONS PVT LTD,,65000.00,638020.00',
    '07/09/2026,RENT PAYMENT LANDLORD NEFT,15000.00,,623020.00',
    '10/09/2026,BAJAJ FINANCE EMI AUTODEBIT,12000.00,,611020.00',
    '12/09/2026,HDFC BANK EMI AUTODEBIT,5000.00,,606020.00',
    '14/09/2026,BESCOM ELECTRICITY BILL PAYMENT,1200.00,,604820.00',
    '16/09/2026,ATM CASH WDL,3000.00,,601820.00',
    '18/09/2026,AMAZON SHOPPING,1800.00,,600020.00',
  ].join('\n')

  describe('Phase 0-1: canonical lead, consent/KYC, and bureau credit report', () => {
    it('is one real, persisted lead with real GRANTED consent and a real panRef (KYC-complete)', async () => {
      const lead = await prisma.lead.findUnique({ where: { bbsLeadId } })
      expect(lead).toBeTruthy()
      expect(lead!.panRef).toBeTruthy()

      const consents = await prisma.consentRecord.findMany({ where: { leadId: lead!.id } })
      expect(consents.some((c) => c.status === 'GRANTED' && c.revokedAt === null)).toBe(true)
    })

    it('exposes the real Signzy-mapped credit report via the Debt Analysis endpoint — never a fallback/mock dataset', async () => {
      const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/debt-analysis`))
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.reportAvailable).toBe(true)
      expect(data.status).toBe('COMPLETED')
      expect(data.meta.bureau).toBe('Signzy Experian Lite')
      expect(data.creditProfile.creditScore).toBe(748)
      expect(data.creditProfile.totalAccounts).toBe(33)
      expect(data.creditProfile.activeAccounts).toBe(5)
      // CURRENT vs HISTORICAL delinquency must remain distinct facts.
      expect(data.delinquency.currentMaxDpd).toBe(0)
      expect(data.delinquency.maxHistoricalDpd).toBe(27)
    })
  })

  describe('Phase 3-4: canonical Financial Analysis — real transactions drive every classification', () => {
    let financialData: Record<string, unknown>

    it('processes the 49-transaction, 6-month canonical bank statement to COMPLETED', async () => {
      const upload = await auth(
        request(app.getHttpServer())
          .post(`/api/leads/${bbsLeadId}/documents`)
          .field('documentType', 'BANK_STATEMENT')
          .attach('file', Buffer.from(CANONICAL_CSV_STATEMENT), { filename: 'canonical-statement.csv', contentType: 'text/csv' }),
      )
      expect(upload.status).toBe(201)

      financialData = await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/financial-analysis`)).then((r) => r.body.data),
        (d) => Boolean(d.reportAvailable) && !['UPLOADED', 'EXTRACTING', 'NORMALIZING', 'CLASSIFYING', 'ANALYZING'].includes(d.status as string),
        20000,
      )

      expect(financialData.status).toBe('COMPLETED')
      expect((financialData.months as unknown[]).length).toBeGreaterThanOrEqual(6)
      expect((financialData.transactions as unknown[]).length).toBe(49)
    }, 30000)

    it('classifies the keyworded recurring salary credit as real INCOME', () => {
      const transactions = financialData.transactions as Array<{ narration: string; category: string }>
      const salaryRows = transactions.filter((t) => t.narration.includes('SALARY CREDIT TECHNOVA'))
      expect(salaryRows).toHaveLength(6)
      expect(salaryRows.every((t) => t.category === 'INCOME')).toBe(true)
    })

    it('NEVER auto-promotes the unkeyworded recurring NAVI FINSERV credit to income — reclassifies to BORROWING via real bureau-lender correlation', () => {
      const transactions = financialData.transactions as Array<{ narration: string; category: string }>
      const naviRows = transactions.filter((t) => t.narration === 'NAVI FINSERV LIMITED')
      expect(naviRows).toHaveLength(3)
      expect(naviRows.every((t) => t.category === 'BORROWING')).toBe(true)
      expect(naviRows.some((t) => t.category === 'INCOME')).toBe(false)
    })

    it('confirms the explicit "OWN ACCOUNT" self-transfer pair — never double-counted as income/expense', () => {
      const transactions = financialData.transactions as Array<{ narration: string; category: string; subcategory: string | null }>
      const selfTransferRows = transactions.filter((t) => t.narration.includes('OWN ACCOUNT'))
      expect(selfTransferRows).toHaveLength(2)
      expect(selfTransferRows.every((t) => t.category === 'TRANSFERS' && t.subcategory === 'Self transfer')).toBe(true)
    })

    it('correlates the real recurring EMI/credit-card payments against the real Signzy lenders (Bajaj Finance Limited, HDFC Bank Ltd)', () => {
      const riskFlags = financialData.riskFlags as Array<{ key: string; evidence: Record<string, unknown> }>
      const matches = riskFlags.filter((f) => f.key === 'CREDIT_BANK_MATCH')
      const lenders = matches.map((f) => f.evidence.bureauLender)
      expect(lenders).toContain('Bajaj Finance Limited')
      expect(lenders).toContain('HDFC Bank Ltd')
    })

    it('flags the confirmed ECS bounce and the large/unusual one-off transaction', () => {
      const riskFlags = financialData.riskFlags as Array<{ key: string }>
      expect(riskFlags.some((f) => f.key === 'CONFIRMED_ECS_BOUNCE')).toBe(true)
      expect(riskFlags.some((f) => f.key === 'LARGE_TRANSACTION')).toBe(true)
    })

    it('reports a real, non-fabricated Financial Health score with full transparency fields', () => {
      const score = financialData.score as Record<string, unknown>
      expect(typeof score.totalScore).toBe('number')
      expect(typeof score.maxAchievablePoints).toBe('number')
      expect(score.componentDetails).toBeTruthy()
    })
  })

  describe('Phase 5: Master Profile — real reconciliation of the real Debt + Financial Analysis', () => {
    let masterProfileVersionBefore: number | null

    it('generates a real COMPLETED Master Profile with meaningful, non-fabricated fields', async () => {
      const before = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/master-profile`))
      masterProfileVersionBefore = before.body.data.profileAvailable ? (before.body.data.version as number) : null

      const generateRes = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/master-profile/generate`))
      expect(generateRes.status).toBe(201)
      expect(generateRes.body.data.generated).toBe(true)

      const data = await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/master-profile`)).then((r) => r.body.data),
        (d) => Boolean(d.profileAvailable) && d.status !== 'GENERATING',
        20000,
      )

      expect(data.status).toBe('COMPLETED')
      expect(masterProfileVersionBefore === null || (data.version as number) > masterProfileVersionBefore).toBe(true)
      expect(data.isStale).toBe(false)

      // Meaningful values for every spec'd position — never null/undefined
      // placeholders standing in for a real calculation.
      expect(data.alignmentState).toBeTruthy()
      expect(data.resolutionCapacity).toBeTruthy()
      expect(data.overallConfidence).toBeTruthy()
      expect(data.identitySnapshot).toBeTruthy()
      expect(data.stressProfile).toBeTruthy()
      expect(Array.isArray(data.strengths)).toBe(true)
      expect(Array.isArray(data.concerns)).toBe(true)
      expect(Array.isArray(data.opportunitySignals)).toBe(true)
      expect(data.cohortAttributes).toBeTruthy()

      // The three DSR concepts remain distinct figures, never coalesced into one.
      expect(typeof data.bureauDsrPercent === 'number' || data.bureauDsrPercent === null).toBe(true)
      expect(typeof data.bankDsrPercent === 'number' || data.bankDsrPercent === null).toBe(true)
      expect(typeof data.masterDsrPercent === 'number' || data.masterDsrPercent === null).toBe(true)

      // The real Bajaj Finance / HDFC Bank reconciliation rows made it through
      // to Master Profile's own reconciliation table (PARTIALLY_MATCHED, not
      // MATCHED — this real Signzy fixture never reports an EMI amount for
      // any of its 33 accounts, so amount can never be bureau-confirmed; an
      // honest real-data limit, not a bug).
      const rows = data.reconciliationRows as Array<{ lender: string; matchStatus: string }>
      const bajaj = rows.find((r) => r.lender === 'Bajaj Finance Limited')
      expect(bajaj).toBeDefined()
      expect(bajaj!.matchStatus).toBe('PARTIALLY_MATCHED')
    }, 30000)
  })

  describe('Phase 6: Cohort Engine — real rules, real precedence, nothing hard-coded', () => {
    it('evaluates all 22 rules against the real Master Profile and persists a real primary cohort + evidence', async () => {
      const beforeRes = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/cohort`))
      const versionBefore = beforeRes.body.data.decisionAvailable ? (beforeRes.body.data.version as number) : null

      const evaluateRes = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/cohort/evaluate`))
      expect(evaluateRes.status).toBe(201)
      expect(evaluateRes.body.data.generated).toBe(true)

      const data = await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/cohort`)).then((r) => r.body.data),
        (d) => Boolean(d.decisionAvailable) && d.status !== 'GENERATING',
        20000,
      )

      expect(data.status).toBe('COMPLETED')
      expect(versionBefore === null || (data.version as number) > versionBefore).toBe(true)
      expect(data.isStale).toBe(false)
      expect(data.ruleResults).toHaveLength(24)
      expect([
        'CONSENT_PENDING', 'KYC_PENDING', 'X1', 'C6', 'C5', 'C4', 'C3', 'C2', 'C1', 'C7', 'X2', 'MANUAL_REVIEW', 'CUSTOMER_UNRESPONSIVE',
        'COMPLIANCE_HOLD', 'DATA_REFRESH_REQUIRED', 'OTHER_ACCOUNTS_REQUIRED', 'P1_INFORMATION_REQUIRED', 'SPECIALIST_REQUIRED', 'CCR_REQUIRED',
      ]).toContain(data.primaryCohort)
      // This canonical lead has a real GRANTED consent + a real panRef, so
      // the two upstream-most gate states must never fire for it — a real
      // substantive cohort (or a real downstream gate like MANUAL_REVIEW)
      // must result, proving the rules actually ran rather than short-
      // circuiting on missing consent/KYC evidence this lead doesn't lack.
      expect(['CONSENT_PENDING', 'KYC_PENDING']).not.toContain(data.primaryCohort)
      expect(data.customerExplanation).toBeTruthy()
      expect(data.dataProvenance).toBeTruthy()

      console.log(`[Canonical Journey] Real cohort result for ${bbsLeadId}: primaryCohort=${data.primaryCohort}, pathway=${data.pathway}, archetype=${data.archetype}`)
    }, 30000)
  })

  describe('Phase 6.5: Pathway Engine (L5) — real rules, real precedence over the SAME persisted Cohort Decision, nothing hard-coded', () => {
    it('evaluates all 20 P-rules against the real Cohort Decision + Master Profile and persists a real pathway decision', async () => {
      const beforeRes = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/pathway`))
      const versionBefore = beforeRes.body.data.decisionAvailable ? (beforeRes.body.data.version as number) : null

      const evaluateRes = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/pathway/evaluate`))
      expect(evaluateRes.status).toBe(201)
      expect(evaluateRes.body.data.generated).toBe(true)

      const data = await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/pathway`)).then((r) => r.body.data),
        (d) => Boolean(d.decisionAvailable) && d.status !== 'GENERATING',
        20000,
      )

      expect(data.status).toBe('COMPLETED')
      expect(versionBefore === null || (data.version as number) > versionBefore).toBe(true)
      expect(data.isStale).toBe(false)
      expect(data.ruleResults.length).toBeGreaterThanOrEqual(16) // P001-P020, minus the pathway-dependent rules that only fire once a primary is known
      // §15's own pathway_status vocabulary — either a real pathway is
      // selected (READY) or a null pathway with a real reason code.
      expect(['READY', 'BLOCKED', 'INSUFFICIENT_DATA', 'SPECIALIST_REVIEW', 'MANUAL_REVIEW', 'OUT_OF_SCOPE', 'NO_SUITABLE_PATHWAY']).toContain(data.pathwayStatus)
      if (data.pathwayStatus === 'READY') {
        expect(['OPTIMISE', 'STABILISE', 'CONSOLIDATE', 'RESTRUCTURE', 'RESOLVE', 'RECOVER']).toContain(data.primaryPathway)
        expect(data.ttl.pathwayTtlDays).toBeGreaterThan(0)
      } else {
        expect(data.primaryPathway).toBeNull()
        expect(data.ttl.pathwayTtlDays).toBeNull()
      }
      expect(data.customerReasons.length).toBeGreaterThan(0)
      expect(data.dataProvenance).toBeTruthy()

      console.log(`[Canonical Journey] Real pathway result for ${bbsLeadId}: primaryPathway=${data.primaryPathway}, pathwayStatus=${data.pathwayStatus}, confidence=${data.confidence}`)
    }, 30000)
  })

  describe('Phase 7-8: BBS Plan / Recovery Plan — consumes ONLY the persisted Cohort Decision + Pathway Decision', () => {
    it('generates a real COMPLETED BBS Plan whose cohort matches the persisted Cohort Decision and whose pathway matches the persisted Pathway Decision exactly', async () => {
      const cohortRes = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/cohort`))
      const cohortDecision = cohortRes.body.data
      const pathwayRes = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/pathway`))
      const pathwayDecision = pathwayRes.body.data

      const beforePlan = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/plan`))
      const planVersionBefore = beforePlan.body.data.planAvailable ? (beforePlan.body.data.version as number) : null

      const generateRes = await auth(request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/plan/generate`))
      expect(generateRes.status).toBe(201)
      expect(generateRes.body.data.generated).toBe(true)

      const plan = await pollUntil(
        () => auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/plan`)).then((r) => r.body.data),
        (d) => Boolean(d.planAvailable) && d.status !== 'GENERATING',
        20000,
      )

      expect(plan.status).toBe('COMPLETED')
      expect(planVersionBefore === null || (plan.version as number) > planVersionBefore).toBe(true)
      expect(plan.isStale).toBe(false)

      // No independent cohort/pathway selection — the Plan Engine must
      // reuse the SAME persisted Cohort Decision's own cohort AND the SAME
      // persisted Pathway Decision's own primaryPathway, never re-decide
      // either (BBS Pathway Engine v3.0, L5, inserted between Cohort
      // Engine and Plan Engine this pass — Plan Engine no longer trusts
      // Cohort Decision's own simpler static cohort->pathway map).
      expect(plan.cohort).toBe(cohortDecision.primaryCohort)
      expect(plan.pathway).toBe(pathwayDecision.primaryPathway)

      expect(plan.templateId).toBeTruthy()
      expect(plan.situationAssessment ?? plan.financialCapacity).toBeTruthy()
      expect(Array.isArray(plan.actions)).toBe(true)
      expect(plan.actions.length).toBeGreaterThan(0)
      expect(Array.isArray(plan.conditions)).toBe(true)
      expect(plan.customerExplanation).toBeTruthy()
      expect(['DRAFT', 'CCR_REVIEW', 'SPECIALIST_REVIEW']).toContain(plan.lifecycleStatus)

      console.log(`[Canonical Journey] Real plan for ${bbsLeadId}: templateId=${plan.templateId}, lifecycleStatus=${plan.lifecycleStatus}, actions=${(plan.actions as unknown[]).length}`)
    }, 30000)
  })

  describe('Phase 10: database integrity for the canonical case', () => {
    it('has exactly one Lead row, one CreditReport, and no orphaned/duplicate rows for this bbsLeadId', async () => {
      const leads = await prisma.lead.findMany({ where: { bbsLeadId } })
      expect(leads).toHaveLength(1)
      const leadId = leads[0]!.id

      const reports = await prisma.creditReport.findMany({ where: { leadId } })
      expect(reports).toHaveLength(1)
      expect(reports[0]!.processingStatus).toBe('COMPLETED')

      const accounts = await prisma.creditAccount.count({ where: { creditReportId: reports[0]!.id } })
      expect(accounts).toBe(33)
      const enquiries = await prisma.creditEnquiry.count({ where: { creditReportId: reports[0]!.id } })
      expect(enquiries).toBe(3)
    })

    // Explicit Jest timeout (10000ms), not the 5000ms default: this test's own
    // pollUntil() call below already budgets 8000ms for its grace period
    // (deliberately, per its own comment) — left as an implicit 5000ms-bound
    // test, Jest's own watchdog kills it before that 8-second budget can ever
    // elapse, which is a latent, structural mismatch regardless of whether any
    // job is actually slow to complete. This does not touch the poll's own
    // 8000ms budget or weaken what it asserts — it only lets that
    // already-authored budget actually run to completion.
    it('has no AnalysisJob stuck RUNNING for this lead (fire-and-forget AI jobs from earlier phases get a reasonable grace period to finish)', async () => {
      const lead = await prisma.lead.findUnique({ where: { bbsLeadId } })
      // "Stuck" honestly means "still RUNNING after a reasonable chance to
      // finish," never "RUNNING at this literal instant" — the Plan/Master
      // Profile insights jobs fired in earlier phases are fire-and-forget
      // and genuinely may not have completed the moment their HTTP response
      // returned. Poll briefly before concluding anything is actually stuck.
      const stuckJobs = await pollUntil(
        () => prisma.analysisJob.findMany({ where: { leadId: lead!.id, status: 'RUNNING' } }),
        (jobs) => jobs.length === 0,
        8000,
      )
      expect(stuckJobs).toHaveLength(0)
    }, 10000)

    it('every persisted Master Profile/Cohort Decision/BBS Plan version for this lead references the same lead — no cross-fixture id leakage', async () => {
      const lead = await prisma.lead.findUnique({ where: { bbsLeadId } })
      const [profiles, decisions, plans] = await Promise.all([
        prisma.masterProfile.findMany({ where: { leadId: lead!.id } }),
        prisma.cohortDecision.findMany({ where: { leadId: lead!.id } }),
        prisma.bbsPlan.findMany({ where: { leadId: lead!.id } }),
      ])
      expect(profiles.length).toBeGreaterThan(0)
      expect(decisions.length).toBeGreaterThan(0)
      expect(plans.length).toBeGreaterThan(0)
      expect(profiles.every((p) => p.leadId === lead!.id)).toBe(true)
      expect(decisions.every((d) => d.leadId === lead!.id)).toBe(true)
      expect(plans.every((p) => p.leadId === lead!.id)).toBe(true)

      // Every version number is unique per lead (append-only, never overwritten).
      const profileVersions = profiles.map((p) => p.version)
      expect(new Set(profileVersions).size).toBe(profileVersions.length)
    })
  })
})
