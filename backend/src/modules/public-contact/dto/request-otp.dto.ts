import { ApiProperty } from '@nestjs/swagger'
import { Matches } from 'class-validator'

export class RequestOtpDto {
  @ApiProperty({ example: '9000010001', description: '10-digit Indian mobile number, no country code' })
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a valid 10-digit mobile number' })
  mobile!: string
}
