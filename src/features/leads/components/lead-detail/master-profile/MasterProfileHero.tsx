import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { MasterProfileReport } from '../../../types'
import { AlignmentStateBadge, DataQualityBandBadge } from './MasterProfileBadges'

/**
 * Spec Part 31: the hero area — status, data sources, and the primary
 * CREDIT ↔ FINANCIAL ALIGNMENT synthesis. Deliberately never rendered as a
 * risk score (the spec's own explicit instruction) — only the descriptive
 * alignment state plus a plain-language explanation.
 */
export function MasterProfileHero({
  profile,
  leadName,
  onRegenerate,
  regenerating,
}: {
  profile: MasterProfileReport
  leadName: string
  onRegenerate: () => void
  regenerating: boolean
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-7 shrink-0 text-[#8e51ff]" aria-hidden="true" />
          <div>
            <p className="text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">BBS Master Profile</p>
            <h2 className="text-lg font-medium tracking-[-0.27px] text-[#171717]">{leadName}</h2>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 text-xs text-[#5c5c5c]">
            <CheckCircle2 className="size-3.5 text-[#1fc16b]" aria-hidden="true" />
            Profile v{profile.version} · {profile.generatedAt ? new Date(profile.generatedAt).toLocaleString() : 'Not generated'}
          </div>
          <Button size="sm" variant="outline" disabled={regenerating} onClick={onRegenerate}>
            <RefreshCw className={`mr-1.5 size-3.5 ${regenerating ? 'animate-spin' : ''}`} aria-hidden="true" />
            {regenerating ? 'Regenerating…' : 'Regenerate profile'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#5c5c5c]">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="size-3.5 text-[#1fc16b]" aria-hidden="true" />
          Credit report{profile.l1DataAsOf ? ` as of ${new Date(profile.l1DataAsOf).toLocaleDateString()}` : ''}
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="size-3.5 text-[#1fc16b]" aria-hidden="true" />
          Bank statement{profile.l2DataAsOf ? ` as of ${new Date(profile.l2DataAsOf).toLocaleDateString()}` : ''}
        </span>
        {profile.dataQuality && (
          <span className="inline-flex items-center gap-1.5">
            Data quality <DataQualityBandBadge band={profile.dataQuality.band} />
          </span>
        )}
      </div>

      {profile.isStale && (
        <div className="rounded-lg bg-[#fffaeb] px-3 py-2 text-xs text-[#f6b51e]">
          Source data has changed since this profile was generated — regenerate to reflect the latest Debt/Financial Analysis.
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Credit ↔ Financial alignment</p>
        <AlignmentStateBadge state={profile.alignmentState} />
      </div>
    </div>
  )
}
