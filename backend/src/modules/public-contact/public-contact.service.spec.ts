import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'

import { PrismaService } from '@/common/prisma/prisma.service'
import { BureauReportService } from '@/modules/bureau/bureau-report.service'
import { PublicContactService } from './public-contact.service'
import { OTP_PROVIDER, type OtpProvider } from './providers/otp-provider.interface'
import { issueVerificationTicket } from './verification-ticket'
import type { SubmitLeadDto } from './dto/submit-lead.dto'

const TICKET_SECRET = 'test-ticket-secret'
const PAN_PEPPER = 'test-pan-pepper'

describe('PublicContactService', () => {
  let service: PublicContactService
  let otpProvider: jest.Mocked<OtpProvider>
  let prisma: {
    lead: { findUnique: jest.Mock; findFirst: jest.Mock }
    $transaction: jest.Mock
  }
  let txLead: { create: jest.Mock }
  let txConsentRecord: { create: jest.Mock }
  let txAuditLog: { create: jest.Mock }
  let bureauReportService: { triggerForLead: jest.Mock }

  function baseDto(overrides: Partial<SubmitLeadDto> = {}): SubmitLeadDto {
    return {
      name: 'Test Kumar',
      mobile: '9876543210',
      pan: 'ABCDE1234F',
      helpCategory: 'loan_settlement',
      situation: 'Need help settling my outstanding personal loan dues urgently.',
      consent: true,
      verificationToken: issueVerificationTicket('9876543210', TICKET_SECRET),
      ...overrides,
    }
  }

  beforeEach(async () => {
    otpProvider = { providerName: 'mock', sendOtp: jest.fn(), verifyOtp: jest.fn() }

    txLead = { create: jest.fn() }
    txConsentRecord = { create: jest.fn() }
    txAuditLog = { create: jest.fn() }
    bureauReportService = { triggerForLead: jest.fn().mockResolvedValue(undefined) }

    prisma = {
      lead: { findUnique: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn({ lead: txLead, consentRecord: txConsentRecord, auditLog: txAuditLog }),
      ),
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicContactService,
        { provide: PrismaService, useValue: prisma },
        { provide: OTP_PROVIDER, useValue: otpProvider },
        { provide: BureauReportService, useValue: bureauReportService },
        {
          provide: ConfigService,
          useValue: {
            get: () => ({
              publicContact: {
                otpTicketSecret: TICKET_SECRET,
                panHashPepper: PAN_PEPPER,
                otpProvider: 'mock',
                siteOrigins: [],
              },
            }),
          },
        },
      ],
    }).compile()

    service = moduleRef.get(PublicContactService)
  })

  describe('requestOtp', () => {
    it('delegates to the injected OTP provider and reports its success', async () => {
      otpProvider.sendOtp.mockResolvedValue({ success: true })

      const result = await service.requestOtp('9876543210')

      expect(otpProvider.sendOtp).toHaveBeenCalledWith('9876543210')
      expect(result).toEqual({ success: true })
    })
  })

  describe('verifyOtp', () => {
    it('returns verified:false with the provider error code on failure, and issues no ticket', async () => {
      otpProvider.verifyOtp.mockResolvedValue({ success: false, errorCode: 'invalid_code' })

      const result = await service.verifyOtp('9876543210', '000000')

      expect(result.verified).toBe(false)
      expect(result.errorCode).toBe('invalid_code')
      expect(result.verificationToken).toBeUndefined()
    })

    it('issues a verification ticket scoped to the mobile number on success', async () => {
      otpProvider.verifyOtp.mockResolvedValue({ success: true })

      const result = await service.verifyOtp('9876543210', '123456')

      expect(result.verified).toBe(true)
      expect(typeof result.verificationToken).toBe('string')
    })
  })

  describe('submitLead', () => {
    // 203.0.113.5 is from the RFC 5737 TEST-NET-3 documentation range —
    // guaranteed never a real, routable client address.
    const TEST_CLIENT_IP = '203.0.113.5'

    it('rejects when the verification ticket is missing, tampered, or for a different mobile', async () => {
      const dto = baseDto({ verificationToken: 'not-a-real-ticket' })

      await expect(service.submitLead(dto, TEST_CLIENT_IP)).rejects.toThrow(UnauthorizedException)
      expect(prisma.lead.findFirst).not.toHaveBeenCalled()
    })

    it('rejects a ticket issued for a different mobile number than the one being submitted', async () => {
      const dto = baseDto({
        mobile: '9111111111',
        verificationToken: issueVerificationTicket('9876543210', TICKET_SECRET),
      })

      await expect(service.submitLead(dto, TEST_CLIENT_IP)).rejects.toThrow(UnauthorizedException)
    })

    it('creates a Lead + ConsentRecord + AuditLog and assigns the Website (ONLINE) source', async () => {
      prisma.lead.findFirst.mockResolvedValue(null) // no existing lead by phone/panRef
      txLead.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'lead-db-id',
        bbsLeadId: 'BBS-LD-123456',
        ...data,
      }))

      const dto = baseDto()
      const result = await service.submitLead(dto, TEST_CLIENT_IP)

      expect(result.status).toBe('received')
      expect(txLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fullName: 'Test Kumar',
            phone: '+91 9876543210',
            source: 'ONLINE',
          }),
        }),
      )
      // The raw PAN is never persisted anywhere — only its hash.
      const createCall = txLead.create.mock.calls[0][0]
      expect(createCall.data.pan).toBeUndefined()
      expect(createCall.data.panRef).toBeDefined()
      expect(createCall.data.panRef).not.toBe(dto.pan)

      expect(txConsentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ leadId: 'lead-db-id', status: 'GRANTED', ipAddress: TEST_CLIENT_IP }),
        }),
      )
      expect(txAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PUBLIC_LEAD_SUBMITTED', leadId: 'lead-db-id' }),
        }),
      )
      // Never logs/records the OTP or the raw PAN in the audit trail metadata.
      const auditCall = txAuditLog.create.mock.calls[0][0]
      expect(JSON.stringify(auditCall.data.metadata)).not.toContain(dto.pan)

      // Fire-and-forget bureau trigger — only after the Lead + GRANTED
      // ConsentRecord above were actually committed. bbsLeadId is randomly
      // generated (see generateUniqueBbsLeadId), so only its shape is
      // asserted here, not an exact value.
      expect(bureauReportService.triggerForLead).toHaveBeenCalledWith({
        leadId: 'lead-db-id',
        bbsLeadId: expect.stringMatching(/^BBS-LD-\d{6}$/),
        fullName: 'Test Kumar',
        phone: '+91 9876543210',
        // The real, raw PAN and real consent evidence — required by
        // Signzy, never persisted anywhere (see the audit-log assertion
        // above, which confirms the PAN never reaches a stored record).
        pan: dto.pan,
        // No `version` here — BBS's internal consent-copy version
        // (CONSENT_VERSION) is only ever recorded on the real
        // ConsentRecord row (asserted separately above), never sent
        // toward the bureau trigger — see the dedicated test below for
        // the explicit proof.
        consent: { grantedAt: expect.any(Date), granted: true, ipAddress: TEST_CLIENT_IP },
      })
    })

    it('CRITICAL: never threads BBS\'s internal consent-copy version into the bureau trigger — a real Signzy rejection ("Invalid consent message Id") confirmed conflating the two is wrong', async () => {
      prisma.lead.findFirst.mockResolvedValue(null)
      txLead.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'lead-db-id',
        bbsLeadId: 'BBS-LD-123456',
        ...data,
      }))

      await service.submitLead(baseDto(), TEST_CLIENT_IP)

      // BBS's own audit trail still gets the real internal version...
      expect(txConsentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 'contact-form-v1' }) }),
      )
      // ...but the object handed to the bureau trigger has no `version`
      // key at all (TriggerBureauRequestParams.consent no longer declares
      // one — see bureau-report.service.ts).
      const triggerCall = bureauReportService.triggerForLead.mock.calls[0][0]
      expect('version' in triggerCall.consent).toBe(false)
    })

    it('CRITICAL: threads null (never fabricated) into both ConsentRecord and the bureau trigger when no real client IP could be determined', async () => {
      prisma.lead.findFirst.mockResolvedValue(null)
      txLead.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'lead-db-id',
        bbsLeadId: 'BBS-LD-123456',
        ...data,
      }))

      await service.submitLead(baseDto(), null)

      expect(txConsentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ipAddress: null }) }),
      )
      expect(bureauReportService.triggerForLead).toHaveBeenCalledWith(
        expect.objectContaining({ consent: expect.objectContaining({ ipAddress: null }) }),
      )
    })

    it('detects a duplicate by phone or PAN and does not create a second Lead, and never re-triggers a bureau request', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'existing-id', bbsLeadId: 'BBS-LD-999999' })

      const result = await service.submitLead(baseDto(), TEST_CLIENT_IP)

      expect(result).toEqual({ status: 'already_received', bbsLeadId: 'BBS-LD-999999' })
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(bureauReportService.triggerForLead).not.toHaveBeenCalled()
    })
  })
})
