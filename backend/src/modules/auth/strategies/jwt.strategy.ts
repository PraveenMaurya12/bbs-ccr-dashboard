import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { PrismaService } from '@/common/prisma/prisma.service'
import type { AppConfig } from '@/config/configuration'
import type { AuthenticatedUser, JwtPayload } from '../types/authenticated-user.type'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<AppConfig>('app')!.jwt.accessSecret,
    })
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is no longer active')
    }

    return { id: user.id, email: user.email, name: user.name, role: user.role }
  }
}
