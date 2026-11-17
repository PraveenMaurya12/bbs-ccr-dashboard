import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Role } from '@prisma/client'

import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Roles } from '@/common/decorators/roles.decorator'
import { RolesGuard } from '@/common/guards/roles.guard'
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type'
import { CcrInteractionService } from './ccr-interaction.service'
import { SaveCcrAnswersDto } from './dto/save-answers.dto'

@ApiTags('ccr-interaction')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.CCR, Role.SUPERVISOR, Role.ADMIN)
@Controller('leads/:bbsLeadId')
export class CcrInteractionController {
  constructor(private readonly ccrInteractionService: CcrInteractionService) {}

  @Get('ccr-interaction')
  @ApiOperation({ summary: 'The lead\'s CCR verification questions (from L1 + L2) with any saved answers and progress.' })
  getForLead(@Param('bbsLeadId') bbsLeadId: string) {
    return this.ccrInteractionService.getForLead(bbsLeadId)
  }

  @Put('ccr-interaction/answers')
  @ApiOperation({ summary: 'Save or edit answers (partial saves allowed). Editing a submitted interaction reopens it.' })
  saveAnswers(@Param('bbsLeadId') bbsLeadId: string, @Body() dto: SaveCcrAnswersDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ccrInteractionService.saveAnswers(bbsLeadId, dto, user)
  }

  @Post('ccr-interaction/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit the completed interaction: applies structured answers and regenerates the Master Profile.' })
  submit(@Param('bbsLeadId') bbsLeadId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ccrInteractionService.submit(bbsLeadId, user)
  }

  @Get('data-requirements')
  @ApiOperation({ summary: 'What data this lead still needs (derived from the persisted Master Profile) and the action that supplies each item.' })
  dataRequirements(@Param('bbsLeadId') bbsLeadId: string) {
    return this.ccrInteractionService.getDataRequirements(bbsLeadId)
  }

  @Post('recalculate-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Regenerate the Master Profile, then run Cohort, Pathway and Plan in order. Never approves or activates a plan.' })
  recalculateAll(@Param('bbsLeadId') bbsLeadId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ccrInteractionService.recalculateAll(bbsLeadId, user)
  }
}
