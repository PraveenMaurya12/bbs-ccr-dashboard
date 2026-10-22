import { ApiPropertyOptional } from '@nestjs/swagger'
import { LeadSource, StageStatus } from '@prisma/client'
import { IsEnum, IsOptional, IsString } from 'class-validator'

import { PaginationQueryDto } from '@/common/dto/pagination.dto'

export class QueryLeadsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches against name, email, phone, or BBS Lead ID' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource

  @ApiPropertyOptional({ enum: StageStatus, description: 'Filters on level1Status' })
  @IsOptional()
  @IsEnum(StageStatus)
  level1Status?: StageStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedCcrId?: string
}
