import { Fragment } from 'react'
import { Stethoscope } from 'lucide-react'

import type { DebtAnalysisInsights, DebtDiagnosisFinding } from '../../../types'
import { DEBT_RISK_SEVERITY_META } from '../../../utils/leadDisplay'
import { getDebtDiagnosisFindings } from './aiFindings'
import { EvidenceLevelBadge } from './EvidenceLevelBadge'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

function FindingRow({ finding }: { finding: DebtDiagnosisFinding }) {
  const severityMeta = DEBT_RISK_SEVERITY_META[finding.severity]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-[#171717]">{finding.title}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs leading-4 font-medium ${severityMeta.bgClassName} ${severityMeta.textClassName}`}>{finding.severity}</span>
          <EvidenceLevelBadge level={finding.evidenceLevel} />
        </div>
      </div>
      <p className="text-sm text-[#5c5c5c]">{finding.statement}</p>
      {finding.relatedAccounts.length > 0 && <p className="text-xs text-[#a3a3a3]">Related: {finding.relatedAccounts.join(', ')}</p>}
    </div>
  )
}

function FindingGroup({ title, findings }: { title: string; findings: DebtDiagnosisFinding[] }) {
  if (findings.length === 0) return null
  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">{title}</p>
      <div className="flex flex-col gap-3">
        {findings.map((f, i) => (
          <Fragment key={i}>
            {i > 0 && <CardDivider />}
            <FindingRow finding={f} />
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/**
 * Layer 5 — Debt Diagnosis: Current position, Primary/Secondary concern,
 * Historical context, Data gap (the spec's own Layer 5 fields), plus
 * Possible drivers (Rule 23 root-cause analysis), Stress signals, and
 * Account insights. `accountInsights` previously existed on the AI output
 * contract (`DebtDiagnosisFindings.accountInsights`) but was never rendered
 * anywhere in the tab — every other `DebtDiagnosisFinding[]` category has a
 * home, this one silently didn't.
 * Advisory only — see ExecutiveDiagnosisSummary's own doc comment.
 */
export function DebtDiagnosisPanel({ insights }: { insights: DebtAnalysisInsights | null }) {
  const findings = getDebtDiagnosisFindings(insights)

  if (!findings) {
    return (
      <SectionCard icon={Stethoscope} title="Debt diagnosis">
        <NotAvailable
          reason={
            !insights
              ? 'No AI insights have been generated for this report yet.'
              : insights.status !== 'COMPLETED'
                ? 'AI insights are still being generated for this report.'
                : 'These insights were generated in an older format and cannot be rendered here.'
          }
        />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={Stethoscope} title="Debt diagnosis">
      <FindingGroup title="Primary concern" findings={findings.primaryConcerns} />
      <FindingGroup title="Secondary concern" findings={findings.secondaryConcerns} />
      <FindingGroup title="Historical context" findings={findings.historicalContext} />
      <FindingGroup title="Stress signals" findings={findings.stressSignals} />
      <FindingGroup title="Possible drivers (root cause, Rule 23)" findings={findings.possibleDrivers} />
      <FindingGroup title="Account insights" findings={findings.accountInsights} />

      <CardDivider />
      <div>
        <p className="mb-1 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Debt trajectory</p>
        <p className="text-sm text-[#5c5c5c]">{findings.debtTrajectory}</p>
      </div>

      {findings.dataGaps.length > 0 && (
        <>
          <CardDivider />
          <div>
            <p className="mb-1 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Data gap</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-[#171717]">
              {findings.dataGaps.map((gap, i) => (
                <li key={i}>{gap}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </SectionCard>
  )
}
