import { Injectable, NotFoundException } from '@nestjs/common'

import { PrismaService } from '@/common/prisma/prisma.service'

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByLeadBbsId(bbsLeadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { bbsLeadId },
      include: { customer: { include: { contacts: true } } },
    })

    if (!lead?.customer) {
      throw new NotFoundException(`No customer record exists yet for lead ${bbsLeadId}`)
    }

    return lead.customer
  }
}
