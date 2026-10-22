import { ApiProperty } from '@nestjs/swagger'
import { DocumentType } from '@prisma/client'
import { IsEnum } from 'class-validator'

/** The file itself arrives via multer (`@UploadedFile()`), not this DTO — see DocumentsController.upload. */
export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  documentType!: DocumentType
}
