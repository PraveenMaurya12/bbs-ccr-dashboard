import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Role } from '@prisma/client'

import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Roles } from '@/common/decorators/roles.decorator'
import { RolesGuard } from '@/common/guards/roles.guard'
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type'
import { OverridePlanDto } from './dto/override-plan.dto'
import { UpdateActionStatusDto } from './dto/update-action-status.dto'
import { UpdateConditionStatusDto } from './dto/update-condition-status.dto'
import { PlanEngineService } from './plan-engine.service'

@ApiTags('plan-engine')
@ApiBearerAuth()
@Controller('leads/:bbsLeadId/plan')
export class PlanEngineController {
  constructor(private readonly planEngineService: PlanEngineService) {}

  @Get()
  @ApiOperation({
    summary:
      "Read the lead's latest BBS Plan. Returns { planAvailable: false, cohortDecisionReady } when no plan has been " +
      'generated yet, and { planAvailable: true, status } for GENERATING/FAILED, with a full COMPLETED shape ' +
      '(including every action/condition and an `isStale` flag when the Cohort Decision has moved to a newer version since).',
  })
  getForLead(@Param('bbsLeadId') bbsLeadId: string) {
    return this.planEngineService.getForLead(bbsLeadId)
  }

  @Post('generate')
  @ApiOperation({
    summary:
      'CCR-initiated generation (first run or explicit re-generation) — never triggered automatically. Requires the ' +
      'Cohort Decision to be COMPLETED and not stale; otherwise returns { generated: false, reason }. Generation never ' +
      'refuses based on WHICH cohort was decided — every cohort (including X1/X2/C6 and the upstream-gate states) ' +
      'produces a real, if thinner, plan via the Template Registry.',
  })
  generate(@Param('bbsLeadId') bbsLeadId: string) {
    return this.planEngineService.generate(bbsLeadId)
  }

  @Post('reassess')
  @ApiOperation({ summary: 'Alias of POST .../plan/generate — re-composes the plan from the current Cohort Decision, appending a new plan version.' })
  reassess(@Param('bbsLeadId') bbsLeadId: string) {
    return this.planEngineService.reassess(bbsLeadId)
  }

  @Get('history')
  @ApiOperation({ summary: 'Every persisted BBS Plan version for this lead, newest first — historical plans are never overwritten.' })
  getHistory(@Param('bbsLeadId') bbsLeadId: string) {
    return this.planEngineService.getHistory(bbsLeadId)
  }

  @Post('submit-review')
  @ApiOperation({ summary: 'DRAFT -> CCR_REVIEW or SPECIALIST_REVIEW depending on whether specialist review is required (or SPECIALIST_REVIEW -> CCR_REVIEW once a specialist has cleared it).' })
  submitReview(@Param('bbsLeadId') bbsLeadId: string) {
    return this.planEngineService.submitReview(bbsLeadId)
  }

  @Post('accept')
  @ApiOperation({ summary: 'CCR-attested customer acceptance (CCR_REVIEW -> EXECUTION_READY). This dashboard has no customer-facing portal, so acceptance is always recorded by a CCR on the customer\'s behalf.' })
  accept(@Param('bbsLeadId') bbsLeadId: string) {
    return this.planEngineService.accept(bbsLeadId)
  }

  @Post('activate')
  @ApiOperation({ summary: 'EXECUTION_READY -> ACTIVE.' })
  activate(@Param('bbsLeadId') bbsLeadId: string) {
    return this.planEngineService.activate(bbsLeadId)
  }

  @Post('override')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({ summary: 'Supervisor/admin override of the current plan\'s lifecycle status — creates a new, immutable plan version with a linked audit trail; never mutates the overridden plan.' })
  override(@Param('bbsLeadId') bbsLeadId: string, @Body() dto: OverridePlanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.planEngineService.override(bbsLeadId, { newLifecycleStatus: dto.newLifecycleStatus, reason: dto.reason }, { userId: user.id, role: user.role })
  }

  @Post('actions/:actionId/status')
  @ApiOperation({ summary: 'v3.0 §11.2 — transition one action\'s status on the current plan version, enforcing the legal-transition table on the backend.' })
  updateActionStatus(@Param('bbsLeadId') bbsLeadId: string, @Param('actionId') actionId: string, @Body() dto: UpdateActionStatusDto) {
    return this.planEngineService.updateActionStatus(bbsLeadId, actionId, dto.status)
  }

  @Post('conditions/:conditionId/status')
  @ApiOperation({ summary: 'v3.0 §13.3 — transition one condition\'s state on the current plan version, enforcing the condition transition table on the backend.' })
  updateConditionStatus(@Param('bbsLeadId') bbsLeadId: string, @Param('conditionId') conditionId: string, @Body() dto: UpdateConditionStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.planEngineService.updateConditionStatus(bbsLeadId, conditionId, { newState: dto.state, verificationEvidence: dto.verificationEvidence }, { userId: user.id })
  }
}
