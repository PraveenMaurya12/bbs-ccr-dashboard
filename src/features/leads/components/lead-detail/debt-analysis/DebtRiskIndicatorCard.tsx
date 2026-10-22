import { Gauge } from 'lucide-react'

import type { DebtRiskIndicatorResult } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

const BAND_META: Record<DebtRiskIndicatorResult['band'], { textClassName: string; bgClassName: string; barClassName: string }> = {
  Positive: { textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]', barClassName: 'bg-[#1fc16b]' },
  Attention: { textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]', barClassName: 'bg-[#f6b51e]' },
  Elevated: { textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]', barClassName: 'bg-[#fa7319]' },
  High: { textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]', barClassName: 'bg-[#fb3748]' },
  Critical: { textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]', barClassName: 'bg-[#fb3748]' },
}

const COMPONENT_LABELS: Record<keyof DebtRiskIndicatorResult['components'], string> = {
  currentDelinquency: 'Current delinquency',
  adverseAccountStatus: 'Adverse account status',
  debtBurdenConcentration: 'Debt burden / concentration',
  cardUtilisation: 'Credit-card utilisation',
  recentBorrowing: 'Recent borrowing',
  enquiryBehaviour: 'Enquiry behaviour',
  historicalRepayment: 'Historical repayment behaviour',
  dataInconsistencies: 'Data / profile inconsistencies',
}

const BANDS: Array<{ label: DebtRiskIndicatorResult['band']; range: string }> = [
  { label: 'Positive', range: '0–20' },
  { label: 'Attention', range: '21–40' },
  { label: 'Elevated', range: '41–60' },
  { label: 'High', range: '61–80' },
  { label: 'Critical', range: '81–100' },
]

/**
 * BBS Debt Analysis Module v3.0, §13 — optional on the wire for the same
 * reason as ScoreStructureDivergenceCard: added after this module first
 * shipped, so an older response can omit it entirely.
 */
export function DebtRiskIndicatorCard({ indicator }: { indicator: DebtRiskIndicatorResult | undefined }) {
  if (!indicator) {
    return (
      <SectionCard icon={Gauge} title="BBS Debt Risk Indicator">
        <NotAvailable reason="Debt Risk Indicator unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={Gauge} title="BBS Debt Risk Indicator">
      <div className="flex flex-wrap items-center gap-2">
        {BANDS.map((b) => {
          const isCurrent = b.label === indicator.band
          const meta = BAND_META[b.label]
          return (
            <div
              key={b.label}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 ${isCurrent ? meta.bgClassName : 'bg-[#f7f7f7]'}`}
            >
              <span className={`text-xs font-semibold ${isCurrent ? meta.textClassName : 'text-[#a3a3a3]'}`}>{b.label}</span>
              <span className="text-[10px] text-[#a3a3a3]">{b.range}</span>
            </div>
          )
        })}
      </div>
      <p className={`text-center text-lg font-semibold ${BAND_META[indicator.band].textClassName}`}>{indicator.total} / 100</p>

      <div className="flex flex-col gap-2">
        {(Object.keys(indicator.components) as Array<keyof DebtRiskIndicatorResult['components']>).map((key) => {
          const c = indicator.components[key]
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-[#171717]">{COMPONENT_LABELS[key]}</span>
                <span className="shrink-0 font-medium text-[#171717]">
                  {c.score} / {c.weight}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f7f7f7]">
                <div className={`h-full rounded-full ${BAND_META[indicator.band].barClassName}`} style={{ width: `${Math.round((c.score / c.weight) * 100)}%` }} />
              </div>
              <p className="text-xs text-[#a3a3a3]">{c.evidence}</p>
            </div>
          )
        })}
      </div>

      <p className="rounded-lg bg-[#f7f7f7] px-3 py-2 text-xs text-[#a3a3a3]">
        What this indicator is NOT: not a credit score, not a lending decision, not a settlement recommendation, not a cohort
        assignment, and not a substitute for L2 (bank statement analysis), L3 (Master Profile) or CCR validation.
      </p>
    </SectionCard>
  )
}
