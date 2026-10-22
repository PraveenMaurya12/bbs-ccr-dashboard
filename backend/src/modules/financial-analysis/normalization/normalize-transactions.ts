import type { FinancialAnalysisConfig, NormalizedTransactionInput } from '../financial-analysis.types'
import type { ParsedStatementRow } from '../parsers/types'

// New BBS-established confidence convention (no prior rule — the spec
// states the evidence MODEL, not a numeric confidence scale): CSV/XLSX rows
// are directly, structurally read — high confidence, CONFIRMED tier. Every
// PDF-derived row is capped here regardless of how clean the heuristic
// match looked, per the confirmed v1 PDF-parsing scope agreed before
// implementation — never presented with the same authority as a
// spreadsheet-derived row.
const TABULAR_SOURCE_CONFIDENCE = 0.95
const PDF_SOURCE_CONFIDENCE_CEILING = 0.6

const MONTH_NAMES: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/**
 * Hand-rolled, not a date library — the format set actually seen across
 * Indian bank statement exports is small and finite (DD/MM/YYYY,
 * DD-MM-YYYY, DD-Mon-YYYY, YYYY-MM-DD), so a small parser here avoids an
 * otherwise-unneeded dependency. Returns null (never a guessed date) when
 * the string doesn't match a recognized format.
 */
export function parseStatementDate(raw: string): Date | null {
  const trimmed = raw.trim()

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  }

  const slashOrDashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed)
  if (slashOrDashMatch) {
    const [, d, m, yRaw] = slashOrDashMatch
    const year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw)
    const month = Number(m) - 1
    if (month < 0 || month > 11) return null
    return new Date(Date.UTC(year, month, Number(d)))
  }

  const monthNameMatch = /^(\d{1,2})[/-]([A-Za-z]{3,9})[/-](\d{2,4})$/.exec(trimmed)
  if (monthNameMatch) {
    const [, d, monthName, yRaw] = monthNameMatch
    const month = MONTH_NAMES[monthName.slice(0, 3).toLowerCase()]
    if (month === undefined) return null
    const year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw)
    return new Date(Date.UTC(year, month, Number(d)))
  }

  return null
}

/** Strips thousands separators/currency noise and parses a monetary string — never silently returns 0 for an unparseable value, returns null instead. */
export function parseMoneyToken(raw: string | null): number | null {
  if (raw === null) return null
  // Order matters: strip currency markers and thousands commas/whitespace,
  // but never the decimal point itself (a naive single character class
  // like [,\s₹.] would strip '.' too, silently turning "2000.00" into
  // "200000" — caught by this module's own unit tests).
  const cleaned = raw
    .replace(/₹/g, '')
    .replace(/\bRs\.?\b/gi, '')
    .replace(/\bINR\b/gi, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
  if (cleaned === '' || cleaned === '-') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

export interface NormalizeOptions {
  /** Every row from parsePdfStatement() must set this — caps confidence/evidenceLevel regardless of match quality. */
  isPdfSource: boolean
}

export interface NormalizeResult {
  transactions: NormalizedTransactionInput[]
  warnings: string[]
}

export interface DirectionInversionResult {
  /** True only when the aggregate evidence crosses config's deterministic threshold — never asserted from a single transaction (see this function's own doc comment). */
  inverted: boolean
  evaluatedPairs: number
  conventionalConsistentCount: number
  invertedConsistentCount: number
}

const DIRECTION_DELTA_TOLERANCE = 0.5

/**
 * Deterministic, statement-level DR/CR-vs-running-balance consistency
 * check — NEVER AI/Gemini, never based on a single transaction, never
 * hardcoded to a specific bank/customer/filename (see this task's own
 * safety rule). Confirmed necessary via a real customer's statement where
 * balance-delta math proved ALL 1567 rows' DR/CR columns were inverted
 * relative to the running balance — a genuine source-file defect this
 * module can now detect and correct for, generically, for any future
 * statement with the same defect.
 *
 * Walks `rows` in their given (file) order — the order a running balance
 * is defined against — and for every consecutive pair where BOTH rows
 * report a usable balance AND the later row has a resolvable debit/credit
 * amount, checks whether the observed balance delta matches the
 * CONVENTIONAL reading (DR decreases balance, CR increases it) or the
 * INVERTED reading (the opposite). Only asserts `inverted: true` when the
 * sample is large enough (config.directionInversionMinSampleSize) AND the
 * inverted reading explains at least config.directionInversionConfidenceThreshold
 * of all evaluated transitions — a statement with mixed/ambiguous evidence
 * (the two counts don't clearly favor either reading) is left at the safe,
 * conventional default, same as a statement with too few usable balance
 * pairs to decide anything at all. Only ever consulted for the separate
 * debit/credit-column statement shape — a single signed-amount column
 * (`rawAmount`) already encodes direction unambiguously via its own sign
 * and is never subject to this check.
 */
export function detectDirectionInversion(rows: ParsedStatementRow[], config: FinancialAnalysisConfig): DirectionInversionResult {
  let previousBalance: number | null = null
  let conventionalConsistentCount = 0
  let invertedConsistentCount = 0
  let evaluatedPairs = 0

  for (const row of rows) {
    const balance = parseMoneyToken(row.rawBalance)
    const debit = parseMoneyToken(row.rawDebit)
    const credit = parseMoneyToken(row.rawCredit)

    if (balance === null) {
      // No usable balance at this point in the sequence — this row can't
      // serve as either side of a comparison; the chain simply resumes
      // once a row with a real balance reappears.
      previousBalance = null
      continue
    }

    const amount = debit !== null && debit !== 0 ? debit : credit !== null && credit !== 0 ? credit : null
    const isDebitLabeled = debit !== null && debit !== 0

    if (previousBalance !== null && amount !== null) {
      const observedDelta = balance - previousBalance
      const conventionalExpectedDelta = isDebitLabeled ? -amount : amount
      const invertedExpectedDelta = -conventionalExpectedDelta

      if (Math.abs(observedDelta - conventionalExpectedDelta) < DIRECTION_DELTA_TOLERANCE) {
        conventionalConsistentCount++
        evaluatedPairs++
      } else if (Math.abs(observedDelta - invertedExpectedDelta) < DIRECTION_DELTA_TOLERANCE) {
        invertedConsistentCount++
        evaluatedPairs++
      }
      // Neither reading matches cleanly (e.g. an interest/fee row sharing a
      // balance snapshot with another transaction) — not counted either
      // way; this row's own balance still becomes `previousBalance` below.
    }

    previousBalance = balance
  }

  const inverted =
    evaluatedPairs >= config.directionInversionMinSampleSize &&
    invertedConsistentCount / evaluatedPairs >= config.directionInversionConfidenceThreshold

  return { inverted, evaluatedPairs, conventionalConsistentCount, invertedConsistentCount }
}

/**
 * Format-agnostic — operates only on the parsers' shared ParsedStatementRow
 * shape, never re-branches on file format itself (that distinction already
 * collapsed into `options.isPdfSource`, the one place format still matters
 * at this stage). Classification (category/subcategory/lender) happens
 * later — every row leaves here as `category: 'UNCLASSIFIED'`.
 */
export function normalizeTransactions(rows: ParsedStatementRow[], options: NormalizeOptions, config: FinancialAnalysisConfig): NormalizeResult {
  const warnings: string[] = []
  const confidence = options.isPdfSource ? PDF_SOURCE_CONFIDENCE_CEILING : TABULAR_SOURCE_CONFIDENCE
  const evidenceLevel = options.isPdfSource ? 'INFERRED' : 'CONFIRMED'

  // Deterministic, aggregate-evidence-only check (see detectDirectionInversion's
  // own doc comment) — never AI, never a single transaction, never
  // bank/customer/filename-specific. Only the DR/CR-column reading is ever
  // swapped; a single signed-amount column is untouched.
  const inversionResult = detectDirectionInversion(rows, config)
  if (inversionResult.inverted) {
    warnings.push(
      'DR/CR columns appear systematically inverted relative to running balance; transaction directions normalized using balance-consistency detection.',
    )
  }

  const candidates: NormalizedTransactionInput[] = []

  for (const row of rows) {
    const transactionDate = row.rawDate ? parseStatementDate(row.rawDate) : null
    if (!transactionDate) {
      warnings.push(`row ${row.rowIndex}: unparseable date "${row.rawDate}" — skipped`)
      continue
    }

    const valueDate = row.rawValueDate ? parseStatementDate(row.rawValueDate) : null

    let direction: 'CREDIT' | 'DEBIT' | null = null
    let amount: number | null = null

    const signedAmount = parseMoneyToken(row.rawAmount)
    const debitAmount = parseMoneyToken(row.rawDebit)
    const creditAmount = parseMoneyToken(row.rawCredit)
    // Only swapped when the statement-level inversion check above crossed
    // its deterministic threshold — never per-row, never guessed.
    const debitDirection = inversionResult.inverted ? 'CREDIT' : 'DEBIT'
    const creditDirection = inversionResult.inverted ? 'DEBIT' : 'CREDIT'

    if (signedAmount !== null && signedAmount !== 0) {
      direction = signedAmount < 0 ? 'DEBIT' : 'CREDIT'
      amount = Math.abs(signedAmount)
    } else if (debitAmount !== null && debitAmount !== 0) {
      direction = debitDirection
      amount = Math.abs(debitAmount)
    } else if (creditAmount !== null && creditAmount !== 0) {
      direction = creditDirection
      amount = Math.abs(creditAmount)
    }

    if (direction === null || amount === null) {
      warnings.push(`row ${row.rowIndex}: no resolvable debit/credit/amount — skipped`)
      continue
    }

    candidates.push({
      transactionDate,
      valueDate,
      narration: row.narration,
      amount,
      direction,
      balance: parseMoneyToken(row.rawBalance),
      counterparty: null, // resolved later by classification's P2P/self-transfer detectors
      transactionType: null,
      category: 'UNCLASSIFIED',
      subcategory: null,
      lender: null,
      confidence,
      evidenceLevel,
      bounceEvidence: null,
      sourceRowRef: row.rowIndex,
      narrationDetail: null,
    })
  }

  // Dedupe exact (date, narration, amount, direction, balance) repeats —
  // e.g. a PDF table accidentally merged twice across pages. Conservative
  // on purpose: a genuinely repeated real-world transaction (same
  // narration/amount twice in a month) is common and must never be
  // silently dropped, so only a byte-for-byte identical tuple collapses.
  // CRITICAL: a running balance is required for that identical-tuple test
  // to be trustworthy — without one, two genuinely distinct same-day
  // same-amount transactions (e.g. two separate ATM withdrawals) would
  // collapse to the same key and the second would be wrongly discarded.
  // A statement with no balance column therefore participates in NO
  // dedup at all (every row is kept), rather than silently dropping a
  // real transaction on a weaker signal.
  const seen = new Set<string>()
  const deduped: NormalizedTransactionInput[] = []
  let duplicateCount = 0
  for (const txn of candidates) {
    if (txn.balance === null) {
      deduped.push(txn)
      continue
    }
    const key = `${txn.transactionDate.toISOString()}|${txn.narration}|${txn.amount}|${txn.direction}|${txn.balance}`
    if (seen.has(key)) {
      duplicateCount++
      continue
    }
    seen.add(key)
    deduped.push(txn)
  }
  if (duplicateCount > 0) {
    warnings.push(`${duplicateCount} exact-duplicate row(s) were removed.`)
  }

  deduped.sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime())

  return { transactions: deduped, warnings }
}
