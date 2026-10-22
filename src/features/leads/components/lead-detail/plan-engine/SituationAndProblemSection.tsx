import { FileText, HelpCircle } from 'lucide-react'

import type { BbsPlanReport } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

function narrativeOf(value: Record<string, unknown> | null): string | null {
  const narrative = value?.narrative
  return typeof narrative === 'string' ? narrative : null
}

/** Situation Assessment + Problem Definition — the first two of the 14 Plan Layers, both deterministic/template-governed, never AI. */
export function SituationAssessmentSection({ plan }: { plan: BbsPlanReport }) {
  const narrative = narrativeOf(plan.situationAssessment)
  return (
    <SectionCard icon={FileText} title="Situation assessment">
      {narrative ? <p className="text-sm leading-6 text-[#171717]">{narrative}</p> : <NotAvailable reason="No situation assessment is available for this plan." />}
    </SectionCard>
  )
}

export function ProblemDefinitionSection({ plan }: { plan: BbsPlanReport }) {
  const narrative = narrativeOf(plan.problemDefinition)
  return (
    <SectionCard icon={HelpCircle} title="Problem definition">
      {narrative ? <p className="text-sm leading-6 text-[#171717]">{narrative}</p> : <NotAvailable reason="No problem definition is available for this plan." />}
      {plan.customerExplanation && (
        <>
          <div className="h-px w-full shrink-0 bg-[#ebebeb]" />
          <div>
            <p className="mb-1 text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Customer-safe explanation</p>
            <p className="text-sm leading-6 text-[#171717]">{plan.customerExplanation}</p>
          </div>
        </>
      )}
    </SectionCard>
  )
}
