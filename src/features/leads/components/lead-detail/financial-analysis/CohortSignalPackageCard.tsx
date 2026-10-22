import { Share2 } from 'lucide-react'

import type { FinancialCohortSignalPackage } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

function formatValue(value: unknown): string {
  if (value === null) return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

/**
 * v4.0 spec §18.2 Cohort Signal Package — a fixed, flat signal export for
 * downstream engines. Field names are kept snake_case here (matching the
 * spec's own schema and the backend's wire contract verbatim) rather than
 * translated to camelCase, since this is a literal handoff-contract
 * listing, not an internal UI label set. The Cohort Engine does not
 * currently read this field (it consumes Master Profile's own
 * `cohortAttributes` vector) — this is forward-compatible plumbing matching
 * the spec's contract, not a live integration; `cohortSignalPackage` is
 * optional on the wire.
 */
export function CohortSignalPackageCard({ cohortSignalPackage }: { cohortSignalPackage: FinancialCohortSignalPackage | undefined }) {
  if (!cohortSignalPackage) {
    return (
      <SectionCard icon={Share2} title="Cohort signal package">
        <NotAvailable reason="Cohort signal package unavailable — this field was not included in this analysis response." />
      </SectionCard>
    )
  }

  const entries = Object.entries(cohortSignalPackage)

  return (
    <SectionCard icon={Share2} title="Cohort signal package">
      <p className="text-xs text-[#a3a3a3]">
        Fixed-schema signal export for downstream engines — not currently consumed by the Cohort Engine, which reads Master Profile's own cohort-attributes vector instead.
      </p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-2 border-b border-[#f7f7f7] py-1 text-xs">
            <span className="min-w-0 flex-1 truncate font-mono text-[#5c5c5c]">{key}</span>
            <span className="shrink-0 font-medium text-[#171717]">{formatValue(value)}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
