import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AiProvider } from '@prisma/client'

import type { AppConfig } from '@/config/configuration'
import {
  AiProviderAuthenticationError,
  AiProviderInvalidRequestError,
  AiProviderInvalidResponseError,
  AiProviderModelNotFoundError,
  AiProviderRateLimitError,
  AiProviderTimeoutError,
  AiProviderTransportError,
  type AiAnalysisProvider,
  type AnalysisRequest,
  type AnalysisResponse,
} from './ai-provider.interface'
import {
  buildBbsPlanNarrativePrompt,
  buildDebtDiagnosisPrompt,
  buildFinancialAssessmentPrompt,
  buildMasterProfilePrompt,
  buildPrompt,
  parseBbsPlanNarrative,
  parseDebtDiagnosisFindings,
  parseFinancialAssessmentFindings,
  parseFindings,
  parseMasterProfileAssessmentFindings,
} from './gemini-ai-provider'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_API_VERSION = '2023-06-01'

/**
 * Real Anthropic Claude integration via the plain Messages API REST
 * endpoint (no SDK dependency — one JSON POST, same "no SDK" convention
 * GeminiAiProvider/ExperianSoapClient/SignzyHttpClient already use in this
 * backend). Output is advisory-only, exactly like every other provider's
 * (see AnalysisResult's own doc comment in prisma/schema.prisma) — it is
 * never written into a deterministic, CCR-verified record directly.
 *
 * Reuses the EXACT SAME prompt builders and output parsers GeminiAiProvider
 * uses (see gemini-ai-provider.ts) — these are provider-agnostic pure
 * functions of the request, so both providers are grounded in identical
 * guardrail language and produce an identically-shaped, identically-
 * validated `findings` object. This provider only owns the HTTP transport,
 * the Claude-specific request/response shape, and Claude's own error
 * mapping — it never re-implements evidence/provenance validation.
 */
@Injectable()
export class ClaudeAiProvider implements AiAnalysisProvider {
  readonly providerName = AiProvider.CLAUDE
  private readonly logger = new Logger(ClaudeAiProvider.name)

  constructor(private readonly configService: ConfigService) {}

  private get config() {
    return this.configService.get<AppConfig>('app')!.analysis.claude
  }

  /** Never logs ANTHROPIC_API_KEY/the x-api-key header/the raw prompt or response body — only provider/model/timing/status metadata. */
  private log(event: string, details: Record<string, string | number | undefined>): void {
    const parts = Object.entries(details)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
    this.logger.log(`${event} ${parts.join(' ')}`)
  }

  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    // Same per-job-type contract split as GeminiAiProvider (see that
    // file's own doc comment) — every job type is grounded in the exact
    // same prompt text and validated by the exact same parser.
    let findings: Record<string, unknown>
    if (request.jobType === 'DEBT_ANALYSIS_INSIGHTS') {
      findings = (await this.callClaudeRaw(buildDebtDiagnosisPrompt(request)).then(parseDebtDiagnosisFindings)) as unknown as Record<string, unknown>
    } else if (request.jobType === 'FINANCIAL_ANALYSIS_INSIGHTS') {
      findings = (await this.callClaudeRaw(buildFinancialAssessmentPrompt(request)).then(parseFinancialAssessmentFindings)) as unknown as Record<string, unknown>
    } else if (request.jobType === 'MASTER_PROFILE_INSIGHTS') {
      findings = (await this.callClaudeRaw(buildMasterProfilePrompt(request)).then(parseMasterProfileAssessmentFindings)) as unknown as Record<string, unknown>
    } else if (request.jobType === 'RECOVERY_PLAN_GENERATION') {
      findings = (await this.callClaudeRaw(buildBbsPlanNarrativePrompt(request)).then(parseBbsPlanNarrative)) as unknown as Record<string, unknown>
    } else {
      findings = (await this.callClaudeRaw(buildPrompt(request)).then(parseFindings)) as unknown as Record<string, unknown>
    }

    return {
      findings,
      // The Claude Messages API does not return a calibrated confidence
      // score for free-text generation — 0 here means "not reported by
      // the provider", never a real measured confidence (same convention
      // as GeminiAiProvider's own AnalysisResponse.confidence).
      confidence: 0,
      modelVersion: this.config.model,
    }
  }

  private async callClaudeRaw(prompt: string): Promise<string> {
    const { apiKey, model, requestTimeoutMs, effort, maxOutputTokens, workspaceId } = this.config
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured — cannot call the real Claude provider.')
    }

    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,
      'content-type': 'application/json',
    }
    // Only a user-scoped key (sk-ant-usr-...) needs this; a standard
    // workspace/organization key (sk-ant-api03-...) doesn't need it, so
    // it's never sent when unconfigured.
    if (workspaceId) {
      headers['anthropic-workspace-id'] = workspaceId
    }

    const requestBody: Record<string, unknown> = {
      model,
      max_tokens: maxOutputTokens,
      messages: [{ role: 'user', content: prompt }],
    }
    // output_config.effort is the Messages API's genuine effort parameter
    // ("low"|"medium"|"high"|"xhigh"|"max") — distinct from Claude Code's
    // own CLI effort setting. Omitted entirely when effort is '' (lets the
    // model use its own API default rather than sending an invalid value).
    if (effort) {
      requestBody.output_config = { effort }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
    const startedAt = Date.now()

    let response: Response
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
    } catch (error) {
      const elapsedMs = Date.now() - startedAt
      if (error instanceof Error && error.name === 'AbortError') {
        this.log('CLAUDE_CALL_TIMED_OUT', { model, elapsedMs, requestTimeoutMs })
        throw new AiProviderTimeoutError(`Claude request timed out after ${requestTimeoutMs}ms`)
      }
      this.log('CLAUDE_CALL_TRANSPORT_FAILED', { model, elapsedMs, error: error instanceof Error ? error.message : String(error) })
      throw new AiProviderTransportError(`Claude request failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      clearTimeout(timeout)
    }

    const elapsedMs = Date.now() - startedAt
    this.log('CLAUDE_CALL_RESPONDED', { model, elapsedMs, httpStatus: response.status })

    if (!response.ok) {
      const body = await response.text()
      const detail = body.slice(0, 500)
      if (response.status === 401) {
        throw new AiProviderAuthenticationError(`Claude API authentication failed (HTTP 401): ${detail}`)
      }
      if (response.status === 403) {
        throw new AiProviderAuthenticationError(`Claude API authorization failed (HTTP 403): ${detail}`)
      }
      if (response.status === 429) {
        throw new AiProviderRateLimitError(`Claude API rate limit exceeded (HTTP 429): ${detail}`)
      }
      if (response.status === 404) {
        throw new AiProviderModelNotFoundError(`Claude model "${model}" was not found (HTTP 404): ${detail}`)
      }
      if (response.status === 400) {
        throw new AiProviderInvalidRequestError(`Claude API rejected the request (HTTP 400): ${detail}`)
      }
      // 5xx and anything else not covered by a more specific class above.
      throw new AiProviderTransportError(`Claude API responded with HTTP ${response.status}: ${detail}`)
    }

    const body = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>
      stop_reason?: string
    }
    const text = body.content?.find((block) => block.type === 'text')?.text
    if (!text) {
      throw new AiProviderInvalidResponseError('Claude response contained no text content block')
    }
    // CRITICAL: a response cut off mid-generation is necessarily incomplete
    // JSON — a live run against the real API found exactly this (the
    // structured prompts this provider serves can need more output tokens
    // than a conservative max_tokens allows), and letting an incomplete
    // body reach the parser risks leaking a truncated JSON fragment into a
    // user-facing narrative field. Fail loudly and typed instead of
    // silently handing the parser a body it cannot honestly complete.
    if (body.stop_reason === 'max_tokens') {
      this.log('CLAUDE_RESPONSE_TRUNCATED', { model, maxOutputTokens })
      throw new AiProviderInvalidResponseError(
        `Claude response was truncated at the configured max_tokens limit (${maxOutputTokens}) before completing — the JSON body is necessarily incomplete. Increase CLAUDE_MAX_OUTPUT_TOKENS.`,
      )
    }

    return text
  }
}
