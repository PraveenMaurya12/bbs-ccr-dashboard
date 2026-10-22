import { CheckCircle2, Lightbulb, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { MasterSignalEvidence } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'
import { MasterConfidenceBadge } from './MasterProfileBadges'

function SignalColumn({ icon: Icon, title, items, emptyReason }: { icon: LucideIcon; title: string; items: MasterSignalEvidence[]; emptyReason: string }) {
  return (
    <SectionCard icon={Icon} title={title}>
      {items.length === 0 ? (
        <NotAvailable reason={emptyReason} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.key} className="flex flex-col gap-1 border-b border-[#ebebeb] pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[#171717]">{item.label}</p>
                <MasterConfidenceBadge level={item.confidence} />
              </div>
              <p className="text-xs text-[#5c5c5c]">{item.detail}</p>
              <p className="text-xs text-[#a3a3a3]">{item.sourceModules.map((m) => (m === 'DEBT_ANALYSIS' ? 'Debt Analysis' : 'Financial Analysis')).join(' + ')}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

/** Spec Part 40: three-column evidence-backed strengths/concerns/opportunities. */
export function StrengthsConcernsOpportunities({
  strengths,
  concerns,
  opportunitySignals,
}: {
  strengths: MasterSignalEvidence[] | null
  concerns: MasterSignalEvidence[] | null
  opportunitySignals: MasterSignalEvidence[] | null
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <SignalColumn icon={CheckCircle2} title="Strengths" items={strengths ?? []} emptyReason="No evidence-backed strengths were identified." />
      <SignalColumn icon={TriangleAlert} title="Concerns" items={concerns ?? []} emptyReason="No evidence-backed concerns were identified." />
      <SignalColumn icon={Lightbulb} title="Opportunity signals" items={opportunitySignals ?? []} emptyReason="No opportunity signals were identified." />
    </div>
  )
}
