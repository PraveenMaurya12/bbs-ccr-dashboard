import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsObject, IsString } from 'class-validator'

import type { AnalysisJobType } from '../providers/ai-provider.interface'

const JOB_TYPES: AnalysisJobType[] = [
  'L1_CREDIT_SCREENING',
  'L2_FINANCIAL_ANALYSIS',
  'L3_ASSESSMENT',
  'RECOVERY_PLAN_GENERATION',
]

export class CreateAnalysisJobDto {
  @ApiProperty({ description: 'BBS Lead ID this analysis job is for' })
  @IsString()
  bbsLeadId!: string

  @ApiProperty({ enum: JOB_TYPES })
  @IsIn(JOB_TYPES)
  jobType!: AnalysisJobType

  @ApiProperty({ description: 'Job-type-specific input payload', type: Object })
  @IsObject()
  payload!: Record<string, unknown>
}
