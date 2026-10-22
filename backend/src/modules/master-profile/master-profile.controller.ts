import { Controller, Get, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { MasterProfileService } from './master-profile.service'

@ApiTags('master-profile')
@ApiBearerAuth()
@Controller('leads/:bbsLeadId/master-profile')
export class MasterProfileController {
  constructor(private readonly masterProfileService: MasterProfileService) {}

  @Get()
  @ApiOperation({
    summary:
      "Read the lead's latest Master Profile — the reconciliation of BBS Debt Analysis and BBS Financial Analysis. " +
      'Returns { profileAvailable: false, debtAnalysisReady, financialAnalysisReady } when no profile has been ' +
      'generated yet, and { profileAvailable: true, status } for GENERATING/FAILED, with a full COMPLETED shape ' +
      '(including an `isStale` flag when either upstream module has been reprocessed since this profile was generated).',
  })
  getForLead(@Param('bbsLeadId') bbsLeadId: string) {
    return this.masterProfileService.getForLead(bbsLeadId)
  }

  @Post('generate')
  @ApiOperation({
    summary:
      'CCR-initiated generation (first run or explicit regenerate) — never triggered automatically. Requires both ' +
      'Debt Analysis and Financial Analysis to be COMPLETED for this lead; otherwise returns { generated: false, reason }.',
  })
  generate(@Param('bbsLeadId') bbsLeadId: string) {
    return this.masterProfileService.generate(bbsLeadId)
  }
}
