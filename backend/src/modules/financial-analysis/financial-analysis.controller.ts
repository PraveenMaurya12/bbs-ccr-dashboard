import { Controller, Get, Param } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { FinancialAnalysisService } from './financial-analysis.service'

@ApiTags('financial-analysis')
@ApiBearerAuth()
@Controller('leads/:bbsLeadId/financial-analysis')
export class FinancialAnalysisController {
  constructor(private readonly financialAnalysisService: FinancialAnalysisService) {}

  @Get()
  @ApiOperation({
    summary:
      "Compute the lead's Financial Analysis tab data from its most recently uploaded/processed bank statement. " +
      'Returns { reportAvailable: false } when no BANK_STATEMENT document has ever been uploaded, and a distinct ' +
      '{ reportAvailable: true, status } shape for the UPLOADED/EXTRACTING/NORMALIZING/CLASSIFYING/ANALYZING/FAILED ' +
      'lifecycle stages, never fabricated figures.',
  })
  getForLead(@Param('bbsLeadId') bbsLeadId: string) {
    return this.financialAnalysisService.getForLead(bbsLeadId)
  }
}
