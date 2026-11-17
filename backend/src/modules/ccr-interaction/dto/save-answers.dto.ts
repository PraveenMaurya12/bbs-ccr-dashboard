import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator'

export enum CcrResponseStatusDto {
  ANSWERED = 'ANSWERED',
  CUSTOMER_DECLINED = 'CUSTOMER_DECLINED',
  NOT_KNOWN = 'NOT_KNOWN',
}

export class CcrAnswerInputDto {
  @ApiProperty({ description: 'The questionKey returned by GET /leads/:id/ccr-interaction' })
  @IsString()
  @Matches(/^(L1|L2|MP)-[0-9a-f]{12}$/, { message: 'questionKey is not a valid question key' })
  questionKey!: string

  @ApiProperty({ enum: CcrResponseStatusDto })
  @IsEnum(CcrResponseStatusDto)
  responseStatus!: CcrResponseStatusDto

  @ApiProperty({ required: false, description: 'Free-text answer. Required for an ANSWERED TEXT question.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  answerText?: string

  @ApiProperty({ required: false, description: 'INR amount. Required for an ANSWERED AMOUNT question.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  answerAmount?: number

  @ApiProperty({ required: false, description: 'Required for an ANSWERED YES_NO question.' })
  @IsOptional()
  @IsBoolean()
  answerBoolean?: boolean
}

export class SaveCcrAnswersDto {
  @ApiProperty({ type: [CcrAnswerInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CcrAnswerInputDto)
  answers!: CcrAnswerInputDto[]
}
