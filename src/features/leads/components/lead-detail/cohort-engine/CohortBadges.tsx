import type { CohortCaseAgingState, CohortComplianceAgingState, CohortConfidenceLevel, CohortLifecycleState, CohortPlanEligibility, CohortPrimaryState } from '../../../types'

/**
 * Cohort Engine's own accent (`#2a8f60`, a deep green distinct from Debt's
 * plain badges, Financial's `#335cff` dot, and Master Profile's `#8e51ff`
 * square) plus a leading DIAMOND marker — the 4th distinct per-module
 * visual-distinction convention established across this dashboard.
 */
function Pill({ textClassName, bgClassName, label }: { textClassName: string; bgClassName: string; label: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs leading-4 font-medium ${bgClassName} ${textClassName}`}>
      <span className="size-1.5 shrink-0 rotate-45 bg-current" aria-hidden="true" />
      {label}
    </span>
  )
}

const COHORT_META: Record<CohortPrimaryState, { label: string; textClassName: string; bgClassName: string }> = {
  CONSENT_PENDING: { label: 'Consent pending', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  KYC_PENDING: { label: 'KYC pending', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  X1: { label: 'X1 — Insufficient data', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  C6: { label: 'C6 — Specialist review', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  C5: { label: 'C5 — Debt-cycle intervention', textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  C4: { label: 'C4 — Resolution candidate', textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  C3: { label: 'C3 — Restructure candidate', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  C2: { label: 'C2 — Consolidation candidate', textClassName: 'text-[#2a8f60]', bgClassName: 'bg-[#e3f7ec]' },
  C1: { label: 'C1 — Stabilisation ready', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  C7: { label: 'C7 — Recovery / credit rebuild', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  X2: { label: 'X2 — Outside current program', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  MANUAL_REVIEW: { label: 'Manual review', textClassName: 'text-[#8e51ff]', bgClassName: 'bg-[#f4edff]' },
  CUSTOMER_UNRESPONSIVE: { label: 'Customer unresponsive', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  // v3.0 §4.2's unified BLOCKED reason codes — violet-accented (distinct
  // from both the red "hard adverse" and amber "needs attention" shades
  // used elsewhere) since a BLOCKED case is "paused pending input," not a
  // negative outcome.
  COMPLIANCE_HOLD: { label: 'Blocked — compliance hold', textClassName: 'text-[#7d52f4]', bgClassName: 'bg-[#f4edff]' },
  DATA_REFRESH_REQUIRED: { label: 'Blocked — data refresh required', textClassName: 'text-[#7d52f4]', bgClassName: 'bg-[#f4edff]' },
  OTHER_ACCOUNTS_REQUIRED: { label: 'Blocked — other accounts required', textClassName: 'text-[#7d52f4]', bgClassName: 'bg-[#f4edff]' },
  P1_INFORMATION_REQUIRED: { label: 'Blocked — P1 information required', textClassName: 'text-[#7d52f4]', bgClassName: 'bg-[#f4edff]' },
  SPECIALIST_REQUIRED: { label: 'Blocked — specialist required', textClassName: 'text-[#7d52f4]', bgClassName: 'bg-[#f4edff]' },
  CCR_REQUIRED: { label: 'Blocked — CCR review required', textClassName: 'text-[#7d52f4]', bgClassName: 'bg-[#f4edff]' },
}

export function CohortPrimaryBadge({ cohort }: { cohort: CohortPrimaryState | null }) {
  if (cohort === null) return <Pill label="Not yet assessed" textClassName="text-[#a3a3a3]" bgClassName="bg-[#f7f7f7]" />
  return <Pill {...COHORT_META[cohort]} />
}

const LIFECYCLE_META: Record<CohortLifecycleState, { label: string; textClassName: string; bgClassName: string }> = {
  CCR_REVIEW: { label: 'CCR review', textClassName: 'text-[#8e51ff]', bgClassName: 'bg-[#f4edff]' },
  CUSTOMER_ACCEPTANCE_PENDING: { label: 'Customer acceptance pending', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  EXECUTION_READY: { label: 'Execution ready', textClassName: 'text-[#2a8f60]', bgClassName: 'bg-[#e3f7ec]' },
  ACTIVE: { label: 'Active', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  COMPLETED: { label: 'Completed', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  CANCELLED: { label: 'Cancelled', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  CUSTOMER_DECLINED: { label: 'Customer declined', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  STALE_90D: { label: 'Stale (90+ days)', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
}

export function LifecycleStateBadge({ state }: { state: CohortLifecycleState | null }) {
  if (state === null) return <Pill label="Not applicable" textClassName="text-[#a3a3a3]" bgClassName="bg-[#f7f7f7]" />
  return <Pill {...LIFECYCLE_META[state]} />
}

const COMPLIANCE_AGING_META: Record<CohortComplianceAgingState, { label: string; textClassName: string; bgClassName: string }> = {
  COMPLIANCE_HOLD: { label: 'Within SLA', textClassName: 'text-[#2a8f60]', bgClassName: 'bg-[#e3f7ec]' },
  COMPLIANCE_AGING: { label: 'Aging (2/3 SLA elapsed)', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  COMPLIANCE_ESCALATED: { label: 'Escalated (SLA breached)', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  COMPLIANCE_CLEARED: { label: 'Cleared', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  COMPLIANCE_DECLINED: { label: 'Declined', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
}

export function ComplianceAgingBadge({ state }: { state: CohortComplianceAgingState | null }) {
  if (state === null) return null
  return <Pill {...COMPLIANCE_AGING_META[state]} />
}

const CASE_AGING_META: Record<CohortCaseAgingState, { label: string; textClassName: string; bgClassName: string }> = {
  AGING_15D: { label: 'Blocked 15+ days', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  AGING_30D: { label: 'Blocked 30+ days', textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  AGING_60D: { label: 'Blocked 60+ days', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  STALE_90D: { label: 'Stale — 90+ days blocked', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
}

export function CaseAgingBadge({ state }: { state: CohortCaseAgingState | null }) {
  if (state === null) return null
  return <Pill {...CASE_AGING_META[state]} />
}

const ELIGIBILITY_META: Record<CohortPlanEligibility, { label: string; textClassName: string; bgClassName: string }> = {
  DRAFT: { label: 'Draft', textClassName: 'text-[#2a8f60]', bgClassName: 'bg-[#e3f7ec]' },
  CCR_REVIEW: { label: 'CCR review', textClassName: 'text-[#8e51ff]', bgClassName: 'bg-[#f4edff]' },
  SPECIALIST: { label: 'Specialist', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  INSUFFICIENT_DATA: { label: 'Insufficient data', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  OUT_OF_SCOPE: { label: 'Out of scope', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
}

export function PlanEligibilityBadge({ eligibility }: { eligibility: CohortPlanEligibility | null }) {
  return <Pill {...ELIGIBILITY_META[eligibility ?? 'INSUFFICIENT_DATA']} />
}

const CONFIDENCE_META: Record<CohortConfidenceLevel, { label: string; textClassName: string; bgClassName: string }> = {
  HIGH: { label: 'High confidence', textClassName: 'text-[#2a8f60]', bgClassName: 'bg-[#e3f7ec]' },
  MEDIUM: { label: 'Medium confidence', textClassName: 'text-[#8e51ff]', bgClassName: 'bg-[#f4edff]' },
  LOW: { label: 'Low confidence', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
}

export function CohortConfidenceBadge({ level }: { level: CohortConfidenceLevel | null }) {
  return <Pill {...CONFIDENCE_META[level ?? 'LOW']} />
}
