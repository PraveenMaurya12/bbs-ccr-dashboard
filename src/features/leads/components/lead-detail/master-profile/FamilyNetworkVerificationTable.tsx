import { Users } from 'lucide-react'

import type { MasterFamilyNetworkVerification } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * v3.0 §9.2: inferred family-network transfers, reused from Financial
 * Analysis's own detector — every member starts UNVERIFIED and is treated
 * as potentially essential pending CCR confirmation, never silently
 * excluded from capacity calculations.
 */
export function FamilyNetworkVerificationTable({ verification }: { verification: MasterFamilyNetworkVerification | undefined }) {
  if (!verification) {
    return (
      <SectionCard icon={Users} title="Family network verification">
        <NotAvailable reason="Family network verification was not computed for this profile." />
      </SectionCard>
    )
  }

  if (verification.members.length === 0) {
    return (
      <SectionCard icon={Users} title="Family network verification">
        <NotAvailable reason="No inferred family-network transfers were detected." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={Users} title="Family network verification">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#ebebeb] text-left text-xs text-[#a3a3a3] uppercase">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Inferred relation</th>
              <th className="pb-2 font-medium">Verification</th>
              <th className="pb-2 font-medium">CCR action</th>
            </tr>
          </thead>
          <tbody>
            {verification.members.map((member, i) => (
              <tr key={i} className="border-b border-[#ebebeb] last:border-0">
                <td className="py-2 pr-2">{member.name}</td>
                <td className="py-2 pr-2 text-[#5c5c5c]">{member.inferredRelation}</td>
                <td className="py-2 pr-2">
                  <span className={`font-medium ${member.verificationStatus === 'VERIFIED' ? 'text-[#1fc16b]' : 'text-[#f6b51e]'}`}>
                    {member.verificationStatus === 'VERIFIED' ? 'Verified' : 'Unverified'}
                  </span>
                </td>
                <td className="py-2 text-[#5c5c5c]">{member.ccrAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {verification.treatedAsEssentialPendingCcr && (
        <p className="mt-3 text-xs text-[#a3a3a3]">
          These inferred transfers are treated as potentially essential expenses pending CCR confirmation — never excluded from capacity calculations by default.
        </p>
      )}
    </SectionCard>
  )
}
