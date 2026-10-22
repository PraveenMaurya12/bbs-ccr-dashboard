import type { DataAvailability } from '../../../types'

/**
 * Every major metric in this module needs an availability tag (spec's own
 * "Data Quality / Confidence" requirement). Rendered as a plain small tag
 * (no filled pill) so it never competes visually with SeverityBadge/
 * FinancialEvidenceLevelBadge on dense metric grids — AVAILABLE shows
 * nothing at all (the quiet default); the others name why a figure is
 * missing rather than leaving a blank gap or a fabricated 0.
 */
const LABELS: Record<Exclude<DataAvailability, 'AVAILABLE'>, string> = {
  NOT_REPORTED: 'Not reported',
  NOT_APPLICABLE: 'Not applicable',
  INSUFFICIENT_DATA: 'Insufficient data',
}

export function DataAvailabilityBadge({ availability }: { availability: DataAvailability }) {
  if (availability === 'AVAILABLE') return null
  const textClassName = availability === 'INSUFFICIENT_DATA' ? 'text-[#f6b51e]' : 'text-[#a3a3a3]'
  return <span className={`text-xs ${textClassName}`}>{LABELS[availability]}</span>
}
