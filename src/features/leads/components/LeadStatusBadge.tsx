import { STATUS_META } from '../utils/leadDisplay'
import type { LeadFunnelStatus } from '../types'

/** 'sm' (default) matches the Leads table's compact rows; 'md' matches the Lead Detail header's Figma spec (14px text). */
export function LeadStatusBadge({ status, size = 'sm' }: { status: LeadFunnelStatus; size?: 'sm' | 'md' }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md py-1 pr-2 pl-1 font-medium tracking-[-0.084px] ${size === 'md' ? 'text-sm' : 'text-xs'} ${meta.bgClassName} ${meta.textClassName}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {meta.label}
    </span>
  )
}
