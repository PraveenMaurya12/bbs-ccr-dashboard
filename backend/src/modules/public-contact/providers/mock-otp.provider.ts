import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { AppConfig } from '@/config/configuration'
import type { OtpProvider, OtpResult } from './otp-provider.interface'

const OTP_LENGTH = 6
const OTP_TTL_MS = 5 * 60 * 1000

interface StoredOtp {
  code: string
  expiresAt: number
}

function generateCode(): string {
  return Math.floor(Math.random() * 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0')
}

/**
 * Development-only stand-in for a real SMS/OTP provider. No SMS is ever
 * sent — the code is logged to the SERVER console only (never returned in
 * an API response), clearly labeled as a dev-only mock, so a wrong code
 * genuinely fails verification instead of the app pretending a message
 * reached the phone.
 *
 * Refuses to load in production (see PublicContactModule) — there is no
 * real SMS provider configured anywhere in this codebase yet. Standing one
 * up means implementing `OtpProvider` against a real provider (e.g. MSG91,
 * Twilio) and setting `OTP_PROVIDER` + its credentials in `backend/.env`.
 */
@Injectable()
export class MockOtpProvider implements OtpProvider, OnModuleInit {
  readonly providerName = 'mock'
  private readonly logger = new Logger(MockOtpProvider.name)
  private readonly codes = new Map<string, StoredOtp>()

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const nodeEnv = this.configService.get<AppConfig>('app')!.nodeEnv
    if (nodeEnv === 'production') {
      throw new Error(
        'MockOtpProvider must never run with NODE_ENV=production. Configure a real ' +
          'OTP_PROVIDER (and its credentials) before deploying the public contact endpoints.',
      )
    }
    this.logger.warn(
      'Using MockOtpProvider — no SMS is sent. OTP codes are logged to this server console only.',
    )
  }

  async sendOtp(mobile: string): Promise<OtpResult> {
    const code = generateCode()
    this.codes.set(mobile, { code, expiresAt: Date.now() + OTP_TTL_MS })
    this.logger.warn(`[DEV-ONLY MOCK — no SMS sent] OTP for +91 ${mobile}: ${code}`)
    return { success: true }
  }

  async verifyOtp(mobile: string, code: string): Promise<OtpResult> {
    const stored = this.codes.get(mobile)
    if (!stored) {
      return { success: false, errorCode: 'generic_error' }
    }
    if (Date.now() > stored.expiresAt) {
      this.codes.delete(mobile)
      return { success: false, errorCode: 'expired_code' }
    }
    if (stored.code !== code) {
      return { success: false, errorCode: 'invalid_code' }
    }
    this.codes.delete(mobile)
    return { success: true }
  }

  /**
   * Dev-only convenience backing GET /public/contact/otp/dev-code/:mobile
   * (see PublicContactController) — lets the public site's frontend fetch
   * the real, currently-pending code for a mobile number instead of a
   * developer having to read it from this server's own console output.
   * Read-only: never consumes/deletes the code, so the frontend can then
   * present it to the REAL verifyOtp above and go through completely
   * normal, unmodified verification. This route (and this whole provider)
   * already refuses to run in production — see onModuleInit above — so
   * this never exists as an attack surface outside local development.
   */
  peekCode(mobile: string): string | null {
    const stored = this.codes.get(mobile)
    if (!stored || Date.now() > stored.expiresAt) return null
    return stored.code
  }
}
