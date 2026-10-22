import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import * as bcrypt from 'bcrypt'

import { PrismaService } from '@/common/prisma/prisma.service'
import { AuthService } from './auth.service'

describe('AuthService', () => {
  let authService: AuthService
  let prisma: {
    user: { findUnique: jest.Mock }
    refreshToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock }
    auditLog: { create: jest.Mock }
  }

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      refreshToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: () => ({
              jwt: {
                accessSecret: 'test-secret',
                accessTtl: '15m',
                refreshSecret: 'test-refresh-secret',
                refreshTtl: '7d',
              },
            }),
          },
        },
      ],
    }).compile()

    authService = moduleRef.get(AuthService)
  })

  it('rejects a login for an unknown email without revealing that the account does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null)

    await expect(authService.login('nobody@example.test', 'whatever')).rejects.toThrow(
      UnauthorizedException,
    )
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'LOGIN_FAILED' }) }),
    )
  })

  it('rejects a login with the wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4)
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'ccr@example.test',
      passwordHash,
      isActive: true,
      role: 'CCR',
      name: 'Test CCR',
    })

    await expect(authService.login('ccr@example.test', 'wrong-password')).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('issues an access + refresh token pair for valid credentials', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4)
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'ccr@example.test',
      passwordHash,
      isActive: true,
      role: 'CCR',
      name: 'Test CCR',
    })
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' })

    const result = await authService.login('ccr@example.test', 'correct-password')

    expect(result.accessToken).toBe('signed.jwt.token')
    expect(typeof result.refreshToken).toBe('string')
    expect(result.user).toEqual({
      id: 'user-1',
      email: 'ccr@example.test',
      name: 'Test CCR',
      role: 'CCR',
    })
    expect(prisma.refreshToken.create).toHaveBeenCalled()
  })

  it('rejects an inactive user even with the correct password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4)
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'ccr@example.test',
      passwordHash,
      isActive: false,
      role: 'CCR',
      name: 'Test CCR',
    })

    await expect(authService.login('ccr@example.test', 'correct-password')).rejects.toThrow(
      UnauthorizedException,
    )
  })
})
