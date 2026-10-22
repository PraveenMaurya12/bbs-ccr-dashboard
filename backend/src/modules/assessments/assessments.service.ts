import { Injectable, NotFoundException } from '@nestjs/common'

import { PrismaService } from '@/common/prisma/prisma.service'

@Injectable()
export class AssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the latest version of each assessment level for a lead. */
  async getStatus(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { bbsLeadId } })
    if (!lead) {
      throw new NotFoundException(`Lead ${bbsLeadId} was not found`)
    }

    const [level1, level2, level3] = await Promise.all([
      this.prisma.financialAssessment.findFirst({
        where: { leadId: lead.id, level: 1 },
        orderBy: { version: 'desc' },
      }),
      this.prisma.financialAssessment.findFirst({
        where: { leadId: lead.id, level: 2 },
        orderBy: { version: 'desc' },
      }),
      this.prisma.customerProfile.findFirst({
        where: { leadId: lead.id },
        orderBy: { version: 'desc' },
      }),
    ])

    return {
      bbsLeadId: lead.bbsLeadId,
      level1: {
        status: lead.level1Status,
        assessment: level1,
      },
      level2: {
        status: lead.level2Status,
        assessment: level2,
      },
      level3: {
        status: lead.level3Status,
        profile: level3,
      },
    }
  }
}
