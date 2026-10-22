import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Role } from '@prisma/client'

import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Roles } from '@/common/decorators/roles.decorator'
import { RolesGuard } from '@/common/guards/roles.guard'
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type'
import { CohortEngineService } from './cohort-engine.service'
import { ComplianceActionDto } from './dto/compliance-action.dto'
import { DeclineCohortDto } from './dto/decline-cohort.dto'
import { OverrideCohortDto } from './dto/override-cohort.dto'

@ApiTags('cohort-engine')
@ApiBearerAuth()
@Controller('leads/:bbsLeadId/cohort')
export class CohortEngineController {
  constructor(private readonly cohortEngineService: CohortEngineService) {}

  @Get()
  @ApiOperation({
    summary:
      "Read the lead's latest Cohort Decision. Returns { decisionAvailable: false, masterProfileReady } when no decision has " +
      'been generated yet, and { decisionAvailable: true, status } for GENERATING/FAILED, with a full COMPLETED shape ' +
      '(including every evaluated rule result and an `isStale` flag when Master Profile has moved to a newer version since).',
  })
  getForLead(@Param('bbsLeadId') bbsLeadId: string) {
    return this.cohortEngineService.getForLead(bbsLeadId)
  }

  @Post('evaluate')
  @ApiOperation({
    summary:
      'CCR-initiated evaluation (first run or explicit re-evaluation) — never triggered automatically. Requires Master ' +
      'Profile to be COMPLETED and not stale; otherwise returns { generated: false, reason }. Never calls an AI provider — ' +
      'the cohort decision itself is always deterministic.',
  })
  evaluate(@Param('bbsLeadId') bbsLeadId: string) {
    return this.cohortEngineService.evaluate(bbsLeadId)
  }

  @Post('recalculate')
  @ApiOperation({ summary: 'Alias of POST .../cohort/evaluate — re-runs the full rule evaluation and precedence resolution, appending a new decision version.' })
  recalculate(@Param('bbsLeadId') bbsLeadId: string) {
    return this.cohortEngineService.recalculate(bbsLeadId)
  }

  @Get('history')
  @ApiOperation({ summary: 'Every persisted Cohort Decision version for this lead, newest first — historical decisions are never overwritten.' })
  getHistory(@Param('bbsLeadId') bbsLeadId: string) {
    return this.cohortEngineService.getHistory(bbsLeadId)
  }

  @Get('refresh-triggers')
  @ApiOperation({
    summary:
      "v3.0 §15.1's refresh-trigger taxonomy, made inspectable: all 6 documented triggers (new bank statement, new bureau pull, CCR discovery complete, " +
      'compliance cleared, policy change, material event), each with its required conditions, affected layers, and expected re-evaluation behaviour — enriched ' +
      'with real per-lead applicability where this codebase can honestly determine it.',
  })
  getRefreshTriggers(@Param('bbsLeadId') bbsLeadId: string) {
    return this.cohortEngineService.getRefreshTriggers(bbsLeadId)
  }

  @Post('override')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({ summary: 'Supervisor/admin override of the current primary cohort — creates a new, immutable decision version with a linked audit trail; never mutates the overridden decision.' })
  override(@Param('bbsLeadId') bbsLeadId: string, @Body() dto: OverrideCohortDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cohortEngineService.override(bbsLeadId, { newPrimaryCohort: dto.newPrimaryCohort, reason: dto.reason, approverId: dto.approverId }, { userId: user.id, role: user.role })
  }

  @Post('decline')
  @ApiOperation({ summary: 'v3.0 §14.3: records the customer\'s explicit decision to decline — creates a new, immutable decision version with lifecycleState CUSTOMER_DECLINED (terminal). CCR-attested (this dashboard has no customer portal).' })
  decline(@Param('bbsLeadId') bbsLeadId: string, @Body() dto: DeclineCohortDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cohortEngineService.decline(bbsLeadId, dto.reason ?? null, { userId: user.id })
  }

  @Post('compliance/clear')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({
    summary:
      'v3.0 §7.4 compliance feedback loop, step 1: records that compliance has CLEARED an active hold — creates a new, immutable decision version promoting ' +
      'the next-highest real cohort candidate already preserved in the prior decision\'s own secondaryFlags (never re-runs the 24-rule evaluation against ' +
      'stale upstream data). Requires an active, unresolved compliance hold on the latest decision; 400s otherwise.',
  })
  clearCompliance(@Param('bbsLeadId') bbsLeadId: string, @Body() dto: ComplianceActionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cohortEngineService.clearCompliance(bbsLeadId, dto.reason, { userId: user.id })
  }

  @Post('compliance/decline')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({
    summary:
      'v3.0 §7.4 compliance feedback loop, step 2: records that compliance has DECLINED — creates a new, immutable decision version with primaryCohort X2 ' +
      '("Outside Current Program"), per the spec\'s own explicit instruction. Requires an active, unresolved compliance hold on the latest decision; 400s otherwise.',
  })
  declineCompliance(@Param('bbsLeadId') bbsLeadId: string, @Body() dto: ComplianceActionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cohortEngineService.declineCompliance(bbsLeadId, dto.reason, { userId: user.id })
  }
}
