import type { BounceEvidenceTier, NormalizedTransactionInput } from '../financial-analysis.types'

// The spec's own 3-tier evidence rule (Part 13 / Rule 20) — an explicit
// return/bounce narration is the ONLY thing that may ever read as
// CONFIRMED_BOUNCE. A fee-only narration (no explicit return evidence) is
// POSSIBLE_BOUNCE and may NEVER be promoted to CONFIRMED, no matter how
// suggestive (D06) — this is a hard rule, not a threshold to tune.
const CONFIRMED_BOUNCE_PATTERN = /ecs\s*return|nach\s*return|che?que\s*return|chq\s*ret\b|inward\s*return|unpaid\s*che?que|mandate\s*fail/i
const POSSIBLE_BOUNCE_PATTERN = /ecs\s*charges?|return\s*charges?|penal\s*charges?|bounce\s*charges?/i
// A generic reversal with no further qualifying evidence either way —
// evaluated but genuinely inconclusive, never inferred into a bounce.
const UNKNOWN_REVERSAL_PATTERN = /reversal|\breturn\b/i

function classifyBounceEvidence(narration: string): BounceEvidenceTier | null {
  if (CONFIRMED_BOUNCE_PATTERN.test(narration)) return 'CONFIRMED_BOUNCE'
  if (POSSIBLE_BOUNCE_PATTERN.test(narration)) return 'POSSIBLE_BOUNCE'
  if (UNKNOWN_REVERSAL_PATTERN.test(narration)) return 'UNKNOWN'
  return null // not relevant to bounce evidence at all — distinct from an evaluated-but-inconclusive UNKNOWN
}

/** Stamps `bounceEvidence` on every transaction whose narration matches one of the 3 tiers — leaves it null (not evaluated) on everything else. */
export function detectBounceEvidence(transactions: NormalizedTransactionInput[]): NormalizedTransactionInput[] {
  return transactions.map((t) => {
    const tier = classifyBounceEvidence(t.narration)
    return tier ? { ...t, bounceEvidence: tier } : t
  })
}

export interface BounceSummary {
  confirmedCount: number
  possibleCount: number
  unknownCount: number
  confirmedLast30Days: number
  confirmedLast90Days: number
  confirmedLast180Days: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Rule 20: total bounces plus bounces over 30/90/180 days — confirmed-tier only, since "total bounces" without a tier distinction would conflate confirmed and merely-possible evidence (never done in this module). */
export function summarizeBounces(transactions: NormalizedTransactionInput[], referenceDate: Date): BounceSummary {
  const confirmed = transactions.filter((t) => t.bounceEvidence === 'CONFIRMED_BOUNCE')
  const withinDays = (days: number) => confirmed.filter((t) => referenceDate.getTime() - t.transactionDate.getTime() <= days * MS_PER_DAY).length

  return {
    confirmedCount: confirmed.length,
    possibleCount: transactions.filter((t) => t.bounceEvidence === 'POSSIBLE_BOUNCE').length,
    unknownCount: transactions.filter((t) => t.bounceEvidence === 'UNKNOWN').length,
    confirmedLast30Days: withinDays(30),
    confirmedLast90Days: withinDays(90),
    confirmedLast180Days: withinDays(180),
  }
}
