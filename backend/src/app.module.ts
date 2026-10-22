import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'

import { HttpExceptionFilter } from '@/common/filters/http-exception.filter'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor'
import { PrismaModule } from '@/common/prisma/prisma.module'
import configuration from '@/config/configuration'
import { validate } from '@/config/env.validation'
import { AnalysisModule } from '@/modules/analysis/analysis.module'
import { AssessmentsModule } from '@/modules/assessments/assessments.module'
import { AuthModule } from '@/modules/auth/auth.module'
import { CohortEngineModule } from '@/modules/cohort-engine/cohort-engine.module'
import { CustomersModule } from '@/modules/customers/customers.module'
import { DebtAnalysisModule } from '@/modules/debt-analysis/debt-analysis.module'
import { DocumentsModule } from '@/modules/documents/documents.module'
import { FinancialAnalysisModule } from '@/modules/financial-analysis/financial-analysis.module'
import { HealthModule } from '@/modules/health/health.module'
import { LeadsModule } from '@/modules/leads/leads.module'
import { MasterProfileModule } from '@/modules/master-profile/master-profile.module'
import { PathwayEngineModule } from '@/modules/pathway-engine/pathway-engine.module'
import { PlanEngineModule } from '@/modules/plan-engine/plan-engine.module'
import { PublicContactModule } from '@/modules/public-contact/public-contact.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    // Generous global default (protects every route from abuse); the
    // public-contact endpoints override it with much stricter per-route
    // limits via @Throttle(). Applied everywhere via the APP_GUARD below.
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }] }),
    PrismaModule,
    HealthModule,
    AuthModule,
    LeadsModule,
    CustomersModule,
    DocumentsModule,
    FinancialAnalysisModule,
    DebtAnalysisModule,
    MasterProfileModule,
    CohortEngineModule,
    PathwayEngineModule,
    PlanEngineModule,
    AssessmentsModule,
    AnalysisModule,
    PublicContactModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Every route requires a valid JWT unless annotated `@Public()`.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
