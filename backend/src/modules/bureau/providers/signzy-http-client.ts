import type { BureauIdentity } from '../identity'
import { CreditReportTimeoutError, CreditReportTransportError } from './credit-report-provider.interface'

export interface SignzyConfig {
  apiBaseUrl: string
  apiKey: string
  requestTimeoutMs: number
}

/**
 * PERMANENT Signzy Experian Lite integration contract — not a temporary
 * development value. Every Signzy request sends exactly these five values,
 * unconditionally — never derived from request.ip, ConsentRecord.ipAddress/
 * grantedAt/version, TRUST_PROXY_HOPS, SIGNZY_DEV_CONSENT_IP (no longer a
 * thing this provider reads at all), nodeEnv, or any other database/
 * environment/configuration state. They do not vary per customer, per lead,
 * or across repeated calls. This is independent of (and does not affect)
 * the real client-IP/consent capture used elsewhere for ConsentRecord's own
 * audit fields — only the Signzy-facing request body is pinned. The Signzy
 * provider/request builder deliberately reads no client-IP information of
 * any kind — the 403 "IP address not allowed" a misconfigured dev network
 * can produce is a network/account-allowlist concern external to BBS, never
 * something resolved by manipulating this request body.
 *
 * consentTimestamp is the integration spec's own fixed sample value (a
 * 10-digit Unix-seconds value) — never "corrected" to the current time,
 * never converted to milliseconds, never derived from
 * ConsentRecord.grantedAt.
 *
 * consentIpAddress ("152.58.46.166") and consentMessageId ("CM_2") were
 * updated from an earlier contract revision ("192.168.5.90"/"CM_1") per an
 * explicit instruction citing a verified working Postman request against
 * the real Signzy endpoint. Note for future maintainers: 152.58.46.166 is
 * NOT a Signzy-documented placeholder — it is a real machine's public
 * egress IP, and this project's own live-call history shows Signzy's own
 * "IP address not allowed" 403 naming this exact IP as the REJECTED
 * network-connection source on repeated attempts from that machine. The
 * JSON body's consentIpAddress field has never been observed to affect
 * Signzy's allowlist outcome (only the real TCP-connection source IP does)
 * — changing this constant does not change which network a given BBS
 * deployment calls Signzy from, and does not alone guarantee a 200.
 *
 * NEVER CHANGE THESE VALUES without an explicit instruction to do so.
 */
const SIGNZY_FIXED_REQUEST_VALUES = {
  alternateFlow: 'masked-Mobile-Flow',
  consent: {
    consentFlag: true,
    consentTimestamp: 1784805240,
    consentIpAddress: '152.58.46.166',
    consentMessageId: 'CM_2',
  },
} as const

/**
 * Request body for `POST /api/v3/bureau/experian-lite`, mapped field-for-
 * field from the integration spec supplied for this task — every field
 * name and the `alternateFlow` constant are exactly as given, nothing
 * guessed. `pan` is required by Signzy but is never persisted anywhere in
 * this codebase (see PublicContactService.hashPan) — it only ever exists
 * in-memory, for this one request, at the moment of the initial trigger.
 */
export interface SignzyExperianLiteRequestBody {
  phoneNumber: string
  pan: string
  firstName: string
  lastName: string
  alternateFlow: 'masked-Mobile-Flow'
  consent: {
    consentFlag: boolean
    consentTimestamp: number
    consentIpAddress: string
    consentMessageId: string
  }
}

/**
 * Real consent evidence a lead's ConsentRecord must supply. `granted` gates
 * whether buildSignzyRequestBody is willing to build a request AT ALL (a
 * real business-rule safety net — never call Signzy without real GRANTED
 * consent) — it does NOT feed the request body's own consentFlag value,
 * which is frozen per SIGNZY_FIXED_REQUEST_VALUES above. `grantedAt` and
 * `ipAddress` are kept here, and are still real, for callers that persist/
 * audit them (e.g. ConsentRecord.grantedAt/ipAddress) — but
 * buildSignzyRequestBody below deliberately does NOT read either for the
 * Signzy-facing consentTimestamp/consentIpAddress fields: see
 * SIGNZY_FIXED_REQUEST_VALUES's own doc comment. There is deliberately no
 * `version` field here: BBS's internal consent-copy version
 * (ConsentRecord.version) is a separate concept from Signzy's own
 * consentMessageId and is never sent to Signzy at all.
 */
export interface ConsentEvidence {
  grantedAt: Date
  /** Gates whether a request is built at all — see this interface's own doc comment. Never an independently-assumed literal. */
  granted: boolean
  ipAddress: string | null
}

/**
 * `identity.pan` must be present (the real, raw PAN, in-memory only — see
 * BureauIdentity's own doc comment) for this to be a valid Signzy request;
 * callers must not invoke this without it.
 */
export function buildSignzyRequestBody(identity: BureauIdentity, consent: ConsentEvidence): SignzyExperianLiteRequestBody {
  if (!identity.pan) {
    throw new Error('Signzy Experian Lite requires a PAN, but none was available for this identity.')
  }
  if (!consent.granted) {
    throw new Error('Signzy Experian Lite requires real GRANTED consent, but the recorded consent was not granted.')
  }

  return {
    phoneNumber: identity.mobilePhone,
    // PANs are canonically uppercase; the visitor's typed case is never
    // guaranteed (PublicContactService.hashPan already uppercases for its
    // own hash independently of this).
    pan: identity.pan.toUpperCase(),
    firstName: identity.firstName,
    lastName: identity.surname,
    // Every field below is frozen per SIGNZY_FIXED_REQUEST_VALUES — never
    // derived from identity/consent/environment. See that constant's own
    // doc comment.
    alternateFlow: SIGNZY_FIXED_REQUEST_VALUES.alternateFlow,
    consent: { ...SIGNZY_FIXED_REQUEST_VALUES.consent },
  }
}

/**
 * POSTs to Signzy's Experian Lite endpoint. Returns the raw response text
 * on a 2xx status — the caller (signzy-response.mapper.ts) is responsible
 * for parsing/mapping it; this function only handles transport. Never
 * retries — see BureauReportService's one-call business rule.
 */
export async function callSignzyExperianLite(
  body: SignzyExperianLiteRequestBody,
  config: SignzyConfig,
): Promise<{ status: number; text: string }> {
  if (!config.apiKey) {
    throw new Error('SIGNZY_API_KEY is not configured — cannot call the real Signzy provider.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs)

  try {
    const response = await fetch(`${config.apiBaseUrl}/api/v3/bureau/experian-lite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Never logged — see BureauReportService's own logging convention.
        Authorization: config.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const text = await response.text()
    return { status: response.status, text }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CreditReportTimeoutError(`Signzy request timed out after ${config.requestTimeoutMs}ms`)
    }
    throw new CreditReportTransportError(`Signzy request failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timeout)
  }
}
