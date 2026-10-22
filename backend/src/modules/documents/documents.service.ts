import { createHash } from 'node:crypto'
import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { PrismaService } from '@/common/prisma/prisma.service'
import type { AppConfig } from '@/config/configuration'
import { FinancialAnalysisService } from '@/modules/financial-analysis/financial-analysis.service'
import type { DocumentType } from '@prisma/client'
import { DOCUMENT_STORAGE_PROVIDER, type DocumentStorageProvider } from './storage/document-storage.interface'
import { issueViewTicket, verifyViewTicket } from './view-ticket'

const SELECT_FOR_LIST = {
  id: true,
  documentType: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  verificationStatus: true,
  verifiedAt: true,
  uploadedAt: true,
  uploadedBy: { select: { id: true, name: true } },
  verifiedBy: { select: { id: true, name: true } },
} as const

@Injectable()
export class DocumentsService {
  private readonly viewTicketSecret: string

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE_PROVIDER) private readonly storage: DocumentStorageProvider,
    configService: ConfigService,
    private readonly financialAnalysisService: FinancialAnalysisService,
  ) {
    this.viewTicketSecret = configService.get<AppConfig>('app')!.documents.viewTicketSecret
  }

  private async findLeadOrThrow(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) {
      throw new NotFoundException(`Lead ${bbsLeadId} was not found`)
    }
    return lead
  }

  private async findLeadDocumentOrThrow(bbsLeadId: string, documentId: string) {
    const lead = await this.findLeadOrThrow(bbsLeadId)
    const document = await this.prisma.documentMetadata.findUnique({ where: { id: documentId } })
    if (!document || document.leadId !== lead.id) {
      // Same 404 whether the document doesn't exist or belongs to a
      // different lead — never confirms/denies existence of another lead's document.
      throw new NotFoundException(`Document ${documentId} was not found for lead ${bbsLeadId}`)
    }
    return document
  }

  async findByLead(bbsLeadId: string) {
    const lead = await this.findLeadOrThrow(bbsLeadId)
    return this.prisma.documentMetadata.findMany({
      where: { leadId: lead.id },
      orderBy: { uploadedAt: 'desc' },
      select: SELECT_FOR_LIST,
    })
  }

  async upload(
    bbsLeadId: string,
    documentType: DocumentType,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    actorId: string,
  ) {
    const lead = await this.findLeadOrThrow(bbsLeadId)

    if (file.size === 0) {
      throw new BadRequestException('Uploaded file is empty')
    }

    const checksum = createHash('sha256').update(file.buffer).digest('hex')

    // Uploading another file for the same checklist slot never deletes or
    // overwrites the previous row — every upload is its own record, so nothing
    // is silently lost even if a visitor/CCR uploads several revisions.
    const stored = await this.storage.save({
      leadId: lead.id,
      buffer: file.buffer,
      suggestedFilename: file.originalname,
    })

    const document = await this.prisma.documentMetadata.create({
      data: {
        leadId: lead.id,
        documentType,
        originalFilename: file.originalname,
        storageProvider: stored.providerName,
        storageRef: stored.storageRef,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        checksum,
        uploadedById: actorId,
      },
      select: SELECT_FOR_LIST,
    })

    await this.prisma.auditLog.create({
      data: {
        actorId,
        leadId: lead.id,
        action: 'DOCUMENT_UPLOADED',
        entityType: 'DocumentMetadata',
        entityId: document.id,
        metadata: { documentType, mimeType: file.mimetype, sizeBytes: file.size },
      },
    })

    if (documentType === 'BANK_STATEMENT') {
      // Awaited — but only up to its own internal reserve-row creation;
      // createAndRun() itself kicks the actual (slow) parse/classify/score
      // pipeline off fire-and-forget internally and resolves right after.
      // This is NOT the same as awaiting full processing: it costs one fast
      // insert's worth of latency, in exchange for guaranteeing the
      // BankStatementAnalysis row already exists by the time this response
      // reaches the frontend. Without this, the frontend's upload-success
      // handler can invalidate and refetch the Financial Analysis query
      // before the row exists, observe `reportAvailable: false`, and — since
      // that query's refetchInterval stops polling entirely on that reply —
      // get permanently stuck showing "no financial analysis yet" despite
      // real processing happening moments later. createAndRun() never
      // throws (same contract as BureauReportService.triggerForLead), so
      // this can never fail the upload response itself.
      await this.financialAnalysisService.createAndRun({
        leadId: lead.id,
        bbsLeadId,
        documentId: document.id,
        buffer: file.buffer,
        mimeType: file.mimetype,
      })
    }

    return document
  }

  /** Re-runs the Financial Analysis pipeline against an already-uploaded BANK_STATEMENT document's stored bytes — NEVER re-uploads or re-reads a new file. */
  async reprocessFinancialAnalysis(bbsLeadId: string, documentId: string): Promise<{ reprocessed: boolean; reason?: string }> {
    const document = await this.findLeadDocumentOrThrow(bbsLeadId, documentId)
    if (document.documentType !== 'BANK_STATEMENT') {
      return { reprocessed: false, reason: 'This document is not a bank statement.' }
    }
    const buffer = await this.storage.read(document.storageRef)
    return this.financialAnalysisService.reprocessFromBuffer(bbsLeadId, documentId, buffer, document.mimeType)
  }

  /** Resolves + authorizes a document read — the file's bytes are only ever handed back through this (or readFileByTicket below). */
  async readFile(bbsLeadId: string, documentId: string, actorId: string, ipAddress: string | undefined) {
    const document = await this.findLeadDocumentOrThrow(bbsLeadId, documentId)
    const buffer = await this.storage.read(document.storageRef)

    await this.prisma.documentAccessLog.create({
      data: {
        documentId: document.id,
        accessedByUserId: actorId,
        action: 'VIEW',
        ipAddress,
      },
    })

    return { buffer, mimeType: document.mimeType, originalFilename: document.originalFilename }
  }

  /**
   * Mints a ~5-minute ticket for one specific document — the authenticated
   * step. Requires the normal JWT (this endpoint is not @Public()); ticket
   * possession alone is what authorizes the subsequent, unauthenticated
   * browser navigation in readFileByTicket. The frontend prefetches these
   * for every visible document as soon as the list loads (rather than only
   * on click) specifically so the eventual window.open() call has no async
   * work ahead of it — see view-ticket.ts's TTL comment for why that matters.
   */
  async issueViewTicketFor(bbsLeadId: string, documentId: string, actorId: string) {
    const document = await this.findLeadDocumentOrThrow(bbsLeadId, documentId)
    const token = issueViewTicket({ documentId: document.id, userId: actorId }, this.viewTicketSecret)
    return { token, expiresInSeconds: 300 }
  }

  /** The @Public() counterpart to readFile — authorized by ticket possession instead of a Bearer JWT. */
  async readFileByTicket(bbsLeadId: string, documentId: string, token: string, ipAddress: string | undefined) {
    const document = await this.findLeadDocumentOrThrow(bbsLeadId, documentId)

    const payload = verifyViewTicket(token, documentId, this.viewTicketSecret)
    if (!payload) {
      throw new UnauthorizedException('This view link is invalid or has expired')
    }

    const buffer = await this.storage.read(document.storageRef)

    await this.prisma.documentAccessLog.create({
      data: {
        documentId: document.id,
        accessedByUserId: payload.userId,
        action: 'VIEW',
        ipAddress,
      },
    })

    return { buffer, mimeType: document.mimeType, originalFilename: document.originalFilename }
  }

  async verify(bbsLeadId: string, documentId: string, status: 'VERIFIED' | 'REJECTED', actorId: string) {
    const document = await this.findLeadDocumentOrThrow(bbsLeadId, documentId)

    const updated = await this.prisma.documentMetadata.update({
      where: { id: document.id },
      data: { verificationStatus: status, verifiedById: actorId, verifiedAt: new Date() },
      select: SELECT_FOR_LIST,
    })

    await this.prisma.auditLog.create({
      data: {
        actorId,
        leadId: document.leadId,
        action: status === 'VERIFIED' ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
        entityType: 'DocumentMetadata',
        entityId: document.id,
      },
    })

    return updated
  }
}
