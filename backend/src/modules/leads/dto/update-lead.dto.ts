import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEmail, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator'

import { UpdateCustomerProfileDto } from './update-customer-profile.dto'

/**
 * Only the fields a CCR is permitted to edit directly. Pipeline statuses,
 * assignment, and downstream assessment data are all changed through their
 * own dedicated endpoints/processes, never through a generic field-level PATCH.
 */
export class UpdateLeadDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(5)
  phone?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  city?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  helpCategory?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  situation?: string

  @ApiProperty({ required: false, type: UpdateCustomerProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCustomerProfileDto)
  customer?: UpdateCustomerProfileDto
}
