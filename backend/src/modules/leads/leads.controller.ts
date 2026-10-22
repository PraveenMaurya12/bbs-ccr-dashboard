import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Role } from '@prisma/client'

import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Roles } from '@/common/decorators/roles.decorator'
import { RolesGuard } from '@/common/guards/roles.guard'
import { AssignLeadDto } from './dto/assign-lead.dto'
import { CaptureConsentDto } from './dto/capture-consent.dto'
import { CreateLeadDto } from './dto/create-lead.dto'
import { QueryLeadsDto } from './dto/query-leads.dto'
import { UpdateLeadDto } from './dto/update-lead.dto'
import { LeadsService } from './leads.service'
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type'

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new lead — generates a stable BBS Lead ID' })
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.create(dto, user.id)
  }

  @Get()
  @ApiOperation({ summary: 'List leads with pagination, search, and filters' })
  findAll(@Query() query: QueryLeadsDto) {
    return this.leadsService.findAll(query)
  }

  @Get(':bbsLeadId')
  @ApiOperation({ summary: 'Get a lead by its BBS Lead ID' })
  findOne(@Param('bbsLeadId') bbsLeadId: string) {
    return this.leadsService.findByBbsLeadId(bbsLeadId)
  }

  @Patch(':bbsLeadId')
  @ApiOperation({ summary: 'Update permitted lead fields' })
  update(
    @Param('bbsLeadId') bbsLeadId: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.update(bbsLeadId, dto, user.id)
  }

  @Post(':bbsLeadId/consent')
  @ApiOperation({
    summary:
      'CCR-attested consent + PAN capture for a lead created via this internal form (never through the public contact form, which already captures its own). Triggers the one real bureau pull this lead will ever get.',
  })
  captureConsent(
    @Param('bbsLeadId') bbsLeadId: string,
    @Body() dto: CaptureConsentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.captureConsentAndPullReport(bbsLeadId, dto, user.id)
  }

  @Post(':bbsLeadId/assign')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({ summary: 'Assign a lead to a CCR (supervisor/admin only)' })
  assign(
    @Param('bbsLeadId') bbsLeadId: string,
    @Body() dto: AssignLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.assign(bbsLeadId, dto, user.id)
  }
}
