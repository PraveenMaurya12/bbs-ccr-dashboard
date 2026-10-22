import type { FamilyNetworkVerificationResult, FinancialAnalysisFacts } from '../master-profile.types'

/**
 * BBS Master Profile Module v3.0 §9.2 — "Family members inferred by L2
 * require verification before use in capacity." Reframes Financial
 * Analysis's own already-computed `familyNetwork` entries (never
 * re-detected here) for capacity-calculation purposes: every entry starts
 * UNVERIFIED, and the spec's own rule is applied verbatim — "Family
 * support flows are treated as potentially essential pending CCR" (not
 * excluded from essential expense until a CCR actually confirms otherwise).
 */
export function buildFamilyNetworkVerification(familyNetwork: FinancialAnalysisFacts['familyNetwork']): FamilyNetworkVerificationResult {
  const members = familyNetwork.map((entry) => {
    const { signals } = entry
    let inferredRelation: string
    if (signals.surnameMatch && signals.bidirectional) inferredRelation = 'Family (bidirectional, surname match)'
    else if (signals.surnameMatch) inferredRelation = 'Family (same surname pattern)'
    else if (signals.bidirectional) inferredRelation = 'Family (bidirectional)'
    else if (signals.personalNamePattern) inferredRelation = 'Friend / family'
    else inferredRelation = 'Business counterparty'

    return {
      name: entry.counterparty,
      inferredRelation,
      verificationStatus: 'UNVERIFIED' as const,
      ccrAction: inferredRelation === 'Business counterparty' ? 'Confirm purpose' : 'Confirm relation',
    }
  })

  return { members, treatedAsEssentialPendingCcr: members.length > 0 }
}
