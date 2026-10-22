import type { FinancialEvidenceLevel } from '../../../types'

/**
 * Rule 23-equivalent for this module (§10's own evidence model):
 * CONFIRMED/DERIVED/INFERRED — distinct meaning from, but structurally
 * parallel to, the Debt module's KNOWN/INDICATED/UNKNOWN. Uses the shared
 * `#335cff` accent for DERIVED (the one consistent visual cue that
 * distinguishes this module's badges from Debt's, alongside the leading dot).
 */
const META: Record<FinancialEvidenceLevel, { label: string; textClassName: string; bgClassName: string }> = {
  CONFIRMED: { label: 'Confirmed', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  DERIVED: { label: 'Derived', textClassName: 'text-[#335cff]', bgClassName: 'bg-[#eef2ff]' },
  INFERRED: { label: 'Inferred', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
}

export function FinancialEvidenceLevelBadge({ level }: { level: FinancialEvidenceLevel }) {
  const meta = META[level]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-4 font-medium ${meta.bgClassName} ${meta.textClassName}`}>
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {meta.label}
    </span>
  )
}
