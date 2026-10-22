import { Module } from '@nestjs/common'

import { AnalysisModule } from '@/modules/analysis/analysis.module'
import { CohortEngineModule } from '@/modules/cohort-engine/cohort-engine.module'
import { MasterProfileModule } from '@/modules/master-profile/master-profile.module'
import { PathwayEngineModule } from '@/modules/pathway-engine/pathway-engine.module'
import { PlanEngineController } from './plan-engine.controller'
import { PlanEngineService } from './plan-engine.service'

@Module({
  // One-directional: PlanEngineModule imports CohortEngineModule +
  // MasterProfileModule + PathwayEngineModule to consume their already-
  // computed getForLead() output; none of these sibling modules ever
  // imports this one back.
  imports: [CohortEngineModule, MasterProfileModule, PathwayEngineModule, AnalysisModule],
  controllers: [PlanEngineController],
  providers: [PlanEngineService],
})
export class PlanEngineModule {}
