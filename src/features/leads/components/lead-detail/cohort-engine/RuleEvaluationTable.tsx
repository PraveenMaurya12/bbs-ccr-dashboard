import { useState } from 'react'
import { ChevronDown, ChevronRight, ListChecks } from 'lucide-react'

import type { CohortRuleResultRecord, CohortRuleSeverity } from '../../../types'
import { SectionCard } from '../shared/SectionCard'

const SEVERITY_COLOR: Record<CohortRuleSeverity, string> = {
  HIGH: 'text-[#fb3748]',
  MEDIUM: 'text-[#f6b51e]',
  LOW: 'text-[#a3a3a3]',
}

function RuleRow({ rule }: { rule: CohortRuleResultRecord }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr className="cursor-pointer border-b border-[#ebebeb] last:border-0" onClick={() => setExpanded((e) => !e)}>
        <td className="py-2 pr-2 align-top">
          <span className="inline-flex items-center gap-1">
            {expanded ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
            <span className="font-mono text-xs">{rule.ruleId}</span>
          </span>
        </td>
        <td className="py-2 pr-2 align-top">
          {!rule.evaluated ? <span className="text-[#a3a3a3]">Not evaluated</span> : rule.matched ? <span className="font-medium text-[#1fc16b]">Matched</span> : <span className="text-[#5c5c5c]">Not matched</span>}
        </td>
        <td className="py-2 pr-2 align-top text-[#171717]">{rule.reason}</td>
        <td className={`py-2 align-top font-medium ${SEVERITY_COLOR[rule.severity]}`}>{rule.severity}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-[#ebebeb] bg-[#fafafa] last:border-0">
          <td colSpan={4} className="px-2 py-2 text-xs text-[#5c5c5c]">
            <p>Evidence level: {rule.evidenceLevel}</p>
            <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-[11px]">{JSON.stringify(rule.evidence, null, 2)}</pre>
          </td>
        </tr>
      )}
    </>
  )
}

/** Spec Part 23's "Rule Evaluation" table — every one of the 22 rules, expandable for its underlying evidence. */
export function RuleEvaluationTable({ ruleResults }: { ruleResults: CohortRuleResultRecord[] }) {
  return (
    <SectionCard icon={ListChecks} title="Rule evaluation">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#ebebeb] text-left text-xs text-[#a3a3a3] uppercase">
              <th className="pb-2 font-medium">Rule</th>
              <th className="pb-2 font-medium">Result</th>
              <th className="pb-2 font-medium">Reason</th>
              <th className="pb-2 font-medium">Severity</th>
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
