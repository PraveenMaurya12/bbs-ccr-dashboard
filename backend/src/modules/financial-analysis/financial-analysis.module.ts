import { Module } from '@nestjs/common'

import { AnalysisModule } from '@/modules/analysis/analysis.module'
import { FinancialAnalysisController } from './financial-analysis.controller'
import { FinancialAnalysisService } from './financial-analysis.service'

@Module({
  imports: [AnalysisModule],
  controllers: [FinancialAnalysisController],
  providers: [FinancialAnalysisService],
  exports: [FinancialAnalysisService],
})
export class FinancialAnalysisModule {}
