import type { BbsPlanActionOutput, BbsPlanActionOwner, PlanInput } from '../plan-engine.types'

/** Cohort Engine's own missing-data owner strings are free text (e.g. "Customer", "CCR") — normalized here to the 3-value action-owner vocabulary, defaulting to BBS (never fabricated as CUSTOMER/CREDITOR when ambiguous). */
function toActionOwner(owner: string): BbsPlanActionOwner {
  const normalized = owner.trim().toUpperCase()
  if (normalized.includes('CUSTOMER')) return 'CUSTOMER'
  if (normalized.includes('LENDER') || normalized.includes('CREDITOR')) return 'CREDITOR'
  return 'BBS'
}

/**
 * Surfaces each Cohort Decision missing-data item (the X1 path's own
 * field/why/document/owner/nextAction shape) as a concrete, trackable
 * plan action — never just restated as prose. Used for X1 and any other
 * thinner template whose `PlanInput.cohortMissingData` is non-empty.
 */
export function buildMissingDataActions(missingData: PlanInput['cohortMissingData']): BbsPlanActionOutput[] {
  return missingData.map((item, i) => ({
    actionId: `missing-data-${i + 1}`,
    ownerType: toActionOwner(item.owner),
    phase: 'IMMEDIATE',
    description: `${item.nextAction} — ${item.why}`,
    owner: item.owner,
    timing: 'Within 5 business days',
    evidenceRequired: item.document ? [item.document] : undefined,
    status: 'PENDING',
  }))
}
