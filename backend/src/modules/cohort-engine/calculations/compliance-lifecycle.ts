import type { CohortComplianceAgingState, CohortEngineConfig } from '../cohort-engine.types'

/**
 * BBS Cohort Engine Module v3.0 §7.2: SLA hours by trigger-type — a
 * related-party match gets the longest clock, a regulatory (PEP/sanctions/
 * fraud) match the shortest, legal status the longest of all. Matches
 * Master Profile's own `complianceRouting.slaHours` when it already set
 * one (reusing it verbatim rather than re-deriving a different number) —
 * this function only supplies a fallback when Master Profile's own value
 * is absent (e.g. a legacy pre-v3.0 Master Profile row).
 */
export function slaHoursForReason(reason: string | null, config: CohortEngineConfig): number {
  if (reason === 'PEP_MATCH' || reason === 'SANCTIONS_MATCH' || reason === 'FRAUD_INDICATOR' || reason === 'REGULATORY_FLAG') return config.complianceSlaRegulatoryHours
  if (reason === 'LEGAL_STATUS_ACTIVE') return config.complianceSlaLegalHours
  return config.complianceSlaRelatedPartyHours
}

export interface ComplianceAgingResult {
  agingState: CohortComplianceAgingState
  escalationAt: Date
}

/**
 * §7.3's compliance aging state machine, computed on read from
 * `holdSince`/`slaHours` — never a cron job, same "no scheduler exists in
 * this codebase" discipline already established for Master Profile's own
 * TTL/expiry. Escalation fires at 2/3 of the SLA; past the full SLA, the
 * hold is ESCALATED. `COMPLIANCE_CLEARED`/`COMPLIANCE_DECLINED` are never
 * computed here — those are explicit, CCR-driven transitions recorded
 * directly on the decision (see cohort-engine.service.ts's own
 * `clearCompliance()`/`declineCompliance()`).
 */
export function computeComplianceAging(holdSince: Date, slaHours: number, now: Date = new Date()): ComplianceAgingResult {
  const elapsedHours = (now.getTime() - holdSince.getTime()) / (1000 * 60 * 60)
  const escalationAt = new Date(holdSince.getTime() + (slaHours * 2 * 60 * 60 * 1000) / 3)
  const agingState: CohortComplianceAgingState = elapsedHours >= slaHours ? 'COMPLIANCE_ESCALATED' : elapsedHours >= (slaHours * 2) / 3 ? 'COMPLIANCE_AGING' : 'COMPLIANCE_HOLD'
  return { agingState, escalationAt }
}
