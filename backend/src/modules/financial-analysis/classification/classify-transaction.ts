import type { NormalizedTransactionInput, TransactionCategory } from '../financial-analysis.types'

interface Rule {
  category: TransactionCategory
  subcategory: string
  pattern: RegExp
  /** When set, this rule only applies to a transaction of that direction — e.g. "Salary" can't be a DEBIT. */
  direction?: 'CREDIT' | 'DEBIT'
  /**
   * v4.0 spec §8.3: "Ambiguous merchants default to a classification and
   * carry MERCHANT_AMBIGUOUS for CCR confirmation." Set on a rule whose
   * keyword is a GENERIC category word (e.g. bare "shop"/"mall") rather
   * than a specific named merchant (e.g. "Amazon") — the classification
   * itself never changes, this only marks the match as less certain so a
   * risk flag/CCR-confirmation item can surface it. A narration matching
   * BOTH a named-merchant rule and a generic one always hits the
   * named-merchant rule first (checked order below), so ambiguity is only
   * ever flagged when no specific merchant name was actually present.
   */
  ambiguous?: boolean
}

/**
 * Keyword/narration-pattern rules, checked in order — the FIRST match
 * wins, so more specific patterns (e.g. "insurance premium") are listed
 * before their more generic overlapping sibling (e.g. bare "insurance").
 * This is explicitly a heuristic over free-text bank narrations, not a
 * verified official taxonomy (same honesty convention as Debt Analysis's
 * product-categorization keyword matching) — real-world narration variety
 * is enormous, and anything matching no rule below correctly falls through
 * to UNCLASSIFIED rather than being force-assigned (D07-style "never force
 * uncertain evidence into a category").
 */
const RULES: Rule[] = [
  // --- Cash ---
  { category: 'CASH', subcategory: 'ATM withdrawal', pattern: /\batm\b|cash\s*wdl|cash\s*withdrawal/i, direction: 'DEBIT' },
  { category: 'CASH', subcategory: 'Cash deposit', pattern: /cash\s*dep(osit)?/i, direction: 'CREDIT' },

  // --- Expense / Financial (checked before the broader Essential "Insurance" rule) ---
  { category: 'EXPENSE', subcategory: 'EMI', pattern: /\bemi\b/i, direction: 'DEBIT' },
  // A lender's own UPI collection VPA (spec Appendix C names Incred,
  // Finnable, SMFG, IDFC and Bajaj as "Debt Payment" merchants) — confirmed
  // against a real statement: "UPI/P2M/.../WWW IDFCBANK COM/UPIInt/..." is
  // structurally a Person-to-MERCHANT payment, never Person-to-Account, so
  // requiring the literal "P2M" direction code alongside the lender name is
  // what distinguishes a genuine lender collection from an ordinary P2P
  // transfer that merely mentions a bank name (e.g. a friend's IFSC/bank
  // field) — a family/friend transfer to an individual is always P2A, never
  // P2M. Recurrence/amount-consistency is still validated downstream by
  // recurring-debt-detector before this contributes to DSR as a confirmed EMI.
  { category: 'EXPENSE', subcategory: 'EMI', pattern: /\bP2M\b.*\b(incred|finnable|smfg|idfc\w*|bajaj\s*fin)\b/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Loan repayment', pattern: /loan\s*(repayment|installment|inst\b)/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Credit-card payment', pattern: /\bcred\b|credit\s*card.*(payment|bill)|card\s*(bill)?\s*payment/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Insurance premium', pattern: /insurance\s*premium|\blic\b/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Investment', pattern: /mutual\s*fund|\bsip\b|\bnps\b|\bequity\b|investment/i, direction: 'DEBIT' },

  // --- Expense / Essential ---
  { category: 'EXPENSE', subcategory: 'Rent', pattern: /\brent\b/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Utilities', pattern: /electricity|water\s*bill|gas\s*bill|\butilit(y|ies)\b|broadband|\bdth\b|mobile\s*recharge/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Groceries', pattern: /bigbasket|\bdmart\b|blinkit|\bzepto\b/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Groceries', pattern: /grocer|supermarket|kirana/i, direction: 'DEBIT', ambiguous: true },
  { category: 'EXPENSE', subcategory: 'Education', pattern: /school|college|tuition|university|education/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Medical', pattern: /hospital|pharmacy|medical|clinic|\bdoctor\b/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Insurance', pattern: /\binsurance\b/i, direction: 'DEBIT' },

  // --- Expense / Discretionary ---
  { category: 'EXPENSE', subcategory: 'Restaurant', pattern: /swiggy|zomato/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Restaurant', pattern: /restaurant|\bcafe\b|food\s*order/i, direction: 'DEBIT', ambiguous: true },
  { category: 'EXPENSE', subcategory: 'Subscription', pattern: /netflix|spotify|prime\s*video|hotstar/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Subscription', pattern: /subscription/i, direction: 'DEBIT', ambiguous: true },
  { category: 'EXPENSE', subcategory: 'Entertainment', pattern: /bookmyshow|\bpvr\b|\binox\b/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Entertainment', pattern: /movie|entertainment/i, direction: 'DEBIT', ambiguous: true },
  { category: 'EXPENSE', subcategory: 'Travel', pattern: /\buber\b|\bola\b|irctc|makemytrip|goibibo/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Travel', pattern: /travel|flight|hotel/i, direction: 'DEBIT', ambiguous: true },
  { category: 'EXPENSE', subcategory: 'Shopping', pattern: /amazon|flipkart|myntra/i, direction: 'DEBIT' },
  { category: 'EXPENSE', subcategory: 'Shopping', pattern: /\bshop(ping)?\b|\bmall\b/i, direction: 'DEBIT', ambiguous: true },

  // --- Borrowing (loan proceeds — credit only) ---
  { category: 'BORROWING', subcategory: 'BNPL', pattern: /\bbnpl\b|buy\s*now\s*pay\s*later|\bsimpl\b|lazypay/i, direction: 'CREDIT' },
  { category: 'BORROWING', subcategory: 'Personal loan', pattern: /personal\s*loan/i, direction: 'CREDIT' },
  { category: 'BORROWING', subcategory: 'Consumer loan', pattern: /consumer\s*loan/i, direction: 'CREDIT' },
  { category: 'BORROWING', subcategory: 'Finance-company loan', pattern: /finance\s*(co|company)\b|\bnbfc\b|bajaj\s*fin|fin\s*corp/i, direction: 'CREDIT' },
  // Named-NBFC loan disbursement — confirmed against a real statement: both
  // "IMPS/P2A/.../INCREDFI/IDFCBank/..." (₹61,932) and "NEFT/.../FINNABLE
  // CREDIT PRIVATE LIMI/..." (₹5,00,000) are genuine loan disbursements that
  // otherwise fall through to the generic UPI/IMPS/NEFT catch-all as a P2P
  // transfer, hiding real borrowing-dependency evidence. Deliberately
  // restricted to NBFC-specific names (not bare "IDFC", which is also a
  // major retail bank and would false-positive on an ordinary transfer
  // whose counterparty happens to bank there).
  { category: 'BORROWING', subcategory: 'Finance-company loan', pattern: /\b(incred\w*|finnable|smfg)\b/i, direction: 'CREDIT' },
  { category: 'BORROWING', subcategory: 'Other loan proceeds', pattern: /loan\s*(disbursement|credit|proceeds|disb)/i, direction: 'CREDIT' },

  // --- Income (credit only) ---
  // "(?:fo|for)?" tolerates Axis Bank's own IMPS narration convention of
  // truncating the account_ref field to a fixed width — confirmed against a
  // real statement where "Salary for the Month of Nov" is truncated to the
  // 8-character "Salaryfo" in that field. \bsalary\b alone never matches
  // "Salaryfo" (no word boundary between "salary" and "fo"), silently
  // zeroing that month's income. Still requires a real boundary after the
  // optional suffix, so "salaryforever" or similar unrelated words don't match.
  { category: 'INCOME', subcategory: 'Salary', pattern: /\bsalary(?:fo|for)?\b|sal\s*credit|payroll/i, direction: 'CREDIT' },
  { category: 'INCOME', subcategory: 'Pension', pattern: /\bpension\b/i, direction: 'CREDIT' },
  { category: 'INCOME', subcategory: 'Business income', pattern: /business\s*(income|receipt)|sales\s*settlement/i, direction: 'CREDIT' },
  // Gig income: platform name AND a payout-ish keyword together — a bare
  // platform-name match alone would misclassify an ordinary ride/food-order
  // REFUND credit (e.g. "UBER REFUND") as income; requiring both keywords
  // keeps this a real, narration-evidenced signal, never a guess.
  { category: 'INCOME', subcategory: 'Gig income', pattern: /(uber|ola|swiggy|zomato|rapido|dunzo|urban\s*company).{0,30}(payout|earning|settlement|incentive)|(payout|earning|settlement|incentive).{0,30}(uber|ola|swiggy|zomato|rapido|dunzo|urban\s*company)/i, direction: 'CREDIT' },
  { category: 'INCOME', subcategory: 'Interest', pattern: /interest\s*(credit|paid)|\bint\.?\s*cr\b/i, direction: 'CREDIT' },
  { category: 'INCOME', subcategory: 'Government benefits', pattern: /subsidy|govt\s*benefit|\bdbt\b|pm\s*kisan/i, direction: 'CREDIT' },

  // --- Other ---
  { category: 'OTHER', subcategory: 'Refund', pattern: /refund/i, direction: 'CREDIT' },
  { category: 'OTHER', subcategory: 'Investment redemption', pattern: /redemption|mf\s*redemption/i, direction: 'CREDIT' },
  { category: 'OTHER', subcategory: 'Asset sale', pattern: /sale\s*proceeds|asset\s*sale/i, direction: 'CREDIT' },

  // --- Transfers (a generic transfer-rail code with no more specific
  // keyword above already matched) — tentatively 'P2P transfer'; the
  // self-transfer/P2P detectors (run afterward, over the whole
  // transaction set) refine this into Self transfer/Business
  // transfer/Internal transfer once they have cross-transaction evidence,
  // never assigned with more confidence than that here. ---
  { category: 'TRANSFERS', subcategory: 'P2P transfer', pattern: /\bupi\b|\bimps\b|\bneft\b|\brtgs\b/i },
]

/**
 * Per-row narration/keyword categorization — the first stage of
 * classification. Never forces a category: a narration matching no rule
 * above leaves `category: 'UNCLASSIFIED'`/`subcategory: null` exactly as
 * normalizeTransactions() already left it.
 */
export function classifyTransaction(transaction: NormalizedTransactionInput): NormalizedTransactionInput {
  for (const rule of RULES) {
    if (rule.direction && rule.direction !== transaction.direction) continue
    if (rule.pattern.test(transaction.narration)) {
      return { ...transaction, category: rule.category, subcategory: rule.subcategory }
    }
  }
  return transaction
}

export function classifyAllTransactions(transactions: NormalizedTransactionInput[]): NormalizedTransactionInput[] {
  return transactions.map(classifyTransaction)
}

/**
 * Re-derives whether a transaction's narration matched one of the
 * `ambiguous: true` generic-keyword rules above — a pure, stateless
 * re-lookup (no schema change, no persisted field) used only at
 * report-composition time to populate the MERCHANT_AMBIGUOUS risk flag
 * and the per-transaction CCR-confirmation evidence. Returns false for any
 * transaction whose category/subcategory came from something other than
 * this rule table (e.g. a later self-transfer/P2P/recurring-income
 * upgrade), since those paths have already resolved the ambiguity with
 * stronger cross-transaction evidence.
 */
export function isAmbiguousMerchantMatch(transaction: NormalizedTransactionInput): boolean {
  for (const rule of RULES) {
    if (rule.direction && rule.direction !== transaction.direction) continue
    if (rule.pattern.test(transaction.narration)) {
      return rule.category === transaction.category && rule.subcategory === transaction.subcategory && rule.ambiguous === true
    }
  }
  return false
}
