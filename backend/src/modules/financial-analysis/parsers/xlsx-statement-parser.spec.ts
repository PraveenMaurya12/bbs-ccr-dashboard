import ExcelJS from 'exceljs'

import { parseXlsxStatement } from './xlsx-statement-parser'
import { StatementParseError } from './types'

async function buildWorkbookBuffer(rows: Array<Array<string | number>>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Statement')
  for (const row of rows) sheet.addRow(row)
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

describe('parseXlsxStatement', () => {
  it('parses a real XLSX workbook built via exceljs, with a metadata preamble before the header row', async () => {
    const buffer = await buildWorkbookBuffer([
      ['Account Statement'],
      ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
      ['01/04/2026', 'SALARY CREDIT ABC CORP', '', 50000, 50000],
      ['02/04/2026', 'ATM WD', 2000, '', 48000],
    ])

    const result = await parseXlsxStatement(buffer)

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({ rawDate: '01/04/2026', narration: 'SALARY CREDIT ABC CORP', rawCredit: '50000' })
    expect(result.rows[1]).toMatchObject({ rawDate: '02/04/2026', narration: 'ATM WD', rawDebit: '2000' })
  })

  it('reads a Date-typed cell as its own ISO text rather than a blank/garbled value', async () => {
    const buffer = await buildWorkbookBuffer([
      ['Date', 'Narration', 'Amount', 'Balance'],
      [new Date(Date.UTC(2026, 3, 1)) as unknown as string, 'SALARY', 50000, 50000],
    ])
    const result = await parseXlsxStatement(buffer)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].rawDate).toContain('2026-04-01')
  })

  it('throws CORRUPT_FILE for bytes that are not a real XLSX file', async () => {
    await expect(parseXlsxStatement(Buffer.from('not an xlsx file'))).rejects.toBeInstanceOf(StatementParseError)
    await expect(parseXlsxStatement(Buffer.from('not an xlsx file'))).rejects.toMatchObject({ code: 'CORRUPT_FILE' })
  })
})
