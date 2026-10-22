import { NotFoundException } from '@nestjs/common'

import { FinancialAnalysisService } from './financial-analysis.service'

describe('FinancialAnalysisService.getForLead', () => {
  let prisma: {
    lead: { findUnique: jest.Mock }
    bankStatementAnalysis: { findFirst: jest.Mock }
    analysisJob: { findFirst: jest.Mock }
  }
  let service: FinancialAnalysisService

  beforeEach(() => {
    prisma = {
      lead: { findUnique: jest.fn() },
      bankStatementAnalysis: { findFirst: jest.fn() },
      analysisJob: { findFirst: jest.fn() },
    }
    service = new FinancialAnalysisService(prisma as never, { get: () => ({}) } as never, {} as never)
  })

  it('throws NotFoundException for an unknown lead', async () => {
    prisma.lead.findUnique.mockResolvedValue(null)
    await expect(service.getForLead('BBS-LD-000000')).rejects.toThrow(NotFoundException)
  })

  it('reports reportAvailable:false when no BankStatementAnalysis row exists at all', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
    prisma.bankStatementAnalysis.findFirst.mockResolvedValue(null)

    const result = await service.getForLead('BBS-LD-100001')
    expect(result).toEqual({ reportAvailable: false })
  })

  it('surfaces an in-flight pipeline stage directly (not collapsed into one generic IN_PROGRESS)', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
    prisma.bankStatementAnalysis.findFirst.mockResolvedValue({ status: 'CLASSIFYING' })

    const result = await service.getForLead('BBS-LD-100001')
    expect(result).toEqual({ reportAvailable: true, status: 'CLASSIFYING' })
  })

  it('CRITICAL: passes a FAILED analysis\'s errorMessage/errorCode through completely unmodified when no earlier COMPLETED analysis exists', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
    prisma.bankStatementAnalysis.findFirst
      .mockResolvedValueOnce({
        status: 'FAILED',
        errorMessage: 'This PDF is password-protected and could not be opened.',
        errorCode: 'PDF_PASSWORD_PROTECTED',
        documentId: 'doc-1',
      })
      // The lookup for a prior COMPLETED analysis — none exists yet.
      .mockResolvedValueOnce(null)

    const result = await service.getForLead('BBS-LD-100001')
    expect(result).toEqual({
      reportAvailable: true,
      status: 'FAILED',
      errorMessage: 'This PDF is password-protected and could not be opened.',
      errorCode: 'PDF_PASSWORD_PROTECTED',
      documentId: 'doc-1',
    })
  })

  it('CRITICAL: never lets a FAILED newest upload shadow a genuinely COMPLETED earlier analysis — surfaces the failure alongside the last known-good report instead', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
    prisma.bankStatementAnalysis.findFirst
      .mockResolvedValueOnce({
        status: 'FAILED',
        errorMessage: 'This file is not a recognized bank statement format.',
        errorCode: 'UNRECOGNIZED_FORMAT',
        documentId: 'doc-2',
        createdAt: new Date('2026-06-01T10:00:00Z'),
      })
      .mockResolvedValueOnce({
        status: 'COMPLETED',
        bankName: 'Mock Bank',
        accountNumberMasked: 'XXXX1234',
        statementPeriodStart: new Date('2026-01-01'),
        statementPeriodEnd: new Date('2026-04-30'),
        transactionCount: 0,
        monthsCovered: 4,
        sourceFileFormat: 'CSV',
        extractionConfidence: 0.95,
        documentId: 'doc-1',
        completedAt: new Date('2026-05-01'),
        score: { totalScore: 80 },
        riskFlags: [],
        months: [],
        transactions: [],
      })
    prisma.analysisJob.findFirst.mockResolvedValue(null)

    const result = await service.getForLead('BBS-LD-100001')
    if (!result.reportAvailable || result.status !== 'COMPLETED') throw new Error('expected a COMPLETED result despite the newer FAILED row')

    // The last known-good (doc-1) report is still what's returned...
    expect(result.statement.documentId).toBe('doc-1')
    expect(result.score).toEqual({ totalScore: 80 })
    // ...but the newer failed attempt (doc-2) is never hidden.
    expect(result.latestUploadFailed).toEqual({
      documentId: 'doc-2',
      errorMessage: 'This file is not a recognized bank statement format.',
      errorCode: 'UNRECOGNIZED_FORMAT',
      uploadedAt: '2026-06-01T10:00:00.000Z',
    })
  })

  it('assembles a COMPLETED result from the persisted score/riskFlags/months/transactions, converting Decimal fields to plain numbers', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
    prisma.bankStatementAnalysis.findFirst.mockResolvedValue({
      status: 'COMPLETED',
      bankName: 'Mock Bank',
      accountNumberMasked: 'XXXX1234',
      statementPeriodStart: new Date('2026-01-01'),
      statementPeriodEnd: new Date('2026-04-30'),
      transactionCount: 2,
      monthsCovered: 4,
      sourceFileFormat: 'CSV',
      extractionConfidence: 0.95,
      documentId: 'doc-1',
      completedAt: new Date('2026-05-01'),
      score: { totalScore: 80 },
      riskFlags: [{ key: 'INCOME_STABLE' }],
      months: [
        {
          periodMonth: new Date('2026-01-01'),
          totalInflow: { toNumber: () => 65000 },
          totalOutflow: { toNumber: () => 36200 },
          netCashFlow: { toNumber: () => 28800 },
          normalizedIncome: { toNumber: () => 65000 },
          essentialExpenses: { toNumber: () => 16200 },
          financialExpenses: { toNumber: () => 17000 },
          discretionaryExpenses: { toNumber: () => 1450 },
          mandatoryDebtPayments: { toNumber: () => 12000 },
          creditCardPayments: { toNumber: () => 5000 },
          loanInflows: { toNumber: () => 0 },
          transferInflows: { toNumber: () => 0 },
          transferOutflows: { toNumber: () => 0 },
          cashWithdrawals: { toNumber: () => 3000 },
          cashDeposits: { toNumber: () => 0 },
          closingBalance: { toNumber: () => 565000 },
          minBalance: { toNumber: () => 527350 },
        },
      ],
      transactions: [{ amount: { toNumber: () => 50000 }, balance: { toNumber: () => 55000 }, narration: 'SALARY' }],
    })
    prisma.analysisJob.findFirst.mockResolvedValue(null)

    const result = await service.getForLead('BBS-LD-100001')
    if (!result.reportAvailable || result.status !== 'COMPLETED') throw new Error('expected a COMPLETED result')

    expect(result.statement.bankName).toBe('Mock Bank')
    expect(result.score).toEqual({ totalScore: 80 })
    expect(result.riskFlags).toEqual([{ key: 'INCOME_STABLE' }])
    expect(result.transactions[0].amount).toBe(50000)
    expect(result.transactions[0].balance).toBe(55000)
    // CRITICAL regression guard: a raw (unconverted) Decimal reaching the
    // frontend serializes to a STRING over JSON, and frontend code that
    // averages/sums these fields across months then does STRING
    // CONCATENATION instead of arithmetic, producing a wildly corrupted
    // currency figure — confirmed via a real browser check against the
    // canonical fixture. Every Decimal field on `months` must be a real number.
    expect(result.months[0].normalizedIncome).toBe(65000)
    expect(result.months[0].essentialExpenses).toBe(16200)
    expect(result.months[0].mandatoryDebtPayments).toBe(12000)
    expect(result.months[0].closingBalance).toBe(565000)
    expect(result.months[0].minBalance).toBe(527350)
    expect(typeof result.months[0].normalizedIncome).toBe('number')
    expect(result.insights).toBeNull()
  })
})
