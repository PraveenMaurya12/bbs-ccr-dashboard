import type { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/main'
import type { AppConfig } from '../src/config/configuration'

/**
 * Exercises the real Documents tab flow end-to-end against the app's
 * configured (local dev) database and disk storage, the same way the
 * other e2e specs do. Each run creates its own fresh lead so document
 * records never collide across runs.
 */
describe('Documents (e2e)', () => {
  let app: NestExpressApplication
  let accessToken: string
  let bbsLeadId: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication<NestExpressApplication>()
    configureApp(app, app.get(ConfigService).get<AppConfig>('app')!)
    await app.init()

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ccr.dev@bbs.example.test', password: 'DevOnly-Passw0rd-2026' })
    accessToken = login.body.data.accessToken

    const lead = await request(app.getHttpServer())
      .post('/api/leads')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fullName: 'Documents E2E Test Lead',
        phone: `+91 9${Math.floor(100000000 + Math.random() * 900000000)}`,
        email: 'documents.e2e@example.test',
        city: 'Pune',
        source: 'ONLINE',
      })
    bbsLeadId = lead.body.data.bbsLeadId
  })

  afterAll(async () => {
    await app.close()
  })

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${accessToken}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/documents`)
    expect(res.status).toBe(401)
  })

  it('starts with an empty document list for a brand new lead', async () => {
    const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/documents`))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('rejects an unsupported file type', async () => {
    const res = await auth(
      request(app.getHttpServer())
        .post(`/api/leads/${bbsLeadId}/documents`)
        .field('documentType', 'PAN_CARD')
        .attach('file', Buffer.from('not a real document'), {
          filename: 'malware.exe',
          contentType: 'application/x-msdownload',
        }),
    )
    expect(res.status).toBe(400)
  })

  it('rejects an oversized file', async () => {
    // DOCUMENT_MAX_FILE_SIZE_BYTES defaults to 10 MB in .env — 11 MB trips it.
    const oversized = Buffer.alloc(11 * 1024 * 1024, 1)
    const res = await auth(
      request(app.getHttpServer())
        .post(`/api/leads/${bbsLeadId}/documents`)
        .field('documentType', 'PAN_CARD')
        .attach('file', oversized, { filename: 'huge.pdf', contentType: 'application/pdf' }),
    )
    // Multer's own LIMIT_FILE_SIZE is converted by Nest's FileInterceptor
    // into a PayloadTooLargeException — 413, the more specifically correct
    // status for this case (not a generic 400).
    expect(res.status).toBe(413)
  })

  let uploadedDocumentId: string

  it('uploads a valid PDF and returns it as PENDING', async () => {
    const res = await auth(
      request(app.getHttpServer())
        .post(`/api/leads/${bbsLeadId}/documents`)
        .field('documentType', 'PAN_CARD')
        .attach('file', Buffer.from('%PDF-1.4 fake but valid-enough test content'), {
          filename: 'pan-card.pdf',
          contentType: 'application/pdf',
        }),
    )
    expect(res.status).toBe(201)
    expect(res.body.data.documentType).toBe('PAN_CARD')
    expect(res.body.data.originalFilename).toBe('pan-card.pdf')
    expect(res.body.data.verificationStatus).toBe('PENDING')
    uploadedDocumentId = res.body.data.id
  })

  it('lists the uploaded document for this lead', async () => {
    const res = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/documents`))
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].id).toBe(uploadedDocumentId)
  })

  it('streams the real file bytes back on view', async () => {
    const res = await auth(
      request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/documents/${uploadedDocumentId}/file`),
    )
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    // supertest only populates `.text` for content-types it treats as
    // text/*; for application/pdf the raw bytes land in `.body` instead.
    expect(Buffer.from(res.body).toString()).toContain('%PDF-1.4 fake but valid-enough test content')
  })

  it('rejects an unauthenticated request for a view-ticket', async () => {
    const res = await request(app.getHttpServer()).post(
      `/api/leads/${bbsLeadId}/documents/${uploadedDocumentId}/view-ticket`,
    )
    expect(res.status).toBe(401)
  })

  it('a minted view-ticket opens the file with no Authorization header at all', async () => {
    const ticketRes = await auth(
      request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/documents/${uploadedDocumentId}/view-ticket`),
    )
    expect(ticketRes.status).toBe(201)
    const token = ticketRes.body.data.token
    expect(typeof token).toBe('string')

    // No .set('Authorization', ...) here at all — this is the whole point.
    const fileRes = await request(app.getHttpServer()).get(
      `/api/leads/${bbsLeadId}/documents/${uploadedDocumentId}/view?token=${token}`,
    )
    expect(fileRes.status).toBe(200)
    expect(Buffer.from(fileRes.body).toString()).toContain('%PDF-1.4 fake but valid-enough test content')
  })

  it('rejects a view-ticket minted for a different document', async () => {
    const otherUpload = await auth(
      request(app.getHttpServer())
        .post(`/api/leads/${bbsLeadId}/documents`)
        .field('documentType', 'AADHAAR_CARD')
        .attach('file', Buffer.from('%PDF-1.4 a completely different document'), {
          filename: 'aadhaar.pdf',
          contentType: 'application/pdf',
        }),
    )
    const otherDocumentId = otherUpload.body.data.id

    const ticketRes = await auth(
      request(app.getHttpServer()).post(`/api/leads/${bbsLeadId}/documents/${otherDocumentId}/view-ticket`),
    )
    const token = ticketRes.body.data.token

    const fileRes = await request(app.getHttpServer()).get(
      `/api/leads/${bbsLeadId}/documents/${uploadedDocumentId}/view?token=${token}`,
    )
    expect(fileRes.status).toBe(401)
  })

  it('rejects a request to /view with no token at all', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/leads/${bbsLeadId}/documents/${uploadedDocumentId}/view`,
    )
    expect(res.status).toBe(400)
  })

  it('does not leak a document across a different lead', async () => {
    const otherLead = await auth(
      request(app.getHttpServer()).post('/api/leads').send({
        fullName: 'Other Lead',
        phone: `+91 9${Math.floor(100000000 + Math.random() * 900000000)}`,
        email: 'other.lead@example.test',
        city: 'Mumbai',
        source: 'ONLINE',
      }),
    )
    const otherBbsLeadId = otherLead.body.data.bbsLeadId

    const res = await auth(
      request(app.getHttpServer()).get(`/api/leads/${otherBbsLeadId}/documents/${uploadedDocumentId}/file`),
    )
    expect(res.status).toBe(404)
  })

  it('marks the document VERIFIED and records who/when', async () => {
    const res = await auth(
      request(app.getHttpServer())
        .patch(`/api/leads/${bbsLeadId}/documents/${uploadedDocumentId}/verify`)
        .send({ status: 'VERIFIED' }),
    )
    expect(res.status).toBe(200)
    expect(res.body.data.verificationStatus).toBe('VERIFIED')
    expect(res.body.data.verifiedBy).toBeTruthy()
    expect(res.body.data.verifiedAt).toBeTruthy()
  })

  it('uploading a second file for the same checklist slot keeps both records (does not overwrite)', async () => {
    const before = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/documents`))
    const countBefore = before.body.data.length

    const res = await auth(
      request(app.getHttpServer())
        .post(`/api/leads/${bbsLeadId}/documents`)
        .field('documentType', 'PAN_CARD')
        .attach('file', Buffer.from('%PDF-1.4 a second revision of the same document'), {
          filename: 'pan-card-v2.pdf',
          contentType: 'application/pdf',
        }),
    )
    expect(res.status).toBe(201)

    const after = await auth(request(app.getHttpServer()).get(`/api/leads/${bbsLeadId}/documents`))
    expect(after.body.data).toHaveLength(countBefore + 1)
    // Both the original PAN_CARD upload and this new revision are present —
    // neither replaced the other.
    expect(after.body.data.filter((d: { documentType: string }) => d.documentType === 'PAN_CARD')).toHaveLength(2)
  })
})
