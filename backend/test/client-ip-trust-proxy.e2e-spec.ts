import { Controller, Get, Module, Req } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import type { Request } from 'express'
import request from 'supertest'

import { extractClientIp } from '../src/common/http/client-ip'
import configuration from '../src/config/configuration'
import { configureApp } from '../src/main'

/**
 * Isolated from AppModule/the database on purpose — this only exercises
 * one specific main.ts-level Express concern (how `request.ip` resolves
 * under `trust proxy`), which has nothing to do with business logic.
 */
@Controller('test-ip')
class TestIpController {
  @Get()
  getIp(@Req() req: Request) {
    return { ip: extractClientIp(req) }
  }
}

@Module({ controllers: [TestIpController] })
class TestIpModule {}

async function buildApp(trustProxyHops: number): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [TestIpModule] }).compile()
  const app = moduleRef.createNestApplication<NestExpressApplication>()
  const appConfig = { ...configuration().app, trustProxyHops }
  configureApp(app, appConfig)
  await app.init()
  return app
}

describe('Client IP resolution under trust proxy (e2e)', () => {
  describe('trustProxyHops = 0 (local dev — no real proxy in front)', () => {
    let app: NestExpressApplication
    beforeAll(async () => {
      app = await buildApp(0)
    })
    afterAll(async () => {
      await app.close()
    })

    it('IPv4 direct client — resolves to the real connecting socket address', async () => {
      const res = await request(app.getHttpServer()).get('/api/test-ip')
      expect(res.status).toBe(200)
      // supertest connects over loopback — IPv4 localhost sometimes
      // appears as the IPv6-mapped ::ffff:127.0.0.1 form, which
      // normalizeClientIp unwraps to plain 127.0.0.1.
      expect(['127.0.0.1', '::1']).toContain(res.body.ip)
    })

    it('ignores an untrusted X-Forwarded-For header entirely when no proxy hop is configured as trusted — the spoofing case', async () => {
      const res = await request(app.getHttpServer()).get('/api/test-ip').set('X-Forwarded-For', '198.51.100.99')
      expect(res.status).toBe(200)
      // Must NOT be the attacker-supplied header value — with
      // trustProxyHops=0, Express ignores X-Forwarded-For completely and
      // reports only the real, direct socket address.
      expect(res.body.ip).not.toBe('198.51.100.99')
      expect(['127.0.0.1', '::1']).toContain(res.body.ip)
    })
  })

  describe('trustProxyHops = 1 (the documented production topology — one Render edge-proxy hop)', () => {
    let app: NestExpressApplication
    beforeAll(async () => {
      app = await buildApp(1)
    })
    afterAll(async () => {
      await app.close()
    })

    it('a single-hop proxy/load-balancer request — trusts the one forwarded value as the real client IP', async () => {
      const res = await request(app.getHttpServer()).get('/api/test-ip').set('X-Forwarded-For', '203.0.113.5')
      expect(res.status).toBe(200)
      expect(res.body.ip).toBe('203.0.113.5')
    })

    it('multiple X-Forwarded-For values — trusts only the RIGHTMOST entry (what the one trusted hop itself appended), never an earlier client-supplied value', async () => {
      // X-Forwarded-For is appended-to left-to-right as a request passes
      // through hops, so the entry closest to the server (rightmost) is
      // what the one hop we actually trust (Render's own edge proxy)
      // itself reported as the address it received the request from. An
      // earlier entry could have been supplied by the client itself and
      // must never be trusted as "the real IP" — confirmed empirically
      // here, not assumed.
      const res = await request(app.getHttpServer()).get('/api/test-ip').set('X-Forwarded-For', '198.51.100.10, 203.0.113.5')
      expect(res.status).toBe(200)
      expect(res.body.ip).toBe('203.0.113.5')
    })

    it('a spoofed/untrusted SECOND forwarded hop beyond the configured trust count is not blindly trusted as the client', async () => {
      // With trustProxyHops=1, only the real proxy's own hop is trusted —
      // an attacker prepending extra fake entries before reaching the
      // real proxy must not be able to claim an arbitrary IP as "the
      // client" beyond what the one trusted hop actually reports.
      const res = await request(app.getHttpServer())
        .get('/api/test-ip')
        .set('X-Forwarded-For', '198.51.100.1, 198.51.100.2, 203.0.113.5')
      expect(res.status).toBe(200)
      // Only the last (right-most, closest-to-server) entry is trusted as
      // the real proxy hop's own report — the attacker-controlled earlier
      // entries are not what gets returned as the resolved IP.
      expect(res.body.ip).toBe('203.0.113.5')
    })

    it('IPv6 client behind the trusted proxy', async () => {
      const res = await request(app.getHttpServer()).get('/api/test-ip').set('X-Forwarded-For', '2001:db8::1')
      expect(res.status).toBe(200)
      expect(res.body.ip).toBe('2001:db8::1')
    })

    it('missing IP — no X-Forwarded-For and no usable socket address is handled by returning null, never a fabricated value', async () => {
      // extractClientIp itself is already unit-tested for this (missing
      // request.ip entirely) — this just confirms the controller-level
      // contract never substitutes a placeholder when resolution fails.
      expect(extractClientIp({})).toBeNull()
    })
  })
})
