import { HelpCircle } from 'lucide-react'

import { NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * v4.0 spec §20 "What L2 Cannot Decide" — a fixed, deterministic list of
 * this module's own structural boundaries (never AI-authored, never
 * computed from this statement's data). These require CCR, L3 (Master
 * Profile), the Cohort Engine, and human validation.
 */
export function WhatL2CannotDecideCard({ items }: { items: string[] | undefined }) {
  if (!items) {
    return (
      <SectionCard icon={HelpCircle} title="What L2 cannot decide">
        <NotAvailable reason="This field was not included in this analysis response." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={HelpCircle} title="What L2 cannot decide">
      <p className="text-xs text-[#a3a3a3]">These require CCR, L3 (Master Profile), the Cohort Engine, and human validation.</p>
      <ul className="list-inside list-disc space-y-1.5 text-sm text-[#171717]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </SectionCard>
  )
}
