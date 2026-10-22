import type { CreditFinancialAlignmentState, MasterConfidenceLevel, MasterDataQualityBand, ReadinessOutcome, ReconciliationMatchState, ResolutionCapacityLevel } from '../../../types'

/**
 * Master Profile's own accent (`#8e51ff`, violet) plus a leading SQUARE
 * marker — distinct from both Debt Analysis's plain (no-marker) badges and
 * Financial Analysis's `#335cff` leading-DOT badges, so a CCR can tell which
 * module's scale they're reading at a glance even where a hue happens to
 * overlap.
 */
function Pill({ textClassName, bgClassName, label }: { textClassName: string; bgClassName: string; label: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs leading-4 font-medium ${bgClassName} ${textClassName}`}>
      <span className="size-1.5 shrink-0 rounded-sm bg-current" aria-hidden="true" />
      {label}
    </span>
  )
}

/** BBS Master Profile Module v3.0 §12.1's 5-state model. COMPLIANCE_HOLD is deliberately the most visually distinct (never confusable with a routine "stressed" reading), since §12.3 has it supersede every other state. */
const ALIGNMENT_META: Record<CreditFinancialAlignmentState, { label: string; textClassName: string; bgClassName: string }> = {
  ALIGNED_HEALTHY: { label: 'Aligned — Healthy', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  CREDIT_STRONG_FINANCIAL_STRESSED: { label: 'Credit strong / Financial stressed', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  CREDIT_STRESSED_FINANCIAL_STRONG: { label: 'Credit stressed / Financial strong', textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  BOTH_STRESSED: { label: 'Both stressed', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  COMPLIANCE_HOLD: { label: 'Compliance hold', textClassName: 'text-[#7d52f4]', bgClassName: 'bg-[#f4edff]' },
}

const UNCLASSIFIED_ALIGNMENT = { label: 'Insufficient evidence to classify', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' }

/** `null` is a real, honest outcome in v3.0 (evidence too thin to classify) — never forced into one of the 5 named states. */
export function AlignmentStateBadge({ state }: { state: CreditFinancialAlignmentState | null }) {
  if (state === null) return <Pill {...UNCLASSIFIED_ALIGNMENT} />
  return <Pill {...ALIGNMENT_META[state]} />
}

/** v3.0 §16.5's exact 6-band resolution-capacity table. */
const RESOLUTION_META: Record<ResolutionCapacityLevel, { label: string; textClassName: string; bgClassName: string }> = {
  STRONG: { label: 'Strong', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  MODERATE: { label: 'Moderate', textClassName: 'text-[#8e51ff]', bgClassName: 'bg-[#f4edff]' },
  TIGHT: { label: 'Tight', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  MARGINAL: { label: 'Marginal', textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  NONE: { label: 'None', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  UNKNOWN: { label: 'Unknown', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
}

export function ResolutionReadinessBadge({ level }: { level: ResolutionCapacityLevel | null }) {
  return <Pill {...RESOLUTION_META[level ?? 'UNKNOWN']} />
}

const CONFIDENCE_META: Record<MasterConfidenceLevel, { label: string; textClassName: string; bgClassName: string }> = {
  HIGH: { label: 'High confidence', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  MEDIUM: { label: 'Medium confidence', textClassName: 'text-[#8e51ff]', bgClassName: 'bg-[#f4edff]' },
  LOW: { label: 'Low confidence', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
}

export function MasterConfidenceBadge({ level }: { level: MasterConfidenceLevel | null }) {
  return <Pill {...CONFIDENCE_META[level ?? 'LOW']} />
}

/** v3.0 §5.2's 8-state credit<->bank reconciliation match (previously 5 — AMOUNT_MISMATCH/TIMING_MISMATCH/POST_STATEMENT are new). */
const MATCH_META: Record<ReconciliationMatchState, { label: string; textClassName: string }> = {
  MATCHED: { label: 'Matched', textClassName: 'text-[#1fc16b]' },
  PARTIALLY_MATCHED: { label: 'Partially matched', textClassName: 'text-[#f6b51e]' },
  NOT_OBSERVED: { label: 'Not observed', textClassName: 'text-[#fa7319]' },
  UNMATCHED_PAYMENT: { label: 'Unmatched payment', textClassName: 'text-[#fb3748]' },
  AMOUNT_MISMATCH: { label: 'Amount mismatch', textClassName: 'text-[#fb3748]' },
  TIMING_MISMATCH: { label: 'Timing mismatch', textClassName: 'text-[#f6b51e]' },
  POST_STATEMENT: { label: 'Post-statement', textClassName: 'text-[#7d52f4]' },
  UNKNOWN: { label: 'Unknown', textClassName: 'text-[#a3a3a3]' },
}

function isMatchState(value: string): value is ReconciliationMatchState {
  return value in MATCH_META
}

export function ReconciliationMatchLabel({ status }: { status: string }) {
  const meta = MATCH_META[isMatchState(status) ? status : 'UNKNOWN']
  return <span className={`font-medium ${meta.textClassName}`}>{meta.label}</span>
}

/** v3.0 §4.4.1's qualitative Data Quality band — replaces a numeric score entirely. */
const DATA_QUALITY_META: Record<MasterDataQualityBand, { label: string; textClassName: string; bgClassName: string }> = {
  HIGH: { label: 'High', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  MODERATE: { label: 'Moderate', textClassName: 'text-[#8e51ff]', bgClassName: 'bg-[#f4edff]' },
  LOW_MODERATE: { label: 'Low-Moderate', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  LOW: { label: 'Low', textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  INSUFFICIENT: { label: 'Insufficient', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
}

export function DataQualityBandBadge({ band }: { band: MasterDataQualityBand | null }) {
  return <Pill {...DATA_QUALITY_META[band ?? 'INSUFFICIENT']} />
}

/** v3.0 §22.2's readiness-gate outcome. */
const READINESS_OUTCOME_META: Record<ReadinessOutcome, { label: string; textClassName: string; bgClassName: string }> = {
  READY: { label: 'Ready for Cohort Engine', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  CCR_FIRST: { label: 'CCR discovery first', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  COMPLIANCE_HOLD: { label: 'Compliance hold', textClassName: 'text-[#7d52f4]', bgClassName: 'bg-[#f4edff]' },
  SPECIALIST_REVIEW: { label: 'Specialist review', textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  X1_CANDIDATE: { label: 'X1 — Insufficient data', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  REGENERATE: { label: 'Regenerate profile', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
}

export function ReadinessOutcomeBadge({ outcome }: { outcome: ReadinessOutcome | null }) {
  return <Pill {...READINESS_OUTCOME_META[outcome ?? 'REGENERATE']} />
}
