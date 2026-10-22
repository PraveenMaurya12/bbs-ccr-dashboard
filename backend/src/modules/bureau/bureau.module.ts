import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

import type { AppConfig } from '@/config/configuration'
import { AnalysisModule } from '@/modules/analysis/analysis.module'
import { BureauReportService } from './bureau-report.service'
import { CREDIT_REPORT_PROVIDER } from './providers/credit-report-provider.interface'
import { ExperianCreditReportProvider } from './providers/experian-credit-report.provider'
import { MockCreditReportProvider } from './providers/mock-credit-report.provider'
import { SignzyCreditReportProvider } from './providers/signzy-credit-report.provider'

@Module({
  imports: [ConfigModule, AnalysisModule],
  providers: [
    BureauReportService,
    MockCreditReportProvider,
    ExperianCreditReportProvider,
    SignzyCreditReportProvider,
    {
      provide: CREDIT_REPORT_PROVIDER,
      inject: [ConfigService, MockCreditReportProvider, ExperianCreditReportProvider, SignzyCreditReportProvider],
      useFactory: (
        configService: ConfigService,
        mockProvider: MockCreditReportProvider,
        experianProvider: ExperianCreditReportProvider,
        signzyProvider: SignzyCreditReportProvider,
      ) => {
        const provider = configService.get<AppConfig>('app')!.bureau.creditReportProvider
        if (provider === 'signzy') return signzyProvider
        if (provider === 'experian') return experianProvider
        return mockProvider
      },
    },
  ],
  exports: [BureauReportService],
})
export class BureauModule {}
