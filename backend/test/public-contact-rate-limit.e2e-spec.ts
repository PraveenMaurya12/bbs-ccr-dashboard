import type { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/main'
import type { AppConfig } from '../src/config/configuration'

/**
 * Isolated in its own app instance (own in-memory ThrottlerStorage) so
 * tripping the limit here can never bleed into public-contact.e2e-spec.ts's
 * functional assertions, which run in a separate app instance.
 */
describe('Public Contact rate limiting (e2e)', () => {
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

  it('throttles otp/request after 5 requests from the same IP within the window', async () => {
    const responses: number[] = []
    for (let i = 0; i < 6; i++) {
      const mobile = `9${Math.floor(100000000 + Math.random() * 900000000)}`
      const res = await request(app.getHttpServer())
        .post('/api/public/contact/otp/request')
        .send({ mobile })
      responses.push(res.status)
    }

    expect(responses.slice(0, 5)).toEqual([200, 200, 200, 200, 200])
    expect(responses[5]).toBe(429)
  })
})
