import { Controller, Get, Param } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { AssessmentsService } from './assessments.service'

@ApiTags('assessments')
@ApiBearerAuth()
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get(':bbsLeadId')
  @ApiOperation({ summary: 'Get the latest Level 1 / Level 2 / Level 3 assessment status for a lead' })
  getStatus(@Param('bbsLeadId') bbsLeadId: string) {
    return this.assessmentsService.getStatus(bbsLeadId)
  }
}
