import { extractStatementMetadata } from './statement-metadata-extractor'
import { EMPTY_STATEMENT_METADATA, type ParsedStatementRow, type ParseResult } from './types'

/**
 * Shared header-detection + column-mapping heuristic used by BOTH the CSV
 * and XLSX parsers (and, for its table-detected path, the PDF parser) —
 * every bank/export tool names its columns slightly differently, so this
 * never assumes a fixed schema. Real bank exports also commonly carry a
 * few metadata lines ("Account Statement for ... Period: ...") before the
 * real header row, so the header row itself is detected, not assumed to
 * be row 0.
 */

const HEADER_KEYWORDS = {
  date: ['txn date', 'transaction date', 'posting date', 'date'],
  valueDate: ['value date', 'val date'],
  narration: ['narration', 'description', 'particulars', 'details', 'remarks', 'transaction remarks'],
  debit: ['debit', 'withdrawal', 'withdrawal amt', 'dr amount', 'dr'],
  credit: ['credit', 'deposit', 'deposit amt', 'cr amount', 'cr'],
  amount: ['amount', 'transaction amount'],
  // 'bal' is the standalone abbreviation a real bank export (e.g. this
  // module's own Axis Bank CSV fixture) uses in place of the spelled-out
  // "Balance" — a real, confirmed bug: without it, a genuine BAL column is
  // never detected, every transaction's balance is persisted as null, and
  // liquidity/closing-balance become NOT_REPORTED even though the file
  // actually reports a running balance. matchesAny's word-boundary check
  // (below) keeps this safe — "bal" never matches inside "balance" or any
  // other longer word (confirmed by this file's own regression tests).
  balance: ['balance', 'closing balance', 'running balance', 'available balance', 'bal'],
}

function normalizeHeaderCell(cell: string): string {
  return cell.trim().toLowerCase().replace(/\s+/g, ' ')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Word-boundary matching, NOT a bare substring test — a short keyword like
 * the bare `'cr'`/`'dr'` entries in HEADER_KEYWORDS must never match inside
 * an unrelated longer word. A real bug this guards against: the narration
 * header "Description" contains the literal substring "cr" ("des-CR-
 * iption"), which a naive `.includes('cr')` wrongly matched, silently
 * routing the real Deposit/Credit column's data into the narration column
 * instead and dropping every credit transaction from the parsed result.
 */
function matchesAny(cell: string, keywords: string[]): boolean {
  return keywords.some((k) => new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(k)}(?:$|[^a-z0-9])`).test(cell))
}

interface ColumnMap {
  date: number | null
  valueDate: number | null
  narration: number | null
  debit: number | null
  credit: number | null
  amount: number | null
  balance: number | null
}

/**
 * A row counts as a plausible header when at least a date-like column AND
 * (a narration-like column OR an amount/debit/credit-like column) are
 * found — a bare metadata line ("Statement Period: Jan-Dec 2026") won't
 * satisfy both, so it's correctly skipped.
 */
function tryMapHeaderRow(cells: string[]): ColumnMap | null {
  const normalized = cells.map(normalizeHeaderCell)
  const find = (keywords: string[]): number | null => {
    const index = normalized.findIndex((cell) => matchesAny(cell, keywords))
    return index === -1 ? null : index
  }

  const map: ColumnMap = {
    date: find(HEADER_KEYWORDS.date),
    valueDate: find(HEADER_KEYWORDS.valueDate),
    narration: find(HEADER_KEYWORDS.narration),
    debit: find(HEADER_KEYWORDS.debit),
    credit: find(HEADER_KEYWORDS.credit),
    amount: find(HEADER_KEYWORDS.amount),
    balance: find(HEADER_KEYWORDS.balance),
  }

  const hasAmountSignal = map.amount !== null || map.debit !== null || map.credit !== null
  if (map.date !== null && (map.narration !== null || hasAmountSignal)) return map
  return null
}

function cell(row: string[], index: number | null): string | null {
  if (index === null) return null
  const value = row[index]
  return value !== undefined && value.trim() !== '' ? value.trim() : null
}

/**
 * `rows` is every row read from the source file, in order, each already
 * split into cells as plain strings (CSV: csv-parse's own cell split;
 * XLSX: one cell's text value per column). Scans forward for the first
 * row that looks like a real header (see tryMapHeaderRow), then maps every
 * row after it. Rows before the detected header, and any row with no date
 * and no narration/amount at all (a trailing "End of Statement" footer,
 * a blank separator row), are silently skipped — never fabricated into a
 * transaction.
 */
export function mapTabularRows(rows: string[][]): ParseResult {
  const warnings: string[] = []
  let headerIndex = -1
  let columnMap: ColumnMap | null = null

  for (let i = 0; i < rows.length; i++) {
    const candidate = tryMapHeaderRow(rows[i])
    if (candidate) {
      headerIndex = i
      columnMap = candidate
      break
    }
  }

  if (!columnMap) {
    return { rows: [], warnings: ['No recognizable header row (date + narration/amount columns) was found in this file.'], metadata: EMPTY_STATEMENT_METADATA }
  }

  const parsedRows: ParsedStatementRow[] = []
  let lastDataRowIndex = headerIndex
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const raw = rows[i]
    const rowIndex = i + 1 // 1-based, matches the spec's own row-reference convention
    const rawDate = cell(raw, columnMap.date)
    const narration = cell(raw, columnMap.narration) ?? ''
    const rawDebit = cell(raw, columnMap.debit)
    const rawCredit = cell(raw, columnMap.credit)
    const rawAmount = cell(raw, columnMap.amount)
    const rawBalance = cell(raw, columnMap.balance)

    // A row with no date and no amount signal at all is almost certainly a
    // trailing footer/summary line, not a transaction — skip, don't fabricate.
    if (!rawDate && !rawDebit && !rawCredit && !rawAmount) continue

    if (!rawDate) {
      warnings.push(`row ${rowIndex}: no date found — skipped`)
      continue
    }

    parsedRows.push({
      rowIndex,
      rawDate,
      rawValueDate: cell(raw, columnMap.valueDate),
      narration,
      rawDebit,
      rawCredit,
      rawAmount,
      rawBalance,
    })
    lastDataRowIndex = i
  }

  // Statement-level metadata (bank name/account number/period) — read from
  // the pre-header metadata block and the trailing footer block only,
  // never from a transaction's own narration/counterparty (see
  // statement-metadata-extractor.ts's own doc comment).
  const metadata = extractStatementMetadata(rows, headerIndex, lastDataRowIndex)

  return { rows: parsedRows, warnings, metadata }
}
