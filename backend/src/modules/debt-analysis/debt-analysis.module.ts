import { Module } from '@nestjs/common'

import { BureauModule } from '@/modules/bureau/bureau.module'
import { DebtAnalysisController } from './debt-analysis.controller'
import { DebtAnalysisService } from './debt-analysis.service'

@Module({
  imports: [BureauModule],
  controllers: [DebtAnalysisController],
  providers: [DebtAnalysisService],
  // Exported so MasterProfileModule can inject DebtAnalysisService directly
  // and consume its already-computed level1 output, rather than duplicating
  // any of its calculation logic.
  exports: [DebtAnalysisService],
})
export class DebtAnalysisModule {}
