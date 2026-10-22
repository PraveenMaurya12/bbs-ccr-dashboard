import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

import type { AppConfig } from '@/config/configuration'
import { AnalysisController } from './analysis.controller'
import { AnalysisService } from './analysis.service'
import { AI_ANALYSIS_PROVIDER } from './providers/ai-provider.interface'
import { ClaudeAiProvider } from './providers/claude-ai-provider'
import { GeminiAiProvider } from './providers/gemini-ai-provider'
import { MockAiProvider } from './providers/mock-ai-provider'

@Module({
  imports: [ConfigModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    MockAiProvider,
    GeminiAiProvider,
    ClaudeAiProvider,
    {
      provide: AI_ANALYSIS_PROVIDER,
      inject: [ConfigService, MockAiProvider, GeminiAiProvider, ClaudeAiProvider],
      useFactory: (
        configService: ConfigService,
        mockProvider: MockAiProvider,
        geminiProvider: GeminiAiProvider,
        claudeProvider: ClaudeAiProvider,
      ) => {
        const provider = configService.get<AppConfig>('app')!.analysis.aiProvider
        if (provider === 'gemini') return geminiProvider
        if (provider === 'claude') return claudeProvider
        return mockProvider
      },
    },
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
