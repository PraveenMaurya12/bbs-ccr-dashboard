import type { BbsPlanActionOwner, BbsPlanActionStatus, BbsPlanConditionState, BbsPlanLifecycleStatus } from '../../../types'

/**
 * Plan Engine's own accent — a leading upward TRIANGLE marker, the 5th
 * distinct per-module visual-distinction convention (Debt: plain, no dot;
 * Financial: `#335cff` circular dot; Master Profile: `#8e51ff` rotated
 * square; Cohort Engine: `#2a8f60` rotated-45 diamond; Plan Engine: a
 * triangle) — so a CCR can tell at a glance which module's badge scale a
 * given pill belongs to, regardless of its semantic color.
 */
function Pill({ textClassName, bgClassName, label }: { textClassName: string; bgClassName: string; label: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs leading-4 font-medium ${bgClassName} ${textClassName}`}>
      <span className="size-0 border-x-[3px] border-b-[5px] border-x-transparent border-b-current" aria-hidden="true" />
      {label}
    </span>
  )
}

const LIFECYCLE_META: Record<BbsPlanLifecycleStatus, { label: string; textClassName: string; bgClassName: string }> = {
  DRAFT: { label: 'Draft', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  CCR_REVIEW: { label: 'CCR review', textClassName: 'text-[#8e51ff]', bgClassName: 'bg-[#f4edff]' },
  SPECIALIST_REVIEW: { label: 'Specialist review', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  CUSTOMER_ACCEPTANCE_PENDING: { label: 'Awaiting customer acceptance', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  EXECUTION_READY: { label: 'Execution ready', textClassName: 'text-[#335cff]', bgClassName: 'bg-[#eef2ff]' },
  ACTIVE: { label: 'Active', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  PAUSED: { label: 'Paused', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  REASSESSMENT_REQUIRED: { label: 'Reassessment required', textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  COMPLETED: { label: 'Completed', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  CANCELLED: { label: 'Cancelled', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
}

export function PlanLifecycleBadge({ status }: { status: BbsPlanLifecycleStatus | null }) {
  if (status === null) return <Pill label="Not set" textClassName="text-[#a3a3a3]" bgClassName="bg-[#f7f7f7]" />
  return <Pill {...LIFECYCLE_META[status]} />
}

const OWNER_META: Record<BbsPlanActionOwner, { label: string; textClassName: string; bgClassName: string }> = {
  CUSTOMER: { label: 'Customer', textClassName: 'text-[#335cff]', bgClassName: 'bg-[#eef2ff]' },
  BBS: { label: 'BBS', textClassName: 'text-[#2a8f60]', bgClassName: 'bg-[#e3f7ec]' },
  CREDITOR: { label: 'Creditor', textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
}

export function PlanActionOwnerBadge({ ownerType }: { ownerType: BbsPlanActionOwner }) {
  return <Pill {...OWNER_META[ownerType]} />
}

const CONDITION_STATE_META: Record<BbsPlanConditionState, { label: string; textClassName: string; bgClassName: string }> = {
  MET: { label: 'Met', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  PENDING: { label: 'Pending', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  FAILED: { label: 'Failed', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  NOT_APPLICABLE: { label: 'Not applicable', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  UNKNOWN: { label: 'Unknown', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
}

export function PlanConditionStateBadge({ state }: { state: BbsPlanConditionState }) {
  return <Pill {...CONDITION_STATE_META[state]} />
}

/** v3.0 §11.2's own 7-value action state machine. */
const ACTION_STATUS_META: Record<BbsPlanActionStatus, { label: string; textClassName: string; bgClassName: string }> = {
  PENDING: { label: 'Pending', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  IN_PROGRESS: { label: 'In progress', textClassName: 'text-[#335cff]', bgClassName: 'bg-[#eef2ff]' },
  COMPLETE: { label: 'Complete', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  BLOCKED: { label: 'Blocked', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  FAILED: { label: 'Failed', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  CANCELLED: { label: 'Cancelled', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  ESCALATED: { label: 'Escalated', textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
}

export function PlanActionStatusBadge({ status }: { status: BbsPlanActionStatus }) {
  return <Pill {...ACTION_STATUS_META[status]} />
}
