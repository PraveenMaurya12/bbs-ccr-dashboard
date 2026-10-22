import { Fragment } from 'react'

import type { FinancialFinding } from '../../../types'
import { FinancialEvidenceLevelBadge } from './FinancialEvidenceLevelBadge'
import { SeverityBadge } from './SeverityBadge'
import { CardDivider } from '../shared/SectionCard'

/**
 * One shared, parameterized renderer for any FinancialFinding[] — used by
 * strengths/concerns/possibleDrivers/dataGaps/investigationPriorities.
 * Deliberate improvement over the Debt module's one-bespoke-component-per-
 * array pattern, justified by this module having noticeably more finding
 * arrays sharing the identical shape.
 */
export function FindingList({ title, findings }: { title: string; findings: FinancialFinding[] }) {
  if (findings.length === 0) return null

  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">{title}</p>
      <div className="flex flex-col gap-3">
        {findings.map((finding, i) => (
          <Fragment key={i}>
            {i > 0 && <CardDivider />}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium text-[#171717]">{finding.title}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <SeverityBadge severity={finding.severity} />
                  <FinancialEvidenceLevelBadge level={finding.evidenceLevel} />
                </div>
              </div>
              <p className="text-sm text-[#5c5c5c]">{finding.statement}</p>
              {(finding.relatedMonths.length > 0 || finding.relatedTransactions.length > 0 || finding.relatedAccounts.length > 0) && (
                <p className="text-xs text-[#a3a3a3]">
                  Related: {[...finding.relatedMonths, ...finding.relatedAccounts, ...finding.relatedTransactions].join(', ')}
                </p>
              )}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
