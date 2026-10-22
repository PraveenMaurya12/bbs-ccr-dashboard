import { Module } from '@nestjs/common'

import { BureauModule } from '@/modules/bureau/bureau.module'
import { LeadsController } from './leads.controller'
import { LeadsService } from './leads.service'

@Module({
  // BureauModule is imported so captureConsentAndPullReport() can trigger
  // the one real bureau pull a CCR-created lead would otherwise never
  // get (see that method's own doc comment) — one-directional, BureauModule
  // never imports this one back.
  imports: [BureauModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
