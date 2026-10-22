import { Fingerprint } from 'lucide-react'

import type { IdentityVariantsResult } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * BBS Debt Analysis Module v3.0, §3.3/§15.4 — `available` is false for
 * this integration's live Signzy provider (confirmed: no per-account
 * holder-identity data in that response shape at all). Built to also
 * honestly render a future `available: true` result (e.g. an
 * Experian-XML-sourced report, if that path is ever wired up), never
 * assuming the unavailable case is the only one.
 */
export function IdentityVariantsCard({ identity }: { identity: IdentityVariantsResult | undefined }) {
  if (!identity) {
    return (
      <SectionCard icon={Fingerprint} title="Identity variants">
        <NotAvailable reason="Identity variants unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  if (!identity.available) {
    return (
      <SectionCard icon={Fingerprint} title="Identity variants">
        <NotAvailable reason={identity.unavailableReason} />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={Fingerprint} title="Identity variants">
      <MetricRow label="Canonical name" value={identity.canonicalName ?? 'N/A'} />
      <CardDivider />
      <div>
        <p className="mb-1 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Name variants ({identity.nameVariants.length})</p>
        <p className="text-sm text-[#171717]">{identity.nameVariants.join(', ') || 'None reported'}</p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Mobile variants ({identity.mobileVariants.length})</p>
        <p className="text-sm text-[#171717]">{identity.mobileVariants.join(', ') || 'None reported'}</p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Address variants ({identity.addressVariants.length})</p>
        <p className="text-sm text-[#171717]">{identity.addressVariants.join(', ') || 'None reported'}</p>
      </div>
    </SectionCard>
  )
}
