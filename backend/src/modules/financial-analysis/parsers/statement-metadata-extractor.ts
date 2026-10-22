import { parseStatementDate } from '../normalization/normalize-transactions'
import { EMPTY_STATEMENT_METADATA, type StatementMetadata } from './types'

/**
 * IFSC first-4-letter bank codes → display name. Deliberately NOT
 * exhaustive — this is the statement owner's OWN bank (reliable,
 * statement-level evidence, per an official RBI-assigned code), never an
 * arbitrary transaction counterparty. Extend this table when a real
 * uploaded statement carries an IFSC prefix not yet listed here; an
 * unrecognized prefix safely falls through to the footer-text fallback
 * (or null), it never throws or guesses.
 */
const IFSC_BANK_PREFIXES: Record<string, string> = {
  UTIB: 'Axis Bank',
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  SBIN: 'State Bank of India',
  PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda',
  CNRB: 'Canara Bank',
  UBIN: 'Union Bank of India',
  IDIB: 'Indian Bank',
  IOBA: 'Indian Overseas Bank',
  MAHB: 'Bank of Maharashtra',
  CBIN: 'Central Bank of India',
  UCBA: 'UCO Bank',
  YESB: 'Yes Bank',
  INDB: 'IndusInd Bank',
  KKBK: 'Kotak Mahindra Bank',
  RATN: 'RBL Bank',
  FDRL: 'Federal Bank',
  SIBL: 'South Indian Bank',
  IDFB: 'IDFC First Bank',
  AUBL: 'AU Small Finance Bank',
  PSIB: 'Punjab & Sind Bank',
  KARB: 'Karnataka Bank',
  CIUB: 'City Union Bank',
  DCBL: 'DCB Bank',
  BKID: 'Bank of India',
  JAKA: "Jammu & Kashmir Bank",
}

/**
 * Secondary fallback only, used when no IFSC line is present — full bank
 * names, matched as whole phrases (never short ambiguous abbreviations)
 * against the statement's own pre-header metadata lines and trailing
 * footer/disclaimer text ONLY, never against a transaction row's own
 * narration/counterparty (a narration mentioning "HDFC Bank" as the
 * COUNTERPARTY's bank on an unrelated P2P transfer must never be read as
 * "this statement belongs to HDFC Bank").
 */
const KNOWN_BANK_NAME_PATTERNS: string[] = [
  'AXIS BANK',
  'HDFC BANK',
  'ICICI BANK',
  'STATE BANK OF INDIA',
  'PUNJAB NATIONAL BANK',
  'BANK OF BARODA',
  'CANARA BANK',
  'UNION BANK OF INDIA',
  'KOTAK MAHINDRA BANK',
  'YES BANK',
  'INDUSIND BANK',
  'FEDERAL BANK',
  'IDFC FIRST BANK',
  'RBL BANK',
  'BANK OF INDIA',
  'CENTRAL BANK OF INDIA',
  'UCO BANK',
  'INDIAN BANK',
  'INDIAN OVERSEAS BANK',
  'BANK OF MAHARASHTRA',
  'SOUTH INDIAN BANK',
  'KARNATAKA BANK',
  'CITY UNION BANK',
  'DCB BANK',
  'AU SMALL FINANCE BANK',
  'JAMMU AND KASHMIR BANK',
  'PUNJAB AND SIND BANK',
]

function joinRowsToText(rows: string[][]): string {
  return rows.map((r) => r.join(' ')).join('\n')
}

function maskAccountNumber(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, '')
  if (digitsOnly.length <= 4) return 'X'.repeat(digitsOnly.length)
  return 'X'.repeat(digitsOnly.length - 4) + digitsOnly.slice(-4)
}

function extractBankName(preHeaderText: string, footerText: string): string | null {
  const ifscMatch = /\bIFSC\s*Code\s*:?-?\s*([A-Z]{4})0[A-Z0-9]{6}\b/i.exec(preHeaderText)
  if (ifscMatch) {
    const prefix = ifscMatch[1].toUpperCase()
    const known = IFSC_BANK_PREFIXES[prefix]
    if (known) return known
  }

  const combined = `${preHeaderText}\n${footerText}`.toUpperCase()
  for (const name of KNOWN_BANK_NAME_PATTERNS) {
    if (combined.includes(name)) {
      // Re-derive the display casing from the pattern itself (Title Case) rather than shouting the matched uppercase text.
      return name
        .split(' ')
        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(' ')
    }
  }

  return null
}

/** Masked only — the full account number is never returned, logged, or persisted anywhere past this function. */
function extractAccountNumberMasked(preHeaderText: string): string | null {
  const match = /(?:statement of )?a\/?c(?:count)?\s*(?:no\.?|number)\s*[:-]?\s*(\d{6,20})\b/i.exec(preHeaderText)
  if (!match) return null
  return maskAccountNumber(match[1])
}

/** A real, RBI-format IFSC code (4 letters + '0' + 6 alphanumeric) stated in the statement header — never guessed from the bank name. */
function extractIfscCode(preHeaderText: string): string | null {
  const match = /\bIFSC\s*Code\s*:?-?\s*([A-Z]{4}0[A-Z0-9]{6})\b/i.exec(preHeaderText)
  return match ? match[1].toUpperCase() : null
}

/**
 * Only ever matched against an explicit labeled header line — "Account
 * Holder Name:", "Customer Name:", "Name:" — never inferred from a
 * transaction narration (a P2M/P2A counterparty name is NOT the account
 * holder). A bare "Name:" line is accepted only when it appears before the
 * transaction header row (preHeaderText is already scoped to that region
 * by the caller), to avoid ever matching a counterparty field on a
 * transaction row.
 */
function extractAccountHolderName(preHeaderText: string): string | null {
  const match = /(?:account\s*holder(?:'s)?\s*name|customer\s*name|holder\s*name|\bname)\s*[:-]+\s*([A-Za-z][A-Za-z .]{2,60})/i.exec(preHeaderText)
  if (!match) return null
  const name = match[1].trim().replace(/\s{2,}/g, ' ')
  // Guard against accidentally matching a trailing label/field on the same line (e.g. "Name: John Address:").
  const cut = name.split(/\s{2,}|\t/)[0].trim()
  return cut.length >= 3 ? cut : null
}

function extractAccountType(preHeaderText: string): string | null {
  const match = /(?:a\/?c|account)\s*type\s*[:-]+\s*([A-Za-z ]{3,30})/i.exec(preHeaderText)
  return match ? match[1].trim() : null
}

function extractStatementPeriod(preHeaderText: string): { start: Date | null; end: Date | null } {
  const periodMatch = /period\s*\(?\s*from\s*:?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})\s*to\s*:?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})/i.exec(
    preHeaderText,
  )
  if (periodMatch) {
    return { start: parseStatementDate(periodMatch[1]), end: parseStatementDate(periodMatch[2]) }
  }
  return { start: null, end: null }
}

/**
 * Statement-level metadata extraction — reliable header/footer evidence
 * only, never an arbitrary transaction counterparty, never a hardcoded
 * bank/customer. `rows` is every row read from the source file (same
 * input tabular-row-mapper.ts receives); `headerIndex`/`lastDataRowIndex`
 * bound the pre-header metadata block and the trailing footer block.
 *
 * Statement period falls back to null here (never guessed) when no
 * explicit period line is found — callers that need a period MUST fall
 * back to the actual earliest/latest transaction dates themselves (see
 * financial-analysis.service.ts), since that fallback requires the fully
 * parsed transaction list, which this function doesn't have.
 */
export function extractStatementMetadata(rows: string[][], headerIndex: number, lastDataRowIndex: number): StatementMetadata {
  if (headerIndex < 0) return EMPTY_STATEMENT_METADATA

  const preHeaderText = joinRowsToText(rows.slice(0, headerIndex))
  const footerText = joinRowsToText(rows.slice(lastDataRowIndex + 1))

  const { start, end } = extractStatementPeriod(preHeaderText)

  return {
    bankName: extractBankName(preHeaderText, footerText),
    accountNumberMasked: extractAccountNumberMasked(preHeaderText),
    statementPeriodStart: start,
    statementPeriodEnd: end,
    accountHolderName: extractAccountHolderName(preHeaderText),
    ifscCode: extractIfscCode(preHeaderText),
    accountType: extractAccountType(preHeaderText),
  }
}
