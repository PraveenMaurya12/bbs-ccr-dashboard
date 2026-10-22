import type { FinancialAiSeverity, FinancialFlagSeverity } from '../../../types'

/**
 * The 5-tier Positive/Informational/Attention/Elevated/Critical scale —
 * shared by both the deterministic risk flags (FinancialFlagSeverity,
 * UPPERCASE) and the AI findings (FinancialAiSeverity, Title-Case), hence
 * accepting either casing. Uses the same red/orange/yellow/green hues as
 * the Debt module's ThresholdBadge/EvidenceLevelBadge for consistent
 * semantic meaning app-wide, but adds `#335cff` for "Informational" (a
 * tier Debt's 3-tier scale has no equivalent for) plus a leading dot — the
 * one consistent visual cue that distinguishes this module's badges from
 * Debt's at a glance, even where the hues overlap.
 */
type SeverityKey = 'POSITIVE' | 'INFORMATIONAL' | 'ATTENTION' | 'ELEVATED' | 'CRITICAL'

const META: Record<SeverityKey, { label: string; textClassName: string; bgClassName: string }> = {
  POSITIVE: { label: 'Positive', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  INFORMATIONAL: { label: 'Informational', textClassName: 'text-[#335cff]', bgClassName: 'bg-[#eef2ff]' },
  ATTENTION: { label: 'Attention', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  ELEVATED: { label: 'Elevated', textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  CRITICAL: { label: 'Critical', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
}

function isSeverityKey(value: string): value is SeverityKey {
  return value in META
}

export function SeverityBadge({ severity }: { severity: FinancialFlagSeverity | FinancialAiSeverity }) {
  const upper = severity.toUpperCase()
  const meta = META[isSeverityKey(upper) ? upper : 'INFORMATIONAL']
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-4 font-medium ${meta.bgClassName} ${meta.textClassName}`}>
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {meta.label}
    </span>
  )
}
