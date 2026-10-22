import { ApiProperty } from '@nestjs/swagger'
import { LeadSource } from '@prisma/client'
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator'

export class CreateLeadDto {
  @ApiProperty({ example: 'Ananya Rao' })
  @IsString()
  @MinLength(1)
  fullName!: string

  @ApiProperty({ example: '+91 90000 10001' })
  @IsString()
  @MinLength(5)
  phone!: string

  @ApiProperty({ example: 'ananya.rao@example.test' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: 'Bengaluru' })
  @IsString()
  @MinLength(1)
  city!: string

  @ApiProperty({ enum: LeadSource })
  @IsEnum(LeadSource)
  source!: LeadSource

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string
}
