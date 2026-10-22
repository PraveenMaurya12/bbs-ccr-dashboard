import { ListTodo } from 'lucide-react'

import type { BbsPlanActionPhase, BbsPlanActionRecord, BbsPlanActionStatus } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'
import { PlanActionOwnerBadge, PlanActionStatusBadge } from './PlanBadges'

const PHASE_LABEL: Record<BbsPlanActionPhase, string> = {
  IMMEDIATE: 'Immediate',
  DAY_30: 'Day 30',
  DAY_60: 'Day 60',
  DAY_90: 'Day 90',
}

const PHASE_ORDER: BbsPlanActionPhase[] = ['IMMEDIATE', 'DAY_30', 'DAY_60', 'DAY_90']

const ACTION_STATUS_OPTIONS: BbsPlanActionStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED', 'FAILED', 'CANCELLED', 'ESCALATED']

/**
 * The spec's own 4-phase Action Plan (Immediate/30/60/90-day) — grouped by
 * phase, each action tagged by who owns it (Customer/BBS/Creditor). The
 * status dropdown offers every v3.0 §11.2 state; the server enforces the
 * real legal-transition table and rejects an illegal change with a clear
 * reason (surfaced via `onStatusRejected`) rather than ever silently
 * applying one.
 */
export function ActionPlanTable({ actions, onUpdateStatus, updatingActionId }: { actions: BbsPlanActionRecord[]; onUpdateStatus?: (actionId: string, status: BbsPlanActionStatus) => void; updatingActionId?: string | null }) {
  if (actions.length === 0) {
    return (
      <SectionCard icon={ListTodo} title="Action plan">
        <NotAvailable reason="No actions are defined for this plan." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ListTodo} title="Action plan">
      <div className="flex flex-col gap-4">
        {PHASE_ORDER.filter((phase) => actions.some((a) => a.phase === phase)).map((phase) => (
          <div key={phase} className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-[0.48px] text-[#a3a3a3] uppercase">{PHASE_LABEL[phase]}</p>
            <ul className="flex flex-col gap-2">
              {actions
                .filter((a) => a.phase === phase)
                .map((a) => (
                  <li key={a.actionId} className="flex flex-col gap-1 rounded-lg border border-[#ebebeb] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <PlanActionOwnerBadge ownerType={a.ownerType} />
                        <PlanActionStatusBadge status={a.status} />
                      </div>
                      {onUpdateStatus && (
                        <select
                          aria-label={`Update status for action ${a.actionId}`}
                          className="rounded-md border border-[#ebebeb] bg-white px-2 py-1 text-xs text-[#171717] disabled:opacity-50"
                          value={a.status}
                          disabled={updatingActionId === a.actionId}
                          onChange={(event) => {
                            const next = event.target.value as BbsPlanActionStatus
                            if (next === a.status) return
                            onUpdateStatus(a.actionId, next)
                          }}
                        >
                          {ACTION_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <p className="text-sm text-[#171717]">{a.description}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#a3a3a3]">
                      <span>Owner: {a.owner}</span>
                      <span>Timing: {a.timing}</span>
                      {a.slaDays !== null && <span>SLA: {a.slaDays} day{a.slaDays === 1 ? '' : 's'}</span>}
                      {a.dependency && <span>Depends on: {a.dependency}</span>}
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
