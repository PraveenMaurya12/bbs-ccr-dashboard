import { Controller, Get, Param } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { CustomersService } from './customers.service'

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get(':bbsLeadId')
  @ApiOperation({ summary: "Get a customer's details via their originating lead's BBS Lead ID" })
  findOne(@Param('bbsLeadId') bbsLeadId: string) {
    return this.customersService.findByLeadBbsId(bbsLeadId)
  }
}
