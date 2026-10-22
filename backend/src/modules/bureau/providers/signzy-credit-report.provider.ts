import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { AppConfig } from '@/config/configuration'
import type { BureauIdentity } from '../identity'
import { CreditReportTransportError, CreditReportUnmappedResponseError, type CreditReportProvider, type FetchReportResult } from './credit-report-provider.interface'
import { formatSanitizedDiagnostics, sanitizeSignzyErrorBody } from './signzy-error-sanitizer'
import { buildSignzyRequestBody, callSignzyExperianLite, type SignzyConfig } from './signzy-http-client'
import { mapSignzyExperianLiteResponse } from './signzy-response.mapper'

/**
 * Signzy's Experian Lite API — the PRIMARY bureau provider for BBS going
 * forward (see this module's own task history: the previous direct
 * Experian SOAP integration, still present as ExperianCreditReportProvider,
 * is retained but no longer the intended production path).
 *
 * RESPONSE FIELD MAPPING covers exactly one verified shape: a matched
 * identity with `Match_result.Exact_match === 'Y'` (see
 * fixtures/signzy-experian-lite-success.json and
 * signzy-response.mapper.ts's own doc comment). Any other shape — most
 * importantly Signzy's own "no record found" response, which has never
 * been captured — still correctly reports REQUIRES_REVIEW with the raw
 * response preserved, rather than guessing that shape.
 */
@Injectable()
export class SignzyCreditReportProvider implements CreditReportProvider {
  readonly providerName = 'Signzy Experian Lite'

  constructor(private readonly configService: ConfigService) {}

  private get config(): SignzyConfig {
    return this.configService.get<AppConfig>('app')!.bureau.signzy
  }

  /**
   * `identity.consent` must be the lead's own real, GRANTED ConsentRecord
   * evidence — the caller (BureauReportService) is responsible for
   * fetching it before calling this provider at all (see
   * buildSignzyRequestBody, which throws rather than fabricate consent).
   * Note: buildSignzyRequestBody does NOT use identity.consent.ipAddress/
   * grantedAt for the Signzy-facing consent fields — see
   * SIGNZY_FIXED_REQUEST_VALUES's own doc comment in signzy-http-client.ts.
   */
  async fetchReport(identity: BureauIdentity): Promise<FetchReportResult> {
    if (!identity.consent) {
      throw new Error('Signzy Experian Lite requires real consent evidence, but none was available for this identity.')
    }
    const body = buildSignzyRequestBody(identity, identity.consent)
    const { status, text } = await callSignzyExperianLite(body, this.config)

    if (status < 200 || status >= 300) {
      // The raw body is read (by callSignzyExperianLite, always) but never
      // itself logged, persisted, or forwarded — only a small, fixed
      // allowlist of generic diagnostic fields survives sanitizeSignzyErrorBody
      // (see its own doc comment for exactly what that does and does not
      // guarantee), so this message is safe to persist as
      // CreditReport.errorMessage and show to CCR staff via the Debt
      // Analysis API, same as the previous status-only message was.
      const diagnostics = sanitizeSignzyErrorBody(text)
      const detail = formatSanitizedDiagnostics(diagnostics)
      // formatSanitizedDiagnostics can come back empty for two genuinely
      // different reasons — the body was truly empty, or a real body came
      // back but matched none of sanitizeSignzyErrorBody's allowlisted
      // field names — and collapsing both into the same fully-generic
      // message would make a future failure indistinguishable from this
      // one. Byte count only, never content, so this stays just as safe to
      // persist/display as the sanitized detail itself.
      const note = detail
        ? detail
        : diagnostics.bodyFormat !== 'empty'
          ? `body present, ${text.trim().length} bytes, no recognized diagnostic fields`
          : ''
      throw new CreditReportTransportError(
        note ? `Signzy Experian Lite responded with HTTP ${status} (${note})` : `Signzy Experian Lite responded with HTTP ${status}`,
      )
    }

    try {
      const data = mapSignzyExperianLiteResponse(text, identity)
      return { data, rawResponse: text }
    } catch (error) {
      // A real response WAS received (this is not a transport failure) —
      // attach it so BureauReportService can persist it for later
      // reprocessing without ever calling Signzy again for this lead.
      if (error instanceof CreditReportUnmappedResponseError) {
        error.rawResponse = text
      }
      throw error
    }
  }
}
