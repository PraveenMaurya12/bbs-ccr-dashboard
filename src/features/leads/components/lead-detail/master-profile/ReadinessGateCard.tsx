import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react'

import type { MasterReadinessGate } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'
import { ReadinessOutcomeBadge } from './MasterProfileBadges'

/**
 * v3.0 §22: the Readiness Gate — R1-R8 pass/fail conditions feeding a
 * single outcome. Never rendered as a positive readiness state when the
 * outcome itself is not READY — a failed condition or a non-READY outcome
 * always stays visibly failed/blocking here.
 */
export function ReadinessGateCard({ gate }: { gate: MasterReadinessGate | undefined }) {
  if (!gate) {
    return (
      <SectionCard icon={CircleDashed} title="Readiness gate">
        <NotAvailable reason="Readiness gate was not computed for this profile." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={CircleDashed} title="Readiness gate">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Outcome</span>
        <ReadinessOutcomeBadge outcome={gate.outcome} />
      </div>
      <CardDivider />
      <ul className="flex flex-col gap-2">
        {gate.conditions.map((condition) => (
          <li key={condition.code} className="flex items-start gap-2 text-sm text-[#171717]">
            {condition.passed ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1fc16b]" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-[#fb3748]" aria-hidden="true" />
            )}
            <span>
              <span className="font-medium">{condition.code}</span> — {condition.label}
              <span className="block text-xs text-[#a3a3a3]">{condition.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {gate.blockingFactors.length > 0 && (
        <>
          <CardDivider />
          <div className="flex flex-col gap-1">
            <p className="text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Blocking factors</p>
            <ul className="flex flex-col gap-1">
              {gate.blockingFactors.map((factor, i) => (
                <li key={i} className="text-xs text-[#fb3748]">
                  {factor}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </SectionCard>
  )
}
