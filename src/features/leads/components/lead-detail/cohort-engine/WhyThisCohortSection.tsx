import { HelpCircle } from 'lucide-react'

import type { CohortDecisionReport } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * Spec Part 12/23's "Why This Cohort?" — the deterministic, customer-safe
 * explanation plus (for the CCR) the matched rules that actually drove the
 * decision. Reasons always reference real evidence, never a generic
 * explanation (the spec's own explicit instruction).
 */
export function WhyThisCohortSection({ decision }: { decision: CohortDecisionReport }) {
  const matchedRules = decision.ruleResults.filter((r) => r.matched)

  return (
    <SectionCard icon={HelpCircle} title="Why this cohort?">
      {decision.customerExplanation && <p className="text-sm leading-6 text-[#171717]">{decision.customerExplanation}</p>}
      {matchedRules.length === 0 ? (
        <NotAvailable reason="No rule conditions were matched for this decision." />
      ) : (
        <ul className="flex flex-col gap-2">
          {matchedRules.map((rule) => (
            <li key={rule.ruleId} className="flex items-start gap-2 text-sm text-[#171717]">
              <span className="mt-0.5 shrink-0 font-mono text-xs text-[#2a8f60]">✓ {rule.ruleId}</span>
              <span>{rule.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
