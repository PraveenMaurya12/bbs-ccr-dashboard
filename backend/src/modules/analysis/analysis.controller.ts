import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { AnalysisService } from './analysis.service'
import { CreateAnalysisJobDto } from './dto/create-analysis-job.dto'

@ApiTags('analysis')
@ApiBearerAuth()
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('jobs')
  @ApiOperation({ summary: 'Queue an AI analysis job (mock provider only, for now)' })
  create(@Body() dto: CreateAnalysisJobDto) {
    return this.analysisService.createAndRun(dto)
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Get an analysis job\'s status and result (if completed)' })
  getStatus(@Param('jobId') jobId: string) {
    return this.analysisService.getStatus(jobId)
  }
}
