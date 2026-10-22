import { Module } from '@nestjs/common'

import { AnalysisModule } from '@/modules/analysis/analysis.module'
import { DebtAnalysisModule } from '@/modules/debt-analysis/debt-analysis.module'
import { FinancialAnalysisModule } from '@/modules/financial-analysis/financial-analysis.module'
import { MasterProfileController } from './master-profile.controller'
import { MasterProfileService } from './master-profile.service'

@Module({
  // One-directional: MasterProfileModule imports both sibling analysis
  // modules to consume their already-computed getForLead() output; neither
  // sibling module ever imports this one back.
  imports: [DebtAnalysisModule, FinancialAnalysisModule, AnalysisModule],
  controllers: [MasterProfileController],
  providers: [MasterProfileService],
  // Exported so CohortEngineModule can inject MasterProfileService
  // directly and consume its already-computed cohortAttributes output,
  // rather than duplicating any of its calculation logic.
  exports: [MasterProfileService],
})
export class MasterProfileModule {}
