import { Gauge } from 'lucide-react'

import type { BbsPlanReport } from '../../../types'
import { CardDivider, MetricRow, SectionCard } from '../shared/SectionCard'

function field(value: Record<string, unknown> | null, key: string): string {
  const v = value?.[key]
  if (v === null || v === undefined) return 'N/A'
  return typeof v === 'number' ? v.toLocaleString('en-IN') : String(v)
}

/**
 * Financial & Debt Target Model — explicitly the SAME model Cohort Engine
 * itself already computed, reused verbatim here (never recalculated by
 * the Plan Engine).
 */
export function FinancialCapacityAndTargetsPanel({ plan }: { plan: BbsPlanReport }) {
  return (
    <SectionCard icon={Gauge} title="Financial capacity & targets">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricRow label="Capacity band" value={field(plan.financialCapacity, 'capacityBand')} />
        <MetricRow label="Capacity ratio" value={field(plan.financialCapacity, 'capacityRatio')} />
        <MetricRow label="Sustainable cash flow" value={field(plan.financialCapacity, 'sustainableCashFlow')} />
        <MetricRow label="Stabilisation coverage" value={field(plan.financialCapacity, 'stabilisationCoverage')} />
        <MetricRow label="Bureau DSR %" value={field(plan.financialCapacity, 'bureauDsrPercent')} />
        <MetricRow label="Bank DSR %" value={field(plan.financialCapacity, 'bankDsrPercent')} />
      </div>
      <CardDivider />
      <div>
        <p className="mb-1 text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Debt strategy</p>
        <p className="text-sm leading-6 text-[#171717]">{typeof plan.debtStrategy?.narrative === 'string' ? plan.debtStrategy.narrative : 'N/A'}</p>
      </div>
      <MetricRow label="Debt complexity" value={field(plan.debtTargets, 'currentDebtComplexityBand')} />
    </SectionCard>
  )
}
