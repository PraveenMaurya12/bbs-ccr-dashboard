import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Req } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'

import { extractClientIp } from '@/common/http/client-ip'
import { Public } from '@/common/decorators/public.decorator'
import type { AppConfig } from '@/config/configuration'
import { RequestOtpDto } from './dto/request-otp.dto'
import { SubmitLeadDto } from './dto/submit-lead.dto'
import { VerifyOtpDto } from './dto/verify-otp.dto'
import { PublicContactService } from './public-contact.service'

const MOBILE_PATTERN = /^[6-9]\d{9}$/

/**
 * The ONLY controller in this backend the public BBS website ever calls.
 * Every route is `@Public()` (bypasses JwtAuthGuard) and rate-limited —
 * every other controller in the app still requires a CCR JWT regardless.
 */
@ApiTags('public-contact')
@Controller('public/contact')
@Public()
export class PublicContactController {
  constructor(
    private readonly publicContactService: PublicContactService,
    private readonly configService: ConfigService,
  ) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 600_000 } }) // 5 requests / 10 min / IP
  @ApiOperation({ summary: 'Send an OTP to a mobile number (dev: logged server-side, no SMS sent)' })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.publicContactService.requestOtp(dto.mobile)
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 600_000 } }) // 10 attempts / 10 min / IP
  @ApiOperation({ summary: 'Verify an OTP — on success, returns a short-lived verification token' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.publicContactService.verifyOtp(dto.mobile, dto.code)
  }

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 600_000 } }) // 5 submissions / 10 min / IP
  @ApiOperation({ summary: 'Create a lead from the public contact form — requires a valid verificationToken' })
  submit(@Body() dto: SubmitLeadDto, @Req() request: Request) {
    // The only place this codebase ever reads a client IP — resolved by
    // Express's own `trust proxy` setting (see main.ts's configureApp),
    // never by reading a forwarded header directly. See client-ip.ts's
    // own doc comment for why.
    return this.publicContactService.submitLead(dto, extractClientIp(request))
  }

  /**
   * DEV-ONLY. Lets the public site's frontend fetch the real, currently
   * pending mock OTP code for a mobile number instead of a developer
   * having to read it off this server's own console — see
   * bade-bhaisab/src/lib/otpService.ts's dev-mode "123456" shortcut, which
   * calls this internally and forwards the REAL code it gets back to the
   * real otp/verify route above. Nothing about otp/verify or submit
   * itself changes — this only automates a step a developer would
   * otherwise do by hand. Explicitly refuses outside development even
   * though MockOtpProvider itself already never binds in production
   * (PublicContactModule) — this second, explicit check is deliberate
   * defense in depth on a route whose entire purpose is to hand back
   * something production must never expose.
   */
  @Get('otp/dev-code/:mobile')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'DEV-ONLY: peek the currently pending mock OTP code for a mobile number' })
  devPeekOtp(@Param('mobile') mobile: string) {
    if (this.configService.get<AppConfig>('app')!.nodeEnv === 'production') {
      throw new NotFoundException()
    }
    if (!MOBILE_PATTERN.test(mobile)) {
      throw new BadRequestException('Enter a valid 10-digit mobile number')
    }
    return { code: this.publicContactService.devPeekOtp(mobile) }
  }
}
