/**
 * The common, format-agnostic shape every statement parser (CSV/XLSX/PDF)
 * produces — raw strings only, nothing parsed/typed yet (that happens in
 * normalization/normalize-transactions.ts). Keeping this one shape shared
 * across all three parsers is what lets normalizeTransactions() stay
 * genuinely format-agnostic, never re-branching on file format itself.
 */
export interface ParsedStatementRow {
  /** 1-based row/line number in the source file — debugging/audit only. */
  rowIndex: number
  rawDate: string | null
  rawValueDate: string | null
  narration: string
  /** Present when the source uses separate debit/credit columns — mutually exclusive with rawAmount. */
  rawDebit: string | null
  rawCredit: string | null
  /** Present when the source uses one signed amount column — mutually exclusive with rawDebit/rawCredit. */
  rawAmount: string | null
  rawBalance: string | null
}

/**
 * Statement-level (not per-transaction) metadata, extracted from the
 * document's own pre-header/footer text — never inferred from an arbitrary
 * transaction counterparty (see statement-metadata-extractor.ts's own doc
 * comment). Every field stays null, never fabricated, when the statement
 * doesn't carry reliable evidence for it.
 */
export interface StatementMetadata {
  bankName: string | null
  /** Last 4 digits only — the full account number is never persisted or logged (see statement-metadata-extractor.ts). */
  accountNumberMasked: string | null
  statementPeriodStart: Date | null
  statementPeriodEnd: Date | null
  /** Only ever read from an explicit "Account Holder:"/"Customer Name:"/"Name:" header line — never derived from or cross-checked against the Lead/Customer CRM record (see statement-metadata-extractor.ts's own doc comment). Null when no such line is found. */
  accountHolderName: string | null
  ifscCode: string | null
  accountType: string | null
}

export const EMPTY_STATEMENT_METADATA: StatementMetadata = {
  bankName: null,
  accountNumberMasked: null,
  statementPeriodStart: null,
  statementPeriodEnd: null,
  accountHolderName: null,
  ifscCode: null,
  accountType: null,
}

export interface ParseResult {
  rows: ParsedStatementRow[]
  /** Row-level issues that didn't stop parsing (e.g. "row 47: balance column unparseable") — never the raw file bytes, never PII beyond what's already in the narration. */
  warnings: string[]
  metadata: StatementMetadata
}

/**
 * A parser-level failure that stops the pipeline — distinct from a
 * `warnings` entry (which is a single bad row, not a reason the whole
 * document can't be processed). `code` is a stable discriminator
 * (BankStatementAnalysis.errorCode) so a specific, actionable reason
 * reaches the UI instead of a generic "parse failed."
 */
export class StatementParseError extends Error {
  constructor(
    message: string,
    readonly code: 'PDF_PASSWORD_PROTECTED' | 'SCANNED_PDF_UNSUPPORTED' | 'UNSUPPORTED_LAYOUT' | 'CORRUPT_FILE',
  ) {
    super(message)
    this.name = 'StatementParseError'
  }
}
