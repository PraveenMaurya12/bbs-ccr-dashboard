import { formatSanitizedDiagnostics, sanitizeSignzyErrorBody } from './signzy-error-sanitizer'

describe('sanitizeSignzyErrorBody', () => {
  it('extracts code + message from a JSON 400 error body', () => {
    const result = sanitizeSignzyErrorBody(JSON.stringify({ code: 'BAD_REQUEST', message: 'Something was wrong with the request' }))
    expect(result.bodyFormat).toBe('json')
    expect(result.providerErrorCode).toBe('BAD_REQUEST')
    expect(result.providerErrorMessage).toBe('Something was wrong with the request')
    expect(result.validationField).toBeNull()
  })

  it('extracts the validation field from a JSON validation-error body', () => {
    const result = sanitizeSignzyErrorBody(
      JSON.stringify({ errorCode: 'VALIDATION_ERROR', field: 'consentTimestamp', message: 'must be a Unix timestamp in seconds' }),
    )
    expect(result.providerErrorCode).toBe('VALIDATION_ERROR')
    expect(result.validationField).toBe('consentTimestamp')
    expect(result.providerErrorMessage).toBe('must be a Unix timestamp in seconds')
  })

  it('extracts a request/correlation/reference id when supplied, under any of the common field names', () => {
    expect(sanitizeSignzyErrorBody(JSON.stringify({ requestId: 'req-123' })).referenceId).toBe('req-123')
    expect(sanitizeSignzyErrorBody(JSON.stringify({ correlationId: 'corr-456' })).referenceId).toBe('corr-456')
    expect(sanitizeSignzyErrorBody(JSON.stringify({ trace_id: 'trace-789' })).referenceId).toBe('trace-789')
  })

  it('treats a plain-text 400 body as unstructured text, redacted the same way', () => {
    const result = sanitizeSignzyErrorBody('Bad Request: missing required field')
    expect(result.bodyFormat).toBe('text')
    expect(result.providerErrorCode).toBeNull()
    expect(result.providerErrorMessage).toBe('Bad Request: missing required field')
  })

  it('falls back to text handling for malformed JSON rather than throwing', () => {
    const result = sanitizeSignzyErrorBody('{"code": "BAD_REQUEST", "message": ')
    expect(result.bodyFormat).toBe('text')
    expect(result.providerErrorMessage).toContain('BAD_REQUEST')
  })

  it('returns an empty/null diagnostic for an empty body, never throwing', () => {
    expect(sanitizeSignzyErrorBody('')).toEqual({
      bodyFormat: 'empty',
      reason: null,
      providerErrorCode: null,
      providerErrorMessage: null,
      validationField: null,
      referenceId: null,
    })
    expect(sanitizeSignzyErrorBody('   ')).toEqual({
      bodyFormat: 'empty',
      reason: null,
      providerErrorCode: null,
      providerErrorMessage: null,
      validationField: null,
      referenceId: null,
    })
    expect(sanitizeSignzyErrorBody(null)).toEqual({
      bodyFormat: 'empty',
      reason: null,
      providerErrorCode: null,
      providerErrorMessage: null,
      validationField: null,
      referenceId: null,
    })
    expect(sanitizeSignzyErrorBody(undefined)).toEqual({
      bodyFormat: 'empty',
      reason: null,
      providerErrorCode: null,
      providerErrorMessage: null,
      validationField: null,
      referenceId: null,
    })
  })

  describe('redaction of sensitive data appearing in an error body', () => {
    it('redacts a PAN-shaped string inside a JSON message field', () => {
      const result = sanitizeSignzyErrorBody(JSON.stringify({ message: 'No record found for PAN ABCDE1234F' }))
      expect(result.providerErrorMessage).not.toContain('ABCDE1234F')
      expect(result.providerErrorMessage).toContain('[REDACTED]')
    })

    it('redacts a 10-digit mobile number inside a JSON message field', () => {
      const result = sanitizeSignzyErrorBody(JSON.stringify({ message: 'Mobile 9000010001 is not serviceable' }))
      expect(result.providerErrorMessage).not.toContain('9000010001')
    })

    it('redacts an echoed Authorization header', () => {
      const result = sanitizeSignzyErrorBody(JSON.stringify({ message: 'Authorization: SgQcYJ05uqxrXrPpkZ2ym9J2K9ocvYAj is invalid' }))
      expect(result.providerErrorMessage).not.toContain('SgQcYJ05uqxrXrPpkZ2ym9J2K9ocvYAj')
    })

    it('CRITICAL: never redacts a SCREAMING_SNAKE_CASE error code just because it is 20+ characters — only real opaque tokens', () => {
      // A real regression: TEST_VALIDATION_ERROR (22 chars) was being
      // redacted by the long-opaque-token heuristic before this fix,
      // destroying the exact diagnostic this sanitizer exists to preserve.
      const result = sanitizeSignzyErrorBody(JSON.stringify({ code: 'TEST_VALIDATION_ERROR' }))
      expect(result.providerErrorCode).toBe('TEST_VALIDATION_ERROR')

      const longerCode = sanitizeSignzyErrorBody(JSON.stringify({ code: 'INVALID_REQUEST_PARAMETER_TYPE' }))
      expect(longerCode.providerErrorCode).toBe('INVALID_REQUEST_PARAMETER_TYPE')
    })

    it('redacts a long opaque token/key-shaped string even without an "Authorization:" label', () => {
      const result = sanitizeSignzyErrorBody(JSON.stringify({ message: 'key SgQcYJ05uqxrXrPpkZ2ym9J2K9ocvYAj rejected' }))
      expect(result.providerErrorMessage).not.toContain('SgQcYJ05uqxrXrPpkZ2ym9J2K9ocvYAj')
    })

    it('redacts the same sensitive patterns inside a plain-text (non-JSON) body too', () => {
      const result = sanitizeSignzyErrorBody('Rejected: PAN ABCDE1234F, mobile 9000010001')
      expect(result.providerErrorMessage).not.toContain('ABCDE1234F')
      expect(result.providerErrorMessage).not.toContain('9000010001')
    })

    it('never forwards an unknown/unexpected JSON field verbatim — only the fixed allowlist is ever read', () => {
      const result = sanitizeSignzyErrorBody(
        JSON.stringify({ message: 'rejected', firstName: 'Arvind', lastName: 'Sinha', pan: 'ABCDE1234F', phoneNumber: '9000010001' }),
      )
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain('Arvind')
      expect(serialized).not.toContain('Sinha')
      expect(serialized).not.toContain('ABCDE1234F')
      expect(serialized).not.toContain('9000010001')
    })
  })

  describe('401/403/500 — handled identically to any other non-2xx status (the status code itself is the caller\'s concern, not the sanitizer\'s)', () => {
    it('sanitizes a JSON 401 body the same way as any other status', () => {
      const result = sanitizeSignzyErrorBody(JSON.stringify({ code: 'UNAUTHORIZED', message: 'invalid credentials' }))
      expect(result.providerErrorCode).toBe('UNAUTHORIZED')
      expect(result.providerErrorMessage).toBe('invalid credentials')
    })

    it('sanitizes a JSON 403 body the same way', () => {
      const result = sanitizeSignzyErrorBody(JSON.stringify({ code: 'FORBIDDEN', message: 'access denied' }))
      expect(result.providerErrorCode).toBe('FORBIDDEN')
    })

    it('sanitizes a JSON 500 body the same way', () => {
      const result = sanitizeSignzyErrorBody(JSON.stringify({ code: 'INTERNAL_ERROR', message: 'unexpected failure' }))
      expect(result.providerErrorCode).toBe('INTERNAL_ERROR')
    })
  })

  it('truncates an excessively long message rather than forwarding an entire raw body', () => {
    const longMessage = 'x'.repeat(1000)
    const result = sanitizeSignzyErrorBody(JSON.stringify({ message: longMessage }))
    expect(result.providerErrorMessage!.length).toBeLessThan(longMessage.length)
  })

  describe('the known, confirmed-real nested Signzy error envelope — {"error": {...}}', () => {
    // Exactly the envelope a real Signzy rejection returned for an invalid
    // consent.consentMessageId — this is what previously produced "no
    // recognized diagnostic fields" because the sanitizer only read the
    // root object, never the nested `error` object underneath.
    const KNOWN_SIGNZY_ENVELOPE = JSON.stringify({
      error: {
        reason: 'VALIDATION_ERROR',
        status: 400,
        message: 'Invalid consent message Id',
        type: 'Bad Request',
        statusCode: 400,
        name: 'error',
      },
    })

    it('extracts reason and message from the nested error object', () => {
      const result = sanitizeSignzyErrorBody(KNOWN_SIGNZY_ENVELOPE)
      expect(result.bodyFormat).toBe('json')
      expect(result.reason).toBe('VALIDATION_ERROR')
      expect(result.providerErrorMessage).toBe('Invalid consent message Id')
    })

    it('never forwards unknown/unallowlisted fields inside the nested error object ("type", "name", and the numeric "status"/"statusCode") — only string-typed, explicitly allowlisted fields are ever read', () => {
      const result = sanitizeSignzyErrorBody(KNOWN_SIGNZY_ENVELOPE)
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain('Bad Request')
      expect(serialized).not.toContain('"name"')
      // "status"/"statusCode" are numbers (400) in this real envelope, not
      // strings — the allowlist only ever reads string-typed values (see
      // firstNonEmptyString), so providerErrorCode correctly stays null
      // here rather than silently coercing a number.
      expect(result.providerErrorCode).toBeNull()
      // validationField/referenceId have no corresponding field in this
      // real envelope, so they must stay null — nothing gets dumped in to
      // fill the gap.
      expect(result.validationField).toBeNull()
      expect(result.referenceId).toBeNull()
    })

    it('does not treat the nested error object itself as a flat/root-level field (it is an object, never a string)', () => {
      // Regression guard: obj.error being an object (not a string) must
      // never be coerced into text or otherwise misread as a message.
      const result = sanitizeSignzyErrorBody(KNOWN_SIGNZY_ENVELOPE)
      expect(result.providerErrorMessage).not.toContain('[object Object]')
    })

    it('still redacts sensitive data if it appeared inside the nested error object', () => {
      const envelopeWithPan = JSON.stringify({ error: { reason: 'VALIDATION_ERROR', message: 'Invalid PAN ABCDE1234F supplied' } })
      const result = sanitizeSignzyErrorBody(envelopeWithPan)
      expect(result.providerErrorMessage).not.toContain('ABCDE1234F')
    })
  })

  it('preserves existing flat/root-level handling when there is no nested "error" object (e.g. the fixture used in earlier regression tests)', () => {
    const result = sanitizeSignzyErrorBody(JSON.stringify({ code: 'TEST_VALIDATION_ERROR', message: 'Test validation failure', field: 'consentTimestamp' }))
    expect(result.providerErrorCode).toBe('TEST_VALIDATION_ERROR')
    expect(result.providerErrorMessage).toBe('Test validation failure')
    expect(result.validationField).toBe('consentTimestamp')
    expect(result.reason).toBeNull()
  })

  it('does not recursively dump an arbitrary nested object beyond the one "error" level — unknown nested shapes degrade to no match, never a raw dump', () => {
    const result = sanitizeSignzyErrorBody(JSON.stringify({ error: { details: { deeplyNested: 'should never surface' } } }))
    expect(JSON.stringify(result)).not.toContain('deeplyNested')
    expect(JSON.stringify(result)).not.toContain('should never surface')
  })
})

describe('formatSanitizedDiagnostics', () => {
  it('renders every present field (including reason) and omits absent ones', () => {
    expect(
      formatSanitizedDiagnostics({
        bodyFormat: 'json',
        reason: 'VALIDATION_ERROR',
        providerErrorCode: 'BAD_REQUEST',
        providerErrorMessage: 'invalid phone',
        validationField: 'phoneNumber',
        referenceId: 'req-1',
      }),
    ).toBe('reason=VALIDATION_ERROR code=BAD_REQUEST message="invalid phone" field=phoneNumber ref=req-1')
  })

  it('renders an empty string when nothing was extracted', () => {
    expect(
      formatSanitizedDiagnostics({
        bodyFormat: 'empty',
        reason: null,
        providerErrorCode: null,
        providerErrorMessage: null,
        validationField: null,
        referenceId: null,
      }),
    ).toBe('')
  })
})
