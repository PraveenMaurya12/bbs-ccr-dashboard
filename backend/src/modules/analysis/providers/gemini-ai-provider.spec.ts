import { Logger } from '@nestjs/common'

import { AiProviderAuthenticationError, AiProviderTimeoutError, AiProviderTransportError } from './ai-provider.interface'
import { GeminiAiProvider, parseBbsPlanNarrative, parseDebtDiagnosisFindings, parseFinancialAssessmentFindings, parseMasterProfileAssessmentFindings } from './gemini-ai-provider'

function mockConfigService(apiKey: string, overrides: { model?: string; requestTimeoutMs?: number; thinkingLevel?: string } = {}) {
  return {
    get: jest.fn(() => ({
      analysis: {
        gemini: {
          apiKey,
          model: overrides.model ?? 'gemini-2.0-flash',
          requestTimeoutMs: overrides.requestTimeoutMs ?? 120000,
          thinkingLevel: overrides.thinkingLevel ?? 'low',
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

describe('GeminiAiProvider', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('throws a clear error when GEMINI_API_KEY is not configured, rather than silently succeeding', async () => {
    const provider = new GeminiAiProvider(mockConfigService('') as never)
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toThrow(/GEMINI_API_KEY/)
  })

  it('parses a well-formed DebtDiagnosisFindings JSON object out of the Gemini response text', async () => {
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
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(findings) }] } }] }),
    ) as unknown as typeof fetch

    const provider = new GeminiAiProvider(mockConfigService('test-key') as never)
    const result = await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: { totalOutstanding: 100000 } })

    expect(result.findings).toEqual(findings)
    expect(result.modelVersion).toBe('gemini-2.0-flash')
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
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ candidates: [{ content: { parts: [{ text: fenced }] } }] }),
    ) as unknown as typeof fetch

    const provider = new GeminiAiProvider(mockConfigService('test-key') as never)
    const result = await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })

    expect(result.findings).toEqual(findings)
  })

  it('falls back to the raw text as executiveSummary, with every array safely empty, when Gemini does not return valid JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ candidates: [{ content: { parts: [{ text: 'not json at all' }] } }] }),
    ) as unknown as typeof fetch

    const provider = new GeminiAiProvider(mockConfigService('test-key') as never)
    const result = await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })

    expect(result.findings).toEqual({
      executiveSummary: 'not json at all',
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
    })
  })

  it('throws AiProviderTransportError (PROVIDER_ERROR) for a generic non-2xx status not covered by a more specific class', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse('server error', false, 500)) as unknown as typeof fetch

    const provider = new GeminiAiProvider(mockConfigService('test-key') as never)
    const promise = provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })
    await expect(promise).rejects.toThrow(/HTTP 500/)
    await expect(promise).rejects.toBeInstanceOf(AiProviderTransportError)
    await expect(promise).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
  })

  it('endpoint construction: the request URL is built from the exact configured model, never a hardcoded one', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
    ) as unknown as typeof fetch

    const provider = new GeminiAiProvider(mockConfigService('test-key', { model: 'gemini-3.8-flash' }) as never)
    await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })

    const [calledUrl] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=test-key')
  })

  it('request body: includes generationConfig.thinkingConfig.thinkingLevel when configured (Gemini 3.x contract, not the legacy numeric thinkingBudget)', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
    ) as unknown as typeof fetch

    const provider = new GeminiAiProvider(mockConfigService('test-key', { thinkingLevel: 'low' }) as never)
    await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.generationConfig).toEqual({ thinkingConfig: { thinkingLevel: 'low' } })
    expect(sentBody.generationConfig.thinkingConfig.thinkingBudget).toBeUndefined()
  })

  it('request body: omits generationConfig entirely when thinkingLevel is the empty string (a configured model with no thinking support)', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
    ) as unknown as typeof fetch

    const provider = new GeminiAiProvider(mockConfigService('test-key', { thinkingLevel: '' }) as never)
    await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.generationConfig).toBeUndefined()
  })

  it('throws AiProviderAuthenticationError for HTTP 401/403', async () => {
    const provider = new GeminiAiProvider(mockConfigService('bad-key') as never)

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ error: 'invalid API key' }, false, 401)) as unknown as typeof fetch
    await expect(provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })).rejects.toBeInstanceOf(
      AiProviderAuthenticationError,
    )

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ error: 'forbidden' }, false, 403)) as unknown as typeof fetch
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_ERROR' })
  })

  it('throws AiProviderRateLimitError for HTTP 429', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ error: 'quota exceeded' }, false, 429)) as unknown as typeof fetch
    const provider = new GeminiAiProvider(mockConfigService('test-key') as never)
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' })
  })

  it('throws AiProviderModelNotFoundError for HTTP 404', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ error: 'model not found' }, false, 404)) as unknown as typeof fetch
    const provider = new GeminiAiProvider(mockConfigService('test-key') as never)
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
  })

  it('throws AiProviderInvalidRequestError for HTTP 400', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ error: 'invalid thinkingLevel' }, false, 400)) as unknown as typeof fetch
    const provider = new GeminiAiProvider(mockConfigService('test-key') as never)
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('throws AiProviderTimeoutError (NETWORK_TIMEOUT) when the request aborts — the configured requestTimeoutMs, not a hardcoded 20s', async () => {
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) as unknown as typeof fetch
    const provider = new GeminiAiProvider(mockConfigService('test-key', { requestTimeoutMs: 120000 }) as never)
    const promise = provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })
    await expect(promise).rejects.toBeInstanceOf(AiProviderTimeoutError)
    await expect(promise).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' })
    await expect(promise).rejects.toThrow(/120000/)
  })

  it('throws AiProviderTransportError for a generic network failure (not an AbortError)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch
    const provider = new GeminiAiProvider(mockConfigService('test-key') as never)
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toBeInstanceOf(AiProviderTransportError)
  })

  it('throws AiProviderInvalidResponseError when the HTTP call succeeds but no candidate text is present', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ candidates: [] })) as unknown as typeof fetch
    const provider = new GeminiAiProvider(mockConfigService('test-key') as never)
    await expect(
      provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} }),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_RESPONSE' })
  })

  it('CRITICAL: never logs GEMINI_API_KEY, the Authorization header (there is none — the key is a URL query param), or the raw prompt/response body', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ candidates: [{ content: { parts: [{ text: '{"executiveSummary":"secret-looking prompt content"}' }] } }] }),
    ) as unknown as typeof fetch

    const provider = new GeminiAiProvider(mockConfigService('super-secret-api-key-value') as never)
    await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: { note: 'secret-looking prompt content' } })

    const loggedText = logSpy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(loggedText).not.toContain('super-secret-api-key-value')
    expect(loggedText).not.toContain('secret-looking prompt content')
    logSpy.mockRestore()
  })

  it('PROVIDER ABSTRACTION: analyze() returns the generic AnalysisResponse shape (findings/confidence/modelVersion) — never a raw Gemini candidates/content object', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ candidates: [{ content: { parts: [{ text: '{"executiveSummary":"ok"}' }] } }] }),
    ) as unknown as typeof fetch

    const provider = new GeminiAiProvider(mockConfigService('test-key', { model: 'gemini-3.8-flash' }) as never)
    const result = await provider.analyze({ jobType: 'DEBT_ANALYSIS_INSIGHTS', leadId: 'lead-1', debtAnalysis: {} })

    expect(Object.keys(result).sort()).toEqual(['confidence', 'findings', 'modelVersion'])
    expect(result).not.toHaveProperty('candidates')
    expect(result.modelVersion).toBe('gemini-3.8-flash')
  })

  it('parses a well-formed MasterProfileAssessmentFindings JSON object out of the Gemini response text', async () => {
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
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(findings) }] } }] }),
    ) as unknown as typeof fetch

    const provider = new GeminiAiProvider(mockConfigService('test-key') as never)
    const result = await provider.analyze({ jobType: 'MASTER_PROFILE_INSIGHTS', leadId: 'lead-1', masterProfileFacts: { alignmentState: 'ALIGNED_HEALTHY' } })

    expect(result.findings).toEqual(findings)
  })
})

describe('parseDebtDiagnosisFindings (malformed/partial AI output degrades safely rather than crashing)', () => {
  it('drops a finding missing its required title/statement instead of fabricating one', () => {
    const raw = JSON.stringify({
      executiveSummary: 'ok',
      primaryConcerns: [{ severity: 'High' }, fullFinding],
    })
    const result = parseDebtDiagnosisFindings(raw)
    expect(result.primaryConcerns).toEqual([fullFinding])
  })

  it('falls back evidenceLevel/severity/confidence to their most conservative value on an invalid enum', () => {
    const raw = JSON.stringify({
      primaryConcerns: [{ title: 'x', statement: 'y', severity: 'EXTREME', evidenceLevel: 'MAYBE', confidence: 'very high' }],
    })
    const result = parseDebtDiagnosisFindings(raw)
    expect(result.primaryConcerns[0]).toMatchObject({ severity: 'Low', evidenceLevel: 'UNKNOWN', confidence: 'low' })
  })

  it('never throws on a non-object JSON value (e.g. a bare array or number)', () => {
    expect(() => parseDebtDiagnosisFindings('[1,2,3]')).not.toThrow()
    expect(() => parseDebtDiagnosisFindings('42')).not.toThrow()
    expect(parseDebtDiagnosisFindings('[1,2,3]').primaryConcerns).toEqual([])
  })

  it('never throws on completely empty input', () => {
    expect(() => parseDebtDiagnosisFindings('')).not.toThrow()
  })

  it('defaults a missing actionPlan to all-empty arrays rather than throwing', () => {
    const result = parseDebtDiagnosisFindings(JSON.stringify({ executiveSummary: 'ok' }))
    expect(result.actionPlan).toEqual({ verify: [], immediateAttention: [], monitor: [], optimize: [] })
  })

  it('DEFECT REGRESSION: never leaks the raw JSON text into executiveSummary when the response is valid JSON but lacks the field (same class of defect found live in the Master Profile narrative)', () => {
    const raw = JSON.stringify({ primaryConcerns: [fullFinding] })
    const result = parseDebtDiagnosisFindings(raw)
    expect(result.executiveSummary).toBe('')
    expect(result.executiveSummary).not.toContain('{')
  })

  it('DEFECT REGRESSION: recovers executiveSummary from a one-level-nested "result" wrapper instead of leaking the raw JSON', () => {
    const raw = JSON.stringify({ result: { executiveSummary: 'Recovered.', primaryConcerns: [fullFinding] } })
    const result = parseDebtDiagnosisFindings(raw)
    expect(result.executiveSummary).toBe('Recovered.')
    expect(result.primaryConcerns).toEqual([fullFinding])
  })
})

describe('parseFinancialAssessmentFindings (malformed/partial AI output degrades safely rather than crashing)', () => {
  it('DEFECT REGRESSION: never leaks the raw JSON text into executiveSummary when the response is valid JSON but lacks the field', () => {
    const raw = JSON.stringify({ financialPosition: 'Stable.' })
    const result = parseFinancialAssessmentFindings(raw)
    expect(result.executiveSummary).toBe('')
    expect(result.executiveSummary).not.toContain('{')
    expect(result.financialPosition).toBe('Stable.')
  })

  it('DEFECT REGRESSION: recovers executiveSummary from a one-level-nested "data" wrapper instead of leaking the raw JSON', () => {
    const raw = JSON.stringify({ data: { executiveSummary: 'Recovered.' } })
    const result = parseFinancialAssessmentFindings(raw)
    expect(result.executiveSummary).toBe('Recovered.')
  })

  it('falls back to the raw text as executiveSummary when the response is not valid JSON at all', () => {
    const result = parseFinancialAssessmentFindings('not json at all')
    expect(result.executiveSummary).toBe('not json at all')
  })
})

describe('parseBbsPlanNarrative (malformed/partial AI output degrades safely rather than crashing)', () => {
  it('DEFECT REGRESSION: never leaks the raw JSON text into whereYouAreToday when the response is valid JSON but lacks the field', () => {
    const raw = JSON.stringify({ whatNeedsAttention: 'Overdue balance.' })
    const result = parseBbsPlanNarrative(raw)
    expect(result.whereYouAreToday).toBe('')
    expect(result.whereYouAreToday).not.toContain('{')
    expect(result.whatNeedsAttention).toBe('Overdue balance.')
  })

  it('DEFECT REGRESSION: recovers whereYouAreToday from a one-level-nested "output" wrapper instead of leaking the raw JSON', () => {
    const raw = JSON.stringify({ output: { whereYouAreToday: 'Recovered.' } })
    const result = parseBbsPlanNarrative(raw)
    expect(result.whereYouAreToday).toBe('Recovered.')
  })

  it('falls back to the raw text as whereYouAreToday when the response is not valid JSON at all', () => {
    const result = parseBbsPlanNarrative('not json at all')
    expect(result.whereYouAreToday).toBe('not json at all')
  })
})

describe('parseMasterProfileAssessmentFindings (malformed/partial AI output degrades safely rather than crashing)', () => {
  const fullMasterFinding = {
    type: 'repayment',
    severity: 'Positive' as const,
    title: 'Regular EMI',
    statement: 'Matched obligation.',
    evidence: [],
    evidenceLevel: 'KNOWN' as const,
    confidence: 'high' as const,
    sourceModules: ['DEBT_ANALYSIS', 'FINANCIAL_ANALYSIS'],
    relatedDebtAccounts: [],
    relatedFinancialMetrics: [],
  }

  it('drops a finding missing its required title/statement instead of fabricating one', () => {
    const raw = JSON.stringify({ strengths: [{ severity: 'Positive' }, fullMasterFinding] })
    const result = parseMasterProfileAssessmentFindings(raw)
    expect(result.strengths).toEqual([fullMasterFinding])
  })

  it('falls back evidenceLevel/severity/confidence to their most conservative value on an invalid enum', () => {
    const raw = JSON.stringify({ strengths: [{ title: 'x', statement: 'y', severity: 'EXTREME', evidenceLevel: 'MAYBE', confidence: 'very high' }] })
    const result = parseMasterProfileAssessmentFindings(raw)
    expect(result.strengths[0]).toMatchObject({ severity: 'Informational', evidenceLevel: 'UNKNOWN', confidence: 'low', sourceModules: [] })
  })

  it('never throws on a non-object JSON value or completely empty input', () => {
    expect(() => parseMasterProfileAssessmentFindings('[1,2,3]')).not.toThrow()
    expect(() => parseMasterProfileAssessmentFindings('')).not.toThrow()
    expect(parseMasterProfileAssessmentFindings('[1,2,3]').strengths).toEqual([])
  })

  it('CRITICAL: never reads alignmentState/resolutionCapacity/cohortAttributes off the AI response even if present — those are deterministic fields only', () => {
    const raw = JSON.stringify({ executiveProfile: 'ok', alignmentState: 'HIGH_DEBT_CAPACITY_ALIGNED', resolutionCapacity: 'STRONG', cohortAttributes: { foo: 'bar' } })
    const result = parseMasterProfileAssessmentFindings(raw)
    expect(result).not.toHaveProperty('alignmentState')
    expect(result).not.toHaveProperty('resolutionCapacity')
    expect(result).not.toHaveProperty('cohortAttributes')
  })

  it('falls back to the raw text as executiveProfile, with every array safely empty, when Gemini does not return valid JSON', () => {
    const result = parseMasterProfileAssessmentFindings('not json at all')
    expect(result.executiveProfile).toBe('not json at all')
    expect(result.strengths).toEqual([])
    expect(result.confidence).toBe('low')
  })

  // Regression tests for a real defect a live Master Profile QA pass found:
  // the model's response was valid, parseable JSON — just not shaped the
  // way the prompt requested — and the old code's blanket "field missing ->
  // fall back to the raw stripped text" rule leaked the ENTIRE JSON object
  // into the Executive Profile narrative shown to a CCR. These two tests
  // pin the fix: valid-but-wrong-shaped JSON must never leak as a
  // narrative string, whether or not a one-level unwrap can recover it.
  it('DEFECT REGRESSION: recovers the narrative from a one-level-nested response instead of leaking the raw JSON (model wrapped its answer under "response")', () => {
    const raw = JSON.stringify({
      response: {
        executiveProfile: 'Recovered from a nested response wrapper.',
        strengths: [fullMasterFinding],
      },
    })
    const result = parseMasterProfileAssessmentFindings(raw)
    expect(result.executiveProfile).toBe('Recovered from a nested response wrapper.')
    expect(result.strengths).toEqual([fullMasterFinding])
  })

  it('DEFECT REGRESSION: never leaks the raw JSON text into executiveProfile when the response is valid JSON but lacks the field entirely (no wrapper key recovers it either) — defaults to empty, same as every other missing string field', () => {
    const raw = JSON.stringify({ strengths: [fullMasterFinding], someOtherTopLevelKeyTheModelInvented: { nested: true } })
    const result = parseMasterProfileAssessmentFindings(raw)
    expect(result.executiveProfile).toBe('')
    expect(result.executiveProfile).not.toContain('{')
    expect(result.strengths).toEqual([fullMasterFinding])
  })
})
