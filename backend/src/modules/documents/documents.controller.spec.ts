import { BadRequestException } from '@nestjs/common'

import { DocumentsController } from './documents.controller'

function makeController(uploadImpl: jest.Mock = jest.fn().mockResolvedValue({ id: 'doc-1' })) {
  const documentsService = { upload: uploadImpl } as never
  return new DocumentsController(documentsService)
}

const user = { id: 'user-1' } as never

describe('DocumentsController.upload MIME allowlist', () => {
  it('accepts PDF/JPEG/PNG for every document type, including BANK_STATEMENT', async () => {
    const controller = makeController()
    for (const mimetype of ['application/pdf', 'image/jpeg', 'image/png']) {
      await expect(
        controller.upload('BBS-LD-1', { documentType: 'BANK_STATEMENT' } as never, { mimetype, buffer: Buffer.from('x'), originalname: 'f' } as never, user),
      ).resolves.toBeDefined()
    }
  })

  it('rejects XLSX/CSV for a non-BANK_STATEMENT document type', async () => {
    const controller = makeController()
    await expect(
      controller.upload(
        'BBS-LD-1',
        { documentType: 'PAN_CARD' } as never,
        { mimetype: 'text/csv', buffer: Buffer.from('x'), originalname: 'f.csv' } as never,
        user,
      ),
    ).rejects.toThrow(BadRequestException)
  })

  it('accepts XLSX/CSV specifically for BANK_STATEMENT', async () => {
    const controller = makeController()
    for (const mimetype of ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']) {
      await expect(
        controller.upload('BBS-LD-1', { documentType: 'BANK_STATEMENT' } as never, { mimetype, buffer: Buffer.from('x'), originalname: 'f' } as never, user),
      ).resolves.toBeDefined()
    }
  })

  it('rejects an unsupported type even for BANK_STATEMENT, with a message naming the accepted formats', async () => {
    const controller = makeController()
    await expect(
      controller.upload(
        'BBS-LD-1',
        { documentType: 'BANK_STATEMENT' } as never,
        { mimetype: 'application/zip', buffer: Buffer.from('x'), originalname: 'f.zip' } as never,
        user,
      ),
    ).rejects.toThrow(/PDF, JPEG, PNG, XLSX, and CSV/)
  })

  it('throws BadRequestException when no file was uploaded at all', async () => {
    const controller = makeController()
    await expect(controller.upload('BBS-LD-1', { documentType: 'PAN_CARD' } as never, undefined, user)).rejects.toThrow(BadRequestException)
  })
})
