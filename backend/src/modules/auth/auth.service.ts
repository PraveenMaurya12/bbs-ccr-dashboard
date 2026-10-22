import { createHash, randomBytes } from 'node:crypto'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'

import { PrismaService } from '@/common/prisma/prisma.service'
import type { AppConfig } from '@/config/configuration'
import type { AuthResponseDto } from './dto/auth-response.dto'
import type { JwtPayload } from './types/authenticated-user.type'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const DURATION_UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
}

/** Parses simple durations like "15m", "7d" — the only formats this app's TTL config uses. */
function parseDurationMs(duration: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(duration.trim())
  if (!match) {
    throw new Error(`Unsupported duration format: "${duration}"`)
  }
  const [, amount, unit] = match
  return Number(amount) * DURATION_UNIT_MS[unit]
}

@Injectable()
export class AuthService {
  private readonly jwtConfig: AppConfig['jwt']

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.jwtConfig = configService.get<AppConfig>('app')!.jwt
  }

  async login(email: string, password: string, ipAddress?: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email } })

    // Same generic error whether the email doesn't exist or the password is
    // wrong — never reveal which one it was.
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      await this.prisma.auditLog.create({
        data: { action: 'LOGIN_FAILED', metadata: { email }, ipAddress },
      })
      throw new UnauthorizedException('Invalid email or password')
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role)

    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: 'LOGIN_SUCCESS', ipAddress },
    })

    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    }
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const tokenHash = hashToken(refreshToken)
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })

    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Refresh token is invalid or expired')
    }

    // Rotate: revoke the used token and issue a fresh pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    const { user } = stored
    const tokens = await this.issueTokens(user.id, user.email, user.role)

    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    }
  }

  private async issueTokens(userId: string, email: string, role: JwtPayload['role']) {
    const payload: JwtPayload = { sub: userId, email, role }

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.jwtConfig.accessSecret,
      // `expiresIn` is typed against a narrow string-literal union upstream;
      // ours comes from runtime config, so a plain `string` is intentional here.
      expiresIn: this.jwtConfig.accessTtl as never,
    })

    const refreshToken = randomBytes(48).toString('base64url')
    const expiresAt = new Date(Date.now() + parseDurationMs(this.jwtConfig.refreshTtl))

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hashToken(refreshToken), expiresAt },
    })

    return { accessToken, refreshToken }
  }
}
