import { ClipboardList } from 'lucide-react'

import type { DebtAnalysisInsights } from '../../../types'
import { getDebtDiagnosisFindings } from './aiFindings'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * Layer 6 — BBS Action Plan: the spec's own 4-quadrant table (Verify /
 * Immediate attention / Monitor / Optimize) — Trajectory is rendered
 * separately by DebtDiagnosisPanel's `debtTrajectory` field, per Rule 29's
 * instruction to always keep Debt Trajectory separate from the rest.
 */
function Quadrant({ title, items, accentClassName }: { title: string; items: string[]; accentClassName: string }) {
  return (
    <div className={`flex flex-col gap-2 rounded-xl border-l-4 bg-[#f7f7f7] p-3 ${accentClassName}`}>
      <p className="text-xs font-semibold tracking-[0.22px] text-[#171717] uppercase">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-[#a3a3a3]">Nothing surfaced in this area.</p>
      ) : (
        <ul className="list-inside list-disc space-y-1 text-sm text-[#171717]">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function BBSActionPlanPanel({ insights }: { insights: DebtAnalysisInsights | null }) {
  const findings = getDebtDiagnosisFindings(insights)

  if (!findings) {
    return (
      <SectionCard icon={ClipboardList} title="BBS action plan">
        <NotAvailable reason="The action plan is generated alongside the AI debt diagnosis — not yet available for this report." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ClipboardList} title="BBS action plan">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Quadrant title="Verify" items={findings.actionPlan.verify} accentClassName="border-[#335cff]" />
        <Quadrant title="Immediate attention" items={findings.actionPlan.immediateAttention} accentClassName="border-[#fb3748]" />
        <Quadrant title="Monitor" items={findings.actionPlan.monitor} accentClassName="border-[#f6b51e]" />
        <Quadrant title="Optimize" items={findings.actionPlan.optimize} accentClassName="border-[#1fc16b]" />
      </div>
    </SectionCard>
  )
}
