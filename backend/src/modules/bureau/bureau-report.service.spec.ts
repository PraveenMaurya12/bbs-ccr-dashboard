import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Prisma } from '@prisma/client'

import { BureauReportService } from './bureau-report.service'
import { CreditReportTimeoutError, CreditReportUnmappedResponseError } from './providers/credit-report-provider.interface'
import type { CreditReportProvider, FetchReportResult } from './providers/credit-report-provider.interface'
import { SignzyCreditReportProvider } from './providers/signzy-credit-report.provider'

/** The same real (identity-redacted) captured Signzy response used by signzy-response.mapper.spec.ts. */
const SIGNZY_SUCCESS_FIXTURE = readFileSync(
  join(__dirname, 'fixtures', 'signzy-experian-lite-success.json'),
  'utf-8',
)

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  })
}

describe('BureauReportService', () => {
  let prisma: {
    creditReport: {
      findUnique: jest.Mock
      create: jest.Mock
      update: jest.Mock
    }
    creditAccount: { create: jest.Mock; deleteMany: jest.Mock }
    creditEnquiry: { create: jest.Mock; deleteMany: jest.Mock }
    lead: { findUnique: jest.Mock; update: jest.Mock }
    $transaction: jest.Mock
  }
  let provider: jest.Mocked<CreditReportProvider>
  let analysisService: { createAndRun: jest.Mock }
  let service: BureauReportService

  const params = { leadId: 'lead-1', bbsLeadId: 'BBS-LD-000001', fullName: 'Ananya Rao', phone: '+91 9000010001' }

  const realDataResult: FetchReportResult = {
    rawResponse: '<INProfileResponse>...real matched data...</INProfileResponse>',
    data: {
      bureau: 'Experian',
      maskedIdNumber: 'XXXX-XXXX-0001',
      pulledAt: new Date('2026-01-01'),
      creditScore: 730,
      scoreBand: 'good',
      totalActiveAccounts: 1,
      totalOutstandingBalance: 50000,
      delinquentAccounts: 0,
      willfulDefaultFlag: false,
      accounts: [],
      enquiries: [],
    },
  }

  const noRecordResult: FetchReportResult = {
    rawResponse: '<INProfileResponse>...no record found...</INProfileResponse>',
    data: {
      bureau: 'Experian',
      maskedIdNumber: 'N/A — no bureau record found',
      pulledAt: new Date('2026-01-01'),
      creditScore: null,
      scoreBand: 'not_found',
      totalActiveAccounts: 0,
      totalOutstandingBalance: 0,
      delinquentAccounts: 0,
      willfulDefaultFlag: null,
      accounts: [],
      enquiries: [],
    },
  }

  beforeEach(() => {
    prisma = {
      creditReport: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      creditAccount: { create: jest.fn(), deleteMany: jest.fn() },
      creditEnquiry: { create: jest.fn(), deleteMany: jest.fn() },
      lead: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    }
    provider = { providerName: 'experian', fetchReport: jest.fn() }
    analysisService = { createAndRun: jest.fn().mockResolvedValue({}) }

    service = new BureauReportService(prisma as never, provider, analysisService as never)
  })

  describe('the one-call-per-lead invariant', () => {
    it('reserves a row and calls the provider exactly once for a brand-new lead', async () => {
      prisma.creditReport.create.mockResolvedValueOnce({ id: 'report-1' })
      provider.fetchReport.mockResolvedValueOnce(realDataResult)

      await service.triggerForLead(params)

      expect(prisma.creditReport.create).toHaveBeenCalledTimes(1)
      expect(provider.fetchReport).toHaveBeenCalledTimes(1)
    })

    it('TEST 1: a second trigger for the same lead calls the provider zero additional times', async () => {
      prisma.creditReport.create.mockResolvedValueOnce({ id: 'report-1' })
      provider.fetchReport.mockResolvedValueOnce(realDataResult)
      await service.triggerForLead(params)
      expect(provider.fetchReport).toHaveBeenCalledTimes(1)

      // Second attempt for the exact same lead — the unique constraint on
      // leadId rejects the reservation INSERT this time.
      prisma.creditReport.create.mockRejectedValueOnce(uniqueViolation())
      await service.triggerForLead(params)

      expect(provider.fetchReport).toHaveBeenCalledTimes(1) // still just once, total
      expect(prisma.creditReport.create).toHaveBeenCalledTimes(2)
    })

    it('never calls the provider at all when the reservation itself is rejected as a duplicate', async () => {
      prisma.creditReport.create.mockRejectedValueOnce(uniqueViolation())

      await expect(service.triggerForLead(params)).resolves.toBeUndefined()

      expect(provider.fetchReport).not.toHaveBeenCalled()
    })

    it('rethrows (via the outer catch) a create failure that is not a unique-constraint violation', async () => {
      const dbError = new Error('connection reset')
      prisma.creditReport.create.mockRejectedValueOnce(dbError)

      // triggerForLead never throws (fire-and-forget contract) even when
      // the inner `run` does — it's swallowed by the outer catch.
      await expect(service.triggerForLead(params)).resolves.toBeUndefined()
      expect(provider.fetchReport).not.toHaveBeenCalled()
    })
  })

  describe('successful outcomes', () => {
    it('marks a real matched response COMPLETED and kicks off Gemini insights', async () => {
      prisma.creditReport.create.mockResolvedValueOnce({ id: 'report-1' })
      provider.fetchReport.mockResolvedValueOnce(realDataResult)

      await service.triggerForLead(params)

      const persistCall = prisma.creditReport.update.mock.calls.find((call) => call[0].data.processingStatus)
      expect(persistCall[0].data.processingStatus).toBe('COMPLETED')
      expect(persistCall[0].data.rawResponse).toBe(realDataResult.rawResponse)
      expect(analysisService.createAndRun).toHaveBeenCalledWith(
        expect.objectContaining({ bbsLeadId: 'BBS-LD-000001', jobType: 'DEBT_ANALYSIS_INSIGHTS' }),
      )
      expect(prisma.lead.update).toHaveBeenLastCalledWith({ where: { id: 'lead-1' }, data: { bureauReportStatus: 'COMPLETED' } })
    })

    it('TEST 6: marks a verified "no record found" response as NO_RECORD, not an error, and never calls Gemini', async () => {
      prisma.creditReport.create.mockResolvedValueOnce({ id: 'report-1' })
      provider.fetchReport.mockResolvedValueOnce(noRecordResult)

      await service.triggerForLead(params)

      const persistCall = prisma.creditReport.update.mock.calls.find((call) => call[0].data.processingStatus)
      expect(persistCall[0].data.processingStatus).toBe('NO_RECORD')
      expect(analysisService.createAndRun).not.toHaveBeenCalled()
      expect(prisma.lead.update).toHaveBeenLastCalledWith({ where: { id: 'lead-1' }, data: { bureauReportStatus: 'COMPLETED' } })
    })

    it('clears any previous tradelines/enquiries before persisting a (re)mapped result', async () => {
      prisma.creditReport.create.mockResolvedValueOnce({ id: 'report-1' })
      provider.fetchReport.mockResolvedValueOnce(realDataResult)

      await service.triggerForLead(params)

      expect(prisma.creditAccount.deleteMany).toHaveBeenCalledWith({ where: { creditReportId: 'report-1' } })
      expect(prisma.creditEnquiry.deleteMany).toHaveBeenCalledWith({ where: { creditReportId: 'report-1' } })
    })

    it('does not let a Gemini insights failure change the COMPLETED status', async () => {
      prisma.creditReport.create.mockResolvedValueOnce({ id: 'report-1' })
      provider.fetchReport.mockResolvedValueOnce(realDataResult)
      analysisService.createAndRun.mockRejectedValueOnce(new Error('Gemini is down'))

      await service.triggerForLead(params)

      const persistCall = prisma.creditReport.update.mock.calls.find((call) => call[0].data.processingStatus)
      expect(persistCall[0].data.processingStatus).toBe('COMPLETED')
    })
  })

  describe('failure outcomes — every one is terminal, none may retry the provider', () => {
    it('TEST 3: a timeout marks the report FAILED with the real error code, and is never retried', async () => {
      prisma.creditReport.create.mockResolvedValueOnce({ id: 'report-1' })
      provider.fetchReport.mockRejectedValueOnce(new CreditReportTimeoutError('Experian SOAP request timed out after 20000ms'))

      await service.triggerForLead(params)

      const failCall = prisma.creditReport.update.mock.calls.find((call) => call[0].data.processingStatus === 'FAILED')
      expect(failCall[0].data.errorCode).toBe('BUREAU_TIMEOUT')
      expect(failCall[0].data.errorMessage).toContain('timed out')
      expect(provider.fetchReport).toHaveBeenCalledTimes(1)
      expect(prisma.lead.update).toHaveBeenLastCalledWith({ where: { id: 'lead-1' }, data: { bureauReportStatus: 'FAILED' } })
    })

    it('TEST 13: an unmapped (but real) response is marked REQUIRES_REVIEW, with the raw response preserved for reprocessing', async () => {
      prisma.creditReport.create.mockResolvedValueOnce({ id: 'report-1' })
      const error = new CreditReportUnmappedResponseError('unrecognized shape')
      error.rawResponse = '<INProfileResponse>...unrecognized...</INProfileResponse>'
      provider.fetchReport.mockRejectedValueOnce(error)

      await service.triggerForLead(params)

      const reviewCall = prisma.creditReport.update.mock.calls.find((call) => call[0].data.processingStatus === 'REQUIRES_REVIEW')
      expect(reviewCall[0].data.errorCode).toBe('BUREAU_UNMAPPED_RESPONSE')
      expect(reviewCall[0].data.rawResponse).toBe(error.rawResponse)
      expect(prisma.lead.update).toHaveBeenLastCalledWith({ where: { id: 'lead-1' }, data: { bureauReportStatus: 'REQUIRES_REVIEW' } })
    })
  })

  describe('reprocessStoredResponse — never calls the provider', () => {
    it('reports nothing-to-reprocess when no report row exists at all', async () => {
      prisma.lead.findUnique.mockResolvedValueOnce({ id: 'lead-1', bbsLeadId: 'BBS-LD-000001', fullName: 'Ananya Rao', phone: '+91 9000010001' })
      prisma.creditReport.findUnique.mockResolvedValueOnce(null)

      const result = await service.reprocessStoredResponse('BBS-LD-000001')

      expect(result.reprocessed).toBe(false)
      expect(provider.fetchReport).not.toHaveBeenCalled()
    })

    it('TEST 4/5 analogue: reports nothing-to-reprocess when the stored report has no raw response (a pure transport failure)', async () => {
      prisma.lead.findUnique.mockResolvedValueOnce({ id: 'lead-1', bbsLeadId: 'BBS-LD-000001', fullName: 'Ananya Rao', phone: '+91 9000010001' })
      prisma.creditReport.findUnique.mockResolvedValueOnce({ id: 'report-1', rawResponse: null })

      const result = await service.reprocessStoredResponse('BBS-LD-000001')

      expect(result.reprocessed).toBe(false)
      expect(result.reason).toMatch(/no raw bureau response/i)
      expect(provider.fetchReport).not.toHaveBeenCalled()
    })

    it('re-runs the mapper against the stored raw response and never touches the provider', async () => {
      prisma.lead.findUnique.mockResolvedValueOnce({ id: 'lead-1', bbsLeadId: 'BBS-LD-000001', fullName: 'Ananya Rao', phone: '+91 9000010001' })
      prisma.creditReport.findUnique.mockResolvedValueOnce({
        id: 'report-1',
        rawResponse:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><INProfileResponse><Header><SystemCode>0</SystemCode></Header>' +
          '<Match_result><Exact_match>N</Exact_match></Match_result><SCORE><BureauScore>-1</BureauScore></SCORE></INProfileResponse>',
      })

      const result = await service.reprocessStoredResponse('BBS-LD-000001')

      expect(result.reprocessed).toBe(true)
      expect(provider.fetchReport).not.toHaveBeenCalled()
      const persistCall = prisma.creditReport.update.mock.calls.find((call) => call[0].data.processingStatus)
      expect(persistCall[0].data.processingStatus).toBe('NO_RECORD')
    })

    it('stays REQUIRES_REVIEW (never calling the provider) when the stored response still cannot be mapped', async () => {
      prisma.lead.findUnique.mockResolvedValueOnce({ id: 'lead-1', bbsLeadId: 'BBS-LD-000001', fullName: 'Ananya Rao', phone: '+91 9000010001' })
      prisma.creditReport.findUnique.mockResolvedValueOnce({
        id: 'report-1',
        rawResponse: '<INProfileResponse><SomeUnrecognizedSection/></INProfileResponse>',
      })

      const result = await service.reprocessStoredResponse('BBS-LD-000001')

      expect(result.reprocessed).toBe(false)
      expect(provider.fetchReport).not.toHaveBeenCalled()
      const reviewCall = prisma.creditReport.update.mock.calls.find((call) => call[0].data.processingStatus === 'REQUIRES_REVIEW')
      expect(reviewCall).toBeTruthy()
    })

    it('dispatches to the Signzy JSON mapper (never the Experian XML mapper) when the stored report says bureau === "Signzy Experian Lite" — regardless of which provider is currently configured', async () => {
      prisma.lead.findUnique.mockResolvedValueOnce({ id: 'lead-1', bbsLeadId: 'BBS-LD-000001', fullName: 'Ananya Rao', phone: '+91 9000010001' })
      prisma.creditReport.findUnique.mockResolvedValueOnce({
        id: 'report-1',
        bureau: 'Signzy Experian Lite',
        rawResponse: '{"success":true,"result":{"score":700}}',
      })

      const result = await service.reprocessStoredResponse('BBS-LD-000001')

      // This particular stored response is a fabricated, never-verified
      // shape (not the real fixture) — correctly stays REQUIRES_REVIEW,
      // never silently "succeeds" via the wrong (Experian XML) mapper, and
      // never calls any provider.
      expect(result.reprocessed).toBe(false)
      expect(provider.fetchReport).not.toHaveBeenCalled()
      const reviewCall = prisma.creditReport.update.mock.calls.find((call) => call[0].data.processingStatus === 'REQUIRES_REVIEW')
      expect(reviewCall).toBeTruthy()
    })

    it('reprocesses a REAL captured Signzy success response end-to-end into a COMPLETED report, with zero provider calls', async () => {
      prisma.lead.findUnique.mockResolvedValueOnce({ id: 'lead-1', bbsLeadId: 'BBS-LD-000001', fullName: 'Ananya Rao', phone: '+91 9000010001' })
      prisma.creditReport.findUnique.mockResolvedValueOnce({
        id: 'report-1',
        bureau: 'Signzy Experian Lite',
        rawResponse: SIGNZY_SUCCESS_FIXTURE,
      })

      const result = await service.reprocessStoredResponse('BBS-LD-000001')

      expect(result.reprocessed).toBe(true)
      expect(provider.fetchReport).not.toHaveBeenCalled()

      const persistCall = prisma.creditReport.update.mock.calls.find((call) => call[0].data.processingStatus)
      expect(persistCall[0].data.processingStatus).toBe('COMPLETED')
      expect(persistCall[0].data.creditScore).toBe(748)
      expect(persistCall[0].data.totalActiveAccounts).toBe(5)
      expect(persistCall[0].data.totalOutstandingBalance).toBe(946114)

      // 33 accounts + 3 enquiries actually persisted (via the $transaction ops array).
      expect(prisma.creditAccount.create).toHaveBeenCalledTimes(33)
      expect(prisma.creditEnquiry.create).toHaveBeenCalledTimes(3)

      // A COMPLETED (non-NO_RECORD) result also kicks off Gemini insights —
      // same as the existing "successful outcomes" behavior above.
      expect(analysisService.createAndRun).toHaveBeenCalledTimes(1)
    })

    it('CRITICAL: rejects a second concurrent reprocess for the same lead instead of double-running the mapper and firing two insight jobs', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', bbsLeadId: 'BBS-LD-000001', fullName: 'Ananya Rao', phone: '+91 9000010001' })
      prisma.creditReport.findUnique.mockResolvedValue({
        id: 'report-1',
        bureau: 'Signzy Experian Lite',
        rawResponse: SIGNZY_SUCCESS_FIXTURE,
      })

      const [first, second] = await Promise.all([
        service.reprocessStoredResponse('BBS-LD-000001'),
        service.reprocessStoredResponse('BBS-LD-000001'),
      ])

      const outcomes = [first, second]
      expect(outcomes.filter((r) => r.reprocessed === true)).toHaveLength(1)
      const rejected = outcomes.find((r) => r.reprocessed === false)
      expect(rejected?.reason).toMatch(/already in progress/i)
      // Only the one call that actually ran fired an insights job — never two.
      expect(analysisService.createAndRun).toHaveBeenCalledTimes(1)
    })
  })

  describe('real Signzy HTTP 400 → sanitized diagnostic propagation (full chain, no mocked provider)', () => {
    // Reproduces the exact path audited after BBS-LD-430642: a REAL
    // SignzyCreditReportProvider (not the generic mocked `provider` used
    // everywhere else in this file) with only `global.fetch` stubbed —
    // proving the sanitized detail survives signzy-http-client.ts →
    // sanitizeSignzyErrorBody → SignzyCreditReportProvider →
    // BureauReportService.applyFailure → the persisted
    // CreditReport.errorMessage, with no layer in between silently
    // discarding or reconstructing it.
    const originalFetch = global.fetch
    afterEach(() => {
      global.fetch = originalFetch
    })

    it('persists the sanitized provider diagnostic into CreditReport.errorMessage, not the generic status-only message', async () => {
      // The exact safe representative body specified for this regression
      // test — never real customer data.
      global.fetch = jest.fn().mockResolvedValue({
        status: 400,
        text: async () => JSON.stringify({ code: 'TEST_VALIDATION_ERROR', message: 'Test validation failure', field: 'consentTimestamp' }),
      }) as unknown as typeof fetch

      const signzyConfigService = { get: () => ({ bureau: { signzy: { apiBaseUrl: 'https://api.signzy.app', apiKey: 'fake-test-key', requestTimeoutMs: 5000 } } }) }
      const realSignzyProvider = new SignzyCreditReportProvider(signzyConfigService as never)
      const serviceWithRealProvider = new BureauReportService(prisma as never, realSignzyProvider, analysisService as never)

      prisma.creditReport.create.mockResolvedValueOnce({ id: 'report-1' })

      await serviceWithRealProvider.triggerForLead({
        ...params,
        pan: 'ABCDE1234F',
        consent: { grantedAt: new Date('2026-09-30T10:00:00.000Z'), granted: true, ipAddress: '203.0.113.5' },
      })

      const failCall = prisma.creditReport.update.mock.calls.find((call) => call[0].data.processingStatus === 'FAILED')
      expect(failCall).toBeTruthy()
      const persistedMessage = failCall[0].data.errorMessage as string

      // The three sanitized fields from the mocked body must all be
      // present in what actually got persisted...
      expect(persistedMessage).toContain('TEST_VALIDATION_ERROR')
      expect(persistedMessage).toContain('Test validation failure')
      expect(persistedMessage).toContain('consentTimestamp')
      // ...and it must NOT be the bare generic message BBS-LD-430642 showed,
      // which is exactly the regression this test guards against.
      expect(persistedMessage).not.toBe('Signzy Experian Lite responded with HTTP 400')
    })
  })
})
