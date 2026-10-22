import { testConfig } from '../classification/test-helpers'
import { detectDirectionInversion, normalizeTransactions, parseMoneyToken, parseStatementDate } from './normalize-transactions'
import type { ParsedStatementRow } from '../parsers/types'

function row(overrides: Partial<ParsedStatementRow> = {}): ParsedStatementRow {
  return {
    rowIndex: 1,
    rawDate: '01/04/2026',
    rawValueDate: null,
    narration: 'SALARY',
    rawDebit: null,
    rawCredit: '50000.00',
    rawAmount: null,
    rawBalance: '50000.00',
    ...overrides,
  }
}

describe('parseStatementDate', () => {
  it('parses DD/MM/YYYY', () => {
    expect(parseStatementDate('01/04/2026')).toEqual(new Date(Date.UTC(2026, 3, 1)))
  })
  it('parses DD-Mon-YYYY', () => {
    expect(parseStatementDate('01-Apr-2026')).toEqual(new Date(Date.UTC(2026, 3, 1)))
  })
  it('parses YYYY-MM-DD', () => {
    expect(parseStatementDate('2026-04-01')).toEqual(new Date(Date.UTC(2026, 3, 1)))
  })
  it('returns null (never guesses) for an unrecognized format', () => {
    expect(parseStatementDate('End of statement')).toBeNull()
  })
})

describe('parseMoneyToken', () => {
  it('strips thousands separators', () => {
    expect(parseMoneyToken('1,25,000.50')).toBe(125000.5)
  })
  it('returns null (never 0) for an empty/unparseable value', () => {
    expect(parseMoneyToken('')).toBeNull()
    expect(parseMoneyToken(null)).toBeNull()
  })
})

describe('normalizeTransactions', () => {
  it('resolves direction/amount from separate debit/credit columns', () => {
    const { transactions } = normalizeTransactions(
      [row({ rawCredit: '50000.00', rawDebit: null }), row({ rowIndex: 2, rawCredit: null, rawDebit: '2000.00', narration: 'ATM WD' })],
      { isPdfSource: false },
      testConfig(),
    )
    expect(transactions).toHaveLength(2)
    expect(transactions[0]).toMatchObject({ direction: 'CREDIT', amount: 50000 })
    expect(transactions[1]).toMatchObject({ direction: 'DEBIT', amount: 2000 })
  })

  it('resolves direction/amount from a single signed amount column', () => {
    const { transactions } = normalizeTransactions(
      [row({ rawCredit: null, rawDebit: null, rawAmount: '-2000.00' })],
      { isPdfSource: false },
      testConfig(),
    )
    expect(transactions[0]).toMatchObject({ direction: 'DEBIT', amount: 2000 })
  })

  it('skips a row with an unparseable date rather than fabricating a transaction date', () => {
    const { transactions, warnings } = normalizeTransactions([row({ rawDate: 'not a date' })], { isPdfSource: false }, testConfig())
    expect(transactions).toHaveLength(0)
    expect(warnings[0]).toContain('unparseable date')
  })

  it('skips a row with no resolvable debit/credit/amount', () => {
    const { transactions, warnings } = normalizeTransactions(
      [row({ rawCredit: null, rawDebit: null, rawAmount: null })],
      { isPdfSource: false },
      testConfig(),
    )
    expect(transactions).toHaveLength(0)
    expect(warnings[0]).toContain('no resolvable debit/credit/amount')
  })

  it('caps every PDF-sourced row at INFERRED/low confidence, never CONFIRMED', () => {
    const { transactions } = normalizeTransactions([row()], { isPdfSource: true }, testConfig())
    expect(transactions[0].evidenceLevel).toBe('INFERRED')
    expect(transactions[0].confidence).toBeLessThanOrEqual(0.6)
  })

  it('marks a CSV/XLSX-sourced row CONFIRMED with high confidence', () => {
    const { transactions } = normalizeTransactions([row()], { isPdfSource: false }, testConfig())
    expect(transactions[0].evidenceLevel).toBe('CONFIRMED')
    expect(transactions[0].confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('removes an exact-duplicate row (same date/narration/amount/direction/balance) but keeps genuinely repeated distinct transactions', () => {
    const { transactions, warnings } = normalizeTransactions(
      [row(), row(), row({ rowIndex: 3, narration: 'SALARY ADVANCE' })],
      { isPdfSource: false },
      testConfig(),
    )
    expect(transactions).toHaveLength(2)
    expect(warnings.some((w) => w.includes('duplicate'))).toBe(true)
  })

  it('CRITICAL: never drops a genuinely repeated transaction when the statement has no balance column at all', () => {
    // Two real, distinct same-day same-amount withdrawals (e.g. two ATM
    // visits) — with no balance signal to tell them apart from a true
    // parsing-artifact duplicate, both must be kept.
    const { transactions } = normalizeTransactions(
      [
        row({ rawBalance: null, narration: 'ATM WITHDRAWAL', rawDebit: '2000.00', rawCredit: null }),
        row({ rowIndex: 2, rawBalance: null, narration: 'ATM WITHDRAWAL', rawDebit: '2000.00', rawCredit: null }),
      ],
      { isPdfSource: false },
      testConfig(),
    )
    expect(transactions).toHaveLength(2)
  })

  it('sorts transactions chronologically ascending', () => {
    const { transactions } = normalizeTransactions(
      [row({ rawDate: '03/04/2026' }), row({ rowIndex: 2, rawDate: '01/04/2026' })],
      { isPdfSource: false },
      testConfig(),
    )
    expect(transactions[0].transactionDate.getUTCDate()).toBe(1)
    expect(transactions[1].transactionDate.getUTCDate()).toBe(3)
  })

  it('never fabricates a balance when the source row genuinely has none', () => {
    const { transactions } = normalizeTransactions([row({ rawBalance: null })], { isPdfSource: false }, testConfig())
    expect(transactions[0].balance).toBeNull()
  })

  it('leaves every row UNCLASSIFIED — classification happens later, not during normalization', () => {
    const { transactions } = normalizeTransactions([row()], { isPdfSource: false }, testConfig())
    expect(transactions[0].category).toBe('UNCLASSIFIED')
  })
})

// --- DR/CR inversion detection (Bug 3) ---------------------------------------

/**
 * Builds a chain of rows whose running balance is internally consistent
 * with ONE interpretation only (conventional: DR decreases/CR increases,
 * or inverted: DR increases/CR decreases) — the same balance-delta
 * methodology used to diagnose the real customer statement this detector
 * was built for.
 */
function buildConsistentChain(count: number, interpretation: 'conventional' | 'inverted'): ParsedStatementRow[] {
  let balance = 100000
  const rows: ParsedStatementRow[] = []
  for (let i = 0; i < count; i++) {
    const isDebit = i % 2 === 0
    const amount = 100 + i
    const debitMovesBalanceDown = interpretation === 'conventional'
    if (isDebit) {
      balance += debitMovesBalanceDown ? -amount : amount
    } else {
      balance += debitMovesBalanceDown ? amount : -amount
    }
    rows.push(
      row({
        rowIndex: i + 1,
        rawDate: `0${(i % 9) + 1}/04/2026`,
        narration: `TXN ${i}`,
        rawDebit: isDebit ? amount.toFixed(2) : null,
        rawCredit: isDebit ? null : amount.toFixed(2),
        rawBalance: balance.toFixed(2),
      }),
    )
  }
  return rows
}

describe('detectDirectionInversion', () => {
  it('F. a normal/conventional statement is never flagged as inverted', () => {
    const rows = buildConsistentChain(30, 'conventional')
    const result = detectDirectionInversion(rows, testConfig())
    expect(result.inverted).toBe(false)
    expect(result.evaluatedPairs).toBeGreaterThanOrEqual(testConfig().directionInversionMinSampleSize)
    expect(result.conventionalConsistentCount).toBeGreaterThan(result.invertedConsistentCount)
  })

  it('E. a statement whose DR/CR is systematically inverted relative to balance is confidently detected', () => {
    const rows = buildConsistentChain(30, 'inverted')
    const result = detectDirectionInversion(rows, testConfig())
    expect(result.inverted).toBe(true)
    expect(result.invertedConsistentCount).toBeGreaterThan(result.conventionalConsistentCount)
  })

  it('D. requires a sufficiently large sample — a handful of rows never triggers inversion, even if 100% "inverted-consistent"', () => {
    const rows = buildConsistentChain(5, 'inverted')
    const result = detectDirectionInversion(rows, testConfig())
    expect(result.evaluatedPairs).toBeLessThan(testConfig().directionInversionMinSampleSize)
    expect(result.inverted).toBe(false)
  })

  it('G. a genuinely ambiguous/mixed statement (no reading dominates) is never confidently flagged either way', () => {
    // Alternate conventional and inverted chains so neither reading
    // accounts for anywhere near the confidence threshold.
    const conventional = buildConsistentChain(15, 'conventional')
    const inverted = buildConsistentChain(15, 'inverted').map((r, i) => ({ ...r, rowIndex: 16 + i }))
    const result = detectDirectionInversion([...conventional, ...inverted], testConfig())
    expect(result.evaluatedPairs).toBeGreaterThanOrEqual(testConfig().directionInversionMinSampleSize)
    expect(result.inverted).toBe(false)
  })

  it('a statement with no balance column at all has zero evaluated pairs and is never flagged', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ rowIndex: i + 1, rawBalance: null }))
    const result = detectDirectionInversion(rows, testConfig())
    expect(result.evaluatedPairs).toBe(0)
    expect(result.inverted).toBe(false)
  })

  it('normalizeTransactions swaps direction and records the required warning when inversion is confidently detected', () => {
    const rows = buildConsistentChain(30, 'inverted')
    const { transactions, warnings } = normalizeTransactions(rows, { isPdfSource: false }, testConfig())
    // Row 0 is debit-labeled; under a confirmed inversion it must resolve to CREDIT.
    const firstDebitLabeledRow = transactions.find((t) => t.sourceRowRef === 1)!
    expect(firstDebitLabeledRow.direction).toBe('CREDIT')
    expect(warnings.some((w) => w.includes('DR/CR columns appear systematically inverted'))).toBe(true)
  })

  it('normalizeTransactions leaves direction untouched and adds no inversion warning for a conventional statement', () => {
    const rows = buildConsistentChain(30, 'conventional')
    const { transactions, warnings } = normalizeTransactions(rows, { isPdfSource: false }, testConfig())
    const firstDebitLabeledRow = transactions.find((t) => t.sourceRowRef === 1)!
    expect(firstDebitLabeledRow.direction).toBe('DEBIT')
    expect(warnings.some((w) => w.includes('inverted'))).toBe(false)
  })

  it('never swaps the single signed-amount-column convention, even on a statement flagged as DR/CR-inverted', () => {
    // A mixed-format edge case: some rows use rawAmount (sign-based),
    // interleaved with a confidently-inverted DR/CR chain. The signed
    // column's own sign must never be touched by the DR/CR-only detector.
    const inverted = buildConsistentChain(30, 'inverted')
    const signedRow = row({ rowIndex: 999, rawDebit: null, rawCredit: null, rawAmount: '-500.00', rawBalance: null })
    const { transactions } = normalizeTransactions([...inverted, signedRow], { isPdfSource: false }, testConfig())
    const signed = transactions.find((t) => t.sourceRowRef === 999)!
    expect(signed.direction).toBe('DEBIT')
  })
})
