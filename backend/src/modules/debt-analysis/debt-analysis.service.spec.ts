import { NotFoundException } from '@nestjs/common'

import { PrismaService } from '@/common/prisma/prisma.service'
import { DebtAnalysisService } from './debt-analysis.service'

describe('DebtAnalysisService.getCallBriefForLead — §18.1 CCR Brief fixed template', () => {
  let prisma: {
    lead: { findUnique: jest.Mock }
    creditReport: { findUnique: jest.Mock }
    analysisJob: { findFirst: jest.Mock }
    customer: { findUnique: jest.Mock }
  }
  let service: DebtAnalysisService

  beforeEach(() => {
    prisma = {
      lead: { findUnique: jest.fn() },
      creditReport: { findUnique: jest.fn() },
      analysisJob: { findFirst: jest.fn() },
      customer: { findUnique: jest.fn().mockResolvedValue(null) },
    }
    service = new DebtAnalysisService(prisma as unknown as PrismaService)
  })

  const decimal = (n: number) => ({ toNumber: () => n })

  it('builds the header block from real lead/report fields, never a fabricated contact detail', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-111111', fullName: 'Ananya Rao', phone: '+91 9000010001', email: 'ananya@example.com' })
    prisma.creditReport.findUnique.mockResolvedValue({
      processingStatus: 'COMPLETED',
      bureau: 'Signzy Experian Lite',
      pulledAt: new Date('2026-10-01'),
      creditScore: 748,
      scoreBand: 'good',
      totalActiveAccounts: 1,
      totalOutstandingBalance: decimal(500000),
      delinquentAccounts: 0,
      willfulDefaultFlag: null,
      documentId: null,
      accounts: [
        {
          accountType: 'Personal Loan',
          lender: 'Bajaj Finance',
          openedOn: new Date('2026-08-12'),
          sanctionedAmount: decimal(500000),
          currentBalance: decimal(500000),
          paymentStatus: 'REGULAR',
          overdueAmount: decimal(0),
          currentDpdDays: 0,
          maxDpdDays: 0,
          monthlyEmiAmount: null,
          creditLimit: null,
          isSecured: false,
          lifecycleStatus: 'ACTIVE',
          closedOn: null,
          paymentHistoryGrid: null,
        },
      ],
      enquiries: [],
    })
    prisma.analysisJob.findFirst.mockResolvedValue(null)

    const brief = await service.getCallBriefForLead('BBS-LD-111111')
    if (!brief.reportAvailable || brief.status !== 'COMPLETED') throw new Error('expected a COMPLETED brief')

    expect(brief.header.customerName).toBe('Ananya Rao')
    expect(brief.header.mobile).toBe('+91 9000010001')
    expect(brief.header.email).toBe('ananya@example.com')
    expect(brief.header.score).toBe(748)

    // The real blank-EMI active account must appear in accounts-needing-validation.
    expect(brief.accountsNeedingValidation).toEqual(
      expect.arrayContaining([expect.objectContaining({ lender: 'Bajaj Finance', issue: 'EMI blank' })]),
    )

    // Discovery agenda must name the real top lender from this lead's own data, never a generic placeholder.
    expect(brief.discoveryAgenda.some((q) => q.includes('Bajaj Finance'))).toBe(true)
  })

  it('flags a high-utilisation card AND a written-off/settled account in accountsNeedingValidation, independently of the EMI-blank path', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-2', bbsLeadId: 'BBS-LD-222222', fullName: 'Rohan Shah', phone: '+91 9000020002', email: null })
    prisma.creditReport.findUnique.mockResolvedValue({
      processingStatus: 'COMPLETED',
      bureau: 'Signzy Experian Lite',
      pulledAt: new Date('2026-10-01'),
      creditScore: 700,
      scoreBand: 'fair',
      totalActiveAccounts: 2,
      totalOutstandingBalance: decimal(90000),
      delinquentAccounts: 0,
      willfulDefaultFlag: null,
      documentId: null,
      accounts: [
        {
          accountType: 'Credit Card',
          lender: 'HDFC Bank',
          openedOn: new Date('2020-01-01'),
          sanctionedAmount: decimal(50000),
          currentBalance: decimal(45000),
          paymentStatus: 'REGULAR',
          overdueAmount: decimal(0),
          currentDpdDays: 0,
          maxDpdDays: 0,
          monthlyEmiAmount: null,
          creditLimit: decimal(50000),
          isSecured: false,
          lifecycleStatus: 'ACTIVE',
          closedOn: null,
          paymentHistoryGrid: null,
        },
        {
          accountType: 'Personal Loan',
          lender: 'Old Lender',
          openedOn: new Date('2019-01-01'),
          sanctionedAmount: decimal(40000),
          currentBalance: decimal(0),
          paymentStatus: 'WRITTEN_OFF',
          overdueAmount: decimal(0),
          currentDpdDays: null,
          maxDpdDays: 90,
          monthlyEmiAmount: decimal(2000),
          creditLimit: null,
          isSecured: false,
          lifecycleStatus: 'WRITTEN_OFF',
          closedOn: new Date('2021-01-01'),
          paymentHistoryGrid: null,
        },
      ],
      enquiries: [],
    })
    prisma.analysisJob.findFirst.mockResolvedValue(null)

    const brief = await service.getCallBriefForLead('BBS-LD-222222')
    if (!brief.reportAvailable || brief.status !== 'COMPLETED') throw new Error('expected a COMPLETED brief')

    expect(brief.accountsNeedingValidation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lender: 'HDFC Bank', issue: '90% utilisation' }),
        expect.objectContaining({ lender: 'Multiple', issue: '1 written-off, 0 settled' }),
      ]),
    )
  })

  it('never crashes on malformed AI findings (e.g. primaryConcerns is not an array) — degrades to empty lists, not a thrown error', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-3', bbsLeadId: 'BBS-LD-333333', fullName: 'Malformed Findings', phone: '+91 9000030003', email: null })
    prisma.creditReport.findUnique.mockResolvedValue({
      processingStatus: 'COMPLETED',
      bureau: 'Signzy Experian Lite',
      pulledAt: new Date('2026-10-01'),
      creditScore: 720,
      scoreBand: 'good',
      totalActiveAccounts: 1,
      totalOutstandingBalance: decimal(10000),
      delinquentAccounts: 0,
      willfulDefaultFlag: null,
      documentId: null,
      accounts: [],
      enquiries: [],
    })
    prisma.analysisJob.findFirst.mockResolvedValue({
      status: 'COMPLETED',
      result: {
        findings: { executiveSummary: 'ok', currentPosition: 123, primaryConcerns: 'not-an-array', secondaryConcerns: null, dataGaps: ['real gap', 42], actionPlan: { verify: 'also-not-an-array' } },
        confidence: null,
        modelVersion: 'test-model',
        createdAt: new Date('2026-10-01'),
      },
    })

    const brief = await service.getCallBriefForLead('BBS-LD-333333')
    if (!brief.reportAvailable || brief.status !== 'COMPLETED') throw new Error('expected a COMPLETED brief')

    expect(brief.keyQuestionsForCcr).toEqual([])
    expect(brief.dataGaps).toEqual(expect.arrayContaining(['real gap']))
    expect(brief.dataGaps).not.toContain(42)
    expect(brief.aiObservations?.summary).toBe('ok')
    expect(brief.aiObservations?.keyObservations).toEqual([])
    expect(brief.aiObservations?.concerns).toEqual([])
  })
})

describe('DebtAnalysisService.getForLead', () => {
  let prisma: {
    lead: { findUnique: jest.Mock }
    creditReport: { findUnique: jest.Mock }
    analysisJob: { findFirst: jest.Mock }
    customer: { findUnique: jest.Mock }
  }
  let service: DebtAnalysisService

  beforeEach(() => {
    prisma = {
      lead: { findUnique: jest.fn() },
      creditReport: { findUnique: jest.fn() },
      analysisJob: { findFirst: jest.fn() },
      customer: { findUnique: jest.fn().mockResolvedValue(null) },
    }
    service = new DebtAnalysisService(prisma as unknown as PrismaService)
  })

  it('throws NotFoundException for an unknown lead', async () => {
    prisma.lead.findUnique.mockResolvedValue(null)
    await expect(service.getForLead('BBS-LD-000000')).rejects.toThrow(NotFoundException)
  })

  it('reports reportAvailable:false when no CreditReport row exists at all', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-111111' })
    prisma.creditReport.findUnique.mockResolvedValue(null)

    const result = await service.getForLead('BBS-LD-111111')
    expect(result).toEqual({ reportAvailable: false })
  })

  it('CRITICAL: passes a FAILED report\'s errorMessage through to the API response completely unmodified — proving the propagation path from BureauReportService.applyFailure to GET /debt-analysis loses nothing', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-111111' })
    const sanitizedMessage =
      'Signzy Experian Lite responded with HTTP 400 (code=TEST_VALIDATION_ERROR message="Test validation failure" field=consentTimestamp)'
    prisma.creditReport.findUnique.mockResolvedValue({
      processingStatus: 'FAILED',
      errorMessage: sanitizedMessage,
    })

    const result = await service.getForLead('BBS-LD-111111')

    expect(result).toEqual({ reportAvailable: true, status: 'FAILED', errorMessage: sanitizedMessage })
  })

  it('reports IN_PROGRESS without needing a full report row', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-111111' })
    prisma.creditReport.findUnique.mockResolvedValue({ processingStatus: 'IN_PROGRESS' })

    const result = await service.getForLead('BBS-LD-111111')
    expect(result).toEqual({ reportAvailable: true, status: 'IN_PROGRESS' })
  })

  it('reports NO_RECORD as a terminal, non-error status', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-111111' })
    prisma.creditReport.findUnique.mockResolvedValue({ processingStatus: 'NO_RECORD' })

    const result = await service.getForLead('BBS-LD-111111')
    expect(result).toEqual({ reportAvailable: true, status: 'NO_RECORD' })
  })

  it('passes a REQUIRES_REVIEW report\'s errorMessage through unmodified too, and never exposes rawResponse', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-111111' })
    prisma.creditReport.findUnique.mockResolvedValue({
      processingStatus: 'REQUIRES_REVIEW',
      errorMessage: 'unrecognized response shape',
      rawResponse: '<this must never appear in the API response>',
    })

    const result = await service.getForLead('BBS-LD-111111')

    expect(result).toEqual({ reportAvailable: true, status: 'REQUIRES_REVIEW', errorMessage: 'unrecognized response shape' })
    expect(JSON.stringify(result)).not.toContain('this must never appear')
  })

  it('CRITICAL: wires a real Customer.monthlySalary into debtServiceRatio/debtToIncome on a COMPLETED report — never left NOT_REPORTED when income is actually on file', async () => {
    const decimal = (n: number) => ({ toNumber: () => n })
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-111111' })
    prisma.creditReport.findUnique.mockResolvedValue({
      processingStatus: 'COMPLETED',
      bureau: 'Experian',
      pulledAt: new Date('2026-09-01'),
      creditScore: 700,
      scoreBand: 'good',
      totalActiveAccounts: 1,
      totalOutstandingBalance: decimal(100000),
      delinquentAccounts: 0,
      willfulDefaultFlag: null,
      documentId: null,
      accounts: [
        {
          accountType: 'Personal Loan',
          lender: 'Bank A',
          openedOn: new Date('2024-01-01'),
          sanctionedAmount: decimal(100000),
          currentBalance: decimal(100000),
          paymentStatus: 'REGULAR',
          overdueAmount: decimal(0),
          currentDpdDays: null,
          maxDpdDays: null,
          monthlyEmiAmount: decimal(10000),
          creditLimit: null,
          isSecured: null,
          lifecycleStatus: null,
          paymentHistoryGrid: null,
        },
      ],
      enquiries: [],
    })
    prisma.analysisJob.findFirst.mockResolvedValue(null)
    prisma.customer.findUnique.mockResolvedValue({ monthlySalary: decimal(50000) })

    const result = await service.getForLead('BBS-LD-111111')

    expect(prisma.customer.findUnique).toHaveBeenCalledWith({ where: { leadId: 'lead-1' } })
    if (!result.reportAvailable || result.status !== 'COMPLETED') throw new Error('expected a COMPLETED result')
    expect(result.debtServiceRatio).toEqual({ availability: 'AVAILABLE', monthlyEmi: 10000, monthlyIncome: 50000, debtServiceRatioPercent: 20 })
    expect(result.debtToIncome.availability).toBe('AVAILABLE')
  })

  it('CRITICAL: forwards the additive scoreStructureDivergence field into the real API response for a COMPLETED report — a frontend crash was caused once by this field silently not reaching the served response', async () => {
    const decimal = (n: number) => ({ toNumber: () => n })
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-111111' })
    prisma.creditReport.findUnique.mockResolvedValue({
      processingStatus: 'COMPLETED',
      bureau: 'Experian',
      pulledAt: new Date('2026-09-01'),
      creditScore: 700,
      scoreBand: 'good',
      totalActiveAccounts: 0,
      totalOutstandingBalance: decimal(0),
      delinquentAccounts: 0,
      willfulDefaultFlag: null,
      documentId: null,
      accounts: [],
      enquiries: [],
    })
    prisma.analysisJob.findFirst.mockResolvedValue(null)
    prisma.customer.findUnique.mockResolvedValue(null)

    const result = await service.getForLead('BBS-LD-111111')

    if (!result.reportAvailable || result.status !== 'COMPLETED') throw new Error('expected a COMPLETED result')
    expect(result.scoreStructureDivergence).toBeDefined()
    expect(result.scoreStructureDivergence).toHaveProperty('available')
  })

  it('falls back to NOT_REPORTED (never a fabricated 0 income) when no Customer row exists for the lead', async () => {
    const decimal = (n: number) => ({ toNumber: () => n })
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-111111' })
    prisma.creditReport.findUnique.mockResolvedValue({
      processingStatus: 'COMPLETED',
      bureau: 'Experian',
      pulledAt: new Date('2026-09-01'),
      creditScore: 700,
      scoreBand: 'good',
      totalActiveAccounts: 0,
      totalOutstandingBalance: decimal(0),
      delinquentAccounts: 0,
      willfulDefaultFlag: null,
      documentId: null,
      accounts: [],
      enquiries: [],
    })
    prisma.analysisJob.findFirst.mockResolvedValue(null)
    prisma.customer.findUnique.mockResolvedValue(null)

    const result = await service.getForLead('BBS-LD-111111')
    if (!result.reportAvailable || result.status !== 'COMPLETED') throw new Error('expected a COMPLETED result')
    expect(result.debtServiceRatio.availability).toBe('NOT_REPORTED')
  })
})
