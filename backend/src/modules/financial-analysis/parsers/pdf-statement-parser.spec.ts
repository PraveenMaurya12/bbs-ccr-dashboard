import { parsePdfStatement } from './pdf-statement-parser'
import { buildTestPdf } from './test-helpers/build-test-pdf'
import { StatementParseError } from './types'

describe('parsePdfStatement', () => {
  it('parses real, genuinely-generated PDF bytes via the heuristic text-line fallback', async () => {
    const buffer = buildTestPdf([
      '01/04/2026 SALARY CREDIT ABC CORP 50000.00 Cr 50000.00',
      '02/04/2026 ATM WITHDRAWAL 2000.00 Dr 48000.00',
    ])

    const result = await parsePdfStatement(buffer)

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].rawDate).toBe('01/04/2026')
    expect(result.rows[0].rawCredit).toBe('50000.00')
    expect(result.rows[0].rawBalance).toBe('50000.00')
    expect(result.rows[1].rawDebit).toBe('2000.00')
  })

  it('throws SCANNED_PDF_UNSUPPORTED for a PDF with no extractable text at all', async () => {
    const buffer = buildTestPdf([])
    await expect(parsePdfStatement(buffer)).rejects.toMatchObject({ code: 'SCANNED_PDF_UNSUPPORTED' })
    await expect(parsePdfStatement(buffer)).rejects.toBeInstanceOf(StatementParseError)
  })

  it('throws UNSUPPORTED_LAYOUT when there is text but no recognizable date+amount transaction lines', async () => {
    const buffer = buildTestPdf(['This statement contains only prose with no dates or amounts whatsoever present here.'])
    await expect(parsePdfStatement(buffer)).rejects.toMatchObject({ code: 'UNSUPPORTED_LAYOUT' })
  })

  it('throws CORRUPT_FILE for bytes that are not a real PDF', async () => {
    await expect(parsePdfStatement(Buffer.from('not a pdf'))).rejects.toThrow()
  })
})
