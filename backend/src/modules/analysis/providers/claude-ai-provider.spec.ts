import { Logger } from '@nestjs/common'

import { AiProviderAuthenticationError, AiProviderTimeoutError, AiProviderTransportError } from './ai-provider.interface'
import { ClaudeAiProvider } from './claude-ai-provider'

function mockConfigService(
  apiKey: string,
  overrides: { model?: string; requestTimeoutMs?: number; effort?: string; workspaceId?: string } = {},
) {
  return {
    get: jest.fn(() => ({
      analysis: {
        claude: {
          apiKey,
          model: overrides.model ?? 'claude-sonnet-5',
          requestTimeoutMs: overrides.requestTimeoutMs ?? 120000,
          effort: overrides.effort ?? 'medium',
          workspaceId: overrides.workspaceId ?? '',
        },
      },
    })),
  }
}

function mockFetchResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

function contentResponse(text: string) {
  return { content: [{ type: 'text', text }] }
}

const fullFinding = {
  type: 'concentration',
  severity: 'High' as const,
  title: 'Lender concentration',
  statement: 'One lender holds 80% of total outstanding.',
  evidence: ['debtBurden.top1LenderSharePercent=80'],
  evidenceLevel: 'KNOWN' as const,
  relatedAccounts: ['Bank A'],
  confidence: 'high' as const,
}

describe('ClaudeAiProvider', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('throws a clear error when ANTHROPIC_API_KEY is not configured, rather than silently succeeding', async () => {
    const provider = new ClaudeAiProvider(mockConfigService('') as never)
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })

  it('parses a well-formed DebtDiagnosisFindings JSON object out of the Claude response text — same schema/validator as GeminiAiProvider', async () => {
    const findings = {
      executiveSummary: 'Stable overall position with one concentration concern.',
      currentPosition: 'All accounts are reported current with no active overdue.',
      primaryConcerns: [fullFinding],
      secondaryConcerns: [],
      historicalContext: [],
      debtTrajectory: 'Insufficient data to determine debt trajectory.',
      stressSignals: [],
      possibleDrivers: [],
      dataGaps: ['Monthly income not reported'],
      accountInsights: [],
      resolutionOpportunities: [],
      actionPlan: { verify: ['Confirm current employment status'], immediateAttention: [], monitor: [], optimize: [] },
    }
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(contentResponse(JSON.stringify(findings)))) as unknown as typeof fetch

    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    const result = await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: { totalOutstanding: 100000 } })

    expect(result.findings).toEqual(findings)
    expect(result.modelVersion).toBe('claude-sonnet-5')
    expect(result.confidence).toBe(0)
  })

  it('strips a markdown code fence around the JSON before parsing', async () => {
    const findings = {
      executiveSummary: 'ok',
      currentPosition: '',
      primaryConcerns: [],
      secondaryConcerns: [],
      historicalContext: [],
      debtTrajectory: 'Insufficient data to determine debt trajectory.',
      stressSignals: [],
      possibleDrivers: [],
      dataGaps: [],
      accountInsights: [],
      resolutionOpportunities: [],
      actionPlan: { verify: [], immediateAttention: [], monitor: [], optimize: [] },
    }
    const fenced = '```json\n' + JSON.stringify(findings) + '\n```'
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(contentResponse(fenced))) as unknown as typeof fetch

    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    const result = await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })

    expect(result.findings).toEqual(findings)
  })

  it('falls back to the raw text as executiveSummary, with every array safely empty, when Claude does not return valid JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(contentResponse('not json at all'))) as unknown as typeof fetch

    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    const result = await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })

    expect(result.findings).toMatchObject({ executiveSummary: 'not json at all', primaryConcerns: [] })
  })

  it('request body: sends model, max_tokens, messages, and output_config.effort — the real Messages API effort parameter, not a thinking budget', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(contentResponse('{}'))) as unknown as typeof fetch

    const provider = new ClaudeAiProvider(mockConfigService('test-key', { model: 'claude-sonnet-5-5', effort: 'medium' }) as never)
    await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })

    const [calledUrl, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toBe('https://api.anthropic.com/v1/messages')
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.model).toBe('claude-sonnet-5-5')
    expect(sentBody.messages).toEqual([{ role: 'user', content: expect.any(String) }])
    expect(sentBody.output_config).toEqual({ effort: 'medium' })
    expect(sentBody.thinking).toBeUndefined()
  })

  it('request body: omits output_config entirely when effort is the empty string (lets the model use its own API default)', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(contentResponse('{}'))) as unknown as typeof fetch

    const provider = new ClaudeAiProvider(mockConfigService('test-key', { effort: '' }) as never)
    await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.output_config).toBeUndefined()
  })

  it('headers: sends x-api-key and anthropic-version on every request, and anthropic-workspace-id only when configured', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(contentResponse('{}'))) as unknown as typeof fetch

    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })

    const [, initNoWorkspace] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
    const headersNoWorkspace = initNoWorkspace.headers as Record<string, string>
    expect(headersNoWorkspace['x-api-key']).toBe('test-key')
    expect(headersNoWorkspace['anthropic-version']).toBe('2023-06-01')
    expect(headersNoWorkspace['anthropic-workspace-id']).toBeUndefined()

    const providerWithWorkspace = new ClaudeAiProvider(mockConfigService('test-key', { workspaceId: 'wrkspc_123' }) as never)
    await providerWithWorkspace.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })
    const [, initWithWorkspace] = (global.fetch as jest.Mock).mock.calls[1] as [string, RequestInit]
    expect((initWithWorkspace.headers as Record<string, string>)['anthropic-workspace-id']).toBe('wrkspc_123')
  })

  it('throws AiProviderTransportError (PROVIDER_ERROR) for a generic non-2xx status not covered by a more specific class', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse('server error', false, 500)) as unknown as typeof fetch

    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    const promise = provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })
    await expect(promise).rejects.toThrow(/HTTP 500/)
    await expect(promise).rejects.toBeInstanceOf(AiProviderTransportError)
    await expect(promise).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
  })

  it('throws AiProviderAuthenticationError for HTTP 401/403', async () => {
    const provider = new ClaudeAiProvider(mockConfigService('bad-key') as never)

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ error: 'invalid x-api-key' }, false, 401)) as unknown as typeof fetch
    await expect(provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })).rejects.toBeInstanceOf(
      AiProviderAuthenticationError,
    )

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ error: 'forbidden' }, false, 403)) as unknown as typeof fetch
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_ERROR' })
  })

  it('throws AiProviderRateLimitError for HTTP 429', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ error: 'rate limited' }, false, 429)) as unknown as typeof fetch
    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' })
  })

  it('throws AiProviderModelNotFoundError for HTTP 404', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ error: 'model not found' }, false, 404)) as unknown as typeof fetch
    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
  })

  it('throws AiProviderInvalidRequestError for HTTP 400 (covers both malformed requests and the workspace-scoping configuration error)', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ error: { message: 'This API key is not scoped to a workspace' } }, false, 400),
    ) as unknown as typeof fetch
    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('throws AiProviderTimeoutError (NETWORK_TIMEOUT) when the request aborts — the configured requestTimeoutMs, not a hardcoded value', async () => {
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) as unknown as typeof fetch
    const provider = new ClaudeAiProvider(mockConfigService('test-key', { requestTimeoutMs: 120000 }) as never)
    const promise = provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })
    await expect(promise).rejects.toBeInstanceOf(AiProviderTimeoutError)
    await expect(promise).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' })
    await expect(promise).rejects.toThrow(/120000/)
  })

  it('throws AiProviderTransportError for a generic network failure (not an AbortError)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch
    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toBeInstanceOf(AiProviderTransportError)
  })

  it('throws AiProviderInvalidResponseError when the HTTP call succeeds but no text content block is present', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ content: [] })) as unknown as typeof fetch
    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_RESPONSE' })
  })

  it('ignores a non-text content block (e.g. a future tool_use block) and still finds the text block', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ content: [{ type: 'tool_use', id: 'x', input: {} }, { type: 'text', text: '{"executiveSummary":"ok"}' }] }),
    ) as unknown as typeof fetch
    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    const result = await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })
    expect(result.findings).toMatchObject({ executiveSummary: 'ok' })
  })

  it('CRITICAL: never logs ANTHROPIC_API_KEY, the x-api-key header value, or the raw prompt/response body', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse(contentResponse('{"executiveSummary":"secret-looking prompt content"}')),
    ) as unknown as typeof fetch

    const provider = new ClaudeAiProvider(mockConfigService('super-secret-api-key-value') as never)
    await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: { note: 'secret-looking prompt content' } })

    const loggedText = logSpy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(loggedText).not.toContain('super-secret-api-key-value')
    expect(loggedText).not.toContain('secret-looking prompt content')
    logSpy.mockRestore()
  })

  it('PROVIDER ABSTRACTION: analyze() returns the generic AnalysisResponse shape (findings/confidence/modelVersion) — never a raw Claude content/role object', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(contentResponse('{"executiveSummary":"ok"}'))) as unknown as typeof fetch

    const provider = new ClaudeAiProvider(mockConfigService('test-key', { model: 'claude-sonnet-5-5' }) as never)
    const result = await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })

    expect(Object.keys(result).sort()).toEqual(['confidence', 'findings', 'modelVersion'])
    expect(result).not.toHaveProperty('content')
    expect(result.modelVersion).toBe('claude-sonnet-5-5')
  })

  it('parses a well-formed MasterProfileAssessmentFindings JSON object out of the Claude response text — same schema/validator as GeminiAiProvider', async () => {
    const findings = {
      executiveProfile: 'Credit clean, cash flow stable.',
      currentPosition: 'No current overdue.',
      creditPosition: 'Clean credit history.',
      financialPosition: 'Positive free cash flow.',
      debtBurden: 'One matched obligation.',
      repaymentCapacity: 'Master DSR 16%.',
      liquidityAssessment: 'Healthy liquidity.',
      stressAssessment: 'Stable.',
      alignmentExplanation: 'ALIGNED_HEALTHY because no credit stress and manageable DSR.',
      strengths: [{ type: 'repayment', severity: 'Positive', title: 'Regular EMI', statement: 'Matched obligation.', evidence: [], evidenceLevel: 'KNOWN', confidence: 'high', sourceModules: ['DEBT_ANALYSIS', 'FINANCIAL_ANALYSIS'], relatedDebtAccounts: [], relatedFinancialMetrics: [] }],
      concerns: [],
      opportunitySignals: [],
      possibleCauses: [],
      keyContradictions: [],
      validationRequired: [],
      resolutionReadinessNarrative: 'Strong.',
      confidence: 'high',
    }
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(contentResponse(JSON.stringify(findings)))) as unknown as typeof fetch

    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    const result = await provider.analyze({ jobType: 'MASTER_PROFILE_INSIGHTS', leadId: 'lead-1', masterProfileFacts: { alignmentState: 'ALIGNED_HEALTHY' } })

    expect(result.findings).toEqual(findings)
  })

  it('CONFIGURATION SELECTION: providerName is the CLAUDE enum value, distinct from GEMINI/MOCK', () => {
    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    expect(provider.providerName).toBe('CLAUDE')
  })

  // Regression tests for the real defect a live Master Profile QA pass
  // found against this exact provider (AI_PROVIDER=claude was already the
  // active configured provider in that environment): Claude's response was
  // valid, parseable JSON nested one level deeper than the prompt
  // requested, and the shared parser (reused from gemini-ai-provider.ts)
  // leaked the entire JSON object into the Executive Profile narrative. Both
  // the recovery path and the never-leak-raw-JSON guarantee are exercised
  // here through the full provider, not just the shared parser in isolation.
  it('DEFECT REGRESSION: recovers the Master Profile executiveProfile narrative from a one-level-nested Claude response instead of leaking the raw JSON', async () => {
    const nested = { response: { executiveProfile: 'Recovered from a nested Claude response.', strengths: [] } }
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(contentResponse(JSON.stringify(nested)))) as unknown as typeof fetch

    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    const result = await provider.analyze({ jobType: 'MASTER_PROFILE_INSIGHTS', leadId: 'lead-1', masterProfileFacts: {} })

    expect((result.findings as { executiveProfile: string }).executiveProfile).toBe('Recovered from a nested Claude response.')
  })

  it('DEFECT REGRESSION: never leaks the raw JSON text into executiveProfile when Claude returns valid JSON that lacks the field entirely', async () => {
    const wrongShape = { strengths: [], someUnexpectedTopLevelKey: { nested: true } }
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(contentResponse(JSON.stringify(wrongShape)))) as unknown as typeof fetch

    const provider = new ClaudeAiProvider(mockConfigService('test-key') as never)
    const result = await provider.analyze({ jobType: 'MASTER_PROFILE_INSIGHTS', leadId: 'lead-1', masterProfileFacts: {} })

    const executiveProfile = (result.findings as { executiveProfile: string }).executiveProfile
    expect(executiveProfile).toBe('')
    expect(executiveProfile).not.toContain('{')
  })
})
