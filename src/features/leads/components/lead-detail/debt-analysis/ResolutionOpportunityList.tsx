import { Fragment } from 'react'
import { Lightbulb } from 'lucide-react'

import type { DebtAnalysisInsights } from '../../../types'
import { getDebtDiagnosisFindings } from './aiFindings'
import { EvidenceLevelBadge } from './EvidenceLevelBadge'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * Layer 6 — Resolution Opportunity (Rule 25): one evidence-based
 * opportunity per material finding — e.g. elevated card utilization →
 * review balances and repayment capacity. Never a generic suggestion
 * untethered from a real finding.
 */
export function ResolutionOpportunityList({ insights }: { insights: DebtAnalysisInsights | null }) {
  const findings = getDebtDiagnosisFindings(insights)

  if (!findings) {
    return (
      <SectionCard icon={Lightbulb} title="Resolution opportunities">
        <NotAvailable reason="Resolution opportunities are generated alongside the AI debt diagnosis — not yet available for this report." />
      </SectionCard>
    )
  }

  if (findings.resolutionOpportunities.length === 0) {
    return (
      <SectionCard icon={Lightbulb} title="Resolution opportunities">
        <NotAvailable reason="No material finding currently warrants a resolution opportunity." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={Lightbulb} title="Resolution opportunities">
      <div className="flex flex-col gap-3">
        {findings.resolutionOpportunities.map((opportunity, i) => (
          <Fragment key={i}>
            {i > 0 && <CardDivider />}
            <div className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium text-[#171717]">{opportunity.title}</p>
                <EvidenceLevelBadge level={opportunity.evidenceLevel} />
              </div>
              <p className="text-sm text-[#5c5c5c]">{opportunity.statement}</p>
            </div>
          </Fragment>
        ))}
      </div>
    </SectionCard>
  )
}
