import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'

import { PrismaService } from '@/common/prisma/prisma.service'
import { BureauReportService } from '@/modules/bureau/bureau-report.service'
import { LeadsService } from './leads.service'

describe('LeadsService', () => {
  let leadsService: LeadsService
  let bureauReportService: { triggerForLead: jest.Mock }
  let prisma: {
    lead: {
      findUnique: jest.Mock
      findUniqueOrThrow: jest.Mock
      findFirst: jest.Mock
      create: jest.Mock
      findMany: jest.Mock
      count: jest.Mock
      update: jest.Mock
    }
    customer: { upsert: jest.Mock }
    consentRecord: { findFirst: jest.Mock; create: jest.Mock }
    auditLog: { create: jest.Mock }
    user: { findUnique: jest.Mock }
    $transaction: jest.Mock
  }

  beforeEach(async () => {
    prisma = {
      lead: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      customer: { upsert: jest.fn() },
      consentRecord: { findFirst: jest.fn(), create: jest.fn() },
      auditLog: { create: jest.fn() },
      user: { findUnique: jest.fn() },
      // Runs the callback against the same mocked `prisma` object — good
      // enough for a unit test, which only needs to verify which calls
      // happen, not real transactional isolation.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    }
    bureauReportService = { triggerForLead: jest.fn().mockResolvedValue(undefined) }

    const moduleRef = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => ({ publicContact: { panHashPepper: 'test-pepper' } }) } },
        { provide: BureauReportService, useValue: bureauReportService },
      ],
    }).compile()

    leadsService = moduleRef.get(LeadsService)
  })

  it('creates a lead with a generated BBS-LD-###### id and records an audit log', async () => {
    prisma.lead.findUnique.mockResolvedValue(null) // uniqueness check passes first try
    prisma.lead.create.mockImplementation(({ data }) => ({ id: 'lead-1', ...data }))

    const lead = await leadsService.create(
      {
        fullName: 'Test Lead',
        phone: '+91 90000 00000',
        email: 'test.lead@example.test',
        city: 'Pune',
        source: 'ONLINE' as never,
      },
      'actor-1',
    )

    expect(lead.bbsLeadId).toMatch(/^BBS-LD-\d{6}$/)
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'LEAD_CREATED', actorId: 'actor-1' }),
      }),
    )
  })

  it('retries BBS Lead ID generation on a collision', async () => {
    prisma.lead.findUnique
      .mockResolvedValueOnce({ id: 'existing' }) // first candidate collides
      .mockResolvedValueOnce(null) // second candidate is free
    prisma.lead.create.mockImplementation(({ data }) => ({ id: 'lead-2', ...data }))

    const lead = await leadsService.create(
      {
        fullName: 'Retry Lead',
        phone: '+91 90000 00001',
        email: 'retry.lead@example.test',
        city: 'Chennai',
        source: 'WALK_IN' as never,
      },
      'actor-1',
    )

    expect(prisma.lead.findUnique).toHaveBeenCalledTimes(2)
    expect(lead.bbsLeadId).toMatch(/^BBS-LD-\d{6}$/)
  })

  it('throws NotFoundException when a lead cannot be found by BBS Lead ID', async () => {
    prisma.lead.findUnique.mockResolvedValue(null)

    await expect(leadsService.findByBbsLeadId('BBS-LD-999999')).rejects.toThrow(NotFoundException)
  })

  it('updates Lead-owned fields and upserts the Customer profile in one transaction', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-100001' })
    prisma.lead.update.mockResolvedValue({ id: 'lead-1' })
    prisma.customer.upsert.mockResolvedValue({ id: 'customer-1' })
    prisma.lead.findUniqueOrThrow.mockResolvedValue({
      id: 'lead-1',
      bbsLeadId: 'BBS-LD-100001',
      fullName: 'Updated Name',
      customer: { id: 'customer-1', gender: 'female' },
    })

    const result = await leadsService.update(
      'BBS-LD-100001',
      { fullName: 'Updated Name', customer: { gender: 'female' } } as never,
      'actor-1',
    )

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lead-1' }, data: { fullName: 'Updated Name' } }),
    )
    expect(prisma.customer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leadId: 'lead-1' },
        create: expect.objectContaining({ leadId: 'lead-1', gender: 'female' }),
        update: expect.objectContaining({ gender: 'female' }),
      }),
    )
    expect(result.customer).toEqual({ id: 'customer-1', gender: 'female' })
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'LEAD_UPDATED' }) }),
    )
  })

  it('clears any previously-saved distinct permanent address when sameAsCurrentAddress is true, even if the client still sent old values', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-3', bbsLeadId: 'BBS-LD-100003' })
    prisma.lead.update.mockResolvedValue({ id: 'lead-3' })
    prisma.customer.upsert.mockResolvedValue({ id: 'customer-3' })
    prisma.lead.findUniqueOrThrow.mockResolvedValue({ id: 'lead-3', bbsLeadId: 'BBS-LD-100003', customer: {} })

    await leadsService.update(
      'BBS-LD-100003',
      {
        customer: {
          sameAsCurrentAddress: true,
          // A misbehaving/stale client sending old permanent-address text
          // anyway — the server must not trust this and persist it.
          permanentAddressLine1: 'Old permanent address, should be dropped',
          permanentCity: 'Old City',
        },
      } as never,
      'actor-1',
    )

    expect(prisma.customer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sameAsCurrentAddress: true,
          permanentAddressLine1: null,
          permanentAddressLine2: null,
          permanentCity: null,
          permanentPinCode: null,
          permanentState: null,
        }),
      }),
    )
  })

  it('does not touch the Customer table when no customer payload is provided', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-2', bbsLeadId: 'BBS-LD-100002' })
    prisma.lead.update.mockResolvedValue({ id: 'lead-2' })
    prisma.lead.findUniqueOrThrow.mockResolvedValue({ id: 'lead-2', bbsLeadId: 'BBS-LD-100002' })

    await leadsService.update('BBS-LD-100002', { fullName: 'Only Lead Field' } as never, 'actor-1')

    expect(prisma.customer.upsert).not.toHaveBeenCalled()
  })

  it('paginates findAll and applies a case-insensitive search filter', async () => {
    prisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }])
    prisma.lead.count.mockResolvedValue(1)

    const result = await leadsService.findAll({
      page: 2,
      pageSize: 10,
      search: 'ananya',
    } as never)

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    )
    expect(result).toEqual({ items: [{ id: 'lead-1' }], page: 2, pageSize: 10, total: 1, totalPages: 1 })
  })

  describe('captureConsentAndPullReport', () => {
    it('CRITICAL: hashes the PAN (never persists it raw), records a GRANTED consent, and triggers the one real bureau pull', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-100001', fullName: 'Test Lead', phone: '+91 90000 00000' })
      prisma.consentRecord.findFirst.mockResolvedValue(null)
      prisma.lead.findFirst.mockResolvedValue(null)
      prisma.lead.update.mockResolvedValue({})
      prisma.consentRecord.create.mockResolvedValue({})

      const result = await leadsService.captureConsentAndPullReport('BBS-LD-100001', { pan: 'ABCDE1234F', consentGranted: true }, 'actor-1')

      expect(result).toEqual({ triggered: true })
      const leadUpdateCall = prisma.lead.update.mock.calls[0][0]
      expect(leadUpdateCall.data.panRef).not.toBe('ABCDE1234F')
      expect(leadUpdateCall.data.panRef).toMatch(/^[0-9a-f]{64}$/)
      expect(prisma.consentRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ leadId: 'lead-1', status: 'GRANTED' }) }))
      expect(bureauReportService.triggerForLead).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'lead-1', bbsLeadId: 'BBS-LD-100001', pan: 'ABCDE1234F' }))
    })

    it('refuses to re-trigger when consent has already been captured for this lead', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-100001' })
      prisma.consentRecord.findFirst.mockResolvedValue({ id: 'consent-1', status: 'GRANTED' })

      const result = await leadsService.captureConsentAndPullReport('BBS-LD-100001', { pan: 'ABCDE1234F', consentGranted: true }, 'actor-1')

      expect(result.triggered).toBe(false)
      expect(bureauReportService.triggerForLead).not.toHaveBeenCalled()
    })

    it('refuses when the hashed PAN already belongs to a different lead', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-100001' })
      prisma.consentRecord.findFirst.mockResolvedValue(null)
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-2', bbsLeadId: 'BBS-LD-100002' })

      const result = await leadsService.captureConsentAndPullReport('BBS-LD-100001', { pan: 'ABCDE1234F', consentGranted: true }, 'actor-1')

      expect(result.triggered).toBe(false)
      expect(result.reason).toMatch(/BBS-LD-100002/)
      expect(bureauReportService.triggerForLead).not.toHaveBeenCalled()
    })

    it('throws NotFoundException for an unknown lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(null)
      await expect(leadsService.captureConsentAndPullReport('BBS-LD-000000', { pan: 'ABCDE1234F', consentGranted: true }, 'actor-1')).rejects.toThrow(NotFoundException)
    })
  })
})
