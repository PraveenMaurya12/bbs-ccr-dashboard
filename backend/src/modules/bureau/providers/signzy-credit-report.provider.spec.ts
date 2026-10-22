import { SignzyCreditReportProvider } from './signzy-credit-report.provider'
import { CreditReportTransportError, CreditReportUnmappedResponseError } from './credit-report-provider.interface'

function mockConfigService(overrides: { nodeEnv?: string } = {}) {
  return {
    get: jest.fn(() => ({
      nodeEnv: overrides.nodeEnv ?? 'development',
      bureau: {
        signzy: {
          apiBaseUrl: 'https://api.signzy.app',
          apiKey: 'fake-test-key-never-real',
          requestTimeoutMs: 5000,
        },
      },
    })),
  }
}

describe('SignzyCreditReportProvider', () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  const identity = {
    firstName: 'Ananya',
    surname: 'Rao',
    mobilePhone: '9000010001',
    pan: 'ABCDE1234F',
    consent: { grantedAt: new Date('2026-09-30T10:00:00.000Z'), granted: true, ipAddress: '203.0.113.5' },
  }

  it('throws without calling fetch when no consent evidence is present, rather than fabricating consent', async () => {
    global.fetch = jest.fn()
    const provider = new SignzyCreditReportProvider(mockConfigService() as never)
    await expect(provider.fetchReport({ ...identity, consent: null })).rejects.toThrow(/consent/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  describe('PERMANENT Signzy integration contract: consentIpAddress is pinned to 152.58.46.166 (end-to-end through the real provider)', () => {
    function capturedRequestBody(): Record<string, unknown> {
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
      return JSON.parse(init.body as string)
    }

    async function sentConsentIp(ipAddress: string | null, nodeEnv = 'development'): Promise<unknown> {
      global.fetch = jest.fn().mockResolvedValue({ status: 200, text: async () => '{}' }) as unknown as typeof fetch
      const provider = new SignzyCreditReportProvider(mockConfigService({ nodeEnv }) as never)
      await provider.fetchReport({ ...identity, consent: { ...identity.consent, ipAddress } }).catch(() => {})
      return (capturedRequestBody().consent as Record<string, unknown>).consentIpAddress
    }

    it('2/5. a real, non-loopback client IP never affects it — still exactly 152.58.46.166', async () => {
      expect(await sentConsentIp('203.0.113.5')).toBe('152.58.46.166')
    })

    it('3. ::1 does not affect it', async () => {
      expect(await sentConsentIp('::1')).toBe('152.58.46.166')
    })

    it('4. 127.0.0.1 does not affect it', async () => {
      expect(await sentConsentIp('127.0.0.1')).toBe('152.58.46.166')
    })

    it('6. ConsentRecord.ipAddress (threaded through as identity.consent.ipAddress) does not affect it, including null', async () => {
      expect(await sentConsentIp(null)).toBe('152.58.46.166')
    })

    it('8. nodeEnv/TRUST_PROXY_HOPS-style environment differences do not affect it — identical in production', async () => {
      expect(await sentConsentIp('203.0.113.5', 'production')).toBe('152.58.46.166')
      expect(await sentConsentIp('::1', 'production')).toBe('152.58.46.166')
    })

    it('9. remains exactly "152.58.46.166" across every input tried above, never a different substituted value', async () => {
      const results = await Promise.all(
        ['203.0.113.5', '::1', '127.0.0.1', null, '2001:4860:7:b05::f5'].map((ip) => sentConsentIp(ip)),
      )
      expect(new Set(results)).toEqual(new Set(['152.58.46.166']))
    })

    it('REGRESSION: the superseded "192.168.5.90" contract value is never sent, under any input, including when request.ip itself happens to equal it', async () => {
      const results = await Promise.all(['203.0.113.5', '::1', '192.168.5.90', null].map((ip) => sentConsentIp(ip)))
      expect(results.every((r) => r !== '192.168.5.90')).toBe(true)
    })

    it('REGRESSION: environment variables (SIGNZY_DEV_CONSENT_IP, TRUST_PROXY_HOPS) cannot override consentIpAddress', async () => {
      const originalEnv = { ...process.env }
      process.env.SIGNZY_DEV_CONSENT_IP = '10.0.0.1'
      process.env.TRUST_PROXY_HOPS = '5'
      try {
        expect(await sentConsentIp('203.0.113.5')).toBe('152.58.46.166')
      } finally {
        process.env = originalEnv
      }
    })

    it('the final Signzy JSON body contains exactly the existing request fields — the request is no longer refused for a loopback consent IP, only the pinned consent IP value changed', async () => {
      global.fetch = jest.fn().mockResolvedValue({ status: 200, text: async () => '{}' }) as unknown as typeof fetch
      const provider = new SignzyCreditReportProvider(mockConfigService({ nodeEnv: 'development' }) as never)

      await provider.fetchReport({ ...identity, consent: { ...identity.consent, ipAddress: '::1' } }).catch(() => {})
      const sentBody = capturedRequestBody()

      expect(Object.keys(sentBody).sort()).toEqual(['alternateFlow', 'consent', 'firstName', 'lastName', 'pan', 'phoneNumber'])
      expect(Object.keys(sentBody.consent as object).sort()).toEqual([
        'consentFlag',
        'consentIpAddress',
        'consentMessageId',
        'consentTimestamp',
      ])
      expect((sentBody.consent as Record<string, unknown>).consentIpAddress).toBe('152.58.46.166')
      expect((sentBody.consent as Record<string, unknown>).consentMessageId).toBe('CM_2')
      expect((sentBody.consent as Record<string, unknown>).consentFlag).toBe(true)
    })
  })

  it('throws CreditReportTransportError on a non-2xx response, enriched with ONLY the sanitized diagnostic (never the raw body)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 400,
      text: async () => JSON.stringify({ code: 'INVALID_REQUEST', message: 'phoneNumber is required' }),
    }) as unknown as typeof fetch
    const provider = new SignzyCreditReportProvider(mockConfigService() as never)

    await expect(provider.fetchReport(identity)).rejects.toThrow(CreditReportTransportError)
    try {
      await provider.fetchReport(identity)
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('400')
      expect(message).toContain('INVALID_REQUEST')
      expect(message).toContain('phoneNumber is required')
    }
  })

  it('distinguishes a genuinely empty error body from a real body that matched none of the recognized diagnostic fields', async () => {
    const provider = new SignzyCreditReportProvider(mockConfigService() as never)

    global.fetch = jest.fn().mockResolvedValue({ status: 400, text: async () => '' }) as unknown as typeof fetch
    try {
      await provider.fetchReport(identity)
      fail('expected fetchReport to throw')
    } catch (error) {
      // No parenthetical detail at all — there was truly nothing to report.
      expect((error as Error).message).toBe('Signzy Experian Lite responded with HTTP 400')
    }

    global.fetch = jest.fn().mockResolvedValue({
      status: 400,
      text: async () => JSON.stringify({ unexpectedShape: 'something Signzy actually sent' }),
    }) as unknown as typeof fetch
    try {
      await provider.fetchReport(identity)
      fail('expected fetchReport to throw')
    } catch (error) {
      // A real body DID come back — this must read differently from the
      // fully-generic message above, even though no known field matched,
      // so a future failure like this one is distinguishable from a truly
      // silent/empty rejection.
      const message = (error as Error).message
      expect(message).not.toBe('Signzy Experian Lite responded with HTTP 400')
      expect(message).toContain('body present')
      expect(message).not.toContain('something Signzy actually sent')
    }
  })

  it('never surfaces real PAN/mobile/token values that a non-2xx response body happens to contain, even once sanitized diagnostics are enabled', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 400,
      text: async () => JSON.stringify({ message: 'Invalid identity for PAN ABCDE1234F, mobile 9000010001' }),
    }) as unknown as typeof fetch
    const provider = new SignzyCreditReportProvider(mockConfigService() as never)

    try {
      await provider.fetchReport(identity)
      fail('expected fetchReport to throw')
    } catch (error) {
      const message = (error as Error).message
      expect(message).not.toContain('ABCDE1234F')
      expect(message).not.toContain('9000010001')
    }
  })

  it('on a 2xx response, always reports REQUIRES_REVIEW (via CreditReportUnmappedResponseError) and attaches the raw response for later reprocessing — mapping has never been verified', async () => {
    const rawJson = '{"success":true,"result":{"score":700}}'
    global.fetch = jest.fn().mockResolvedValue({ status: 200, text: async () => rawJson }) as unknown as typeof fetch
    const provider = new SignzyCreditReportProvider(mockConfigService() as never)

    await expect(provider.fetchReport(identity)).rejects.toThrow(CreditReportUnmappedResponseError)
    try {
      await provider.fetchReport(identity)
    } catch (error) {
      expect((error as InstanceType<typeof CreditReportUnmappedResponseError>).rawResponse).toBe(rawJson)
    }
  })

  it('never calls fetch a second time for a single fetchReport invocation (one HTTP request per call)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200, text: async () => '{}' }) as unknown as typeof fetch
    const provider = new SignzyCreditReportProvider(mockConfigService() as never)
    await provider.fetchReport(identity).catch(() => {})
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
