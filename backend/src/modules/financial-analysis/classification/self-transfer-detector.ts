import type { NormalizedTransactionInput } from '../financial-analysis.types'

const SELF_TRANSFER_KEYWORD = /\bself\b|own\s*a\/?c|own\s*account|to\s*self|self\s*transfer/i

// New BBS-established tolerance (no prior rule): a debit/credit pair within
// 1% of each other's amount and 3 days of each other is a plausible
// (never certain) same-person reciprocal-account transfer — the weaker,
// INFERRED-tier secondary signal. True reciprocal-account matching isn't
// generally possible from a single account's own statement.
const PAIR_AMOUNT_TOLERANCE_FRACTION = 0.01
const PAIR_WINDOW_DAYS = 3
const MS_PER_DAY = 24 * 60 * 60 * 1000

// A transaction already classified into one of these is a confident,
// specific classification — self-transfer detection must never override
// it (D03 is about never counting a genuine self-transfer AS income/
// expense, which cuts both ways: it's equally wrong to relabel a real
// EMI/Salary/BNPL transaction as a self-transfer just because of a loose
// pattern match).
const PROTECTED_CATEGORIES = new Set(['INCOME', 'BORROWING', 'EXPENSE'])

/**
 * Self-transfer detection (D03: never counted as income/expense/debt
 * payment unless real evidence supports it — which cuts the other way
 * too, see PROTECTED_CATEGORIES above). `accountHolderName`, when known,
 * is the strongest CONFIRMED-tier signal; absent that, only an explicit
 * "self"/"own a/c" narration keyword counts as CONFIRMED. A same-amount
 * debit/credit pair close in time is a weaker, INFERRED-tier secondary
 * signal — never force-labeled into certainty.
 */
export function detectSelfTransfer(transactions: NormalizedTransactionInput[], accountHolderName?: string | null): NormalizedTransactionInput[] {
  const nameKeyword = accountHolderName
    ? new RegExp(accountHolderName.trim().split(/\s+/).filter(Boolean).join('|'), 'i')
    : null

  let result = transactions.map((t) => {
    if (PROTECTED_CATEGORIES.has(t.category)) return t
    const matchesKeyword = SELF_TRANSFER_KEYWORD.test(t.narration) || (nameKeyword !== null && nameKeyword.test(t.narration))
    if (!matchesKeyword) return t
    return { ...t, category: 'TRANSFERS' as const, subcategory: 'Self transfer', evidenceLevel: 'CONFIRMED' as const }
  })

  // Secondary INFERRED-tier pass: same-amount debit/credit pairs close in
  // time, among whatever is still unprotected and not already CONFIRMED above.
  const eligible = result.filter((t) => !PROTECTED_CATEGORIES.has(t.category) && t.subcategory !== 'Self transfer')
  const debits = eligible.filter((t) => t.direction === 'DEBIT')
  const credits = eligible.filter((t) => t.direction === 'CREDIT')
  const matchedPairs = new Set<NormalizedTransactionInput>()

  // CRITICAL: pick the BEST eligible candidate, not merely the first one
  // in array order — with several same-day/same-amount-window
  // transactions, array order is an arbitrary parsing artifact, never a
  // real signal. Preference order: smallest absolute amount difference,
  // then closest timestamp, then a deterministic tie-breaker
  // (sourceRowRef) — never promotes the match to a higher evidence tier
  // than before (still INFERRED), only chooses which pair is INFERRED.
  for (const debit of debits) {
    let best: { credit: NormalizedTransactionInput; amountDiff: number; timeDiff: number } | null = null
    for (const credit of credits) {
      if (matchedPairs.has(credit)) continue
      const amountDiff = Math.abs(credit.amount - debit.amount)
      if (amountDiff > debit.amount * PAIR_AMOUNT_TOLERANCE_FRACTION) continue
      const timeDiff = Math.abs(credit.transactionDate.getTime() - debit.transactionDate.getTime())
      if (timeDiff > PAIR_WINDOW_DAYS * MS_PER_DAY) continue

      const isBetter =
        !best ||
        amountDiff < best.amountDiff ||
        (amountDiff === best.amountDiff && timeDiff < best.timeDiff) ||
        (amountDiff === best.amountDiff && timeDiff === best.timeDiff && (credit.sourceRowRef ?? 0) < (best.credit.sourceRowRef ?? 0))
      if (isBetter) best = { credit, amountDiff, timeDiff }
    }
    if (best) {
      matchedPairs.add(debit)
      matchedPairs.add(best.credit)
    }
  }

  if (matchedPairs.size > 0) {
    result = result.map((t) =>
      matchedPairs.has(t) ? { ...t, category: 'TRANSFERS' as const, subcategory: 'Self transfer', evidenceLevel: 'INFERRED' as const } : t,
    )
  }

  return result
}
