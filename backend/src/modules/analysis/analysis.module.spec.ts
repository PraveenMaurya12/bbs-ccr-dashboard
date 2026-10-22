import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'

import { PrismaModule } from '@/common/prisma/prisma.module'
import { PrismaService } from '@/common/prisma/prisma.service'
import { AnalysisModule } from './analysis.module'
import { AI_ANALYSIS_PROVIDER } from './providers/ai-provider.interface'
import { ClaudeAiProvider } from './providers/claude-ai-provider'
import { GeminiAiProvider } from './providers/gemini-ai-provider'
import { MockAiProvider } from './providers/mock-ai-provider'

/**
 * Provider-selection regression: confirms `AI_PROVIDER` picks the right
 * `AiAnalysisProvider` implementation behind the DI token every service in
 * this codebase actually injects (`AI_ANALYSIS_PROVIDER`) — not just that
 * the provider classes exist in isolation.
 */
describe('AnalysisModule — AI_PROVIDER selection', () => {
  async function buildModuleWithAiProvider(aiProvider: string) {
    const configService = {
      get: jest.fn(() => ({
        analysis: {
          aiProvider,
          gemini: { apiKey: '', model: 'gemini-2.0-flash', requestTimeoutMs: 120000, thinkingLevel: 'low' },
          claude: { apiKey: '', model: 'claude-sonnet-5', requestTimeoutMs: 120000, effort: 'medium', workspaceId: '' },
        },
      })),
    }

    const moduleRef = await Test.createTestingModule({ imports: [AnalysisModule, PrismaModule] })
      .overrideProvider(ConfigService)
      .useValue(configService)
      .overrideProvider(PrismaService)
      .useValue({})
      .compile()

    return moduleRef.get(AI_ANALYSIS_PROVIDER)
  }

  it('AI_PROVIDER=claude selects ClaudeAiProvider', async () => {
    const provider = await buildModuleWithAiProvider('claude')
    expect(provider).toBeInstanceOf(ClaudeAiProvider)
  })

  it('AI_PROVIDER=gemini selects GeminiAiProvider (unchanged by adding Claude)', async () => {
    const provider = await buildModuleWithAiProvider('gemini')
    expect(provider).toBeInstanceOf(GeminiAiProvider)
  })

  it('AI_PROVIDER=mock (or anything unrecognized) selects MockAiProvider — the safe default', async () => {
    expect(await buildModuleWithAiProvider('mock')).toBeInstanceOf(MockAiProvider)
    expect(await buildModuleWithAiProvider('something-unrecognized')).toBeInstanceOf(MockAiProvider)
  })
})
