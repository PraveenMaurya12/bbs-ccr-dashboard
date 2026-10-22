import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LeadSource } from '@prisma/client'

import { PrismaService } from '@/common/prisma/prisma.service'
import { hashPan } from '@/common/security/pan-hash'
import type { AppConfig } from '@/config/configuration'
import { BureauReportService } from '@/modules/bureau/bureau-report.service'
import type { SubmitLeadDto } from './dto/submit-lead.dto'
import { MockOtpProvider } from './providers/mock-otp.provider'
import { OTP_PROVIDER, type OtpProvider, type OtpResult } from './providers/otp-provider.interface'
import { issueVerificationTicket, verifyTicket } from './verification-ticket'

/** The consent text/version a public contact-form submission is recorded against. Bump when the copy materially changes. */
const CONSENT_PURPOSE = 'public_contact_form_submission'
const CONSENT_VERSION = 'contact-form-v1'

const HELP_CATEGORY_LABEL: Record<SubmitLeadDto['helpCategory'], string> = {
  loan_settlement: 'Loan settlement',
  high_emi: 'High EMI',
  credit_score: 'Credit score',
  recovery_pressure: 'Recovery pressure',
  something_else: 'Something else',
}

export interface RequestOtpResult {
  success: boolean
}

export interface VerifyOtpResult {
  verified: boolean
  errorCode?: OtpResult['errorCode']
  verificationToken?: string
}

export type SubmitLeadResult =
  | { status: 'received'; bbsLeadId: string }
  | { status: 'already_received'; bbsLeadId: string }

@Injectable()
export class PublicContactService {
  private readonly config: AppConfig['publicContact']

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider,
    private readonly bureauReportService: BureauReportService,
    configService: ConfigService,
  ) {
    this.config = configService.get<AppConfig>('app')!.publicContact
  }

  async requestOtp(mobile: string): Promise<RequestOtpResult> {
    const result = await this.otpProvider.sendOtp(mobile)
    return { success: result.success }
  }

  async verifyOtp(mobile: string, code: string): Promise<VerifyOtpResult> {
    const result = await this.otpProvider.verifyOtp(mobile, code)

    if (!result.success) {
      return { verified: false, errorCode: result.errorCode }
    }

    const verificationToken = issueVerificationTicket(mobile, this.config.otpTicketSecret)
    return { verified: true, verificationToken }
  }

  /**
   * Backs the dev-only GET /otp/dev-code/:mobile route (see the
   * controller) — only returns a real, currently-pending code when
   * MockOtpProvider is the bound provider. A real SMS provider has no
   * concept of "peek the code back out," and deliberately isn't given one
   * just for this — the controller itself also refuses this route outside
   * development, so this method is redundant-but-safe defense in depth,
   * not the only thing standing between this and production.
   */
  devPeekOtp(mobile: string): string | null {
    if (!(this.otpProvider instanceof MockOtpProvider)) return null
    return this.otpProvider.peekCode(mobile)
  }

  private toPhone(mobile: string): string {
    return `+91 ${mobile}`
  }

  private async generateUniqueBbsLeadId(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `BBS-LD-${Math.floor(100000 + Math.random() * 900000)}`
      const existing = await this.prisma.lead.findUnique({ where: { bbsLeadId: candidate } })
      if (!existing) return candidate
    }
    throw new BadRequestException('Could not generate a lead ID, please try again')
  }

  /**
   * `clientIp` is the real client IP already resolved by Express's own
   * `trust proxy` configuration (see controller + common/http/client-ip.ts)
   * — null when it couldn't be determined (e.g. a malformed/untrusted
   * value). Threaded through to Signzy's consent.consentIpAddress, which
   * Signzy's own validator has confirmed requires a real, non-empty value
   * — see buildSignzyRequestBody's own guard for what happens when this is
   * null at bureau-trigger time (never fabricated, never sent empty).
   */
  async submitLead(dto: SubmitLeadDto, clientIp: string | null): Promise<SubmitLeadResult> {
    // Re-verifies the ticket server-side — a client cannot reach this
    // point just by knowing the request shape; the ticket can only have
    // been minted by a real otpProvider.verifyOtp success for this exact
    // mobile, and it expires in 10 minutes.
    if (!verifyTicket(dto.verificationToken, dto.mobile, this.config.otpTicketSecret)) {
      throw new UnauthorizedException('OTP verification is missing or has expired — please verify again')
    }

    const phone = this.toPhone(dto.mobile)
    const panRef = hashPan(dto.pan, this.config.panHashPepper)

    const existing = await this.prisma.lead.findFirst({
      where: { OR: [{ phone }, { panRef }] },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) {
      return { status: 'already_received', bbsLeadId: existing.bbsLeadId }
    }

    const bbsLeadId = await this.generateUniqueBbsLeadId()
    const notes = `Help category: ${HELP_CATEGORY_LABEL[dto.helpCategory]}\n\n${dto.situation}`
    const consentGrantedAt = new Date()
    // The one real value backing Signzy's consentFlag — set from, and only
    // ever in lockstep with, the ConsentRecord.status literal created
    // immediately below, never an independently-hardcoded boolean.
    const consentStatus = 'GRANTED' as const

    const lead = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          bbsLeadId,
          fullName: dto.name,
          phone,
          source: LeadSource.ONLINE,
          notes,
          panRef,
          // Structured mirror of the same two values folded into `notes`
          // above — lets the CCR dashboard's Lead Details tab show/edit
          // them as real fields instead of parsing free text.
          helpCategory: dto.helpCategory,
          situation: dto.situation,
        },
      })

      await tx.consentRecord.create({
        data: {
          leadId: created.id,
          purpose: CONSENT_PURPOSE,
          version: CONSENT_VERSION,
          status: consentStatus,
          grantedAt: consentGrantedAt,
          // The real client IP at the moment consent was granted — part of
          // the consent evidence itself, not merely transport plumbing for
          // Signzy. Null (not a fabricated value) when it couldn't be
          // determined.
          ipAddress: clientIp,
        },
      })

      await tx.auditLog.create({
        data: {
          leadId: created.id,
          action: 'PUBLIC_LEAD_SUBMITTED',
          entityType: 'Lead',
          entityId: created.id,
          // Never the PAN, never the OTP — just enough to see the source
          // and category of a public submission in the audit trail.
          metadata: { helpCategory: dto.helpCategory, source: 'public_contact_form' },
        },
      })

      return created
    })

    // Fire-and-forget — the public contact request must not wait for the
    // full bureau-fetch + Gemini-insights pipeline (see
    // BureauReportService.triggerForLead's own doc comment). Only reached
    // once the Lead row AND its GRANTED ConsentRecord have actually been
    // committed above, and only for a lead that didn't already exist —
    // never re-triggered on the "already_received" (duplicate submission)
    // path, which BureauReportService's own identity-cache/lock would
    // mostly no-op anyway but is more correctly just not attempted here.
    void this.bureauReportService.triggerForLead({
      leadId: lead.id,
      bbsLeadId: lead.bbsLeadId,
      fullName: lead.fullName,
      phone: lead.phone,
      // Raw PAN and real consent evidence exist only in-memory, right
      // here, at submission time — never persisted (see `panRef` above,
      // and ConsentRecord, which stores no raw consent text/IP). Required
      // by Signzy's request body; ignored entirely by the legacy Experian
      // provider.
      pan: dto.pan,
      // No `version` here — BBS's internal consent-copy version
      // (CONSENT_VERSION) is recorded on the real ConsentRecord row above
      // for BBS's own audit trail, but Signzy's consent.consentMessageId
      // is a separate, frozen value it requires (see
      // SIGNZY_FIXED_REQUEST_VALUES in signzy-http-client.ts) — conflating
      // the two is exactly what caused a real "Invalid consent message Id"
      // rejection.
      consent: { grantedAt: consentGrantedAt, granted: consentStatus === 'GRANTED', ipAddress: clientIp },
    })

    return { status: 'received', bbsLeadId: lead.bbsLeadId }
  }
}
