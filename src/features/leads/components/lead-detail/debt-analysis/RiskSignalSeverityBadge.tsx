import type { RiskSignalSeverity } from '../../../types'

/**
 * BBS Debt Analysis Module v3.0, §3.2/§12.1's 7-value severity vocabulary
 * (Positive/Informational/Attention/Elevated/High/Critical/Data quality) —
 * distinct from Debt's own existing 3-tier High/Medium/Low scale
 * (DEBT_RISK_SEVERITY_META, used by the older riskFlags()-backed
 * RiskIndicatorsCard) and from Financial Analysis's 5-tier scale. Kept as
 * its own badge rather than reusing either, since this is a different,
 * spec-defined vocabulary with its own two extra tiers (High, Data
 * quality) neither existing scale has.
 */
const META: Record<RiskSignalSeverity, { textClassName: string; bgClassName: string }> = {
  Positive: { textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  Informational: { textClassName: 'text-[#335cff]', bgClassName: 'bg-[#eef2ff]' },
  Attention: { textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  Elevated: { textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  High: { textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  Critical: { textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  'Data quality': { textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
}

export function RiskSignalSeverityBadge({ severity }: { severity: RiskSignalSeverity }) {
  const meta = META[severity]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-4 font-medium ${meta.bgClassName} ${meta.textClassName}`}>
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {severity}
    </span>
  )
}
