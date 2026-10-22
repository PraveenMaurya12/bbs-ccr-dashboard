import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Prisma } from '@prisma/client'

import { PrismaService } from '@/common/prisma/prisma.service'
import type { PaginatedResult } from '@/common/dto/pagination.dto'
import { hashPan } from '@/common/security/pan-hash'
import type { AppConfig } from '@/config/configuration'
import { BureauReportService } from '@/modules/bureau/bureau-report.service'
import type { AssignLeadDto } from './dto/assign-lead.dto'
import type { CaptureConsentDto } from './dto/capture-consent.dto'
import type { CreateLeadDto } from './dto/create-lead.dto'
import type { QueryLeadsDto } from './dto/query-leads.dto'
import type { UpdateLeadDto } from './dto/update-lead.dto'

/** The consent text/version a CCR-attested (phone/in-person) lead capture is recorded against — distinct from the public contact form's own `contact-form-v1` (see PublicContactService). Bump when the copy materially changes. */
const CCR_CONSENT_PURPOSE = 'ccr_attested_consent'
const CCR_CONSENT_VERSION = 'ccr-attested-v1'

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly bureauReportService: BureauReportService,
  ) {}

  private get panHashPepper(): string {
    return this.configService.get<AppConfig>('app')!.publicContact.panHashPepper
  }

  private async generateUniqueBbsLeadId(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `BBS-LD-${Math.floor(100000 + Math.random() * 900000)}`
      const existing = await this.prisma.lead.findUnique({ where: { bbsLeadId: candidate } })
      if (!existing) return candidate
    }
    throw new ConflictException('Could not generate a unique BBS Lead ID, please retry')
  }

  async create(dto: CreateLeadDto, actorId: string) {
    const bbsLeadId = await this.generateUniqueBbsLeadId()

    const lead = await this.prisma.lead.create({
      data: {
        bbsLeadId,
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        city: dto.city,
        source: dto.source,
        notes: dto.notes,
      },
    })

    await this.prisma.auditLog.create({
      data: {
        actorId,
        leadId: lead.id,
        action: 'LEAD_CREATED',
        entityType: 'Lead',
        entityId: lead.id,
      },
    })

    return lead
  }

  async findAll(
    query: QueryLeadsDto,
  ): Promise<
    PaginatedResult<
      Prisma.LeadGetPayload<{ include: { assignedCcr: { select: { id: true; name: true; email: true } } } }>
    >
  > {
    const { page, pageSize, search, source, level1Status, city, assignedCcrId } = query

    const where: Prisma.LeadWhereInput = {
      ...(source ? { source } : {}),
      ...(level1Status ? { level1Status } : {}),
      ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
      ...(assignedCcrId ? { assignedCcrId } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { bbsLeadId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { assignedCcr: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.lead.count({ where }),
    ])

    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
  }

  async findByBbsLeadId(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { bbsLeadId },
      include: {
        assignedCcr: { select: { id: true, name: true, email: true } },
        customer: true,
      },
    })

    if (!lead) {
      throw new NotFoundException(`Lead ${bbsLeadId} was not found`)
    }

    return lead
  }

  /**
   * Updates Lead-owned fields and/or (via the nested `customer` payload)
   * upserts the Customer profile row — the Lead Details tab's "Personal
   * Information"/"Employment and Income"/"Location and Address" sections.
   * A Customer row need not exist yet: the first save creates it.
   */
  async update(bbsLeadId: string, dto: UpdateLeadDto, actorId: string) {
    const lead = await this.findByBbsLeadId(bbsLeadId)
    const { customer: customerDto, ...leadDto } = dto

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: lead.id },
        data: leadDto,
      })

      if (customerDto) {
        const { dateOfBirth, ...rest } = customerDto
        const customerData = {
          ...rest,
          ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
          // Enforced here regardless of what the client sent: when the
          // permanent address is marked "same as current", any previously
          // saved distinct permanent address is actively cleared rather
          // than left as orphaned, stale data that could resurface later.
          ...(customerDto.sameAsCurrentAddress
            ? {
                permanentAddressLine1: null,
                permanentAddressLine2: null,
                permanentCity: null,
                permanentPinCode: null,
                permanentState: null,
              }
            : {}),
        }
        await tx.customer.upsert({
          where: { leadId: lead.id },
          create: { leadId: lead.id, ...customerData },
          update: customerData,
        })
      }

      return tx.lead.findUniqueOrThrow({
        where: { id: lead.id },
        include: {
          assignedCcr: { select: { id: true, name: true, email: true } },
          customer: true,
        },
      })
    })

    await this.prisma.auditLog.create({
      data: {
        actorId,
        leadId: lead.id,
        action: 'LEAD_UPDATED',
        entityType: 'Lead',
        entityId: lead.id,
        metadata: dto as unknown as Prisma.InputJsonValue,
      },
    })

    return updated
  }

  async assign(bbsLeadId: string, dto: AssignLeadDto, actorId: string) {
    const lead = await this.findByBbsLeadId(bbsLeadId)

    const ccr = await this.prisma.user.findUnique({ where: { id: dto.ccrUserId } })
    if (!ccr || !ccr.isActive) {
      throw new NotFoundException('Target CCR user was not found or is inactive')
    }

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { assignedCcrId: ccr.id },
    })

    await this.prisma.auditLog.create({
      data: {
        actorId,
        leadId: lead.id,
        action: 'LEAD_ASSIGNED',
        entityType: 'Lead',
        entityId: lead.id,
        metadata: { assignedCcrId: ccr.id },
      },
    })

    return updated
  }

  /**
   * Records CCR-attested consent + a raw PAN for a lead that was created
   * directly via this internal form (never through the public self-
   * service contact form, which captures consent/PAN itself at
   * submission time) — then triggers the one real bureau pull this lead
   * will ever get. Without this, such a lead has no path to a bureau
   * report at all: `CreateLeadDto` never collects a PAN, and
   * `BureauReportService.triggerForLead()` otherwise has exactly one
   * caller in this codebase (`PublicContactService`).
   *
   * The raw PAN is used only in-memory (hashed into `Lead.panRef`, and
   * passed to `triggerForLead()` for the one real bureau call) — never
   * persisted, same discipline as `PublicContactService.hashPan`.
   */
  async captureConsentAndPullReport(bbsLeadId: string, dto: CaptureConsentDto, actorId: string) {
    const lead = await this.findByBbsLeadId(bbsLeadId)

    const existingConsent = await this.prisma.consentRecord.findFirst({ where: { leadId: lead.id, status: 'GRANTED', revokedAt: null } })
    if (existingConsent) {
      return { triggered: false, reason: 'Consent has already been captured for this lead — a bureau pull has already been triggered.' }
    }

    const panRef = hashPan(dto.pan, this.panHashPepper)
    const panConflict = await this.prisma.lead.findFirst({ where: { panRef, NOT: { id: lead.id } } })
    if (panConflict) {
      return { triggered: false, reason: `This PAN is already associated with a different lead (${panConflict.bbsLeadId}).` }
    }

    const consentGrantedAt = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: lead.id }, data: { panRef } })
      await tx.consentRecord.create({
        data: { leadId: lead.id, purpose: CCR_CONSENT_PURPOSE, version: CCR_CONSENT_VERSION, status: 'GRANTED', grantedAt: consentGrantedAt, ipAddress: null },
      })
      await tx.auditLog.create({
        data: { actorId, leadId: lead.id, action: 'CCR_CONSENT_CAPTURED', entityType: 'Lead', entityId: lead.id, metadata: { consentVersion: CCR_CONSENT_VERSION } },
      })
    })

    // Fire-and-forget, same contract as PublicContactService's own
    // trigger — never blocks this response on the full bureau-fetch +
    // Gemini-insights pipeline.
    void this.bureauReportService.triggerForLead({
      leadId: lead.id,
      bbsLeadId: lead.bbsLeadId,
      fullName: lead.fullName,
      phone: lead.phone,
      pan: dto.pan,
      consent: { grantedAt: consentGrantedAt, granted: true, ipAddress: null },
    })

    return { triggered: true }
  }
}
