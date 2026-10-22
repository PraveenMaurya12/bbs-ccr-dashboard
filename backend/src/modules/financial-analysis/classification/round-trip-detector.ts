import type { NormalizedTransactionInput } from '../financial-analysis.types'

const MS_PER_HOUR = 60 * 60 * 1000
// v4.0 spec §5.4: "same amount within 48 hours" — a distinct, slightly
// wider window than self-transfer detection's own 72-hour PAIR_WINDOW_DAYS
// (that rule is about a different phenomenon: a genuine transfer between
// two accounts the same person holds, not a failed/reversed transaction).
const ROUND_TRIP_WINDOW_HOURS = 48
const ROUND_TRIP_AMOUNT_TOLERANCE_FRACTION = 0.01

// Spec's own evidence list: "failed-transaction markers, merchant
// reversals, bank reversals, and CRADJ activity."
const REVERSAL_KEYWORD_PATTERN = /reversal|reversed|cradj|failed|chargeback|refund(?:ed)?|return(?:ed)?/i

// A transaction already classified into one of these is a confident,
// specific classification that round-trip detection must never override
// (same discipline as self-transfer-detector.ts's own PROTECTED_CATEGORIES).
const PROTECTED_CATEGORIES = new Set(['INCOME', 'BORROWING'])

export interface RoundTripPair {
  debitDate: Date
  creditDate: Date
  amount: number
  debitNarration: string
  creditNarration: string
  /** CONFIRMED when the credit-side narration carries an explicit reversal/failed/CRADJ marker; INFERRED when only the amount+time pattern matches. */
  evidenceLevel: 'CONFIRMED' | 'INFERRED'
}

export interface RoundTripResult {
  transactions: NormalizedTransactionInput[]
  pairs: RoundTripPair[]
}

/**
 * v4.0 spec §5.4 Round-Trip Detection — a same-amount debit+credit pair
 * within 48 hours, EXCLUDED from income and expense (distinct from
 * self-transfer: this is a merchant/payment-processor-facing failed
 * transaction or reversal, not a transfer to another account the customer
 * holds — the counterparty here is typically a merchant/VPA, never
 * expected to look like a personal name). Only ever pairs transactions NOT
 * already tagged 'Self transfer' (self-transfer detection runs first and
 * owns that distinct phenomenon).
 */
export function detectRoundTrips(transactions: NormalizedTransactionInput[]): RoundTripResult {
  const eligible = transactions.filter((t) => !PROTECTED_CATEGORIES.has(t.category) && t.subcategory !== 'Self transfer')
  const debits = eligible.filter((t) => t.direction === 'DEBIT')
  const credits = eligible.filter((t) => t.direction === 'CREDIT')
  const matchedPairs = new Set<NormalizedTransactionInput>()
  const pairs: RoundTripPair[] = []

  for (const debit of debits) {
    let best: { credit: NormalizedTransactionInput; amountDiff: number; timeDiff: number } | null = null
    for (const credit of credits) {
      if (matchedPairs.has(credit)) continue
      const amountDiff = Math.abs(credit.amount - debit.amount)
      if (amountDiff > debit.amount * ROUND_TRIP_AMOUNT_TOLERANCE_FRACTION) continue
      const timeDiff = credit.transactionDate.getTime() - debit.transactionDate.getTime()
      if (timeDiff < 0 || timeDiff > ROUND_TRIP_WINDOW_HOURS * MS_PER_HOUR) continue

      const isBetter = !best || amountDiff < best.amountDiff || (amountDiff === best.amountDiff && timeDiff < best.timeDiff)
      if (isBetter) best = { credit, amountDiff, timeDiff }
    }
    if (best) {
      matchedPairs.add(debit)
      matchedPairs.add(best.credit)
      const hasReversalKeyword = REVERSAL_KEYWORD_PATTERN.test(best.credit.narration) || REVERSAL_KEYWORD_PATTERN.test(debit.narration)
      pairs.push({
        debitDate: debit.transactionDate,
        creditDate: best.credit.transactionDate,
        amount: debit.amount,
        debitNarration: debit.narration,
        creditNarration: best.credit.narration,
        evidenceLevel: hasReversalKeyword ? 'CONFIRMED' : 'INFERRED',
      })
    }
  }

  const transactions2 =
    matchedPairs.size > 0
      ? transactions.map((t) => (matchedPairs.has(t) ? { ...t, category: 'OTHER' as const, subcategory: 'Round trip', evidenceLevel: t.evidenceLevel } : t))
      : transactions

  return { transactions: transactions2, pairs }
}
