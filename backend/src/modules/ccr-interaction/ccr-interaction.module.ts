import { Module } from '@nestjs/common'

import { CohortEngineModule } from '@/modules/cohort-engine/cohort-engine.module'
import { DebtAnalysisModule } from '@/modules/debt-analysis/debt-analysis.module'
import { FinancialAnalysisModule } from '@/modules/financial-analysis/financial-analysis.module'
import { MasterProfileModule } from '@/modules/master-profile/master-profile.module'
import { PathwayEngineModule } from '@/modules/pathway-engine/pathway-engine.module'
import { PlanEngineModule } from '@/modules/plan-engine/plan-engine.module'
import { CcrInteractionController } from './ccr-interaction.controller'
import { CcrInteractionService } from './ccr-interaction.service'

@Module({
  // One-directional, like MasterProfileModule: this module consumes the
  // already-computed L1/L2/Master Profile services; none of them import it back.
  imports: [DebtAnalysisModule, FinancialAnalysisModule, MasterProfileModule, CohortEngineModule, PathwayEngineModule, PlanEngineModule],
  controllers: [CcrInteractionController],
  providers: [CcrInteractionService],
})
export class CcrInteractionModule {}
