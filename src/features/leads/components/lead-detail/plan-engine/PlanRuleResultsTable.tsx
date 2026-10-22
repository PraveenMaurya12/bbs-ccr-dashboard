import { useState } from 'react'
import { ChevronDown, ChevronRight, ListChecks } from 'lucide-react'

import type { BbsPlanRuleEvaluation, BbsPlanRuleResult } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

const EVALUATION_META: Record<BbsPlanRuleEvaluation, { label: string; className: string }> = {
  FIRED: { label: 'Fired', className: 'font-medium text-[#1fc16b]' },
  NOT_FIRED: { label: 'Not fired', className: 'text-[#5c5c5c]' },
  NOT_EVALUATED: { label: 'Not evaluated', className: 'text-[#a3a3a3]' },
}

function RuleRow({ rule }: { rule: BbsPlanRuleResult }) {
  const [expanded, setExpanded] = useState(false)
  const meta = EVALUATION_META[rule.evaluation]

  return (
    <>
      <tr className="cursor-pointer border-b border-[#ebebeb] last:border-0" onClick={() => setExpanded((e) => !e)}>
        <td className="py-2 pr-2 align-top">
          <span className="inline-flex items-center gap-1">
            {expanded ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
            <span className="font-mono text-xs">{rule.ruleId}</span>
          </span>
        </td>
        <td className={`py-2 pr-2 align-top ${meta.className}`}>{meta.label}</td>
        <td className="py-2 align-top text-[#171717]">{rule.reason}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-[#ebebeb] bg-[#fafafa] last:border-0">
          <td colSpan={3} className="px-2 py-2 text-xs text-[#5c5c5c]">
            <pre className="overflow-x-auto rounded bg-white p-2 text-[11px]">{JSON.stringify(rule.evidence, null, 2)}</pre>
          </td>
        </tr>
      )}
    </>
  )
}

/** v3.0 §7's rule catalog (PL001/PL004/PL005/PL007-PL010/PL013-PL015), every rule expandable for its underlying evidence — same pattern as Cohort/Pathway Engine's own rule-evaluation tables. */
export function PlanRuleResultsTable({ ruleResults }: { ruleResults: BbsPlanRuleResult[] | null }) {
  if (!ruleResults || ruleResults.length === 0) {
    return (
      <SectionCard icon={ListChecks} title="Rule evaluation">
        <NotAvailable reason="No rule results are recorded for this plan." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ListChecks} title="Rule evaluation">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#ebebeb] text-left text-xs text-[#a3a3a3] uppercase">
              <th className="pb-2 font-medium">Rule</th>
              <th className="pb-2 font-medium">Result</th>
              <th className="pb-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {ruleResults.map((rule) => (
              <RuleRow key={rule.ruleId} rule={rule} />
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
