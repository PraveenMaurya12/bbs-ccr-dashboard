import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'

import { PrismaService } from '@/common/prisma/prisma.service'
import { FinancialAnalysisService } from '@/modules/financial-analysis/financial-analysis.service'
import { DocumentsService } from './documents.service'
import { DOCUMENT_STORAGE_PROVIDER, type DocumentStorageProvider } from './storage/document-storage.interface'
import { issueViewTicket } from './view-ticket'

const TEST_VIEW_TICKET_SECRET = 'test-view-ticket-secret'

describe('DocumentsService', () => {
  let service: DocumentsService
  let storage: jest.Mocked<DocumentStorageProvider>
  let financialAnalysisService: { createAndRun: jest.Mock; reprocessFromBuffer: jest.Mock }
  let prisma: {
    lead: { findUnique: jest.Mock }
    documentMetadata: { findMany: jest.Mock; create: jest.Mock; findUnique: jest.Mock; update: jest.Mock }
    documentAccessLog: { create: jest.Mock }
    auditLog: { create: jest.Mock }
  }

  beforeEach(async () => {
    storage = { providerName: 'local', save: jest.fn(), read: jest.fn(), delete: jest.fn() }
    financialAnalysisService = { createAndRun: jest.fn().mockResolvedValue(undefined), reprocessFromBuffer: jest.fn() }
    prisma = {
      lead: { findUnique: jest.fn() },
      documentMetadata: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      documentAccessLog: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DOCUMENT_STORAGE_PROVIDER, useValue: storage },
        {
          provide: ConfigService,
          useValue: { get: () => ({ documents: { viewTicketSecret: TEST_VIEW_TICKET_SECRET } }) },
        },
        { provide: FinancialAnalysisService, useValue: financialAnalysisService },
      ],
    }).compile()

    service = moduleRef.get(DocumentsService)
  })

  describe('findByLead', () => {
    it('throws NotFoundException for an unknown lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(null)
      await expect(service.findByLead('BBS-LD-999999')).rejects.toThrow(NotFoundException)
    })

    it('lists documents scoped to that lead only', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.documentMetadata.findMany.mockResolvedValue([{ id: 'doc-1' }])

      const result = await service.findByLead('BBS-LD-100001')

      expect(prisma.documentMetadata.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { leadId: 'lead-1' } }),
      )
      expect(result).toEqual([{ id: 'doc-1' }])
    })
  })

  describe('upload', () => {
    it('rejects an empty file', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      const file = { buffer: Buffer.alloc(0), originalname: 'x.pdf', mimetype: 'application/pdf', size: 0 }

      await expect(service.upload('BBS-LD-100001', 'PAN_CARD' as never, file, 'actor-1')).rejects.toThrow(
        BadRequestException,
      )
      expect(storage.save).not.toHaveBeenCalled()
    })

    it('stores the file, creates a DocumentMetadata row, and records an audit log', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      storage.save.mockResolvedValue({ storageRef: 'lead-1/uuid-file.pdf', providerName: 'local' })
      prisma.documentMetadata.create.mockImplementation(({ data }) => ({ id: 'doc-1', ...data }))

      const file = {
        buffer: Buffer.from('pdf-bytes'),
        originalname: 'pan.pdf',
        mimetype: 'application/pdf',
        size: 9,
      }

      const result = await service.upload('BBS-LD-100001', 'PAN_CARD' as never, file, 'actor-1')

      expect(storage.save).toHaveBeenCalledWith(
        expect.objectContaining({ leadId: 'lead-1', suggestedFilename: 'pan.pdf' }),
      )
      expect(prisma.documentMetadata.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: 'lead-1',
            documentType: 'PAN_CARD',
            originalFilename: 'pan.pdf',
            storageRef: 'lead-1/uuid-file.pdf',
            uploadedById: 'actor-1',
          }),
        }),
      )
      expect(result.id).toBe('doc-1')
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'DOCUMENT_UPLOADED' }) }),
      )
    })

    it('never triggers financial analysis for a non-BANK_STATEMENT upload', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      storage.save.mockResolvedValue({ storageRef: 'ref', providerName: 'local' })
      prisma.documentMetadata.create.mockImplementation(({ data }) => ({ id: 'doc-1', ...data }))

      await service.upload('BBS-LD-100001', 'PAN_CARD' as never, { buffer: Buffer.from('x'), originalname: 'x.pdf', mimetype: 'application/pdf', size: 1 }, 'actor-1')

      expect(financialAnalysisService.createAndRun).not.toHaveBeenCalled()
    })

    it('triggers financial analysis (fire-and-forget) for a BANK_STATEMENT upload, passing the in-memory buffer directly', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      storage.save.mockResolvedValue({ storageRef: 'ref', providerName: 'local' })
      prisma.documentMetadata.create.mockImplementation(({ data }) => ({ id: 'doc-1', ...data }))
      const buffer = Buffer.from('csv-bytes')

      await service.upload('BBS-LD-100001', 'BANK_STATEMENT' as never, { buffer, originalname: 'statement.csv', mimetype: 'text/csv', size: 9 }, 'actor-1')

      expect(financialAnalysisService.createAndRun).toHaveBeenCalledWith({
        leadId: 'lead-1',
        bbsLeadId: 'BBS-LD-100001',
        documentId: 'doc-1',
        buffer,
        mimeType: 'text/csv',
      })
    })
  })

  describe('reprocessFinancialAnalysis', () => {
    it('reports reprocessed:false (never throws) for a non-BANK_STATEMENT document', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.documentMetadata.findUnique.mockResolvedValue({ id: 'doc-1', leadId: 'lead-1', documentType: 'PAN_CARD', storageRef: 'ref', mimeType: 'application/pdf' })

      const result = await service.reprocessFinancialAnalysis('BBS-LD-100001', 'doc-1')

      expect(result).toEqual({ reprocessed: false, reason: 'This document is not a bank statement.' })
      expect(storage.read).not.toHaveBeenCalled()
    })

    it('reads the stored bytes and delegates to FinancialAnalysisService.reprocessFromBuffer for a BANK_STATEMENT document', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.documentMetadata.findUnique.mockResolvedValue({ id: 'doc-1', leadId: 'lead-1', documentType: 'BANK_STATEMENT', storageRef: 'lead-1/stmt.csv', mimeType: 'text/csv' })
      storage.read.mockResolvedValue(Buffer.from('stored-bytes'))
      financialAnalysisService.reprocessFromBuffer.mockResolvedValue({ reprocessed: true })

      const result = await service.reprocessFinancialAnalysis('BBS-LD-100001', 'doc-1')

      expect(storage.read).toHaveBeenCalledWith('lead-1/stmt.csv')
      expect(financialAnalysisService.reprocessFromBuffer).toHaveBeenCalledWith('BBS-LD-100001', 'doc-1', Buffer.from('stored-bytes'), 'text/csv')
      expect(result).toEqual({ reprocessed: true })
    })
  })

  describe('readFile', () => {
    it('throws NotFoundException when the document belongs to a different lead', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.documentMetadata.findUnique.mockResolvedValue({ id: 'doc-1', leadId: 'some-other-lead' })

      await expect(service.readFile('BBS-LD-100001', 'doc-1', 'actor-1', '127.0.0.1')).rejects.toThrow(
        NotFoundException,
      )
      expect(storage.read).not.toHaveBeenCalled()
    })

    it('reads the file and logs a DocumentAccessLog VIEW entry', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.documentMetadata.findUnique.mockResolvedValue({
        id: 'doc-1',
        leadId: 'lead-1',
        storageRef: 'lead-1/uuid-file.pdf',
        mimeType: 'application/pdf',
        originalFilename: 'pan.pdf',
      })
      storage.read.mockResolvedValue(Buffer.from('bytes'))

      const result = await service.readFile('BBS-LD-100001', 'doc-1', 'actor-1', '127.0.0.1')

      expect(storage.read).toHaveBeenCalledWith('lead-1/uuid-file.pdf')
      expect(result.originalFilename).toBe('pan.pdf')
      expect(prisma.documentAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ documentId: 'doc-1', accessedByUserId: 'actor-1', action: 'VIEW' }),
        }),
      )
    })
  })

  describe('issueViewTicketFor + readFileByTicket', () => {
    it('issueViewTicketFor throws NotFoundException for a document belonging to a different lead', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.documentMetadata.findUnique.mockResolvedValue({ id: 'doc-1', leadId: 'some-other-lead' })

      await expect(service.issueViewTicketFor('BBS-LD-100001', 'doc-1', 'actor-1')).rejects.toThrow(
        NotFoundException,
      )
    })

    it('a ticket issued by issueViewTicketFor is accepted by readFileByTicket', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.documentMetadata.findUnique.mockResolvedValue({
        id: 'doc-1',
        leadId: 'lead-1',
        storageRef: 'lead-1/uuid-file.pdf',
        mimeType: 'application/pdf',
        originalFilename: 'pan.pdf',
      })
      storage.read.mockResolvedValue(Buffer.from('bytes'))

      const { token, expiresInSeconds } = await service.issueViewTicketFor('BBS-LD-100001', 'doc-1', 'actor-1')
      expect(expiresInSeconds).toBeGreaterThan(0)

      const result = await service.readFileByTicket('BBS-LD-100001', 'doc-1', token, '127.0.0.1')

      expect(result.originalFilename).toBe('pan.pdf')
      // Attributed to the ticket's own embedded user, not some anonymous/null actor.
      expect(prisma.documentAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ accessedByUserId: 'actor-1', action: 'VIEW' }) }),
      )
    })

    it('readFileByTicket rejects a forged/garbage token', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.documentMetadata.findUnique.mockResolvedValue({ id: 'doc-1', leadId: 'lead-1' })

      await expect(
        service.readFileByTicket('BBS-LD-100001', 'doc-1', 'forged-token', '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException)
      expect(storage.read).not.toHaveBeenCalled()
    })

    it('readFileByTicket rejects a genuine ticket issued for a different document', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.documentMetadata.findUnique.mockResolvedValue({ id: 'doc-1', leadId: 'lead-1' })
      const ticketForAnotherDoc = issueViewTicket(
        { documentId: 'some-other-doc', userId: 'actor-1' },
        TEST_VIEW_TICKET_SECRET,
      )

      await expect(
        service.readFileByTicket('BBS-LD-100001', 'doc-1', ticketForAnotherDoc, '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('verify', () => {
    it('throws NotFoundException when the document belongs to a different lead', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.documentMetadata.findUnique.mockResolvedValue({ id: 'doc-1', leadId: 'some-other-lead' })

      await expect(service.verify('BBS-LD-100001', 'doc-1', 'VERIFIED', 'actor-1')).rejects.toThrow(
        NotFoundException,
      )
      expect(prisma.documentMetadata.update).not.toHaveBeenCalled()
    })

    it('updates verification status/verifier/timestamp and records an audit log', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' })
      prisma.documentMetadata.findUnique.mockResolvedValue({ id: 'doc-1', leadId: 'lead-1' })
      prisma.documentMetadata.update.mockResolvedValue({ id: 'doc-1', verificationStatus: 'VERIFIED' })

      const result = await service.verify('BBS-LD-100001', 'doc-1', 'VERIFIED', 'actor-1')

      expect(prisma.documentMetadata.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-1' },
          data: expect.objectContaining({ verificationStatus: 'VERIFIED', verifiedById: 'actor-1' }),
        }),
      )
      expect(result.verificationStatus).toBe('VERIFIED')
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'DOCUMENT_VERIFIED' }) }),
      )
    })
  })
})
