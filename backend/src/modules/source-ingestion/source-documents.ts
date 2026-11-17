/**
 * Pure helpers for loading a person's SUPPLIED credit report (Experian
 * INProfileResponse JSON) and Account Aggregator bank statement (ReBIT
 * deposit-schema JSON) into the existing ingestion workflows: the Experian
 * XML mapper, and the CSV bank-statement parser. Nothing here touches the
 * database or any network — see scripts/ingest-source-documents.ts for the
 * orchestration, which never calls a bureau provider.
 */

type Json = Record<string, unknown>

const asRecord = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null)
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())

/** A repeating Experian node arrives as an array, a lone object, or not at all. */
function asList(v: unknown): Json[] {
  if (Array.isArray(v)) return v.map(asRecord).filter((x): x is Json => x !== null)
  const single = asRecord(v)
  return single ? [single] : []
}

const digits = (v: unknown): string => str(v).replace(/\D/g, '')
export const toTenDigitMobile = (v: unknown): string => digits(v).slice(-10)

/** YYYYMMDD (Experian) or YYYY-MM-DD (AA) -> YYYY-MM-DD; anything else -> null. */
export function normaliseDob(v: unknown): string | null {
  const s = str(v)
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

// Words that introduce a relative ("S/O DILBAG SINGH") — everything after one is not the holder's own name.
const RELATION_MARKER = /\b(?:s\/o|d\/o|w\/o|c\/o|son of|daughter of|wife of)\b/i

/** Name tokens used only to cross-check two documents belong to one person; never stored. */
export function nameTokens(name: string): string[] {
  const own = name.split(RELATION_MARKER)[0]
  return own
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
}

export interface Conflict {
  field: string
  detail: string
}

// --- Credit report -----------------------------------------------------------

export interface CreditIdentity {
  pan: string | null
  fullName: string
  mobile: string | null
  dob: string | null
  /** Experian's own code (1 = male, 2 = female) — not interpreted here. */
  genderCode: number | null
  pinCode: string | null
  bureauScore: number | null
  reportDate: string | null
  exactMatch: boolean
  accountCount: number
  conflicts: Conflict[]
}

function singleValue(label: string, values: string[], conflicts: Conflict[]): string | null {
  const distinct = [...new Set(values.filter((v) => v !== ''))]
  if (distinct.length === 0) return null
  if (distinct.length > 1) {
    conflicts.push({ field: label, detail: `the credit report's own tradelines disagree (${distinct.length} different values) — left unset` })
    return null
  }
  return distinct[0]
}

export function parseCreditReport(raw: unknown): CreditIdentity {
  const root = asRecord(asRecord(raw)?.INProfileResponse)
  if (!root) throw new Error('Not an Experian INProfileResponse document')

  const applicant = asRecord(asRecord(asRecord(root.Current_Application)?.Current_Application_Details)?.Current_Applicant_Details) ?? {}
  const accounts = asList(asRecord(root.CAIS_Account)?.CAIS_Account_DETAILS)
  const holders = accounts.map((a) => asRecord(a.CAIS_Holder_Details) ?? {})
  const conflicts: Conflict[] = []

  const pan = singleValue('pan', [str(applicant.IncomeTaxPan), ...holders.map((h) => str(h.Income_TAX_PAN))].map((p) => p.toUpperCase()), conflicts)
  const applicantName = [applicant.First_Name, applicant.Middle_Name1, applicant.Middle_Name2, applicant.Middle_Name3, applicant.Last_Name].map(str).filter(Boolean).join(' ')
  const tradelineNames = holders.map((h) => str(h.Surname_Non_Normalized)).filter(Boolean)
  const fullName = applicantName || tradelineNames[0] || ''
  const applicantTokens = new Set(nameTokens(applicantName))
  for (const n of new Set(tradelineNames)) {
    const t = nameTokens(n)
    if (applicantTokens.size > 0 && !t.some((x) => applicantTokens.has(x))) {
      conflicts.push({ field: 'fullName', detail: 'a tradeline holder name shares no name part with the applicant name' })
    }
  }

  const dob = singleValue('dateOfBirth', holders.map((h) => normaliseDob(h.Date_of_birth) ?? ''), conflicts)
  const gender = singleValue('gender', holders.map((h) => str(h.Gender_Code)), conflicts)
  const pinCode = singleValue(
    'pinCode',
    accounts.map((a) => digits(asRecord(a.CAIS_Holder_Address_Details)?.ZIP_Postal_Code_non_normalized)),
    conflicts,
  )
  const score = Number(asRecord(root.SCORE)?.BureauScore)
  const header = asRecord(root.CreditProfileHeader)

  return {
    pan: pan && /^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? pan : null,
    fullName,
    mobile: toTenDigitMobile(applicant.MobilePhoneNumber) || null,
    dob,
    genderCode: gender !== null && /^\d+$/.test(gender) ? Number(gender) : null,
    pinCode: pinCode && /^\d{6}$/.test(pinCode) ? pinCode : null,
    bureauScore: Number.isFinite(score) && score > 0 ? score : null,
    reportDate: normaliseDob(header?.ReportDate),
    exactMatch: str(asRecord(root.Match_result)?.Exact_match) === 'Y',
    accountCount: accounts.length,
    conflicts,
  }
}

// --- JSON -> Experian XML (input to the existing mapper) ----------------------------

const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function toXml(name: string, value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => toXml(name, v)).join('')
  const rec = asRecord(value)
  if (rec) return `<${name}>${Object.entries(rec).map(([k, v]) => toXml(k, v)).join('')}</${name}>`
  return `<${name}>${escapeXml(str(value))}</${name}>`
}

/**
 * Re-expresses a supplied INProfileResponse JSON as the INProfileResponse XML
 * the existing Experian mapper (mapInProfileResponseXml) already consumes.
 * Every value becomes text, which is exactly how that mapper reads it; no
 * field is added, dropped, or altered.
 */
export function creditJsonToInProfileXml(raw: unknown): string {
  const root = asRecord(raw)?.INProfileResponse
  if (!asRecord(root)) throw new Error('Not an Experian INProfileResponse document')
  return toXml('INProfileResponse', root)
}

// --- Account Aggregator bank statement ---------------------------------------------

export interface AaTransaction {
  /** Transaction timestamp's calendar date (YYYY-MM-DD). */
  date: string
  /** The bank's value/posting date (YYYY-MM-DD), or '' if not supplied. */
  valueDate: string
  narration: string
  debit: number | null
  credit: number | null
  balance: number | null
}

export interface AaStatement {
  holder: { name: string; dob: string | null; mobile: string | null; pan: string | null; email: string | null }
  account: { maskedAccNumber: string | null; ifsc: string | null; branch: string | null; accountType: string | null }
  fipId: string | null
  period: { start: string | null; end: string | null }
  transactions: AaTransaction[]
}

const num = (v: unknown): number | null => {
  const n = Number(str(v))
  return str(v) !== '' && Number.isFinite(n) ? n : null
}

export function parseAaStatement(raw: unknown): AaStatement {
  const first = asList(asRecord(raw)?.data)[0]
  const account = asRecord(asRecord(asRecord(first?.dataDetail)?.jsonData)?.Account)
  if (!first || !account) throw new Error('Not an Account Aggregator deposit statement')

  const holder = asRecord(asRecord(asRecord(account.Profile)?.Holders)?.Holder) ?? {}
  const summary = asRecord(account.Summary) ?? {}
  const txns = asRecord(account.Transactions) ?? {}

  const transactions: AaTransaction[] = asList(txns.Transaction).map((t) => {
    const amount = num(t.amount)
    const isCredit = str(t.type).toUpperCase() === 'CREDIT'
    return {
      date: str(t.transactionTimestamp).slice(0, 10),
      valueDate: str(t.valueDate).slice(0, 10),
      narration: str(t.narration),
      debit: !isCredit ? amount : null,
      credit: isCredit ? amount : null,
      balance: num(t.currentBalance),
    }
  })

  return {
    holder: {
      name: str(holder.name),
      dob: normaliseDob(holder.dob),
      mobile: toTenDigitMobile(holder.mobile) || null,
      pan: str(holder.pan).toUpperCase() || null,
      email: str(holder.email).toLowerCase() || null,
    },
    account: {
      maskedAccNumber: str(account.maskedAccNumber) || null,
      ifsc: str(summary.ifscCode).toUpperCase() || null,
      branch: str(summary.branch) || null,
      accountType: str(summary.type) || null,
    },
    fipId: str(first.fipid) || null,
    period: { start: str(txns.startDate) || null, end: str(txns.endDate) || null },
    transactions,
  }
}

const dmy = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const csvCell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

export interface OrderedTransactions {
  transactions: AaTransaction[]
  dateBasis: 'transactionTimestamp' | 'valueDate'
  ordering: 'as-supplied' | 'reversed' | 'sorted-by-date'
  /** Adjacent rows whose running balance does not follow from the previous balance and this amount. */
  balanceContinuityBreaks: number
}

function continuityBreaks(rows: AaTransaction[]): number {
  let breaks = 0
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].balance
    const cur = rows[i]
    const amount = (cur.credit ?? 0) - (cur.debit ?? 0)
    if (prev === null || cur.balance === null || Math.abs(prev + amount - cur.balance) > 0.011) breaks++
  }
  return breaks
}

/**
 * AA statements do not guarantee a single ordering: some are ledger-ordered
 * by value date while their transaction timestamps wobble, and some arrive
 * newest-first. The running balance is the ground truth for ledger order, so
 * every (ordering, date column) candidate that yields non-decreasing dates is
 * scored by how many adjacent rows break balance continuity, and the best is
 * used (ties keep the as-supplied order). A statement for which no candidate
 * is date-ordered is rejected, never guessed at.
 */
export function orderAaTransactions(transactions: AaTransaction[]): OrderedTransactions {
  const bases = ['transactionTimestamp', 'valueDate'] as const
  const keyOf = (t: AaTransaction, basis: (typeof bases)[number]) => (basis === 'valueDate' ? t.valueDate : t.date)
  const candidates: OrderedTransactions[] = []

  for (const basis of bases) {
    if (transactions.some((t) => !/^\d{4}-\d{2}-\d{2}$/.test(keyOf(t, basis)))) continue
    const orderings: [OrderedTransactions['ordering'], AaTransaction[]][] = [
      ['as-supplied', transactions],
      ['reversed', [...transactions].reverse()],
      ['sorted-by-date', [...transactions].sort((a, b) => (keyOf(a, basis) < keyOf(b, basis) ? -1 : keyOf(a, basis) > keyOf(b, basis) ? 1 : 0))],
    ]
    for (const [ordering, rows] of orderings) {
      const monotone = rows.every((t, i) => i === 0 || keyOf(t, basis) >= keyOf(rows[i - 1], basis))
      if (monotone) candidates.push({ transactions: rows, dateBasis: basis, ordering, balanceContinuityBreaks: continuityBreaks(rows) })
    }
  }
  if (candidates.length === 0) throw new Error('Statement transactions cannot be put in date order')
  return candidates.reduce((best, c) => (c.balanceContinuityBreaks < best.balanceContinuityBreaks ? c : best))
}

/**
 * Renders the AA transactions as the CSV layout the existing statement
 * parser reads (metadata lines, then Date/Narration/Debit/Credit/Balance),
 * in the ledger order chosen by orderAaTransactions.
 */
export function aaStatementToCsv(statement: AaStatement): { csv: string; ordered: OrderedTransactions } {
  const { account, holder, period } = statement
  if (statement.transactions.length === 0) throw new Error('The statement has no transactions')
  if (statement.transactions.some((t) => t.debit === null && t.credit === null)) throw new Error('A transaction is missing its amount')

  const ordered = orderAaTransactions(statement.transactions)
  const dateOf = (t: AaTransaction) => (ordered.dateBasis === 'valueDate' ? t.valueDate : t.date)

  const lines: string[] = []
  if (holder.name) lines.push(`Account Holder Name: ${holder.name}`)
  if (account.maskedAccNumber) lines.push(`Account Number (masked): ${account.maskedAccNumber}`)
  if (account.ifsc) lines.push(`IFSC Code: ${account.ifsc}`)
  if (account.accountType) lines.push(`Account Type: ${account.accountType}`)
  if (period.start && period.end) lines.push(`Statement Period From: ${dmy(period.start)} To: ${dmy(period.end)}`)
  lines.push('Date,Narration,Debit,Credit,Balance')
  for (const t of ordered.transactions) {
    lines.push([dmy(dateOf(t)), csvCell(t.narration), t.debit?.toFixed(2) ?? '', t.credit?.toFixed(2) ?? '', t.balance?.toFixed(2) ?? ''].join(','))
  }
  return { csv: `${lines.join('\n')}\n`, ordered }
}

// --- Cross-document identity check ---------------------------------------------------

export interface IdentityCheck {
  field: 'mobile' | 'pan' | 'dateOfBirth' | 'name'
  credit: string | null
  statement: string | null
  result: 'MATCH' | 'MISMATCH' | 'ONE_SIDE_ONLY'
}


const FULL_PAN = /^[A-Z]{5}\d{4}[A-Z]$/

/** Compares a full PAN to a statement PAN that may be masked ("****6479L") or a non-PAN placeholder ("FORM60"). */
function comparePan(credit: string | null, statement: string | null): IdentityCheck['result'] {
  if (credit === null || statement === null) return 'ONE_SIDE_ONLY'
  if (FULL_PAN.test(statement)) return credit === statement ? 'MATCH' : 'MISMATCH'
  const masked = /^[*X]+([A-Z0-9]+)$/.exec(statement)
  if (masked) return credit.endsWith(masked[1]) ? 'MATCH' : 'MISMATCH'
  return 'ONE_SIDE_ONLY' // e.g. "FORM60" — not a PAN, so it says nothing either way
}

/**
 * Decides whether a credit report and a bank statement describe the same
 * person. A mismatch on the mobile number, PAN, or name blocks ingestion of
 * the pair entirely — data from two people is never combined. A date-of-birth
 * disagreement alone does not prove they are different people (banks default
 * unknown dates to 1 January), so it is reported as a conflict and the DOB is
 * left unset rather than picking a side. At least the mobile or the PAN must
 * positively agree.
 */
export function crossCheckIdentity(
  credit: CreditIdentity,
  statement: AaStatement,
): { checks: IdentityCheck[]; sameIdentity: boolean; blockers: string[]; softConflicts: Conflict[] } {
  const exact = (field: IdentityCheck['field'], c: string | null, s: string | null): IdentityCheck => ({
    field,
    credit: c,
    statement: s,
    result: c === null || s === null ? 'ONE_SIDE_ONLY' : c === s ? 'MATCH' : 'MISMATCH',
  })

  const creditTokens = nameTokens(credit.fullName)
  const stmtTokens = new Set(nameTokens(statement.holder.name))
  const shared = creditTokens.filter((t) => stmtTokens.has(t)).length
  // Strong name evidence = at least half of the shorter name's parts appear in the other.
  const smaller = Math.min(creditTokens.length, stmtTokens.size)
  const nameResult: IdentityCheck['result'] = smaller === 0 ? 'ONE_SIDE_ONLY' : shared / smaller >= 0.5 ? 'MATCH' : 'MISMATCH'

  const checks: IdentityCheck[] = [
    exact('mobile', credit.mobile, statement.holder.mobile),
    { field: 'pan', credit: credit.pan, statement: statement.holder.pan, result: comparePan(credit.pan, statement.holder.pan) },
    exact('dateOfBirth', credit.dob, statement.holder.dob),
    { field: 'name', credit: credit.fullName || null, statement: statement.holder.name || null, result: nameResult },
  ]
  const blockers = checks.filter((c) => c.field !== 'dateOfBirth' && c.result === 'MISMATCH').map((c) => `${c.field} differs between the credit report and the bank statement`)
  const softConflicts: Conflict[] = checks
    .filter((c) => c.field === 'dateOfBirth' && c.result === 'MISMATCH')
    .map(() => ({ field: 'dateOfBirth', detail: 'the credit report and the bank statement give different dates of birth — left unset' }))
  const positive = checks.some((c) => (c.field === 'mobile' || c.field === 'pan') && c.result === 'MATCH')
  return { checks, sameIdentity: blockers.length === 0 && positive, blockers, softConflicts }
}
