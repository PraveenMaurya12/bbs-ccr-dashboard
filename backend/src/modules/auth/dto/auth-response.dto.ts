import { ApiProperty } from '@nestjs/swagger'
import type { Role } from '@prisma/client'

export class AuthUserDto {
  @ApiProperty() id!: string
  @ApiProperty() email!: string
  @ApiProperty() name!: string
  @ApiProperty({ enum: ['CCR', 'SUPERVISOR', 'ADMIN'] }) role!: Role
}

export class AuthResponseDto {
  @ApiProperty() accessToken!: string
  @ApiProperty() refreshToken!: string
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto
}
