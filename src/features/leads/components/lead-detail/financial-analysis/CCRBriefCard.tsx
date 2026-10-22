import { Fragment } from 'react'
import { ClipboardList } from 'lucide-react'

import { formatCurrencyInr, formatDateOnly } from '../../../utils/leadDisplay'
import type { FinancialCcrBrief, FinancialFlagSeverity } from '../../../types'
import { SeverityBadge } from './SeverityBadge'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * v4.0 spec §18.1 "CCR Brief — Fixed Template" — a deterministic, one-page
 * composition of fields already computed elsewhere in this analysis;
 * mirrors the Debt Analysis module's own CCRBriefCard/call-brief pattern.
 * `ccrBrief` is optional on the wire — a report persisted before this
 * feature shipped has no such field.
 */
export function CCRBriefCard({ ccrBrief }: { ccrBrief: FinancialCcrBrief | undefined }) {
  if (!ccrBrief) {
    return (
      <SectionCard icon={ClipboardList} title="CCR brief">
        <NotAvailable reason="CCR brief unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ClipboardList} title={`CCR brief — ${ccrBrief.caseId}`}>
      <MetricRow
        label="Statement period"
        value={ccrBrief.statementPeriod.start && ccrBrief.statementPeriod.end ? `${formatDateOnly(ccrBrief.statementPeriod.start)} – ${formatDateOnly(ccrBrief.statementPeriod.end)}` : 'Not reported'}
      />
      <MetricRow label="Data quality" value={`${ccrBrief.dataQuality.score}/100 (${ccrBrief.dataQuality.band})${ccrBrief.dataQuality.capsApplied ? ', caps applied' : ''}`} />
      <MetricRow label="Financial Health Score" value={`${ccrBrief.financialHealthScore.total ?? 'N/A'}/100 (${ccrBrief.financialHealthScore.band})`} />
      <MetricRow label="Reconciliation" value={ccrBrief.bankAccountSummary.reconciliation} />

      <CardDivider />
      <MetricRow label="Normalized monthly income" value={formatCurrencyInr(ccrBrief.incomeProfile.normalizedMonthlyIncome)} />
      <MetricRow
        label="Income stability"
        value={`${ccrBrief.incomeProfile.stabilityBand ?? 'Not reported'} (${ccrBrief.incomeProfile.trend})${ccrBrief.incomeProfile.confidenceLevel ? ` — confidence ${ccrBrief.incomeProfile.confidenceLevel}` : ''}`}
      />
      {ccrBrief.incomeProfile.tenureMonths !== null && <MetricRow label="Income tenure" value={`${ccrBrief.incomeProfile.tenureMonths} month(s)`} />}
      {ccrBrief.incomeProfile.confidenceDowngradeReason && <MetricRow label="Confidence downgrade reason" value={ccrBrief.incomeProfile.confidenceDowngradeReason} />}
      <MetricRow label="Single source dependency" value={ccrBrief.incomeProfile.singleSourceDependency ? 'Yes' : 'No'} />
      <MetricRow label="Income transition" value={ccrBrief.incomeProfile.incomeTransition} />
      <MetricRow label="Related-party employer" value={ccrBrief.incomeProfile.relatedPartyEmployer ? 'Yes' : 'No'} />

      <CardDivider />
      <MetricRow label="Fixed monthly debt" value={formatCurrencyInr(ccrBrief.debtServicing.fixedMonthlyDebt)} />
      <MetricRow label="DSR fixed / total" value={`${ccrBrief.debtServicing.dsrFixedPercent ?? 'N/A'}% / ${ccrBrief.debtServicing.dsrTotalPercent ?? 'N/A'}%`} />
      <MetricRow label="Active lenders" value={ccrBrief.debtServicing.activeLenders ?? 'Not reported'} />

      <CardDivider />
      <MetricRow label="Theoretical FCF" value={ccrBrief.cashFlow.theoreticalFcf !== null ? formatCurrencyInr(ccrBrief.cashFlow.theoreticalFcf) : 'N/A'} />
      <MetricRow label="FCF reconciliation gap" value={ccrBrief.cashFlow.fcfGap} />
      <MetricRow label="Deficit months" value={ccrBrief.cashFlow.deficitMonths} />

      <CardDivider />
      <MetricRow label="Minimum balance" value={ccrBrief.liquidity.minimumBalance !== null ? formatCurrencyInr(ccrBrief.liquidity.minimumBalance) : 'N/A'} />
      <MetricRow label="Low-balance frequency" value={ccrBrief.liquidity.lowBalanceFrequencyPercent !== null ? `${ccrBrief.liquidity.lowBalanceFrequencyPercent}%` : 'N/A'} />
      <MetricRow label="Cash visibility gap" value={ccrBrief.liquidity.cashVisibilityGap ? 'Yes' : 'No'} />

      <CardDivider />
      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Top risk signals</p>
        {ccrBrief.topRiskSignals.length === 0 ? (
          <NotAvailable reason="No risk signals at Attention or above were identified." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {ccrBrief.topRiskSignals.map((s, i) => (
              <div key={i} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 text-[#171717]">{s.detail}</span>
                <SeverityBadge severity={s.severity as FinancialFlagSeverity} />
              </div>
            ))}
          </div>
        )}
      </div>

      <CardDivider />
      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">CCR discovery agenda ({ccrBrief.missingInformationAgenda.length})</p>
        <div className="flex flex-col gap-3">
          {ccrBrief.missingInformationAgenda.map((item, i) => (
            <Fragment key={item.item}>
              {i > 0 && <CardDivider />}
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-[#171717]">{item.item}</p>
                <p className="text-xs text-[#5c5c5c]">{item.whyItMatters}</p>
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      <CardDivider />
      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Suggested discovery questions ({ccrBrief.suggestedDiscoveryQuestions.length})</p>
        {ccrBrief.suggestedDiscoveryQuestions.length === 0 ? (
          <NotAvailable reason="No discovery questions were generated for this analysis." />
        ) : (
          <ol className="list-inside list-decimal space-y-1.5 text-sm text-[#171717]">
            {ccrBrief.suggestedDiscoveryQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        )}
      </div>
    </SectionCard>
  )
}
