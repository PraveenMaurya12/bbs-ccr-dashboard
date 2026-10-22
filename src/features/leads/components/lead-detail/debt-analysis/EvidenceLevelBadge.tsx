import type { DebtEvidenceLevel } from '../../../types'

/**
 * Rule 23 (Root Cause Analysis) requires every AI finding to separate
 * Known/Indicated/Unknown — this badge is the one place that distinction is
 * rendered, so it is never silently dropped or flattened into plain text.
 */
const META: Record<DebtEvidenceLevel, { label: string; textClassName: string; bgClassName: string }> = {
  KNOWN: { label: 'Known', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  INDICATED: { label: 'Indicated', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  UNKNOWN: { label: 'Unknown', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
}

export function EvidenceLevelBadge({ level }: { level: DebtEvidenceLevel }) {
  const meta = META[level]
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs leading-4 font-medium ${meta.bgClassName} ${meta.textClassName}`}>
      {meta.label}
    </span>
  )
}
