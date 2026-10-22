import { CheckCircle2, Target, TriangleAlert } from 'lucide-react'

import type { MasterProfileReport } from '../../../types'
import { CardDivider, SectionCard } from '../shared/SectionCard'
import { ResolutionReadinessBadge } from './MasterProfileBadges'

/**
 * Spec Part 20/44: an operational resolution-readiness assessment —
 * explicitly NOT a loan-approval decision. Supporting factors are the
 * backend's own stress-level/DSR-availability sentences, rendered verbatim.
 */
export function ResolutionReadinessPanel({ profile }: { profile: MasterProfileReport }) {
  const factors = profile.stressProfile ? [`Master Stress Profile: ${profile.stressProfile.level}`] : []
  if (profile.masterDsrPercent !== null) factors.push(`Master DSR: ${profile.masterDsrPercent}%`)

  return (
    <SectionCard icon={Target} title="Resolution readiness">
      <div className="flex items-center justify-between gap-2">
        <ResolutionReadinessBadge level={profile.resolutionCapacity} />
      </div>
      <CardDivider />
      <ul className="flex flex-col gap-2">
        {factors.map((factor, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[#171717]">
            {profile.resolutionCapacity === 'STRONG' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1fc16b]" aria-hidden="true" />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#8e51ff]" aria-hidden="true" />
            )}
            {factor}
          </li>
        ))}
      </ul>
      <p className="text-xs text-[#a3a3a3]">This is an operational assessment to guide resolution planning — not a loan-approval decision.</p>
    </SectionCard>
  )
}
