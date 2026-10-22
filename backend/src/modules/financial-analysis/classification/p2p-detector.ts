import type { NormalizedTransactionInput } from '../financial-analysis.types'

const VPA_PATTERN = /([\w.-]+@[a-z]+)/i
// A title-case "Ravi Kumar"-style individual name — deliberately excludes
// ALL-CAPS corporate/merchant narrations ("XYZ ENTERPRISES"), which are
// never mistaken for a P2P counterparty this way.
const TITLE_CASE_NAME_PATTERN = /([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/

// New BBS-established threshold (no prior rule — the spec says "recurring
// counterparty" without a number): 3+ occurrences in the statement window
// is treated as recurring, same floor already used elsewhere in this
// module for "enough evidence to call something a pattern."
const RECURRING_COUNTERPARTY_MIN_OCCURRENCES = 3

export interface P2PCounterpartySummary {
  counterparty: string
  occurrences: number
  recurring: boolean
  trend: 'increasing' | 'decreasing' | 'stable'
  totalInflow: number
  totalOutflow: number
}

export interface P2PDetectionResult {
  transactions: NormalizedTransactionInput[]
  counterparties: P2PCounterpartySummary[]
  /** Transactions that are genuinely P2P-shaped (TRANSFERS/P2P transfer) but with no identifiable counterparty and under the recurring floor — Rule: never force-classified further, flagged for investigation instead (UNCLASSIFIED_P2P). */
  unclassifiedP2pCount: number
}

function extractCounterparty(narration: string): string | null {
  const vpaMatch = VPA_PATTERN.exec(narration)
  if (vpaMatch) return vpaMatch[1].toLowerCase()
  const nameMatch = TITLE_CASE_NAME_PATTERN.exec(narration)
  if (nameMatch) return nameMatch[1]
  return null
}

function trendOf(transactions: NormalizedTransactionInput[]): 'increasing' | 'decreasing' | 'stable' {
  if (transactions.length < 4) return 'stable'
  const sorted = [...transactions].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime())
  const midpoint = Math.floor(sorted.length / 2)
  const firstHalfAvg = sorted.slice(0, midpoint).reduce((s, t) => s + t.amount, 0) / midpoint
  const secondHalfAvg = sorted.slice(midpoint).reduce((s, t) => s + t.amount, 0) / (sorted.length - midpoint)
  if (secondHalfAvg > firstHalfAvg * 1.15) return 'increasing'
  if (secondHalfAvg < firstHalfAvg * 0.85) return 'decreasing'
  return 'stable'
}

/**
 * P2P counterparty tracking — operates only on transactions already left
 * as TRANSFERS/P2P transfer by classifyTransaction (i.e. a generic
 * UPI/IMPS/NEFT/RTGS narration) that self-transfer detection did NOT
 * already resolve. A counterparty with <3 occurrences and/or no
 * identifiable name/VPA stays UNCLASSIFIED_P2P (D07) — never forced into
 * a specific classification.
 */
export function detectP2PCounterparties(transactions: NormalizedTransactionInput[]): P2PDetectionResult {
  const eligible = transactions.filter((t) => t.category === 'TRANSFERS' && t.subcategory === 'P2P transfer')
  const withCounterparty = eligible.map((t) => ({ txn: t, counterparty: extractCounterparty(t.narration) }))

  const byCounterparty = new Map<string, NormalizedTransactionInput[]>()
  for (const { txn, counterparty } of withCounterparty) {
    if (!counterparty) continue
    const existing = byCounterparty.get(counterparty)
    if (existing) existing.push(txn)
    else byCounterparty.set(counterparty, [txn])
  }

  const counterparties: P2PCounterpartySummary[] = []
  const updates = new Map<NormalizedTransactionInput, NormalizedTransactionInput>()

  for (const [counterparty, group] of byCounterparty) {
    const recurring = group.length >= RECURRING_COUNTERPARTY_MIN_OCCURRENCES
    counterparties.push({
      counterparty,
      occurrences: group.length,
      recurring,
      trend: trendOf(group),
      totalInflow: group.filter((t) => t.direction === 'CREDIT').reduce((s, t) => s + t.amount, 0),
      totalOutflow: group.filter((t) => t.direction === 'DEBIT').reduce((s, t) => s + t.amount, 0),
    })
    for (const t of group) updates.set(t, { ...t, counterparty })
  }

  const unclassifiedP2pCount = eligible.filter((t) => {
    const updated = updates.get(t)
    if (!updated) return true // no identifiable counterparty at all
    const summary = counterparties.find((c) => c.counterparty === updated.counterparty)
    return !summary?.recurring
  }).length

  return {
    transactions: transactions.map((t) => updates.get(t) ?? t),
    counterparties: counterparties.sort((a, b) => b.occurrences - a.occurrences),
    unclassifiedP2pCount,
  }
}
