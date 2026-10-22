import { FileCheck2 } from 'lucide-react'

import type { FinancialDataQualityScore } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

const BAND_META: Record<FinancialDataQualityScore['band'], { textClassName: string; bgClassName: string }> = {
  Excellent: { textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  Good: { textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  Moderate: { textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  Limited: { textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  Poor: { textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
}

const COMPONENT_LABELS: Record<keyof FinancialDataQualityScore['components'], string> = {
  statementCompleteness: 'Statement completeness',
  reconciliationStatus: 'Reconciliation status',
  classificationConfidence: 'Classification confidence',
  statementHeaderCompleteness: 'Statement header completeness',
  otherAccountDetection: 'Other-account detection',
}

/**
 * v4.0 spec §"Data Quality & Confidence" — the 5-component formula (25/15/
 * 35/15/10) plus the cap system (`Final = min(raw, ...applicable caps)`).
 * `dataQuality` is optional on the wire (same reason as every other field
 * added this phase — see FinancialHealthScoreRecord's own doc comment).
 */
export function DataQualityScoreCard({ dataQuality }: { dataQuality: FinancialDataQualityScore | undefined }) {
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
        <p className={`text-lg font-semibold ${bandMeta.textClassName}`}>{dataQuality.finalScore} / 100</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${bandMeta.bgClassName} ${bandMeta.textClassName}`}>{dataQuality.band}</span>
      </div>

      <CardDivider />

      <div className="flex flex-col gap-2">
        {(Object.keys(dataQuality.components) as Array<keyof FinancialDataQualityScore['components']>).map((key) => {
          const c = dataQuality.components[key]
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-[#171717]">{COMPONENT_LABELS[key]}</span>
                <span className="shrink-0 font-medium text-[#171717]">
                  {c.score} / {c.maxPoints}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f7f7f7]">
                <div className="h-full rounded-full bg-[#335cff]" style={{ width: `${Math.round((c.score / c.maxPoints) * 100)}%` }} />
              </div>
              <p className="text-xs text-[#a3a3a3]">{c.detail}</p>
            </div>
          )
        })}
      </div>

      {dataQuality.appliedCaps.length > 0 && (
        <>
          <CardDivider />
          <div>
            <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">
              Applied caps (raw {dataQuality.rawScore} → final {dataQuality.finalScore})
            </p>
            <ul className="flex flex-col gap-1.5">
              {dataQuality.appliedCaps.map((cap, i) => (
                <li key={i} className="text-sm">
                  <span className="rounded-full bg-[#f7f7f7] px-2 py-0.5 text-xs font-medium text-[#5c5c5c]">cap {cap.capPoints}</span>
                  <span className="ml-2 text-[#171717]">{cap.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </SectionCard>
  )
}
