import type { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/main'
import type { AppConfig } from '../src/config/configuration'

describe('Health (e2e)', () => {
  let app: NestExpressApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication<NestExpressApplication>()
    configureApp(app, app.get(ConfigService).get<AppConfig>('app')!)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/health reports database connectivity', async () => {
    const response = await request(app.getHttpServer()).get('/api/health')

    // 200 (wrapped as { success, data }) if the configured Postgres is
    // reachable, 503 (the exception filter's flat error envelope) if not —
    // either way the endpoint itself must respond, never throw unhandled.
    expect([200, 503]).toContain(response.status)
    const timestamp = response.status === 200 ? response.body?.data?.timestamp : response.body?.timestamp
    expect(typeof timestamp).toBe('string')
  })
})
