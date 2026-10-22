import { parse } from 'csv-parse/sync'

import { mapTabularRows } from './tabular-row-mapper'
import { StatementParseError, type ParseResult } from './types'

/**
 * CSV is one of the two robust, high-confidence formats (see this module's
 * confirmed v1 PDF-parsing scope) — parsed with the real, structured
 * csv-parse library, never a hand-rolled split(','). `columns: false`
 * because a bank's own header names vary too much to key on directly —
 * mapTabularRows does the real column-identification work generically.
 */
// Async for interface parity with the XLSX/PDF parsers below, which genuinely await.
export async function parseCsvStatement(buffer: Buffer): Promise<ParseResult> {
  let rows: string[][]
  try {
    rows = parse(buffer, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as string[][]
  } catch (error) {
    throw new StatementParseError(
      `Could not parse this file as CSV: ${error instanceof Error ? error.message : String(error)}`,
      'CORRUPT_FILE',
    )
  }

  if (rows.length === 0) {
    throw new StatementParseError('The uploaded CSV file contains no rows.', 'CORRUPT_FILE')
  }

  return mapTabularRows(rows)
}
