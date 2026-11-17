import { NotFoundException } from '@nestjs/common'

import { MasterProfileService } from './master-profile.service'

function decimal(value: number) {
  return { toNumber: () => value }
}

function completedDebtAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    reportAvailable: true as const,
    status: 'COMPLETED' as const,
    meta: { bureau: 'Experian', reportDate: '2026-09-01T00:00:00.000Z' },
    debtBurden: { securedPercent: 20, unsecuredPercent: 80 },
    level1: {
      creditPosition: { creditScore: 780, scoreBand: 'good', totalAccounts: 1, activeAccounts: 1, totalOutstanding: 50000, totalOverdue: 0, recentEnquiries: 0 },
      debtInventory: {
        accounts: [
          { lender: 'HDFC Bank', accountType: 'Personal Loan', openedOn: '2023-01-15T00:00:00.000Z', currentBalance: 50000, overdueAmount: 0, monthlyEmiAmount: 8000, currentDpdDays: 0, maxDpdDays: 0, creditLimit: null, isSecured: false, lifecycleStatus: 'ACTIVE', paymentStatus: 'Current' },
        ],
        monthlyEmi: 8000,
        numbersOfLenders: 1,
        top3LendersSharePercent: 100,
        statusIndicators: { settledCount: 0, writtenOffCount: 0, suitFiledCount: 0, restructuredCount: 0, willfulDefault: null },
        delinquency: { currentMaxDpd: 0, maxHistoricalDpd: 0 },
      },
      debtStructure: { recency: { substantialRecentConcentration: false } },
      debtBehaviour: { borrowing: { clusterDetected: false } },
      repaymentCapacity: {
        debtServiceRatio: { availability: 'AVAILABLE', debtServiceRatioPercent: 16, monthlyIncome: 50000 },
        debtToIncome: { availability: 'AVAILABLE', dtiPercent: 30 },
      },
      stressAnalysis: { level: 'Stable', signals: [] },
    },
    ...overrides,
  }
}

function completedFinancialAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    reportAvailable: true as const,
    status: 'COMPLETED' as const,
    statement: { bankName: 'HDFC', accountNumberMasked: 'XXXX1234', statementPeriodStart: '2025-10-01T00:00:00.000Z', statementPeriodEnd: '2026-08-31T00:00:00.000Z' },
    score: { totalScore: 80, scorePartial: false, stressIndicator0to100: 10, stressBand: 'LOW' },
    riskFlags: [
      {
        key: 'CREDIT_BANK_MATCH',
        severity: 'POSITIVE',
        detail: 'HDFC Bank: bureau-reported obligation matched to a recurring bank repayment (high confidence).',
        evidence: { bureauLender: 'HDFC Bank', bureauAccountOpenedOn: '2023-01-15T00:00:00.000Z', reportedEmi: 8000, observedPayment: 8000, confidence: 0.95, confidenceLabel: 'high' },
        relatedMonth: null,
      },
    ],
    months: [
      {
        periodMonth: new Date('2026-01-01'),
        totalInflow: decimal(60000),
        totalOutflow: decimal(40000),
        netCashFlow: decimal(20000),
        normalizedIncome: decimal(50000),
        essentialExpenses: decimal(15000),
        financialExpenses: decimal(8000),
        discretionaryExpenses: decimal(5000),
        mandatoryDebtPayments: decimal(8000),
        creditCardPayments: decimal(0),
        loanInflows: decimal(0),
        transferInflows: decimal(0),
        transferOutflows: decimal(0),
        cashWithdrawals: decimal(0),
        cashDeposits: decimal(0),
        closingBalance: decimal(50000),
        minBalance: decimal(30000),
        lowBalanceDays: 0,
        observedDays: 30,
        hadNegativeBalance: false,
        transactionCount: 20,
        isExceptionalMonth: false,
        exceptionalMonthReason: null,
      },
    ],
    transactions: [],
    insights: null,
    ...overrides,
  }
}

describe('MasterProfileService', () => {
  let prisma: {
    lead: { findUnique: jest.Mock }
    customer: { findUnique: jest.Mock }
    creditReport: { findUnique: jest.Mock }
    bankStatementAnalysis: { findFirst: jest.Mock }
    masterProfile: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock }
    masterProfileReconciliationRow: { deleteMany: jest.Mock; createMany: jest.Mock }
    masterMissingInformationItem: { deleteMany: jest.Mock; createMany: jest.Mock }
    analysisJob: { findFirst: jest.Mock }
    ccrInteraction: { findUnique: jest.Mock }
    $transaction: jest.Mock
  }
  let debtAnalysisService: { getForLead: jest.Mock }
  let financialAnalysisService: { getForLead: jest.Mock }
  let analysisService: { createAndRun: jest.Mock }
  let service: MasterProfileService

  beforeEach(() => {
    prisma = {
      lead: { findUnique: jest.fn() },
      customer: { findUnique: jest.fn() },
      creditReport: { findUnique: jest.fn() },
      bankStatementAnalysis: { findFirst: jest.fn() },
      masterProfile: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      masterProfileReconciliationRow: { deleteMany: jest.fn(), createMany: jest.fn() },
      masterMissingInformationItem: { deleteMany: jest.fn(), createMany: jest.fn() },
      analysisJob: { findFirst: jest.fn() },
      ccrInteraction: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockResolvedValue([]),
    }
    debtAnalysisService = { getForLead: jest.fn() }
    financialAnalysisService = { getForLead: jest.fn() }
    analysisService = { createAndRun: jest.fn().mockResolvedValue({}) }
    service = new MasterProfileService(prisma as never, debtAnalysisService as never, financialAnalysisService as never, analysisService as never)
  })

  describe('generate', () => {
    it('throws NotFoundException for an unknown lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(null)
      await expect(service.generate('BBS-LD-000000')).rejects.toThrow(NotFoundException)
    })

    it('CRITICAL: never persists a MasterProfile row when Debt Analysis has not completed (UPSTREAM_INCOMPLETE short-circuit)', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      debtAnalysisService.getForLead.mockResolvedValue({ reportAvailable: false })
      financialAnalysisService.getForLead.mockResolvedValue(completedFinancialAnalysis())

      const result = await service.generate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(prisma.masterProfile.create).not.toHaveBeenCalled()
    })

    it('never persists a row when Financial Analysis has not completed', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      debtAnalysisService.getForLead.mockResolvedValue(completedDebtAnalysis())
      financialAnalysisService.getForLead.mockResolvedValue({ reportAvailable: true, status: 'EXTRACTING' })

      const result = await service.generate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(prisma.masterProfile.create).not.toHaveBeenCalled()
    })

    it('creates a GENERATING row, then completes it, when both upstream modules are COMPLETED', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      debtAnalysisService.getForLead.mockResolvedValue(completedDebtAnalysis())
      financialAnalysisService.getForLead.mockResolvedValue(completedFinancialAnalysis())
      prisma.customer.findUnique.mockResolvedValue(null)
      prisma.creditReport.findUnique.mockResolvedValue({ id: 'cr-1', completedAt: new Date('2026-09-01') })
      prisma.bankStatementAnalysis.findFirst.mockResolvedValue({ id: 'bsa-1', completedAt: new Date('2026-08-31') })
      prisma.masterProfile.findFirst.mockResolvedValue(null)
      prisma.masterProfile.create.mockResolvedValue({ id: 'mp-1', version: 1 })

      const result = await service.generate('BBS-LD-100001')

      expect(result.generated).toBe(true)
      expect(prisma.masterProfile.create).toHaveBeenCalledWith({ data: { leadId: 'lead-1', version: 1, status: 'GENERATING' } })
      expect(prisma.$transaction).toHaveBeenCalled()
      expect(analysisService.createAndRun).toHaveBeenCalledWith(expect.objectContaining({ bbsLeadId: 'BBS-LD-100001', jobType: 'MASTER_PROFILE_INSIGHTS' }))
    })

    describe('CCR-declared answers', () => {
      const arrange = () => {
        prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
        debtAnalysisService.getForLead.mockResolvedValue(completedDebtAnalysis())
        financialAnalysisService.getForLead.mockResolvedValue(completedFinancialAnalysis())
        prisma.customer.findUnique.mockResolvedValue(null)
        prisma.creditReport.findUnique.mockResolvedValue({ id: 'cr-1', completedAt: new Date('2026-09-01') })
        prisma.bankStatementAnalysis.findFirst.mockResolvedValue({ id: 'bsa-1', completedAt: new Date('2026-08-31') })
        prisma.masterProfile.findFirst.mockResolvedValue(null)
        prisma.masterProfile.create.mockResolvedValue({ id: 'mp-1', version: 1 })
      }
      const submitted = (answers: Array<{ fieldKey: string; responseStatus?: string; answerAmount?: number | null; answerBoolean?: boolean | null }>) => ({
        status: 'SUBMITTED',
        submittedAt: new Date('2026-10-22T10:00:00Z'),
        answers: answers.map((a) => ({ responseStatus: 'ANSWERED', answerBoolean: null, ...a, answerAmount: a.answerAmount === undefined || a.answerAmount === null ? null : { toNumber: () => a.answerAmount } })),
      })
      const persistedValidationRequired = () => {
        const call = prisma.masterProfile.update.mock.calls.find(([arg]) => arg.data.status === 'COMPLETED')
        return (call?.[0].data.validationRequired ?? []) as Array<{ item: string }>
      }

      it('surfaces a disagreement between a submitted CCR-declared figure and the observed one, and passes the declared facts to the AI synthesis', async () => {
        arrange()
        prisma.ccrInteraction.findUnique.mockResolvedValue(submitted([{ fieldKey: 'MONTHLY_INCOME', answerAmount: 9_000_000 }, { fieldKey: 'CAN_SERVICE_EMIS', answerBoolean: false }]))

        expect((await service.generate('BBS-LD-100001')).generated).toBe(true)

        const items = persistedValidationRequired().map((i) => i.item)
        expect(items).toContain('CCR-declared income differs from bank-observed income')
        expect(items).toContain('Customer reports difficulty servicing current EMIs')
        const facts = analysisService.createAndRun.mock.calls[0][0].payload.masterProfileFacts
        expect(facts.ccrDeclared).toMatchObject({ monthlyIncome: 9_000_000, canServiceEmis: false })
      })

      it('ignores a DRAFT (not yet submitted) interaction entirely', async () => {
        arrange()
        prisma.ccrInteraction.findUnique.mockResolvedValue({ ...submitted([{ fieldKey: 'MONTHLY_INCOME', answerAmount: 9_000_000 }]), status: 'DRAFT', submittedAt: null })

        await service.generate('BBS-LD-100001')

        expect(persistedValidationRequired().map((i) => i.item).some((i) => i.startsWith('CCR-declared'))).toBe(false)
        expect(analysisService.createAndRun.mock.calls[0][0].payload.masterProfileFacts.ccrDeclared).toBeNull()
      })

      it('never counts a "not known" / "declined" response as a declared value', async () => {
        arrange()
        prisma.ccrInteraction.findUnique.mockResolvedValue(submitted([{ fieldKey: 'MONTHLY_INCOME', responseStatus: 'NOT_KNOWN', answerAmount: 9_000_000 }]))

        await service.generate('BBS-LD-100001')

        expect(persistedValidationRequired().map((i) => i.item).some((i) => i.startsWith('CCR-declared'))).toBe(false)
        expect(analysisService.createAndRun.mock.calls[0][0].payload.masterProfileFacts.ccrDeclared.monthlyIncome).toBeNull()
      })
    })

    it('appends a new version rather than overwriting a prior one', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      debtAnalysisService.getForLead.mockResolvedValue(completedDebtAnalysis())
      financialAnalysisService.getForLead.mockResolvedValue(completedFinancialAnalysis())
      prisma.customer.findUnique.mockResolvedValue(null)
      prisma.creditReport.findUnique.mockResolvedValue({ id: 'cr-1', completedAt: new Date('2026-09-01') })
      prisma.bankStatementAnalysis.findFirst.mockResolvedValue({ id: 'bsa-1', completedAt: new Date('2026-08-31') })
      prisma.masterProfile.findFirst.mockResolvedValue({ version: 3 })
      prisma.masterProfile.create.mockResolvedValue({ id: 'mp-4', version: 4 })

      await service.generate('BBS-LD-100001')

      expect(prisma.masterProfile.create).toHaveBeenCalledWith({ data: { leadId: 'lead-1', version: 4, status: 'GENERATING' } })
    })

    it('marks the row FAILED (never silently swallowed) when the pipeline throws', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      debtAnalysisService.getForLead.mockResolvedValue(completedDebtAnalysis())
      financialAnalysisService.getForLead.mockResolvedValue(completedFinancialAnalysis())
      prisma.customer.findUnique.mockResolvedValue(null)
      prisma.creditReport.findUnique.mockResolvedValue({ id: 'cr-1', completedAt: new Date('2026-09-01') })
      prisma.bankStatementAnalysis.findFirst.mockResolvedValue({ id: 'bsa-1', completedAt: new Date('2026-08-31') })
      prisma.masterProfile.findFirst.mockResolvedValue(null)
      prisma.masterProfile.create.mockResolvedValue({ id: 'mp-1', version: 1 })
      prisma.$transaction.mockRejectedValue(new Error('db exploded'))

      const result = await service.generate('BBS-LD-100001')

      expect(result.generated).toBe(false)
      expect(prisma.masterProfile.update).toHaveBeenCalledWith({ where: { id: 'mp-1' }, data: { status: 'FAILED', errorMessage: 'db exploded' } })
    })
  })

  describe('getForLead', () => {
    it('throws NotFoundException for an unknown lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(null)
      await expect(service.getForLead('BBS-LD-000000')).rejects.toThrow(NotFoundException)
    })

    it('reports profileAvailable:false with upstream readiness when no MasterProfile row exists yet', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.masterProfile.findFirst.mockResolvedValue(null)
      debtAnalysisService.getForLead.mockResolvedValue(completedDebtAnalysis())
      financialAnalysisService.getForLead.mockResolvedValue({ reportAvailable: true, status: 'ANALYZING' })

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toEqual({ profileAvailable: false, debtAnalysisReady: true, financialAnalysisReady: false })
    })

    it('reports isStale:false when the stored source timestamps match the live ones exactly', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.masterProfile.findFirst.mockResolvedValue({
        status: 'COMPLETED',
        version: 1,
        generatedAt: new Date('2026-09-01'),
        sourceCreditReportCompletedAt: new Date('2026-09-01'),
        sourceBankStatementAnalysisId: 'bsa-1',
        sourceBankStatementCompletedAt: new Date('2026-08-31'),
        reconciliationRows: [],
        missingInformation: [],
      })
      prisma.creditReport.findUnique.mockResolvedValue({ completedAt: new Date('2026-09-01') })
      prisma.bankStatementAnalysis.findFirst.mockResolvedValue({ completedAt: new Date('2026-08-31') })
      prisma.analysisJob.findFirst.mockResolvedValue(null)

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toMatchObject({ profileAvailable: true, status: 'COMPLETED', isStale: false })
    })

    it('CRITICAL: reports isStale:true when the credit report has been reprocessed since this profile was generated', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.masterProfile.findFirst.mockResolvedValue({
        status: 'COMPLETED',
        version: 1,
        generatedAt: new Date('2026-09-01'),
        sourceCreditReportCompletedAt: new Date('2026-09-01'),
        sourceBankStatementAnalysisId: 'bsa-1',
        sourceBankStatementCompletedAt: new Date('2026-08-31'),
        reconciliationRows: [],
        missingInformation: [],
      })
      // A later reprocessing moved the live CreditReport.completedAt forward.
      prisma.creditReport.findUnique.mockResolvedValue({ completedAt: new Date('2026-09-15') })
      prisma.bankStatementAnalysis.findFirst.mockResolvedValue({ completedAt: new Date('2026-08-31') })
      prisma.analysisJob.findFirst.mockResolvedValue(null)

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toMatchObject({ isStale: true })
    })

    it('reports isStale:true when a CCR interaction was submitted after this profile was generated, and not when it was submitted before', async () => {
      const profile = {
        status: 'COMPLETED',
        version: 1,
        generatedAt: new Date('2026-10-22T10:00:00Z'),
        sourceCreditReportCompletedAt: new Date('2026-09-01'),
        sourceBankStatementCompletedAt: new Date('2026-08-31'),
        reconciliationRows: [],
        missingInformation: [],
      }
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.masterProfile.findFirst.mockResolvedValue(profile)
      prisma.creditReport.findUnique.mockResolvedValue({ completedAt: new Date('2026-09-01') })
      prisma.bankStatementAnalysis.findFirst.mockResolvedValue({ completedAt: new Date('2026-08-31') })
      prisma.analysisJob.findFirst.mockResolvedValue(null)

      prisma.ccrInteraction.findUnique.mockResolvedValue({ status: 'SUBMITTED', submittedAt: new Date('2026-10-22T11:00:00Z') })
      expect(await service.getForLead('BBS-LD-100001')).toMatchObject({ isStale: true })

      prisma.ccrInteraction.findUnique.mockResolvedValue({ status: 'SUBMITTED', submittedAt: new Date('2026-10-22T09:00:00Z') })
      expect(await service.getForLead('BBS-LD-100001')).toMatchObject({ isStale: false })
    })

    describe('AI synthesis status', () => {
      const profile = { status: 'COMPLETED', version: 4, generatedAt: new Date('2026-10-22T11:00:00Z'), sourceCreditReportCompletedAt: new Date('2026-09-01'), sourceBankStatementCompletedAt: new Date('2026-08-31'), reconciliationRows: [], missingInformation: [] }
      const arrange = (job: Record<string, unknown> | null) => {
        prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
        prisma.masterProfile.findFirst.mockResolvedValue(profile)
        prisma.creditReport.findUnique.mockResolvedValue({ completedAt: new Date('2026-09-01') })
        prisma.bankStatementAnalysis.findFirst.mockResolvedValue({ completedAt: new Date('2026-08-31') })
        prisma.analysisJob.findFirst.mockResolvedValue(job)
      }
      const aged = (ms: number) => new Date(Date.now() - ms)

      it('reports a freshly started job as RUNNING', async () => {
        arrange({ status: 'RUNNING', createdAt: new Date(Math.max(Date.now() - 5_000, profile.generatedAt.getTime())), startedAt: aged(4_000), result: null, errorMessage: null })
        const r = await service.getForLead('BBS-LD-100001')
        expect(r).toMatchObject({ insights: { status: 'RUNNING' } })
      })

      it('reports a job stuck RUNNING past the AI timeout as TIMED_OUT, not "running"', async () => {
        arrange({ status: 'RUNNING', createdAt: aged(10 * 60_000), startedAt: aged(10 * 60_000), result: null, errorMessage: null })
        const r = await service.getForLead('BBS-LD-100001')
        expect(r).toMatchObject({ insights: { status: 'TIMED_OUT' } })
      })

      it("passes a FAILED job's error message through", async () => {
        arrange({ status: 'FAILED', createdAt: aged(60_000), startedAt: aged(60_000), result: null, errorMessage: 'provider unreachable' })
        const r = await service.getForLead('BBS-LD-100001')
        expect(r).toMatchObject({ insights: { status: 'FAILED', errorMessage: 'provider unreachable' } })
      })

      const doneJob = (extra: Record<string, unknown>) => ({ status: 'COMPLETED', startedAt: null, result: { findings: { executiveProfile: 'X' }, confidence: 0.9, modelVersion: 'm', createdAt: new Date() }, errorMessage: null, ...extra })

      it("never presents an older profile version's synthesis as this version's", async () => {
        arrange(doneJob({ createdAt: new Date(), requestPayload: { profileVersion: 3 } }))
        const r = await service.getForLead('BBS-LD-100001')
        expect(r).toMatchObject({ insights: null })
      })

      it("presents this version's synthesis even when the database clock stamped it before the app clock stamped generatedAt", async () => {
        arrange(doneJob({ createdAt: new Date(profile.generatedAt.getTime() - 5_000), requestPayload: { profileVersion: 4 } }))
        const r = await service.getForLead('BBS-LD-100001')
        expect(r).toMatchObject({ insights: { status: 'COMPLETED' } })
      })

      it('treats a job from before versions were recorded as current', async () => {
        arrange(doneJob({ createdAt: new Date(), requestPayload: {} }))
        const r = await service.getForLead('BBS-LD-100001')
        expect(r).toMatchObject({ insights: { status: 'COMPLETED' } })
      })
    })

    it('surfaces a GENERATING/FAILED profile directly rather than treating it as COMPLETED', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.masterProfile.findFirst.mockResolvedValue({ status: 'FAILED', errorMessage: 'boom' })

      const result = await service.getForLead('BBS-LD-100001')

      expect(result).toEqual({ profileAvailable: true, status: 'FAILED', errorMessage: 'boom' })
    })
  })
})
