import { AlertTriangle, ShieldCheck, Target } from 'lucide-react'

import type { BbsPlanConditionRecord, BbsPlanConditionState } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'
import { PlanConditionStateBadge } from './PlanBadges'

const QUICK_STATES: Array<Exclude<BbsPlanConditionState, 'NOT_APPLICABLE' | 'UNKNOWN'>> = ['MET', 'PENDING', 'FAILED']

/**
 * The Plan Conditions Engine's own states (MET/PENDING/FAILED/
 * NOT_APPLICABLE/UNKNOWN) — every condition starts UNKNOWN/UNVERIFIED,
 * never fabricated as already satisfied. NOT_APPLICABLE conditions (no
 * live product/lender integration exists to verify them) show no quick
 * actions at all — the server itself refuses to transition them.
 */
export function ConditionsPanel({ conditions, onUpdateState, updatingConditionId }: { conditions: BbsPlanConditionRecord[]; onUpdateState?: (conditionId: string, state: BbsPlanConditionState) => void; updatingConditionId?: string | null }) {
  if (conditions.length === 0) {
    return (
      <SectionCard icon={ShieldCheck} title="Conditions">
        <NotAvailable reason="No conditions are attached to this plan." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ShieldCheck} title="Conditions">
      <ul className="flex flex-col gap-3">
        {conditions.map((c) => (
          <li key={c.conditionId} className="flex flex-col gap-1 border-b border-[#ebebeb] pb-3 last:border-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-[#171717]">{c.description}</p>
              <PlanConditionStateBadge state={c.state} />
            </div>
            <p className="text-xs text-[#a3a3a3]">
              Source: {c.source} · Verification: {c.verificationStatus}
              {c.priority && ` · Priority: ${c.priority}`}
              {c.escalationPath && ` · Escalation: ${c.escalationPath}`}
            </p>
            {onUpdateState && c.state !== 'NOT_APPLICABLE' && (
              <div className="mt-1 flex gap-1.5">
                {QUICK_STATES.filter((s) => s !== c.state).map((state) => (
                  <button
                    key={state}
                    type="button"
                    disabled={updatingConditionId === c.conditionId}
                    onClick={() => onUpdateState(c.conditionId, state)}
                    className="rounded-md border border-[#ebebeb] px-2 py-0.5 text-xs text-[#5c5c5c] hover:bg-[#f7f7f7] disabled:opacity-50"
                  >
                    Mark {state}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

export function RisksAndDisclosuresPanel({ risks, disclosures }: { risks: string[] | null; disclosures: string[] | null }) {
  return (
    <SectionCard icon={AlertTriangle} title="Risks & disclosures">
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1 text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Risks</p>
          {!risks || risks.length === 0 ? (
            <NotAvailable reason="No risks are flagged for this plan." />
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[#171717]">
              {risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="h-px w-full shrink-0 bg-[#ebebeb]" />
        <div>
          <p className="mb-1 text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Disclosures</p>
          {!disclosures || disclosures.length === 0 ? (
            <NotAvailable reason="No disclosures are attached to this plan." />
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[#171717]">
              {disclosures.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  )
}

export function SuccessCriteriaPanel({ successCriteria }: { successCriteria: string[] | null }) {
  return (
    <SectionCard icon={Target} title="Success criteria">
      {!successCriteria || successCriteria.length === 0 ? (
        <NotAvailable reason="No success criteria are defined for this plan." />
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm text-[#171717]">
          {successCriteria.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
