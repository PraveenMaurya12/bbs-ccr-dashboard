import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsDateString, IsEmail, IsInt, IsOptional, IsString, Min } from 'class-validator'

/**
 * Everything on the Lead Details tab that lives on `Customer`, not `Lead`.
 * Every field is optional — a CCR may save just one section at a time, and
 * the service upserts a Customer row on first save rather than requiring
 * one to already exist (see LeadsService.update).
 */
export class UpdateCustomerProfileDto {
  // --- Personal information ---
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gender?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  maritalStatus?: string

  // --- Contact information ---
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  alternateMobile?: string

  // --- Employment and income ---
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  employmentType?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  companyName?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  designation?: string

  @ApiProperty({ required: false })
  @IsOptional()
  monthlySalary?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  officialEmail?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  workingExperienceYears?: number

  // --- Current address ---
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  addressLine1?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  addressLine2?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pinCode?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  state?: string

  // --- Permanent address ---
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  sameAsCurrentAddress?: boolean

  // Explicitly nullable (not just optional): the client sends `null` for
  // each of these when sameAsCurrentAddress is true, actively clearing any
  // previously-saved distinct permanent address (see LeadsService.update,
  // which also enforces this server-side regardless of what's sent here).
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  permanentAddressLine1?: string | null

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  permanentAddressLine2?: string | null

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  permanentCity?: string | null

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  permanentPinCode?: string | null

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  permanentState?: string | null
}
