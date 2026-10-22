import ExcelJS from 'exceljs'

import { mapTabularRows } from './tabular-row-mapper'
import { StatementParseError, type ParseResult } from './types'

/** ExcelJS cell values can be a rich object (hyperlink/formula/date) — always reduce to the cell's own display text, never the raw object. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value) return String(value.result ?? '')
    return ''
  }
  return String(value)
}

/**
 * XLSX is the other robust, high-confidence format (see this module's
 * confirmed v1 PDF-parsing scope) — read-only, first non-empty worksheet,
 * via exceljs (not the `xlsx`/SheetJS npm package, whose published npm
 * releases lag the vendor's own patched CDN builds).
 */
export async function parseXlsxStatement(buffer: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  } catch (error) {
    throw new StatementParseError(
      `Could not parse this file as XLSX: ${error instanceof Error ? error.message : String(error)}`,
      'CORRUPT_FILE',
    )
  }

  const worksheet = workbook.worksheets.find((sheet) => sheet.rowCount > 0)
  if (!worksheet) {
    throw new StatementParseError('The uploaded XLSX file contains no non-empty worksheet.', 'CORRUPT_FILE')
  }

  const rows: string[][] = []
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    // ExcelJS's row.values is 1-indexed with a leading undefined at [0] —
    // slice it off so column indices line up with mapTabularRows' own
    // 0-indexed expectations.
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    rows.push(values.map((v) => cellText(v as ExcelJS.CellValue)))
  })

  if (rows.length === 0) {
    throw new StatementParseError('The uploaded XLSX file contains no rows.', 'CORRUPT_FILE')
  }

  return mapTabularRows(rows)
}
