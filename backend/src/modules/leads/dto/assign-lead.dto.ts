import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class AssignLeadDto {
  @ApiProperty({ description: 'User ID of the CCR to assign this lead to' })
  @IsString()
  ccrUserId!: string
}
