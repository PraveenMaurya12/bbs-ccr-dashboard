import { ShieldAlert, ShieldCheck } from 'lucide-react'

import type { MasterComplianceRouting } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * v3.0 §12.3/§14.3: a COMPLIANCE_HOLD always supersedes every other
 * alignment or readiness state — this banner is deliberately the most
 * visually distinct element on the whole tab when active, and is never
 * collapsed into a routine "stressed" reading.
 */
export function ComplianceHoldBanner({ routing }: { routing: MasterComplianceRouting | undefined }) {
  if (!routing) {
    return (
      <SectionCard icon={ShieldCheck} title="Compliance routing">
        <NotAvailable reason="Compliance routing was not computed for this profile." />
      </SectionCard>
    )
  }

  if (!routing.complianceHold) {
    return (
      <SectionCard icon={ShieldCheck} title="Compliance routing">
        <MetricRow label="Compliance hold" value={<span className="font-medium text-[#1fc16b]">No active hold</span>} />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ShieldAlert} title="Compliance routing" className="border-[#7d52f4] bg-[#f4edff]">
      <span className="inline-flex w-fit items-center rounded-full bg-[#7d52f4] px-2.5 py-1 text-xs font-medium text-white">COMPLIANCE HOLD ACTIVE</span>
      <CardDivider />
      <MetricRow label="Reason" value={routing.reason ?? 'Not specified'} />
      <MetricRow label="Matched entity" value={routing.matchedEntity ?? 'Not specified'} />
      <MetricRow label="Hold since" value={routing.since ? new Date(routing.since).toLocaleDateString() : 'Not available'} />
      <MetricRow label="SLA" value={routing.slaHours !== null ? `${routing.slaHours}h` : 'Not available'} />
      <MetricRow label="Escalation" value={routing.escalationHours !== null ? `${routing.escalationHours}h` : 'Not available'} />
      <p className="text-xs text-[#7d52f4]">
        This lead is routed to compliance review and cannot proceed to Cohort/Plan assignment until the hold is resolved.
      </p>
    </SectionCard>
  )
}
