import type { CustomerIdentityFact, IdentityFieldResult, IdentitySnapshot, LeadIdentityFact } from '../master-profile.types'

/**
 * Spec Part 5/6: maintain canonical identity fields while PRESERVING
 * conflicting source values rather than silently overwriting them. `Lead`
 * (the original submission — "LEAD_FORM") and `Customer` (the CCR-maintained
 * record, incrementally edited from the Lead Details tab — "CCR_VERIFIED")
 * are the only two identity sources this integration has; neither
 * CreditReport nor BankStatementAnalysis carries a raw name/DOB to
 * cross-check against (CreditReport only has a masked ID reference). When
 * both sources report the same field and agree, confidence is HIGH and
 * there is no conflict. When they disagree, BOTH values are kept — the CCR-
 * verified value is treated as canonical only because it is the more
 * recently maintained of the two, never because the Lead-form value is
 * discarded. A field with no value from either source is reported as
 * unavailable, never defaulted to an empty string.
 */
export function reconcileIdentity(lead: LeadIdentityFact, customer: CustomerIdentityFact | null): IdentitySnapshot {
  const overlapping: Array<{ field: string; leadValue: string | null; customerValue: string | null }> = [
    { field: 'fullName', leadValue: lead.fullName, customerValue: customer?.fullName ?? null },
    { field: 'phone', leadValue: lead.phone, customerValue: customer?.phone ?? null },
    { field: 'email', leadValue: lead.email, customerValue: customer?.email ?? null },
    { field: 'city', leadValue: lead.city, customerValue: customer?.city ?? null },
  ]

  const fields: IdentityFieldResult[] = overlapping.map(({ field, leadValue, customerValue }) => {
    if (leadValue === null && customerValue === null) {
      return { field, canonicalValue: null, sourceValues: [], confidence: 'LOW', conflict: false }
    }
    if (leadValue !== null && customerValue !== null && leadValue !== customerValue) {
      return {
        field,
        canonicalValue: customerValue,
        sourceValues: [
          { value: leadValue, source: 'LEAD_FORM' },
          { value: customerValue, source: 'CCR_VERIFIED' },
        ],
        confidence: 'MEDIUM',
        conflict: true,
      }
    }
    const value = customerValue ?? leadValue!
    const source = customerValue !== null ? 'CCR_VERIFIED' : 'LEAD_FORM'
    return { field, canonicalValue: value, sourceValues: [{ value, source }], confidence: 'HIGH', conflict: false }
  })

  // Customer-only fields (no second source to conflict against).
  const customerOnly: Array<{ field: string; value: string | null }> = [
    { field: 'dateOfBirth', value: customer?.dateOfBirth?.toISOString().slice(0, 10) ?? null },
    { field: 'gender', value: customer?.gender ?? null },
    { field: 'occupation', value: customer?.occupation ?? null },
    { field: 'employmentType', value: customer?.employmentType ?? null },
    { field: 'companyName', value: customer?.companyName ?? null },
    { field: 'designation', value: customer?.designation ?? null },
  ]
  for (const { field, value } of customerOnly) {
    fields.push({
      field,
      canonicalValue: value,
      sourceValues: value !== null ? [{ value, source: 'CCR_VERIFIED' }] : [],
      confidence: value !== null ? 'HIGH' : 'LOW',
      conflict: false,
    })
  }

  // v3.0 §3.3 G6 ("Identity consistent (PAN + name)"): compare the PAN
  // hashes for equality when both exist — never the raw PAN itself, which
  // this schema never persists anywhere by design (see hashPan()'s own doc
  // comment). Both panRef values are HMACs of the same raw PAN under the
  // same pepper, so hash equality honestly answers "do these two sources
  // agree on identity" without ever needing the plaintext.
  const panRefConflict = lead.panRef !== null && customer?.panRef != null && lead.panRef !== customer.panRef

  return {
    fields,
    hasConflict: fields.some((f) => f.conflict) || panRefConflict,
    // Never the raw PAN itself — both Lead.panRef and Customer.panRef are
    // opaque hashed/vault references in this schema, by design.
    panAvailable: lead.panAvailable || (customer?.panAvailable ?? false),
    panRefConflict,
  }
}
