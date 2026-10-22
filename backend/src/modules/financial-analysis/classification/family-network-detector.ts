import type { P2PCounterpartySummary } from './p2p-detector'

// Spec §5.5: "business keywords, recurring large amounts, or merchant
// markers" distinguish a business counterparty from a personal one — used
// here as the negative signal for "personal-name pattern" (a title-case
// name containing one of these tokens is a business, not a person, even
// though it passed the title-case name regex upstream in p2p-detector.ts).
export const BUSINESS_SUFFIX_PATTERN = /\b(pvt|ltd|llp|enterprises?|industries|solutions|technologies|services|traders|stores?|mart|company|co|corp|associates|group|bank)\b/i

export type FamilyConfidence = 'HIGH' | 'MEDIUM'

export interface FamilySignals {
  recurring: boolean
  personalNamePattern: boolean
  bidirectional: boolean
  surnameMatch: boolean
}

export interface FamilyNetworkEntry {
  counterparty: string
  netFlow: number
  direction: 'INBOUND' | 'OUTBOUND' | 'BIDIRECTIONAL'
  confidence: FamilyConfidence
  signals: FamilySignals
  signalCount: number
}

function lastToken(name: string): string {
  const tokens = name.trim().split(/\s+/)
  return tokens[tokens.length - 1]?.toLowerCase() ?? ''
}

/**
 * v4.0 spec §5.7 Family Network Inference — "Score family signals; classify
 * as TRANSFER_FAMILY at 3+ signals." This is explicitly an INFERRED signal,
 * never a verified relationship (§17 "What L2 Cannot Decide" lists "Family
 * relationships" by name) — every entry here is a pattern worth a CCR
 * discovery question ("Who is X? (relation?)"), not a stated fact.
 *
 * Four real, independently-computable signals (the spec names a 5th,
 * "absence of merchant markers," which collapses into the same evidence as
 * the personal-name-pattern signal below — scoring it twice would double-
 * count one observation, so only 4 distinct signals are tracked):
 *   1. recurring        — 3+ occurrences in the window (already computed by detectP2PCounterparties).
 *   2. personalNamePattern — a title-case individual name, not a business/merchant name.
 *   3. bidirectional    — both inflow and outflow with this counterparty.
 *   4. surnameMatch     — the counterparty's last name-token matches the account holder's own (requires `accountHolderName`, see Lead.fullName; when absent this signal is simply unavailable, never assumed false in a way that changes wording).
 */
export function detectFamilyNetwork(counterparties: P2PCounterpartySummary[], accountHolderName: string | null): FamilyNetworkEntry[] {
  const holderSurname = accountHolderName ? lastToken(accountHolderName) : null
  const entries: FamilyNetworkEntry[] = []

  for (const c of counterparties) {
    // A VPA-style counterparty ("ravi@okaxis") never looks like a personal name — skip entirely, same as a business name.
    const looksLikePersonalName = /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)+$/.test(c.counterparty) && !BUSINESS_SUFFIX_PATTERN.test(c.counterparty)
    if (!looksLikePersonalName) continue

    const signals: FamilySignals = {
      recurring: c.recurring,
      personalNamePattern: true,
      bidirectional: c.totalInflow > 0 && c.totalOutflow > 0,
      surnameMatch: holderSurname !== null && lastToken(c.counterparty) === holderSurname,
    }
    const signalCount = Object.values(signals).filter(Boolean).length
    if (signalCount < 3) continue

    const netFlow = c.totalInflow - c.totalOutflow
    const direction = c.totalInflow > 0 && c.totalOutflow > 0 ? 'BIDIRECTIONAL' : c.totalInflow > 0 ? 'INBOUND' : 'OUTBOUND'

    entries.push({
      counterparty: c.counterparty,
      netFlow,
      direction,
      confidence: signalCount >= 4 ? 'HIGH' : 'MEDIUM',
      signals,
      signalCount,
    })
  }

  return entries.sort((a, b) => b.signalCount - a.signalCount)
}
