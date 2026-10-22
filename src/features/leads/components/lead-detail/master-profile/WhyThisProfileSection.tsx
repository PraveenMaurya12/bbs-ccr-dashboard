import { CircleCheck, CircleX, HelpCircle } from 'lucide-react'

import type { MasterSignalEvidence } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * Spec Part 41: "Why This Profile?" — a single flat, scannable evidence
 * checklist (✓ strengths, ⚠ concerns), distinct in presentation from the
 * three-column Strengths/Concerns/Opportunities section even though it
 * draws on the same underlying evidence — the spec explicitly calls this
 * out as its own strongest UI component.
 */
export function WhyThisProfileSection({ strengths, concerns }: { strengths: MasterSignalEvidence[] | null; concerns: MasterSignalEvidence[] | null }) {
  const items = [...(strengths ?? []).map((s) => ({ ...s, positive: true })), ...(concerns ?? []).map((c) => ({ ...c, positive: false }))]

  return (
    <SectionCard icon={HelpCircle} title="Why this profile?">
      {items.length === 0 ? (
        <NotAvailable reason="No evidence-backed drivers were identified for this profile." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-2 text-sm text-[#171717]">
              {item.positive ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-[#1fc16b]" aria-hidden="true" />
              ) : (
                <CircleX className="mt-0.5 size-4 shrink-0 text-[#f6b51e]" aria-hidden="true" />
              )}
              <span>
                {item.label}
                <span className="block text-xs text-[#a3a3a3]">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
