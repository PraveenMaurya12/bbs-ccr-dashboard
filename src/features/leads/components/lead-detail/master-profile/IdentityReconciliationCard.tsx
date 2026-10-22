import { UserCheck } from 'lucide-react'

import type { MasterIdentitySnapshot } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

const FIELD_LABELS: Record<string, string> = {
  fullName: 'Full name',
  phone: 'Phone',
  email: 'Email',
  city: 'City',
  dateOfBirth: 'Date of birth',
  gender: 'Gender',
  occupation: 'Occupation',
  employmentType: 'Employment type',
  companyName: 'Employer',
  designation: 'Designation',
}

/**
 * Spec Part 5/6: canonical identity fields, preserving conflicting source
 * values rather than silently overwriting them — a conflicting field shows
 * BOTH values with their source, never just the "winning" one.
 */
export function IdentityReconciliationCard({ identity }: { identity: MasterIdentitySnapshot | null }) {
  if (!identity) {
    return (
      <SectionCard icon={UserCheck} title="Identity">
        <NotAvailable reason="Identity reconciliation is not available for this profile." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={UserCheck} title="Identity">
      {identity.hasConflict && (
        <div className="rounded-lg bg-[#fffaeb] px-3 py-2 text-xs text-[#f6b51e]">
          One or more identity fields disagree between the original lead submission and the CCR-verified record — both values are shown below.
        </div>
      )}
      {identity.fields.map((field) => (
        <div key={field.field}>
          {field.conflict ? (
            <div className="flex w-full flex-col gap-1 py-1">
              <p className="text-sm text-[#171717]">{FIELD_LABELS[field.field] ?? field.field}</p>
              {field.sourceValues.map((sv) => (
                <p key={sv.source} className="text-xs text-[#5c5c5c]">
                  <span className="text-[#a3a3a3]">{sv.source === 'LEAD_FORM' ? 'Lead form' : 'CCR verified'}:</span> {sv.value}
                </p>
              ))}
            </div>
          ) : (
            <MetricRow label={FIELD_LABELS[field.field] ?? field.field} value={field.canonicalValue ?? 'Not available'} />
          )}
        </div>
      ))}
      <CardDivider />
      <MetricRow label="PAN on file" value={identity.panAvailable ? 'Available' : 'Not available'} />
      {identity.panRefConflict && (
        <div className="rounded-lg bg-[#ffebec] px-3 py-2 text-xs text-[#fb3748]">
          The PAN reference on file does not match between the original lead submission and the CCR-verified record — an unresolved identity discrepancy requiring verification before proceeding. The PAN itself is never displayed; only its match status is compared.
        </div>
      )}
    </SectionCard>
  )
}
