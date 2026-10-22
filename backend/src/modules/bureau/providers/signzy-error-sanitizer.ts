/**
 * Extracts only safe diagnostic information from a non-2xx Signzy response
 * body — purely so a developer can see WHY a real call failed (via the
 * existing `CreditReport.errorMessage`, already shown to CCR staff on a
 * FAILED report) without ever persisting, logging, or forwarding the raw
 * body itself. Signzy's error-body shape has never been captured for a
 * real failure, so this deliberately reads only a small, fixed allowlist
 * of generically-named fields ("code", "message", "field", a
 * request/correlation id) that virtually every REST API's error shape
 * uses in some form — it never forwards an unknown field verbatim, which
 * is what actually keeps an echoed PAN/mobile/name out of the diagnostic
 * (those field names are simply never read), not the redaction pass below.
 *
 * The redaction pass is a SECOND, independent layer of defense against a
 * provider unexpectedly echoing sensitive data inside a field we DO read
 * (e.g. a `message` of "Invalid PAN: ABCDE1234F") — it pattern-matches the
 * PAN format, a 10-digit Indian mobile number, and long opaque
 * token/key-shaped strings. It is NOT a guarantee against an arbitrary
 * human name appearing in free text (no reliable regex exists for that);
 * callers must not treat `providerErrorMessage` as risk-free for that
 * specific case, only for the enumerated patterns it actually matches.
 */

export interface SanitizedSignzyDiagnostics {
  bodyFormat: 'json' | 'text' | 'empty'
  /** Signzy's own coarse error classifier (e.g. "VALIDATION_ERROR") — distinct from `providerErrorCode`, which covers the more generic "code"/"errorCode" shape other APIs use. */
  reason: string | null
  providerErrorCode: string | null
  providerErrorMessage: string | null
  validationField: string | null
  referenceId: string | null
}

const REDACTED = '[REDACTED]'
const MAX_FIELD_LENGTH = 300

// PAN: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).
const PAN_PATTERN = /\b[A-Za-z]{5}[0-9]{4}[A-Za-z]\b/g
// A bare 10-digit Indian mobile number, with or without a +91/91 prefix.
const PHONE_PATTERN = /\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/g
// Authorization header/bearer-token echoed inline (e.g. "Authorization: abc...").
const AUTH_HEADER_PATTERN = /\bauthorization\s*:\s*\S+/gi
// Any long opaque alphanumeric run — the general shape of an API key, access
// token, or signed ticket (this codebase's own SIGNZY_API_KEY is 32 chars).
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{20,}\b/g
// A SCREAMING_SNAKE_CASE identifier (e.g. VALIDATION_ERROR,
// INVALID_REQUEST_PARAMETER) is how error *codes* are conventionally
// spelled, and can easily be 20+ characters — it must never be redacted as
// if it were an opaque secret. Real tokens/API keys are mixed-case and/or
// contain no underscores (this codebase's own SIGNZY_API_KEY, for
// instance), so this distinguishes the two reliably rather than by length
// alone.
const SCREAMING_SNAKE_CASE_PATTERN = /^[A-Z][A-Z0-9_]*$/

function redactText(value: string): string {
  let out = value
  out = out.replace(AUTH_HEADER_PATTERN, 'authorization: [REDACTED]')
  out = out.replace(PAN_PATTERN, REDACTED)
  out = out.replace(PHONE_PATTERN, REDACTED)
  out = out.replace(LONG_TOKEN_PATTERN, (match) => (SCREAMING_SNAKE_CASE_PATTERN.test(match) ? match : REDACTED))
  if (out.length > MAX_FIELD_LENGTH) out = `${out.slice(0, MAX_FIELD_LENGTH)}…`
  return out
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return null
}

const EMPTY_DIAGNOSTICS: SanitizedSignzyDiagnostics = {
  bodyFormat: 'empty',
  reason: null,
  providerErrorCode: null,
  providerErrorMessage: null,
  validationField: null,
  referenceId: null,
}

/** Reads the fixed field allowlist from exactly one object — either the root, or (see below) Signzy's nested `error` object — never both, never recursively. */
function extractAllowlistedFields(source: Record<string, unknown>) {
  const reason = firstNonEmptyString(source.reason)
  const code = firstNonEmptyString(source.code, source.errorCode, source.error_code, source.statusCode, source.status_code)
  const message = firstNonEmptyString(
    source.message,
    typeof source.error === 'string' ? source.error : undefined,
    source.errorMessage,
    source.error_message,
    source.msg,
    source.description,
  )
  const field = firstNonEmptyString(source.field, source.validationField, source.invalidField, source.param, source.parameter)
  const referenceId = firstNonEmptyString(
    source.requestId,
    source.request_id,
    source.correlationId,
    source.correlation_id,
    source.referenceId,
    source.reference_id,
    source.traceId,
    source.trace_id,
  )

  return {
    reason: reason ? redactText(reason) : null,
    providerErrorCode: code ? redactText(code) : null,
    providerErrorMessage: message ? redactText(message) : null,
    validationField: field ? redactText(field) : null,
    referenceId: referenceId ? redactText(referenceId) : null,
  }
}

export function sanitizeSignzyErrorBody(rawBody: string | null | undefined): SanitizedSignzyDiagnostics {
  const trimmed = (rawBody ?? '').trim()
  if (!trimmed) {
    return EMPTY_DIAGNOSTICS
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    parsed = undefined
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>

    // Signzy's own real, confirmed error shape nests everything one level
    // down, under a top-level "error" object (e.g.
    // {"error": {"reason": "VALIDATION_ERROR", "message": "...", ...}}).
    // When present AND itself a plain object (never an array/string — a
    // string "error" is handled by extractAllowlistedFields's own
    // message-fallback below, for whichever source object is actually
    // chosen here), read ONLY that nested object's allowlisted fields —
    // exactly one level of nesting, never a recursive walk, and never
    // both the root and the nested object at once.
    const nestedError = obj.error
    const source =
      nestedError && typeof nestedError === 'object' && !Array.isArray(nestedError) ? (nestedError as Record<string, unknown>) : obj

    return { bodyFormat: 'json', ...extractAllowlistedFields(source) }
  }

  // Not a JSON object (malformed JSON, a JSON array/primitive, or plain
  // text) — nothing structured to extract field-by-field, so the whole
  // (redacted) body becomes the message. Still never the raw, unredacted
  // text.
  return {
    bodyFormat: 'text',
    reason: null,
    providerErrorCode: null,
    providerErrorMessage: redactText(trimmed),
    validationField: null,
    referenceId: null,
  }
}

/** Renders the sanitized diagnostics as one short string suitable for `CreditReport.errorMessage` — empty when nothing was extracted. */
export function formatSanitizedDiagnostics(diagnostics: SanitizedSignzyDiagnostics): string {
  const parts: string[] = []
  if (diagnostics.reason) parts.push(`reason=${diagnostics.reason}`)
  if (diagnostics.providerErrorCode) parts.push(`code=${diagnostics.providerErrorCode}`)
  if (diagnostics.providerErrorMessage) parts.push(`message="${diagnostics.providerErrorMessage}"`)
  if (diagnostics.validationField) parts.push(`field=${diagnostics.validationField}`)
  if (diagnostics.referenceId) parts.push(`ref=${diagnostics.referenceId}`)
  return parts.join(' ')
}
