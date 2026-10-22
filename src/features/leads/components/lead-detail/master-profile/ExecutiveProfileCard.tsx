import { Sparkles } from 'lucide-react'

import type { MasterDimensionName, MasterConfidenceLevel, MasterProfileReport } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'
import { DataQualityBandBadge, MasterConfidenceBadge, ResolutionReadinessBadge } from './MasterProfileBadges'

const DIMENSION_LABELS: Record<MasterDimensionName, string> = {
  IDENTITY_COMPLIANCE: 'Identity & compliance',
  CREDIT_HEALTH: 'Credit health',
  INCOME_CASH_FLOW: 'Income & cash flow',
  DEBT_LIQUIDITY: 'Debt & liquidity',
  ALIGNMENT_CAPACITY: 'Alignment & capacity',
}

/**
 * Spec Part 32 / v3.0 §4.2: the Executive Profile panel — a 2-4 sentence
 * AI-generated synthesis, Data Quality band, overall confidence, resolution
 * capacity, and (replacing a single "overall confidence" as the headline
 * caveat) the dimensions that fell below HIGH confidence, surfaced as key
 * limitations. The AI's own `executiveProfile` field is rendered verbatim,
 * never rephrased/hardcoded here.
 */
export function ExecutiveProfileCard({ profile }: { profile: MasterProfileReport }) {
  const insights = profile.insights
  const findings = insights?.status === 'COMPLETED' ? insights.findings : undefined
  const limitedDimensions = profile.dimensionConfidences
    ? (Object.entries(profile.dimensionConfidences) as Array<[MasterDimensionName, MasterConfidenceLevel]>).filter(([, level]) => level !== 'HIGH')
    : []

  return (
    <SectionCard icon={Sparkles} title="Executive profile">
      <div className="flex flex-wrap items-center gap-2">
        <MasterConfidenceBadge level={profile.overallConfidence} />
        <ResolutionReadinessBadge level={profile.resolutionCapacity} />
        {profile.dataQuality && <DataQualityBandBadge band={profile.dataQuality.band} />}
      </div>
      <CardDivider />
      {insights === null && <NotAvailable reason="AI synthesis has not run for this profile yet." />}
      {insights && insights.status !== 'COMPLETED' && <NotAvailable reason={`AI synthesis is ${insights.status.toLowerCase()}.`} />}
      {findings && <p className="text-sm leading-6 text-[#171717]">{findings.executiveProfile}</p>}
      {limitedDimensions.length > 0 && (
        <>
          <CardDivider />
          <div className="flex flex-col gap-1">
            <p className="text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Key limitations</p>
            <ul className="flex flex-col gap-1">
              {limitedDimensions.map(([dimension, level]) => (
                <li key={dimension} className="flex items-center justify-between gap-2 text-xs text-[#5c5c5c]">
                  <span>{DIMENSION_LABELS[dimension]}</span>
                  <span className="font-medium text-[#8e51ff]">{level === 'MEDIUM' ? 'Medium confidence' : 'Low confidence'}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </SectionCard>
  )
}
