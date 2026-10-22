import { Controller, Get, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { PathwayEngineService } from './pathway-engine.service'

@ApiTags('pathway-engine')
@ApiBearerAuth()
@Controller('leads/:bbsLeadId/pathway')
export class PathwayEngineController {
  constructor(private readonly pathwayEngineService: PathwayEngineService) {}

  @Get()
  @ApiOperation({
    summary:
      "Read the lead's latest Pathway Decision. Returns { decisionAvailable: false, cohortDecisionReady } when no decision has been generated yet, and " +
      '{ decisionAvailable: true, status } for GENERATING/FAILED, with a full COMPLETED shape (including every evaluated P-rule and an `isStale` flag when ' +
      'the Cohort Decision has moved to a newer version since).',
  })
  getForLead(@Param('bbsLeadId') bbsLeadId: string) {
    return this.pathwayEngineService.getForLead(bbsLeadId)
  }

  @Post('evaluate')
  @ApiOperation({
    summary:
      'CCR-initiated evaluation (first run or explicit re-evaluation) — never triggered automatically. Requires the Cohort Decision to be COMPLETED and ' +
      'not stale; otherwise returns { generated: false, reason }. Never calls an AI provider — the pathway decision itself is always deterministic.',
  })
  evaluate(@Param('bbsLeadId') bbsLeadId: string) {
    return this.pathwayEngineService.evaluate(bbsLeadId)
  }

  @Post('reassess')
  @ApiOperation({ summary: 'Alias of POST .../pathway/evaluate — re-runs the full rule evaluation and precedence resolution, appending a new decision version.' })
  reassess(@Param('bbsLeadId') bbsLeadId: string) {
    return this.pathwayEngineService.reassess(bbsLeadId)
  }

  @Get('history')
  @ApiOperation({ summary: 'Every persisted Pathway Decision version for this lead, newest first — historical decisions are never overwritten.' })
  getHistory(@Param('bbsLeadId') bbsLeadId: string) {
    return this.pathwayEngineService.getHistory(bbsLeadId)
  }
}
