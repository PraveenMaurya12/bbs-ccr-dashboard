import { useState } from 'react'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import type { CohortRefreshTrigger } from '../../../types'
import { cohortEngineService } from '../../../services/cohortEngineService'
import { SectionCard } from '../shared/SectionCard'

const LAYER_LABEL: Record<string, string> = {
  L1_DEBT_ANALYSIS: 'L1 Debt Analysis',
  L2_FINANCIAL_ANALYSIS: 'L2 Financial Analysis',
  L3_MASTER_PROFILE: 'L3 Master Profile',
  L4_COHORT_DECISION: 'L4 Cohort Decision',
}

function TriggerRow({ trigger }: { trigger: CohortRefreshTrigger }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl border border-[#ebebeb]">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="size-3.5 shrink-0 text-[#a3a3a3]" aria-hidden="true" /> : <ChevronRight className="size-3.5 shrink-0 text-[#a3a3a3]" aria-hidden="true" />}
          <span className="text-sm font-medium text-[#171717]">{trigger.label}</span>
          <span className="text-xs text-[#a3a3a3]">{trigger.layersRerun.map((l) => LAYER_LABEL[l] ?? l).join(' → ')}</span>
        </div>
        <div className="flex items-center gap-2">
          {trigger.currentlyApplicable !== undefined && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${trigger.currentlyApplicable ? 'bg-[#e3f7ec] text-[#1fc16b]' : 'bg-[#f7f7f7] text-[#a3a3a3]'}`}>
              {trigger.currentlyApplicable ? 'Applicable now' : 'Not applicable'}
            </span>
          )}
          {!trigger.mechanicallyDetectable && <span className="rounded-full bg-[#fffaeb] px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#f6b51e] uppercase">Not auto-detectable</span>}
        </div>
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-[#ebebeb] px-3 py-3 text-xs text-[#5c5c5c]">
          <p>
            <span className="font-medium text-[#171717]">Required conditions: </span>
            {trigger.requiredConditions}
          </p>
          <p>
            <span className="font-medium text-[#171717]">Affected assessment: </span>
            {trigger.affectedAssessment}
          </p>
          <p>
            <span className="font-medium text-[#171717]">Expected re-evaluation behaviour: </span>
            {trigger.expectedReevaluationBehavior}
          </p>
          <p>
            <span className="font-medium text-[#171717]">Detection note: </span>
            {trigger.detectionNote}
          </p>
          {trigger.applicabilityBasis && (
            <p>
              <span className="font-medium text-[#171717]">Basis for this lead: </span>
              {trigger.applicabilityBasis}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * v3.0 §15.1's refresh-trigger taxonomy, made an inspectable artifact in its
 * own right — not just the fact that re-running evaluate() happens to
 * correctly re-derive everything. Each of the 6 documented triggers is
 * expandable for its required conditions, affected assessment, and expected
 * re-evaluation behaviour, plus (when a decision exists) real per-lead
 * applicability.
 */
export function RefreshTriggersPanel({ bbsLeadId }: { bbsLeadId: string }) {
  const query = useQuery({ queryKey: ['cohortRefreshTriggers', bbsLeadId], queryFn: () => cohortEngineService.getRefreshTriggers(bbsLeadId) })

  if (!query.data) return null

  return (
    <SectionCard icon={RefreshCw} title="Refresh-trigger taxonomy (§15.1)">
      <p className="text-xs text-[#a3a3a3]">
        {query.data.perLeadApplicability
          ? 'Expand a trigger for its required conditions, affected assessment, and expected re-evaluation behaviour. "Applicable now" reflects this lead\'s current state where this codebase can honestly determine it.'
          : 'Static catalog only — run a Cohort Assessment for this lead to see per-lead applicability.'}
      </p>
      <div className="flex flex-col gap-2">
        {query.data.triggers.map((t) => (
          <TriggerRow key={t.id} trigger={t} />
        ))}
      </div>
    </SectionCard>
  )
}
