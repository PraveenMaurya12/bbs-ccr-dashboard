import type { CohortBlockedReasonCode, CohortEngineConfig } from '../cohort-engine.types'

export type CaseAgingState = 'AGING_15D' | 'AGING_30D' | 'AGING_60D' | 'STALE_90D' | null

export interface CaseAgingResult {
  agingState: CaseAgingState
  ttlDays: number | null
  ttlExpiresAt: Date | null
}

/**
 * v3.0 §14.1/§14.2: how long a BLOCKED case has sat unresolved, and its
 * per-reason-code TTL — both computed on read from `blockedSince` (never a
 * cron job, same discipline as Master Profile's own TTL/compliance aging).
 * `COMPLIANCE_HOLD` has no TTL at all (§14.2's own table: "Wait for
 * compliance" — its own §7.3 aging/escalation model governs instead, see
 * compliance-lifecycle.ts).
 */
export function computeCaseAging(reasonCode: CohortBlockedReasonCode, blockedSince: Date, config: CohortEngineConfig, now: Date = new Date()): CaseAgingResult {
  const elapsedDays = (now.getTime() - blockedSince.getTime()) / (1000 * 60 * 60 * 24)

  let agingState: CaseAgingState = null
  if (elapsedDays >= 90) agingState = 'STALE_90D'
  else if (elapsedDays >= 60) agingState = 'AGING_60D'
  else if (elapsedDays >= 30) agingState = 'AGING_30D'
  else if (elapsedDays >= 15) agingState = 'AGING_15D'

  const ttlDays = ttlDaysForReason(reasonCode, config)
  const ttlExpiresAt = ttlDays !== null ? new Date(blockedSince.getTime() + ttlDays * 24 * 60 * 60 * 1000) : null

  return { agingState, ttlDays, ttlExpiresAt }
}

function ttlDaysForReason(reasonCode: CohortBlockedReasonCode, config: CohortEngineConfig): number | null {
  switch (reasonCode) {
    case 'CONSENT_PENDING':
      return config.ttlConsentPendingDays
    case 'KYC_PENDING':
      return config.ttlKycPendingDays
    case 'COMPLIANCE_HOLD':
      return null
    case 'DATA_REFRESH_REQUIRED':
      return config.ttlDataRefreshRequiredDays
    case 'OTHER_ACCOUNTS_REQUIRED':
      return config.ttlOtherAccountsRequiredDays
    case 'P1_INFORMATION_REQUIRED':
      return config.ttlP1InformationRequiredDays
    case 'MANUAL_REVIEW':
      return config.ttlManualReviewRequiredDays
    case 'SPECIALIST_REQUIRED':
      return config.ttlSpecialistRequiredDays
    case 'CCR_REQUIRED':
      return config.ttlManualReviewRequiredDays
    case 'CUSTOMER_UNRESPONSIVE':
      return null
  }
}
