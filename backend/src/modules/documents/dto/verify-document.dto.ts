import { ApiProperty } from '@nestjs/swagger'
import { IsIn } from 'class-validator'

/** PENDING is deliberately not a valid target here — verification only ever moves a document forward, never back to unreviewed via this endpoint. */
export class VerifyDocumentDto {
  @ApiProperty({ enum: ['VERIFIED', 'REJECTED'] })
  @IsIn(['VERIFIED', 'REJECTED'])
  status!: 'VERIFIED' | 'REJECTED'
}
