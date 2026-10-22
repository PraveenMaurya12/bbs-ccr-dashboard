import { CreditReportTimeoutError, CreditReportTransportError } from './credit-report-provider.interface'
import { buildSignzyRequestBody, callSignzyExperianLite } from './signzy-http-client'

describe('buildSignzyRequestBody', () => {
  const identity = { firstName: 'Ananya', surname: 'Rao', mobilePhone: '9000010001', pan: 'ABCDE1234F' }
  // 203.0.113.5 is from the RFC 5737 TEST-NET-3 documentation range —
  // guaranteed never to be a real, routable client address, used here
  // purely as a realistic-shaped stand-in for "a real captured client IP".
  const consent = { grantedAt: new Date('2026-09-30T10:00:00.000Z'), granted: true, ipAddress: '203.0.113.5' }

  it('maps every field exactly per the integration spec, nothing invented — alternateFlow/consentFlag/consentTimestamp/consentIpAddress/consentMessageId are all frozen per SIGNZY_FIXED_REQUEST_VALUES, regardless of the real captured consent', () => {
    const body = buildSignzyRequestBody(identity, consent)
    expect(body).toEqual({
      phoneNumber: '9000010001',
      pan: 'ABCDE1234F',
      firstName: 'Ananya',
      lastName: 'Rao',
      alternateFlow: 'masked-Mobile-Flow',
      consent: {
        consentFlag: true,
        consentTimestamp: 1784805240,
        consentIpAddress: '152.58.46.166',
        consentMessageId: 'CM_2',
      },
    })
  })

  it('throws rather than send a request with no real PAN', () => {
    expect(() => buildSignzyRequestBody({ ...identity, pan: null }, consent)).toThrow(/PAN/)
  })

  it('throws rather than send a request when consent was not actually granted (a business-rule safety net, separate from the frozen consentFlag VALUE sent in the body)', () => {
    expect(() => buildSignzyRequestBody(identity, { ...consent, granted: false })).toThrow(/GRANTED consent/)
  })

  it('CRITICAL: consentFlag sent in the body is always the frozen `true` constant — it is not read from consent.granted (that field only gates whether a request is built at all)', () => {
    const granted = buildSignzyRequestBody(identity, { ...consent, granted: true })
    expect(granted.consent.consentFlag).toBe(true)
  })

  // PERMANENT Signzy integration contract: consentIpAddress is pinned to
  // "152.58.46.166" unconditionally (see SIGNZY_FIXED_REQUEST_VALUES's own
  // doc comment in signzy-http-client.ts) — these tests enumerate every
  // input the task explicitly called out (1-9) and prove none of them affect it.
  describe('consentIpAddress is pinned to 152.58.46.166 regardless of input', () => {
    it('1/9. the request always contains exactly consentIpAddress: "152.58.46.166"', () => {
      expect(buildSignzyRequestBody(identity, consent).consent.consentIpAddress).toBe('152.58.46.166')
    })

    it('2/5. a different real client IP does not affect it', () => {
      expect(buildSignzyRequestBody(identity, { ...consent, ipAddress: '203.0.113.5' }).consent.consentIpAddress).toBe('152.58.46.166')
      expect(buildSignzyRequestBody(identity, { ...consent, ipAddress: '198.51.100.7' }).consent.consentIpAddress).toBe('152.58.46.166')
    })

    it('3. ::1 does not affect it (and no longer throws — the old loopback guard is gone since the real value is never sent)', () => {
      expect(buildSignzyRequestBody(identity, { ...consent, ipAddress: '::1' }).consent.consentIpAddress).toBe('152.58.46.166')
    })

    it('4. 127.0.0.1 does not affect it', () => {
      expect(buildSignzyRequestBody(identity, { ...consent, ipAddress: '127.0.0.1' }).consent.consentIpAddress).toBe('152.58.46.166')
    })

    it('6. ConsentRecord.ipAddress (consent.ipAddress at this boundary), including null/missing, does not affect it', () => {
      expect(buildSignzyRequestBody(identity, { ...consent, ipAddress: null }).consent.consentIpAddress).toBe('152.58.46.166')
    })

    it('7. SIGNZY_DEV_CONSENT_IP no longer exists as a parameter of this function at all — there is nothing for it to affect', () => {
      // ConsentEvidence/buildSignzyRequestBody take no config/env-derived
      // argument whatsoever; this is a structural guarantee, not just a
      // behavioral one — confirmed by this call compiling with only
      // (identity, consent).
      expect(buildSignzyRequestBody.length).toBe(2)
    })

    it('8. TRUST_PROXY_HOPS does not affect it — this module reads no environment variable at all', () => {
      expect(buildSignzyRequestBody(identity, consent).consent.consentIpAddress).toBe('152.58.46.166')
    })

    it('9. remains exactly "152.58.46.166" across every supported request path tried above', () => {
      const results = [consent.ipAddress, '203.0.113.5', '::1', '127.0.0.1', null, '2001:4860:7:b05::f5'].map(
        (ip) => buildSignzyRequestBody(identity, { ...consent, ipAddress: ip }).consent.consentIpAddress,
      )
      expect(new Set(results)).toEqual(new Set(['152.58.46.166']))
    })

    it('REGRESSION: the superseded "192.168.5.90" contract value is never sent, under any input', () => {
      const results = [consent.ipAddress, '203.0.113.5', '::1', '127.0.0.1', null, '192.168.5.90'].map(
        (ip) => buildSignzyRequestBody(identity, { ...consent, ipAddress: ip }).consent.consentIpAddress,
      )
      expect(results.every((r) => r !== '192.168.5.90')).toBe(true)
    })

    it('REGRESSION: environment variables cannot override consentIpAddress — this module reads no env var at all, so there is nothing to set', () => {
      const originalEnv = { ...process.env }
      process.env.SIGNZY_DEV_CONSENT_IP = '10.0.0.1'
      process.env.TRUST_PROXY_HOPS = '5'
      try {
        expect(buildSignzyRequestBody(identity, consent).consent.consentIpAddress).toBe('152.58.46.166')
      } finally {
        process.env = originalEnv
      }
    })

    it('REGRESSION: nodeEnv cannot alter the fixed Signzy request contract — this module reads no nodeEnv/config argument at all', () => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      try {
        expect(buildSignzyRequestBody(identity, consent)).toEqual({
          phoneNumber: identity.mobilePhone,
          pan: identity.pan,
          firstName: identity.firstName,
          lastName: identity.surname,
          alternateFlow: 'masked-Mobile-Flow',
          consent: { consentFlag: true, consentTimestamp: 1784805240, consentIpAddress: '152.58.46.166', consentMessageId: 'CM_2' },
        })
      } finally {
        process.env.NODE_ENV = originalNodeEnv
      }
    })
  })

  // FREEZE SIGNZY REQUEST CONSTANTS: the remaining four frozen values
  // (alternateFlow, consentFlag, consentTimestamp, consentMessageId) must
  // likewise never vary — proven here across different customers/leads,
  // different ConsentRecord.grantedAt values, and (together with the
  // consentIpAddress block above) different client IPs/environments.
  describe('alternateFlow/consentFlag/consentTimestamp/consentMessageId are frozen regardless of input', () => {
    const otherIdentity = { firstName: 'Rakesh', surname: 'Kulkarni', mobilePhone: '7021446875', pan: 'DJFPM7283E' }
    const otherConsent = { grantedAt: new Date('2020-01-01T00:00:00.000Z'), granted: true, ipAddress: '198.51.100.7' }

    it('alternateFlow is always "masked-Mobile-Flow" — different customer/lead does not affect it', () => {
      expect(buildSignzyRequestBody(identity, consent).alternateFlow).toBe('masked-Mobile-Flow')
      expect(buildSignzyRequestBody(otherIdentity, otherConsent).alternateFlow).toBe('masked-Mobile-Flow')
    })

    it('consentFlag is always true — a different customer/lead/ConsentRecord does not affect it', () => {
      expect(buildSignzyRequestBody(identity, consent).consent.consentFlag).toBe(true)
      expect(buildSignzyRequestBody(otherIdentity, otherConsent).consent.consentFlag).toBe(true)
    })

    it('CRITICAL: consentTimestamp is always exactly 1784805240 — never derived from ConsentRecord.grantedAt, never converted to milliseconds, never "corrected" to the current time', () => {
      expect(buildSignzyRequestBody(identity, consent).consent.consentTimestamp).toBe(1784805240)
      // A very different, much older grantedAt must not change it.
      expect(buildSignzyRequestBody(otherIdentity, otherConsent).consent.consentTimestamp).toBe(1784805240)
      // A grantedAt of "right now" must not change it either.
      expect(buildSignzyRequestBody(identity, { ...consent, grantedAt: new Date() }).consent.consentTimestamp).toBe(1784805240)
    })

    it('consentMessageId is always "CM_2" — a different customer/lead/ConsentRecord does not affect it', () => {
      expect(buildSignzyRequestBody(identity, consent).consent.consentMessageId).toBe('CM_2')
      expect(buildSignzyRequestBody(otherIdentity, otherConsent).consent.consentMessageId).toBe('CM_2')
    })

    it('REGRESSION: the superseded "CM_1" contract value is never sent for masked-Mobile-Flow', () => {
      expect(buildSignzyRequestBody(identity, consent).consent.consentMessageId).not.toBe('CM_1')
      expect(buildSignzyRequestBody(otherIdentity, otherConsent).consent.consentMessageId).not.toBe('CM_1')
    })

    it('all five frozen values remain byte-for-byte identical across two structurally different customers/leads/consent records', () => {
      const bodyA = buildSignzyRequestBody(identity, consent)
      const bodyB = buildSignzyRequestBody(otherIdentity, otherConsent)
      expect(bodyA.alternateFlow).toBe(bodyB.alternateFlow)
      expect(bodyA.consent).toEqual(bodyB.consent)
    })
  })

  it('CRITICAL: consentMessageId is always the fixed "CM_2" Signzy requires — never BBS\'s own internal consent-copy version ("contact-form-v1" was a real, confirmed rejection: "Invalid consent message Id"), and never the superseded "CM_1" value', () => {
    const body = buildSignzyRequestBody(identity, consent)
    expect(body.consent.consentMessageId).toBe('CM_2')
    expect(body.consent.consentMessageId).not.toBe('contact-form-v1')
    expect(body.consent.consentMessageId).not.toBe('CM_1')
    // ConsentEvidence has no `version` field at all (see its own doc
    // comment) — structurally proving this can never again regress to
    // sending BBS's internal version as Signzy's consentMessageId.
    expect('version' in consent).toBe(false)
  })

  it('CRITICAL: consentTimestamp is the frozen Unix-SECONDS sample value, not milliseconds — a real live Signzy call returned HTTP 400 when this was wrong', () => {
    const body = buildSignzyRequestBody(identity, consent)
    // The integration spec's own frozen sample (1784805240) is a 10-digit
    // value. A 13-digit millisecond value is a 1000x magnitude error that a
    // real bureau validation endpoint rejects.
    expect(body.consent.consentTimestamp).toBe(1784805240)
    expect(String(body.consent.consentTimestamp)).toHaveLength(10)
  })

  it('normalizes the PAN to uppercase before sending, regardless of how the visitor typed it', () => {
    const body = buildSignzyRequestBody({ ...identity, pan: 'abcde1234f' }, consent)
    expect(body.pan).toBe('ABCDE1234F')
  })
})

describe('callSignzyExperianLite', () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  const config = { apiBaseUrl: 'https://api.signzy.app', apiKey: 'fake-test-key-never-real', requestTimeoutMs: 5000 }
  const body = buildSignzyRequestBody(
    { firstName: 'Ananya', surname: 'Rao', mobilePhone: '9000010001', pan: 'ABCDE1234F' },
    { grantedAt: new Date(), granted: true, ipAddress: '203.0.113.5' },
  )

  it('FINAL CONTRACT AUDIT: the exact fetch() call — URL, method, headers, and full JSON body — matches the confirmed-working Postman request, using only safe test values', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200, text: async () => '{}' }) as unknown as typeof fetch

    const auditGrantedAt = new Date('2026-09-30T10:00:00.000Z')
    const auditBody = buildSignzyRequestBody(
      { firstName: 'Test', surname: 'User', mobilePhone: '9000010001', pan: 'abcde1234f' },
      { grantedAt: auditGrantedAt, granted: true, ipAddress: '203.0.113.5' },
    )
    await callSignzyExperianLite(auditBody, { ...config, apiKey: 'test-only-credential' })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [calledUrl, calledInit] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]

    // 1. Exact final URL.
    expect(calledUrl).toBe('https://api.signzy.app/api/v3/bureau/experian-lite')
    // 2/3/4. Exact headers — exactly these two keys, Authorization is the
    // raw configured credential with no "Bearer " prefix, no X-API-Key.
    const headers = calledInit.headers as Record<string, string>
    expect(Object.keys(headers).sort()).toEqual(['Authorization', 'Content-Type'])
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers.Authorization).toBe('test-only-credential')
    expect(headers.Authorization.startsWith('Bearer ')).toBe(false)
    expect(headers['X-API-Key']).toBeUndefined()
    expect(calledInit.method).toBe('POST')

    // 5/6/13. Exact field names/nesting/no extras — round-tripped through
    // the REAL JSON.stringify() call, not the pre-serialization object, so
    // this also covers #14 (no transformation between construction and
    // fetch) and #15 (stringify doesn't alter the values unexpectedly).
    const sentBody = JSON.parse(calledInit.body as string) as Record<string, unknown>
    expect(Object.keys(sentBody).sort()).toEqual(['alternateFlow', 'consent', 'firstName', 'lastName', 'pan', 'phoneNumber'])
    expect(Object.keys(sentBody.consent as object).sort()).toEqual([
      'consentFlag',
      'consentIpAddress',
      'consentMessageId',
      'consentTimestamp',
    ])

    // 7/8/9/10/11/12 — every field's exact type/value.
    expect(sentBody).toEqual({
      phoneNumber: '9000010001',
      pan: 'ABCDE1234F',
      firstName: 'Test',
      lastName: 'User',
      alternateFlow: 'masked-Mobile-Flow',
      consent: {
        consentFlag: true,
        consentTimestamp: 1784805240,
        consentIpAddress: '152.58.46.166',
        consentMessageId: 'CM_2',
      },
    })
    expect(typeof sentBody.phoneNumber).toBe('string')
    expect(typeof sentBody.pan).toBe('string')
    expect((sentBody.consent as Record<string, unknown>).consentFlag).toBe(true)
    expect(typeof (sentBody.consent as Record<string, unknown>).consentFlag).toBe('boolean')
    expect(typeof (sentBody.consent as Record<string, unknown>).consentTimestamp).toBe('number')
    expect((sentBody.consent as Record<string, unknown>).consentIpAddress).toBe('152.58.46.166')
    expect((sentBody.consent as Record<string, unknown>).consentIpAddress).not.toBe('192.168.5.90')
    expect((sentBody.consent as Record<string, unknown>).consentMessageId).toBe('CM_2')
    expect((sentBody.consent as Record<string, unknown>).consentMessageId).not.toBe('CM_1')
  })

  it('throws without ever calling fetch when SIGNZY_API_KEY is not configured', async () => {
    global.fetch = jest.fn()
    await expect(callSignzyExperianLite(body, { ...config, apiKey: '' })).rejects.toThrow(/SIGNZY_API_KEY/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('posts to the exact Experian Lite path with the Authorization header set to the configured key, never logging it', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200, text: async () => '{"ok":true}' }) as unknown as typeof fetch
    await callSignzyExperianLite(body, config)

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.signzy.app/api/v3/bureau/experian-lite',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json', Authorization: 'fake-test-key-never-real' }),
      }),
    )
  })

  it('returns the status and text as-is on a non-2xx response, without throwing (the provider decides failure semantics)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 401, text: async () => 'unauthorized' }) as unknown as typeof fetch
    const result = await callSignzyExperianLite(body, config)
    expect(result).toEqual({ status: 401, text: 'unauthorized' })
  })

  it('throws CreditReportTimeoutError when the request aborts', async () => {
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) as unknown as typeof fetch
    await expect(callSignzyExperianLite(body, config)).rejects.toThrow(CreditReportTimeoutError)
  })

  it('throws CreditReportTransportError for a generic network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch
    await expect(callSignzyExperianLite(body, config)).rejects.toThrow(CreditReportTransportError)
  })
})
