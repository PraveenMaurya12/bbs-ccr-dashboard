import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength } from 'class-validator'

export class LoginDto {
  @ApiProperty({ example: 'ccr.dev@bbs.example.test' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: 'DevOnly-Passw0rd-2026' })
  @IsString()
  @MinLength(1)
  password!: string
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string
}
