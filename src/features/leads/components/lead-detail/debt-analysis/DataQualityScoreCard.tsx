import { FileCheck2 } from 'lucide-react'

import type { DataQualityScoreResult } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

const BAND_META: Record<DataQualityScoreResult['band'], { textClassName: string; bgClassName: string }> = {
  'High confidence': { textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  'Moderate confidence': { textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  'Low confidence': { textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  Insufficient: { textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
}

const COMPONENT_LABELS: Record<keyof DataQualityScoreResult['components'], string> = {
  fieldCompleteness: 'Field completeness',
  internalConsistency: 'Internal consistency',
  reportRecency: 'Report recency',
  identityMatchConfidence: 'Identity match confidence',
  accountLevelSufficiency: 'Account-level data sufficiency',
}

/**
 * BBS Debt Analysis Module v3.0, §5.3/§5.4 — this field is optional on the
 * wire (see DebtAnalysisReport's own doc comment): it was added after this
 * module first shipped, so an older response can omit it entirely. Never
 * assume presence.
 */
export function DataQualityScoreCard({ dataQuality }: { dataQuality: DataQualityScoreResult | undefined }) {
  if (!dataQuality) {
    return (
      <SectionCard icon={FileCheck2} title="Data quality">
        <NotAvailable reason="Data quality score unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  const bandMeta = BAND_META[dataQuality.band]

  return (
    <SectionCard icon={FileCheck2} title="Data quality">
      <div className={`flex items-center justify-between rounded-xl border border-transparent p-3 ${bandMeta.bgClassName}`}>
        <p className={`text-lg font-semibold ${bandMeta.textClassName}`}>{dataQuality.total} / 100</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${bandMeta.bgClassName} ${bandMeta.textClassName}`}>{dataQuality.band}</span>
      </div>

      <CardDivider />

      <div className="flex flex-col gap-2">
        {(Object.keys(dataQuality.components) as Array<keyof DataQualityScoreResult['components']>).map((key) => {
          const c = dataQuality.components[key]
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-[#171717]">{COMPONENT_LABELS[key]}</span>
                <span className="shrink-0 font-medium text-[#171717]">
                  {c.score} / {c.weight}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f7f7f7]">
                <div className="h-full rounded-full bg-[#335cff]" style={{ width: `${Math.round((c.score / c.weight) * 100)}%` }} />
              </div>
              <p className="text-xs text-[#a3a3a3]">{c.note}</p>
            </div>
          )
        })}
      </div>

      <CardDivider />

      <MetricRow
        label="Active account count verification"
        value={
          dataQuality.accountCountVerification.match
            ? `PASS — ${dataQuality.accountCountVerification.detailActiveCount} = ${dataQuality.accountCountVerification.summaryActiveCount}`
            : `MISMATCH — ${dataQuality.accountCountVerification.detailActiveCount} ≠ ${dataQuality.accountCountVerification.summaryActiveCount}`
        }
      />
      <p className="text-xs text-[#a3a3a3]">{dataQuality.accountCountVerification.note}</p>

      {dataQuality.flags.length > 0 && (
        <>
          <CardDivider />
          <div>
            <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Data quality flags</p>
            <ul className="flex flex-col gap-1.5">
              {dataQuality.flags.map((flag) => (
                <li key={flag.code} className="text-sm">
                  <span className="rounded-full bg-[#f7f7f7] px-2 py-0.5 text-xs font-medium text-[#5c5c5c]">{flag.code}</span>
                  <span className="ml-2 text-[#171717]">{flag.trigger}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </SectionCard>
  )
}
