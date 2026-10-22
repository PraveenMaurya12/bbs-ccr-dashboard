import { PasswordException, PDFParse } from 'pdf-parse'

import { mapTabularRows } from './tabular-row-mapper'
import { StatementParseError, type ParseResult } from './types'

// pdf-parse's bundled pdfjs-dist defaults to loading its worker via a
// dynamic import() "fake worker" running in-process — this specific path
// fails under Jest's sandboxed module registry ("A dynamic import callback
// was invoked without --experimental-vm-modules"). Pointing it at the real
// worker file makes pdfjs-dist spin up a genuine Node worker_threads
// Worker instead, which resolves ESM natively outside Jest's module
// system. Harmless/no-op outside tests (the real worker is what production
// uses anyway); done once at module load, not per-call.
try {
  PDFParse.setWorker(require.resolve('pdf-parse/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'))
} catch {
  // Falls back to pdf-parse's own default worker resolution — safe to ignore.
}

// A line must start with something date-shaped before it's even considered
// a transaction line — e.g. "01/04/2026", "1-Apr-2026", "2026-04-01".
const LINE_START_DATE = /^(\d{1,2}[/-][A-Za-z0-9]{2,4}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(.*)$/
// Monetary-looking tokens near the end of a line — digits with optional
// thousands separators and exactly 2 decimal places, optionally tagged
// Dr/Cr or prefixed with a sign. Deliberately requires 2 decimal places so
// a bare reference number (e.g. a 12-digit UTR) is never mistaken for an amount.
const MONEY_TOKEN = /([+-]?[\d,]+\.\d{2})\s*(dr|cr)?/gi

/**
 * A single text line parsed into a best-effort row — used only when
 * getTable() found no usable structure. Every row this produces is still
 * downstream-capped at INFERRED/low confidence by the normalizer,
 * regardless of how clean the match looks (see this module's confirmed v1
 * PDF-parsing scope) — this heuristic is explicitly NOT held to the same
 * bar as the CSV/XLSX tabular path.
 */
function parseHeuristicLine(line: string, rowIndex: number): { cells: string[] } | null {
  const dateMatch = LINE_START_DATE.exec(line.trim())
  if (!dateMatch) return null
  const [, rawDate, rest] = dateMatch

  const tokens = [...rest.matchAll(MONEY_TOKEN)]
  if (tokens.length === 0) return null

  // Narration is everything before the first matched money token.
  const firstTokenStart = rest.indexOf(tokens[0][0])
  const narration = rest.slice(0, firstTokenStart).trim()

  // Common bank-PDF layouts, in order of how many money tokens a line has:
  // 1 token -> a single signed/tagged amount, no running balance printed.
  // 2 tokens -> amount then balance.
  // 3 tokens -> debit, credit (one of them blank-rendered as "0.00"), balance.
  const amounts = tokens.map((t) => t[1])
  const tags = tokens.map((t) => (t[2] ?? '').toLowerCase())

  let rawDebit: string | null = null
  let rawCredit: string | null = null
  let rawAmount: string | null = null
  let rawBalance: string | null = null

  if (tokens.length === 1) {
    rawAmount = amounts[0]
  } else if (tokens.length === 2) {
    if (tags[0] === 'dr') rawDebit = amounts[0]
    else if (tags[0] === 'cr') rawCredit = amounts[0]
    else rawAmount = amounts[0]
    rawBalance = amounts[1]
  } else {
    // 3+ tokens: last is balance, the two before it are debit/credit.
    rawBalance = amounts[amounts.length - 1]
    rawDebit = amounts[amounts.length - 3] ?? null
    rawCredit = amounts[amounts.length - 2] ?? null
  }

  return {
    cells: [String(rowIndex), rawDate, narration, rawDebit ?? '', rawCredit ?? '', rawAmount ?? '', rawBalance ?? ''],
  }
}

const HEURISTIC_HEADER = ['#', 'date', 'narration', 'debit', 'credit', 'amount', 'balance']

/**
 * PDF is explicitly best-effort for v1 (see this module's confirmed
 * PDF-parsing scope, resolved with the user before implementation): tries
 * pdf-parse's own getTable() first (works when the PDF's internal
 * structure actually has real table geometry), falls back to a per-line
 * text-regex heuristic otherwise. Every row this parser produces — table
 * or heuristic — is capped at INFERRED/low confidence downstream in
 * normalizeTransactions(), never presented with the same authority as a
 * CSV/XLSX-derived row.
 */
export async function parsePdfStatement(buffer: Buffer): Promise<ParseResult> {
  const parser = new PDFParse({ data: buffer })
  try {
    let tableResult
    try {
      tableResult = await parser.getTable()
    } catch (error) {
      if (error instanceof PasswordException) {
        throw new StatementParseError('This PDF is password-protected and could not be opened.', 'PDF_PASSWORD_PROTECTED')
      }
      throw error
    }

    const tableRows = tableResult.mergedTables.flat()
    if (tableRows.length > 0) {
      const mapped = mapTabularRows(tableRows)
      if (mapped.rows.length > 0) return mapped
    }

    // No usable table structure — fall back to line-based text extraction.
    const textResult = await parser.getText()
    const text = textResult.text.trim()
    if (text.length < 50) {
      throw new StatementParseError(
        'This PDF contains little to no extractable text — it is likely a scanned image, which this version does not support.',
        'SCANNED_PDF_UNSUPPORTED',
      )
    }

    const lines = text.split('\n')
    const cells: string[][] = [HEURISTIC_HEADER]
    for (let i = 0; i < lines.length; i++) {
      const parsed = parseHeuristicLine(lines[i], i + 1)
      if (parsed) cells.push(parsed.cells)
    }

    if (cells.length === 1) {
      throw new StatementParseError(
        'No recognizable transaction lines (a leading date followed by an amount) were found in this PDF.',
        'UNSUPPORTED_LAYOUT',
      )
    }

    return mapTabularRows(cells)
  } finally {
    await parser.destroy()
  }
}
