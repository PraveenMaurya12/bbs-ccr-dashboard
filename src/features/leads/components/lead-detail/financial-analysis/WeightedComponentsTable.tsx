import { ListChecks } from 'lucide-react'

import type { DataAvailability, FinancialHealthScoreRecord } from '../../../types'
import { DataAvailabilityBadge } from './DataAvailabilityBadge'
import { SectionCard } from '../shared/SectionCard'

// Fallback maxPoints for a pre-transparency-feature persisted row (no
// componentDetails yet) — the real, possibly-dynamic max (e.g. Debt
// Servicing Capacity's own F10 sub-signal) comes from componentDetails
// when present and always takes priority over this static fallback.
const COMPONENTS: { key: keyof FinancialHealthScoreRecord; availabilityKey: keyof FinancialHealthScoreRecord; detailsKey: string; label: string; fallbackMax: number }[] = [
  { key: 'incomeStabilityScore', availabilityKey: 'incomeStabilityAvailability', detailsKey: 'incomeStability', label: 'Income Stability', fallbackMax: 15 },
  { key: 'cashFlowStrengthScore', availabilityKey: 'cashFlowStrengthAvailability', detailsKey: 'cashFlowStrength', label: 'Cash Flow Strength', fallbackMax: 15 },
  { key: 'debtServicingCapacityScore', availabilityKey: 'debtServicingCapacityAvailability', detailsKey: 'debtServicing', label: 'Debt Servicing Capacity', fallbackMax: 20 },
  { key: 'liquidityScore', availabilityKey: 'liquidityAvailability', detailsKey: 'liquidity', label: 'Liquidity', fallbackMax: 15 },
  { key: 'expenseBehaviourScore', availabilityKey: 'expenseBehaviourAvailability', detailsKey: 'expenseBehaviour', label: 'Expense Behaviour', fallbackMax: 10 },
  { key: 'borrowingDependencyScore', availabilityKey: 'borrowingDependencyAvailability', detailsKey: 'borrowingDependency', label: 'Borrowing Dependency', fallbackMax: 10 },
  { key: 'creditPaymentBehaviourScore', availabilityKey: 'creditPaymentBehaviourAvailability', detailsKey: 'creditPaymentBehaviour', label: 'Credit Payment Behaviour', fallbackMax: 5 },
  { key: 'transactionBehaviourScore', availabilityKey: 'transactionBehaviourAvailability', detailsKey: 'transactionBehaviour', label: 'Transaction / Account Behaviour', fallbackMax: 5 },
  { key: 'stressSignalsScore', availabilityKey: 'stressSignalsAvailability', detailsKey: 'stressSignals', label: 'Financial Stress Signals', fallbackMax: 5 },
]

/** §09's 9-component weighted breakdown — every row's own score/status/availability, so a partial total (scorePartial) is never mistaken for a precise one. Never converts "not assessable" into a 0. */
export function WeightedComponentsTable({ score }: { score: FinancialHealthScoreRecord }) {
  return (
    <SectionCard icon={ListChecks} title="Score components">
      <div className="flex flex-col gap-3">
        {COMPONENTS.map((component) => {
          const value = score[component.key] as number | null
          const availability = score[component.availabilityKey] as DataAvailability
          const detail = score.componentDetails?.[component.detailsKey]
          const max = detail?.maxPoints ?? component.fallbackMax
          return (
            <div key={component.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 text-sm text-[#171717]">{component.label}</span>
                <div className="flex shrink-0 items-center gap-2">
                  {availability === 'AVAILABLE' ? (
                    <span className="text-sm font-medium text-[#171717]">
                      {value} <span className="text-[#a3a3a3]">/ {max}</span>
                    </span>
                  ) : (
                    <DataAvailabilityBadge availability={availability} />
                  )}
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#f7f7f7]">
                    {value !== null && <div className="h-full rounded-full bg-[#335cff]" style={{ width: `${Math.round((value / max) * 100)}%` }} />}
                  </div>
                </div>
              </div>
              {detail?.reason && <p className="text-xs text-[#a3a3a3]">{detail.reason}</p>}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
