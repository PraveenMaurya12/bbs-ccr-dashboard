import { MessageCircle } from 'lucide-react'

import type { BbsPlanReport } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

const SECTION_LABELS: Array<[key: string, label: string]> = [
  ['whereYouAreToday', 'Where you are today'],
  ['whatNeedsAttention', 'What needs attention'],
  ['whyThisPlan', 'Why this plan'],
  ['whatHappensFirst', 'What happens first'],
  ['yourJourney', 'Your 30/60/90-day journey'],
  ['whatBbsWillDo', 'What BBS will do'],
  ['whatWeNeedFromYou', 'What we need from you'],
  ['lenderDependencies', 'Lender/creditor dependencies'],
  ['whatCanChangeThePlan', 'What can change this plan'],
  ['howProgressIsMeasured', 'How progress is measured'],
  ['reviewDate', 'Next review'],
]

/**
 * The spec's own "Customer-Facing Plan" narrative — AI-generated (the
 * `RECOVERY_PLAN_GENERATION` job), advisory only. It explains the
 * already-decided, deterministic plan above; it never selects a template,
 * invents an action/condition/target, or changes a number (spec's own AI
 * Guardrails).
 */
export function CustomerNarrativePanel({ plan }: { plan: BbsPlanReport }) {
  const findings = plan.narrative?.findings as Record<string, string> | undefined

  if (!plan.narrative || plan.narrative.status !== 'COMPLETED' || !findings) {
    return (
      <SectionCard icon={MessageCircle} title="Customer-facing narrative">
        <NotAvailable reason={plan.narrative?.status === 'FAILED' ? 'The narrative generation job failed — the deterministic plan above is unaffected.' : 'The customer-facing narrative has not finished generating yet.'} />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={MessageCircle} title="Customer-facing narrative">
      <div className="flex flex-col gap-3">
        {SECTION_LABELS.map(([key, label], i) => {
          const text = findings[key]
          if (!text) return null
          return (
            <div key={key} className="flex flex-col gap-1">
              {i > 0 && <CardDivider />}
              <p className="text-xs font-medium tracking-[0.48px] text-[#a3a3a3] uppercase">{label}</p>
              <p className="text-sm leading-6 text-[#171717]">{text}</p>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
