import type { ComplianceRoutingResult } from '../master-profile.types'

/**
 * BBS Master Profile Module v3.0 §14 — compliance routing. Reads Financial
 * Analysis's own already-computed `relatedPartyEmployer` match (never
 * re-detects it; see master-profile.types.ts's own doc comment on that
 * field) and, when matched, routes to COMPLIANCE_HOLD with the spec's own
 * SLA/escalation hours (§14.3: 72h SLA, escalate at 48h). `now` is injected
 * (never `new Date()` internally) so this stays a pure, testable function.
 *
 * §14.2's related-party definition is broader than "employer" alone
 * (counterparty, legal/regulatory/sanctions triggers too), but this
 * integration has no data source for any of those other trigger types —
 * only Financial Analysis's own employer-narration match exists. Rather
 * than fabricate a check against data this codebase doesn't have, this
 * function is honestly scoped to the one trigger it can actually detect,
 * named explicitly in its own return shape (`reason: 'RELATED_PARTY_EMPLOYER'`
 * is the only possible non-null reason today).
 */
export function buildComplianceRouting(relatedPartyEmployer: { detected: boolean; matchedName: string | null }, now: Date): ComplianceRoutingResult {
  if (!relatedPartyEmployer.detected) {
    return { complianceHold: false, reason: null, matchedEntity: null, since: null, slaHours: null, escalationHours: null }
  }
  return {
    complianceHold: true,
    reason: 'RELATED_PARTY_EMPLOYER',
    matchedEntity: relatedPartyEmployer.matchedName,
    since: now.toISOString(),
    slaHours: 72,
    escalationHours: 48,
  }
}
