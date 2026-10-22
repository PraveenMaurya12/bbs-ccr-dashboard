import 'reflect-metadata'
import { Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'

import { AppModule } from './app.module'
import type { AppConfig } from './config/configuration'

/**
 * Applied both by bootstrap() below and by every e2e test (see
 * test/*.e2e-spec.ts) that builds the app via Test.createTestingModule
 * instead of NestFactory.create — otherwise e2e tests would exercise a
 * differently-configured app than production (no CORS, no ValidationPipe)
 * and could pass while the real deployed behavior is broken.
 */
export function configureApp(app: NestExpressApplication, appConfig: AppConfig): void {
  // Controls how many reverse-proxy hops `request.ip` trusts when
  // deriving the real client IP from X-Forwarded-For (see
  // common/http/client-ip.ts, and TRUST_PROXY_HOPS's own doc comment in
  // config/configuration.ts) — applied here, centrally, so every request
  // handler's `request.ip` is already correctly resolved; nothing reads
  // X-Forwarded-For directly anywhere else in this codebase.
  app.set('trust proxy', appConfig.trustProxyHops)

  app.use(helmet())

  // The CCR dashboard's own origins plus the public website's — the public
  // site only ever reaches the narrow `/api/public/*` surface (see
  // PublicContactModule); every other route stays behind JwtAuthGuard
  // regardless of which origin called it.
  app.enableCors({
    origin: [...appConfig.corsOrigins, ...appConfig.publicContact.siteOrigins],
    credentials: true,
  })

  // Strips unknown fields and rejects requests carrying fields the DTO
  // doesn't declare — every request is validated, nothing passes through
  // as an untyped blob.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  app.setGlobalPrefix('api')
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const configService = app.get(ConfigService)
  const appConfig = configService.get<AppConfig>('app')!

  configureApp(app, appConfig)

  // Exposes the full route/DTO schema — unnecessary reconnaissance surface
  // for an app handling PII/financial data on a real deployment (actual
  // data still requires a real JWT per route regardless, so this is an
  // information-disclosure gate, not the actual auth boundary).
  if (appConfig.nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('BBS CCR Dashboard API')
      .setDescription(
        'CCR-only backend for the Bade Bhaisaab Customer Care Representative dashboard. ' +
          'Every route requires a CCR JWT except the narrow, rate-limited public ' +
          'surface under /api/public (the public website’s contact form).',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build()
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('api/docs', app, swaggerDocument)
  }

  await app.listen(appConfig.port)
  Logger.log(`BBS CCR backend listening on http://localhost:${appConfig.port}/api`, 'Bootstrap')
  if (appConfig.nodeEnv !== 'production') {
    Logger.log(`Swagger docs at http://localhost:${appConfig.port}/api/docs`, 'Bootstrap')
  }
}

// Guarded so importing configureApp() from test/*.e2e-spec.ts (which needs
// it to replicate production's CORS/ValidationPipe setup) never also starts
// a real listening server as a side effect of the import.
if (require.main === module) {
  void bootstrap()
}
