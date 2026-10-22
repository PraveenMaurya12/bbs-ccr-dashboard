import { ApiProperty } from '@nestjs/swagger'
import { Equals, IsIn, IsString, Length, Matches, MinLength } from 'class-validator'

/** Mirrors the public Contact page's own zod schema field-for-field — see bade-bhaisab/src/pages/Contact.tsx. */
const HELP_CATEGORIES = [
  'loan_settlement',
  'high_emi',
  'credit_score',
  'recovery_pressure',
  'something_else',
] as const

export class SubmitLeadDto {
  @ApiProperty({ example: 'Ananya Rao' })
  @IsString()
  @MinLength(2)
  name!: string

  @ApiProperty({ example: '9000010001' })
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a valid 10-digit mobile number' })
  mobile!: string

  @ApiProperty({ example: 'ABCDE1234F', description: 'Never stored raw — hashed for duplicate detection only' })
  @Matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, { message: 'Enter a valid PAN' })
  pan!: string

  @ApiProperty({ enum: HELP_CATEGORIES })
  @IsIn(HELP_CATEGORIES)
  helpCategory!: (typeof HELP_CATEGORIES)[number]

  @ApiProperty({ example: 'I have three personal loans and need help consolidating repayments.' })
  @IsString()
  @Length(10, 200)
  situation!: string

  @ApiProperty({ example: true, description: 'Must be true — the visitor must have actually checked the consent box' })
  @Equals(true, { message: 'Consent is required' })
  consent!: boolean

  @ApiProperty({ description: 'The verificationToken returned by POST /public/contact/otp/verify' })
  @IsString()
  verificationToken!: string
}
