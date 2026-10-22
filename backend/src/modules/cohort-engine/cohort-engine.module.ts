import { Module } from '@nestjs/common'

import { DebtAnalysisModule } from '@/modules/debt-analysis/debt-analysis.module'
import { FinancialAnalysisModule } from '@/modules/financial-analysis/financial-analysis.module'
import { MasterProfileModule } from '@/modules/master-profile/master-profile.module'
import { CohortEngineController } from './cohort-engine.controller'
import { CohortEngineService } from './cohort-engine.service'

@Module({
  // One-directional: CohortEngineModule imports all three sibling analysis
  // modules to consume their already-computed getForLead() output; none of
  // them ever imports this one back.
  imports: [DebtAnalysisModule, FinancialAnalysisModule, MasterProfileModule],
  controllers: [CohortEngineController],
  providers: [CohortEngineService],
  // Exported so PlanEngineModule can inject CohortEngineService directly
  // and consume its already-computed Cohort Decision output, rather than
  // duplicating any of its classification logic.
  exports: [CohortEngineService],
})
export class CohortEngineModule {}
