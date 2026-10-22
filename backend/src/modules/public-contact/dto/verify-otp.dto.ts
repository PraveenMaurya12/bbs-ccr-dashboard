import { ApiProperty } from '@nestjs/swagger'
import { Length, Matches } from 'class-validator'

export class VerifyOtpDto {
  @ApiProperty({ example: '9000010001' })
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a valid 10-digit mobile number' })
  mobile!: string

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  @Length(6, 6)
  code!: string
}
