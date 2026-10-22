import { Module } from '@nestjs/common'

import { CohortEngineModule } from '@/modules/cohort-engine/cohort-engine.module'
import { MasterProfileModule } from '@/modules/master-profile/master-profile.module'
import { PathwayEngineController } from './pathway-engine.controller'
import { PathwayEngineService } from './pathway-engine.service'

@Module({
  // One-directional: PathwayEngineModule imports Cohort Engine + Master
  // Profile to consume their already-computed getForLead() output; neither
  // of them ever imports this one back.
  imports: [CohortEngineModule, MasterProfileModule],
  controllers: [PathwayEngineController],
  providers: [PathwayEngineService],
  // Exported so PlanEngineModule can inject PathwayEngineService directly
  // and consume its already-computed Pathway Decision output, rather than
  // duplicating any of its own routing logic.
  exports: [PathwayEngineService],
})
export class PathwayEngineModule {}
