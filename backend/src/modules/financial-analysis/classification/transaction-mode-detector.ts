import type { NormalizedTransactionInput } from '../financial-analysis.types'

/**
 * Populates the already-defined-but-previously-unused
 * `NormalizedTransactionInput.transactionType` field with the bank
 * narration's own rail/mode prefix (spec's §"Narration Parsing & Transaction
 * Modes" — UPI/IMPS/NEFT/RTGS/ACH-DR/ACH-CR/ATM-CASH/CASH DEP/CDM/POS/ECS/
 * SB/CHQ). This is a narration-prefix READ, not a new classification engine
 * — it never changes `category`/`subcategory`, and a narration matching none
 * of these stays `null` (never force-assigned), same D07 discipline as
 * `classifyTransaction`. Checked in order so a more specific prefix (e.g.
 * "ACH-DR" encodes both an ACH debit AND a mandate reference the generic
 * "ACH" alone would miss) wins over a shorter, more generic one.
 */
const MODE_PATTERNS: Array<{ mode: string; pattern: RegExp }> = [
  { mode: 'UPI', pattern: /\bupi\b/i },
  { mode: 'IMPS', pattern: /\bimps\b/i },
  { mode: 'NEFT', pattern: /\bneft\b/i },
  { mode: 'RTGS', pattern: /\brtgs\b/i },
  { mode: 'ACH-DR', pattern: /\bach[\s-]?dr\b/i },
  { mode: 'ACH-CR', pattern: /\bach[\s-]?cr\b/i },
  { mode: 'ECS', pattern: /\becs\b/i },
  { mode: 'CDM', pattern: /\bcdm\b/i },
  { mode: 'CASH DEP', pattern: /cash\s*dep(osit)?/i },
  { mode: 'ATM-CASH', pattern: /\batm\b|cash\s*wdl|cash\s*withdrawal/i },
  { mode: 'POS', pattern: /\bpos\b/i },
  { mode: 'CHQ', pattern: /\bchq\b|\bcheque\b|\bcheck\b/i },
  { mode: 'SB', pattern: /\bsb\b(?!\w)/i },
]

export function detectTransactionMode(narration: string): string | null {
  for (const { mode, pattern } of MODE_PATTERNS) {
    if (pattern.test(narration)) return mode
  }
  return null
}

export function detectTransactionModes(transactions: NormalizedTransactionInput[]): NormalizedTransactionInput[] {
  return transactions.map((t) => (t.transactionType ? t : { ...t, transactionType: detectTransactionMode(t.narration) }))
}
