import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

import type { AppConfig } from '@/config/configuration'
import { BureauModule } from '@/modules/bureau/bureau.module'
import { PublicContactController } from './public-contact.controller'
import { PublicContactService } from './public-contact.service'
import { MockOtpProvider } from './providers/mock-otp.provider'
import { OTP_PROVIDER } from './providers/otp-provider.interface'

@Module({
  imports: [ConfigModule, BureauModule],
  controllers: [PublicContactController],
  providers: [
    PublicContactService,
    MockOtpProvider,
    {
      provide: OTP_PROVIDER,
      inject: [ConfigService, MockOtpProvider],
      useFactory: (configService: ConfigService, mockProvider: MockOtpProvider) => {
        const provider = configService.get<AppConfig>('app')!.publicContact.otpProvider
        if (provider === 'mock') {
          return mockProvider
        }
        // No real SMS provider is implemented in this codebase yet.
        // Implement `OtpProvider` against the chosen provider (MSG91,
        // Twilio, ...) and bind it here — never silently fall back to the
        // dev mock for a configured real provider.
        throw new Error(
          `OTP_PROVIDER="${provider}" has no implementation yet. Implement OtpProvider for ` +
            'it and bind it in PublicContactModule before enabling this in production.',
        )
      },
    },
  ],
})
export class PublicContactModule {}
