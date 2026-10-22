import { ShieldAlert, ShieldCheck, Timer } from 'lucide-react'

import type { CohortDecisionReport } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'
import { CaseAgingBadge, ComplianceAgingBadge } from './CohortBadges'

/**
 * Section 5 — Readiness & Compliance: the compliance-hold sub-state
 * machine (§7.3, computed on read — never a cron job) and the case-aging
 * clock for a BLOCKED decision (§14). Never discloses the specific
 * compliance trigger in customer-facing text anywhere in this component —
 * this card is CCR-only, same non-disclosure discipline as the spec's own
 * §13.1 rules (enforced in the customer-facing templates, not here).
 */
export function CohortComplianceCard({ decision }: { decision: CohortDecisionReport }) {
  return (
    <SectionCard icon={decision.complianceHold ? ShieldAlert : ShieldCheck} title="Compliance routing" className={decision.complianceHold ? 'border-[#7d52f4] bg-[#f4edff]' : undefined}>
      {!decision.complianceHold ? (
        <MetricRow label="Compliance hold" value={<span className="font-medium text-[#1fc16b]">No active hold</span>} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex w-fit items-center rounded-full bg-[#7d52f4] px-2.5 py-1 text-xs font-medium text-white">COMPLIANCE HOLD ACTIVE</span>
            <ComplianceAgingBadge state={decision.complianceAgingState} />
          </div>
          <CardDivider />
          <MetricRow label="Reason" value={decision.complianceReason ?? 'Not specified'} />
          <MetricRow label="Matched entity" value={decision.complianceMatchedEntity ?? 'Not specified'} />
          <MetricRow label="SLA" value={decision.complianceSlaHours !== null ? `${decision.complianceSlaHours}h` : 'Not available'} />
          <MetricRow label="Escalates at" value={decision.complianceEscalationAt ? new Date(decision.complianceEscalationAt).toLocaleString() : 'Not available'} />
          <p className="text-xs text-[#7d52f4]">This lead cannot proceed to a real cohort/pathway until compliance clears or declines this hold.</p>
        </>
      )}

      {decision.caseAging && (
        <>
          <CardDivider />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Case aging</span>
            <CaseAgingBadge state={decision.caseAging.agingState} />
          </div>
          {decision.caseAging.ttlExpiresAt ? (
            <MetricRow label="TTL expires" value={new Date(decision.caseAging.ttlExpiresAt).toLocaleDateString()} />
          ) : (
            <NotAvailable reason="No TTL applies to this blocked reason (e.g. a compliance hold waits for compliance, not a fixed deadline)." />
          )}
        </>
      )}

      {!decision.complianceHold && !decision.caseAging && !decision.complianceAction && <NotAvailable reason="No readiness or compliance gate is currently active for this decision." />}

      {decision.complianceAction && (
        <>
          <CardDivider />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Compliance action (previous hold)</span>
            <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ${decision.complianceAction.action === 'CLEARED' ? 'bg-[#1fc16b] text-white' : 'bg-[#e5484d] text-white'}`}>
              {decision.complianceAction.action === 'CLEARED' ? 'COMPLIANCE CLEARED' : 'COMPLIANCE DECLINED'}
            </span>
          </div>
          <MetricRow label="Reason" value={decision.complianceAction.reason} />
          <MetricRow label="Actor" value={decision.complianceAction.actorName} />
          <MetricRow label="When" value={new Date(decision.complianceAction.createdAt).toLocaleString()} />
        </>
      )}

      <div className="flex items-center gap-1.5 text-xs text-[#a3a3a3]">
        <Timer className="size-3.5" aria-hidden="true" />
        Aging/escalation state is computed on read, not by a background job — refresh this tab to see the latest state.
      </div>
    </SectionCard>
  )
}
