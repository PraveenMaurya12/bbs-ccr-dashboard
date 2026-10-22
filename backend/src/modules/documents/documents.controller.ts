import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Public } from '@/common/decorators/public.decorator'
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type'
import { DocumentsService } from './documents.service'
import { UploadDocumentDto } from './dto/upload-document.dto'
import { VerifyDocumentDto } from './dto/verify-document.dto'

/** Only these formats are accepted for every document type — see DocumentsModule's Multer fileFilter, which enforces this same list. */
export const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

/**
 * BANK_STATEMENT uploads additionally accept spreadsheet/CSV exports — the
 * Financial Analysis module's parsers treat these as the robust, high-
 * confidence path (see modules/financial-analysis), vs. PDF which is
 * accepted everywhere but only ever best-effort for that module. Every
 * other document type keeps the plain `ALLOWED_DOCUMENT_MIME_TYPES` list
 * unchanged — this never widens what a PAN card/salary slip/etc. accepts.
 * Deliberately excludes legacy binary `.xls` (`application/vnd.ms-excel`)
 * for v1 — a known, narrow limitation, not an oversight.
 */
export const ADDITIONAL_BANK_STATEMENT_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/csv',
]

function sendDocumentFile(
  res: Response,
  file: { buffer: Buffer; mimeType: string; originalFilename: string },
) {
  res.setHeader('Content-Type', file.mimeType)
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalFilename)}"`)
  // Every response here carries a real customer document — never let an
  // intermediary cache or a browser's back/forward cache retain it.
  res.setHeader('Cache-Control', 'no-store')
  res.send(file.buffer)
}

@ApiTags('documents')
@ApiBearerAuth()
@Controller('leads/:bbsLeadId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: "List a lead's uploaded documents" })
  findByLead(@Param('bbsLeadId') bbsLeadId: string) {
    return this.documentsService.findByLead(bbsLeadId)
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document for a lead' })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('bbsLeadId') bbsLeadId: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('No file was uploaded')
    }
    const allowedForThisType =
      dto.documentType === 'BANK_STATEMENT'
        ? [...ALLOWED_DOCUMENT_MIME_TYPES, ...ADDITIONAL_BANK_STATEMENT_MIME_TYPES]
        : ALLOWED_DOCUMENT_MIME_TYPES
    if (!allowedForThisType.includes(file.mimetype)) {
      throw new BadRequestException(
        dto.documentType === 'BANK_STATEMENT'
          ? `Unsupported file type "${file.mimetype}" — only PDF, JPEG, PNG, XLSX, and CSV are accepted for a bank statement`
          : `Unsupported file type "${file.mimetype}" — only PDF, JPEG, and PNG are accepted`,
      )
    }
    return this.documentsService.upload(bbsLeadId, dto.documentType, file, user.id)
  }

  @Get(':documentId/file')
  @ApiOperation({ summary: "Stream a document's file bytes (authenticated, ownership-checked)" })
  async getFile(
    @Param('bbsLeadId') bbsLeadId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
    @Res() res: Response,
  ) {
    const file = await this.documentsService.readFile(bbsLeadId, documentId, user.id, ip)
    sendDocumentFile(res, file)
  }

  @Post(':documentId/view-ticket')
  @ApiOperation({
    summary:
      'Mint a ~5-minute, single-document ticket for the "view" endpoint below — needed because a plain ' +
      '<a target="_blank">/window.open() navigation cannot carry a Bearer header, and (per a Chrome ' +
      'security restriction) a different tab cannot be navigated to a blob: URL created in this one.',
  })
  issueViewTicket(
    @Param('bbsLeadId') bbsLeadId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.issueViewTicketFor(bbsLeadId, documentId, user.id)
  }

  @Get(':documentId/view')
  @Public()
  @ApiOperation({ summary: 'Stream a document\'s file bytes, authorized by a view-ticket instead of a Bearer JWT' })
  async viewByTicket(
    @Param('bbsLeadId') bbsLeadId: string,
    @Param('documentId') documentId: string,
    @Query('token') token: string | undefined,
    @Ip() ip: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException('A view token is required')
    }
    const file = await this.documentsService.readFileByTicket(bbsLeadId, documentId, token, ip)
    sendDocumentFile(res, file)
  }

  @Patch(':documentId/verify')
  @ApiOperation({ summary: 'Mark a document VERIFIED or REJECTED' })
  verify(
    @Param('bbsLeadId') bbsLeadId: string,
    @Param('documentId') documentId: string,
    @Body() dto: VerifyDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.verify(bbsLeadId, documentId, dto.status, user.id)
  }

  @Post(':documentId/reprocess-financial-analysis')
  @ApiOperation({
    summary:
      "Re-runs the Financial Analysis pipeline against this BANK_STATEMENT document's already-stored bytes — " +
      'NEVER re-uploads or re-reads a new file. Reports { reprocessed: false, reason } when the document is not ' +
      'a bank statement or no financial-analysis record exists for it yet.',
  })
  reprocessFinancialAnalysis(@Param('bbsLeadId') bbsLeadId: string, @Param('documentId') documentId: string) {
    return this.documentsService.reprocessFinancialAnalysis(bbsLeadId, documentId)
  }
}
