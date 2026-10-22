import { Controller, Get, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { BureauReportService } from '@/modules/bureau/bureau-report.service'
import { DebtAnalysisService } from './debt-analysis.service'

@ApiTags('debt-analysis')
@ApiBearerAuth()
@Controller('leads/:bbsLeadId/debt-analysis')
export class DebtAnalysisController {
  constructor(
    private readonly debtAnalysisService: DebtAnalysisService,
    private readonly bureauReportService: BureauReportService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      "Compute the lead's Debt Analysis tab data from its one-and-only Experian call (at most one is ever " +
      'made per lead — see BureauReportService). Returns { reportAvailable: false } when no call has ever ' +
      'been attempted, and a distinct { reportAvailable: true, status } shape for IN_PROGRESS/NO_RECORD/' +
      'FAILED/REQUIRES_REVIEW, never fabricated figures.',
  })
  getForLead(@Param('bbsLeadId') bbsLeadId: string) {
    return this.debtAnalysisService.getForLead(bbsLeadId)
  }

  @Get('call-brief')
  @ApiOperation({
    summary:
      'A CCR call-prep brief projected from the exact same BBS Level 1 Credit Intelligence as the main Debt ' +
      'Analysis response above — never a second, independent analysis. Surfaces credit position, debt ' +
      'inventory summary, delinquency, risk signals, and (when Gemini succeeded) its suggested questions for ' +
      'the CCR and any noted data gaps.',
  })
  getCallBrief(@Param('bbsLeadId') bbsLeadId: string) {
    return this.debtAnalysisService.getCallBriefForLead(bbsLeadId)
  }

  @Post('reprocess')
  @ApiOperation({
    summary:
      'Re-runs the mapper against this lead\'s already-stored raw bureau response (REQUIRES_REVIEW only) — ' +
      'NEVER calls Experian again. Reports { reprocessed: false, reason } when there is no stored response ' +
      'to reprocess (e.g. the original call never received one).',
  })
  reprocess(@Param('bbsLeadId') bbsLeadId: string) {
    return this.bureauReportService.reprocessStoredResponse(bbsLeadId)
  }
}
