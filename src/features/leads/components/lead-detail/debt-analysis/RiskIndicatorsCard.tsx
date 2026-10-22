import { Fragment } from 'react'
import { PieChart as PieChartIcon } from 'lucide-react'

import type { DebtRiskFlag } from '../../../types'
import { DEBT_RISK_SEVERITY_META } from '../../../utils/leadDisplay'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * Every flag rendered here comes straight from the backend's `riskFlags`
 * array — this component never derives, scores, or invents a severity of
 * its own; it only maps the bureau-derived flag's own `severity` to a
 * color token (see backend debt-analysis.calculations.ts's `riskFlags` doc
 * comment for how each flag's severity was determined). Matches Figma's
 * flat divided-row + severity-pill layout (verified via Figma MCP
 * get_design_context, node 1459:10937) — the underlying `detail` string is
 * still there for a CCR to inspect (native title tooltip), just not shown
 * inline, to match that compact row layout exactly.
 */
export function RiskIndicatorsCard({ riskFlags }: { riskFlags: DebtRiskFlag[] }) {
  return (
    <SectionCard icon={PieChartIcon} title="Risk indicators & warnings flags">
      {riskFlags.length === 0 ? (
        <NotAvailable reason="No risk indicators identified from the current bureau report." />
      ) : (
        riskFlags.map((flag, i) => {
          const meta = DEBT_RISK_SEVERITY_META[flag.severity]
          return (
            <Fragment key={flag.key}>
              {i > 0 && <CardDivider />}
              <div className="flex w-full items-start gap-1" title={flag.detail}>
                <p className="min-w-0 flex-1 text-sm leading-5 tracking-[-0.084px] text-[#171717]">{flag.label}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs leading-4 font-medium ${meta.bgClassName} ${meta.textClassName}`}
                >
                  {flag.severity}
                </span>
              </div>
            </Fragment>
          )
        })
      )}
    </SectionCard>
  )
}
