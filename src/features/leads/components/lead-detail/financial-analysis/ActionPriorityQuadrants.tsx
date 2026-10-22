import { ClipboardList } from 'lucide-react'

import type { FinancialActionPriority, FinancialAnalysisInsights } from '../../../types'
import { FinancialEvidenceLevelBadge } from './FinancialEvidenceLevelBadge'
import { getFinancialAssessmentFindings } from './financialFindings'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

const QUADRANTS: { key: FinancialActionPriority['quadrant']; title: string; accentClassName: string }[] = [
  { key: 'IMMEDIATE_REVIEW', title: 'Immediate review', accentClassName: 'border-[#fb3748]' },
  { key: 'VERIFY', title: 'Verify', accentClassName: 'border-[#335cff]' },
  { key: 'MONITOR', title: 'Monitor', accentClassName: 'border-[#f6b51e]' },
  { key: 'OPTIMIZE', title: 'Optimize', accentClassName: 'border-[#1fc16b]' },
]

/** §11 — the spec's own 4-quadrant grid, each item showing priority/reason/evidence/suggested next step — never a bare suggestion untethered from a real finding. */
export function ActionPriorityQuadrants({ insights }: { insights: FinancialAnalysisInsights | null }) {
  const findings = getFinancialAssessmentFindings(insights)

  if (!findings) {
    return (
      <SectionCard icon={ClipboardList} title="Action / resolution priorities">
        <NotAvailable reason="The action plan is generated alongside the AI financial assessment — not yet available for this statement." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ClipboardList} title="Action / resolution priorities">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {QUADRANTS.map((quadrant) => {
          const items = findings.actionPriorities.filter((p) => p.quadrant === quadrant.key)
          return (
            <div key={quadrant.key} className={`flex flex-col gap-2 rounded-xl border-l-4 bg-[#f7f7f7] p-3 ${quadrant.accentClassName}`}>
              <p className="text-xs font-semibold tracking-[0.22px] text-[#171717] uppercase">{quadrant.title}</p>
              {items.length === 0 ? (
                <p className="text-xs text-[#a3a3a3]">Nothing surfaced in this area.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {items.map((item, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm font-medium text-[#171717]">{item.title}</p>
                        <FinancialEvidenceLevelBadge level={item.evidenceLevel} />
                      </div>
                      <p className="text-xs text-[#5c5c5c]">{item.statement}</p>
                      <p className="text-xs text-[#171717]">
                        <span className="font-medium">Next step: </span>{item.suggestedNextStep}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
