import type { CohortPathway, CustomerReason, PathwayInput, PathwayStatus } from '../pathway-engine.types'

/** §16.2 — Standard Pathway Messages, verbatim. */
const PATHWAY_MESSAGES: Record<CohortPathway, { step: string; why: string; means: string }> = {
  OPTIMISE: { step: 'Focus on financial organisation and stability.', why: 'Your current obligations appear manageable. Small adjustments to budgeting and payment timing can help you stay on track.', means: "No major restructuring is needed. We'll help you organise and monitor your finances." },
  STABILISE: { step: 'First, stabilise your immediate financial position.', why: "You're currently under some financial pressure, and we need to understand what you can sustainably afford before recommending next steps.", means: 'Any structured support will depend on verification, eligibility, and availability.' },
  CONSOLIDATE: { step: 'Evaluate whether your multiple loans can be combined.', why: 'Combining obligations into a single repayment may be more manageable — but this depends on affordability, product availability, and lender approval.', means: "No consolidation is guaranteed. We'll assess carefully first." },
  RESTRUCTURE: { step: 'Explore revising your current repayment structure.', why: 'Your current repayment structure may not be sustainable. A revised arrangement may be possible.', means: "This depends on your lender's options and their approval." },
  RESOLVE: { step: 'Evaluate resolution options with specialist support.', why: 'Current obligations appear unsustainable. Working with your creditors may help find a lawful arrangement.', means: 'No specific outcome can be guaranteed.' },
  RECOVER: { step: 'Focus on maintaining stability and rebuilding financial health.', why: "You've made progress. Now the priority is preventing recurrence and strengthening your financial position.", means: 'Long-term monitoring and support.' },
}

/** §16.3 — Block-Type-Specific Messages (NEW in v3.0), verbatim. */
const BLOCK_MESSAGES: Record<string, { step: string; detail: string }> = {
  COMPLIANCE_HOLD: { step: 'Our team is completing final verification. No action required from you at this time.', detail: "We'll contact you within 2 business days once verification is complete." },
  DATA_REFRESH_REQUIRED: { step: 'Please provide an updated bank statement covering the recent period.', detail: "Once we receive it, we'll continue your assessment." },
  OTHER_ACCOUNTS_REQUIRED: { step: 'Please provide statements from any other bank accounts you hold.', detail: 'These will help us complete your financial picture.' },
  P1_INFORMATION_REQUIRED: { step: 'We need a few more details to complete your profile.', detail: "Our team will contact you within 2 business days." },
  MANUAL_REVIEW: { step: 'Our team is reviewing your case. No action required from you at this time.', detail: "We'll contact you within 2 business days." },
  SPECIALIST_REVIEW: { step: 'Our team is reviewing your case. No action required from you at this time.', detail: "We'll contact you within 2 business days." },
  INSUFFICIENT_DATA: { step: 'We need a few more details to complete your profile.', detail: "Our team will contact you within 2 business days." },
  OUT_OF_SCOPE: { step: 'Based on your current situation, this programme is not the right fit right now.', detail: 'You can re-engage with BBS at any time if your situation changes.' },
  FCF_UNRECONCILED: { step: 'We need to verify a few details about your income and expenses.', detail: "Our team will contact you to confirm a few figures." },
  CONSENT_PENDING: { step: 'We need your consent before we can continue.', detail: 'Please complete the consent step to proceed.' },
  KYC_PENDING: { step: 'We need to verify your identity before we can continue.', detail: 'Please complete identity verification to proceed.' },
  CUSTOMER_DECLINED: { step: 'Case closed per your request.', detail: 'You can re-engage with BBS at any time by providing fresh consent.' },
}

/** §16.4 — fraud/PEP/sanctions triggers must NEVER be disclosed. These reason codes never reach this function's normal path (Cohort Engine's own COMPLIANCE_HOLD reason code is the only one ever surfaced to Pathway Engine — the specific underlying trigger, e.g. PEP_MATCH/SANCTIONS_MATCH/FRAUD_INDICATOR, is Master Profile/Compliance-internal and is never passed down this far), but this constant documents the rule explicitly so no future change accidentally surfaces one. */
const NEVER_DISCLOSE_REASONS: ReadonlySet<string> = new Set(['PEP_MATCH', 'SANCTIONS_MATCH', 'FRAUD_INDICATOR'])

export function buildCustomerReasons(pathway: CohortPathway | null, pathwayStatus: PathwayStatus, blockingReason: string | null): CustomerReason[] {
  if (pathway) {
    const msg = PATHWAY_MESSAGES[pathway]
    return [
      { tier: 'primary', text: msg.step },
      { tier: 'detail', text: msg.why },
      { tier: 'detail', text: msg.means },
    ]
  }
  const reasonKey = blockingReason && !NEVER_DISCLOSE_REASONS.has(blockingReason) ? blockingReason : pathwayStatus
  const msg = BLOCK_MESSAGES[reasonKey] ?? BLOCK_MESSAGES[pathwayStatus] ?? { step: 'Our team is reviewing your case. No action required from you at this time.', detail: "We'll contact you shortly." }
  return [
    { tier: 'primary', text: msg.step },
    { tier: 'detail', text: msg.detail },
  ]
}

/** §10.4 — Pathway Engine never generates next_actions when blocked (inherits from L4). A lightweight, pathway-LEVEL "what happens first" list when READY — distinct from Plan Engine's own detailed, per-customer execution roadmap (L6's responsibility). */
const READY_NEXT_ACTIONS: Record<CohortPathway, string[]> = {
  OPTIMISE: ['Review current budgeting and payment timing with your CCR.', 'Set up monitoring for the next review cycle.'],
  STABILISE: ['CCR to confirm sustainable repayment capacity.', 'Document any temporary support arrangements.'],
  CONSOLIDATE: ['CCR to assess consolidation product availability.', 'Confirm affordability of a combined repayment.'],
  RESTRUCTURE: ['CCR to prepare a restructuring proposal for the affected lender(s).', 'Confirm lender restructuring options.'],
  RESOLVE: ['CCR/specialist to evaluate resolution options with creditors.', 'Confirm legal/specialist review is complete.'],
  RECOVER: ['CCR to confirm monitoring cadence.', 'Review progress against success criteria.'],
}

export function buildNextActions(pathway: CohortPathway | null, pathwayStatus: PathwayStatus): string[] | null {
  if (pathway === null || pathwayStatus !== 'READY') return null
  return READY_NEXT_ACTIONS[pathway]
}

/** §9.5's own exception: C1 + Distressed capacity + multiple obligations -> STABILISE primary with a CONSOLIDATE sequencing hint. */
export function buildSequencingHint(input: PathwayInput, primaryPathway: CohortPathway | null): { naturalNext: CohortPathway; trigger: string } | null {
  if (primaryPathway !== 'STABILISE') return null
  if (input.l4.primaryCohort !== 'C1') return null
  if (input.l4.capacityBand !== 'DISTRESSED') return null
  if ((input.l4.activeAccounts ?? 0) < 2) return null
  return { naturalNext: 'CONSOLIDATE', trigger: 'Capacity stabilization verified' }
}

export function buildInternalReasons(input: PathwayInput, matchedPriority: number, primaryPathway: CohortPathway | null, pathwayStatus: PathwayStatus): string[] {
  const reasons: string[] = [`Priority ${matchedPriority} matched in §7's own precedence table.`]
  if (pathwayStatus === 'BLOCKED' || pathwayStatus === 'INSUFFICIENT_DATA' || pathwayStatus === 'OUT_OF_SCOPE' || pathwayStatus === 'SPECIALIST_REVIEW' || pathwayStatus === 'MANUAL_REVIEW') {
    reasons.push(`L4 primary state: ${input.l4.primaryState}${input.l4.primaryReasonCode ? ` (${input.l4.primaryReasonCode})` : ''} — pathway cannot be selected.`)
  } else if (primaryPathway) {
    reasons.push(`L4 cohort ${input.l4.primaryCohort} -> ${primaryPathway}.`)
    if (input.l4.capacityBand) reasons.push(`Capacity band: ${input.l4.capacityBand}.`)
    if (input.l4.archetype && input.l4.archetype !== 'UNCLASSIFIED') reasons.push(`Archetype (secondary signal only): ${input.l4.archetype}.`)
  }
  if (input.l4.manualReviewRequired) reasons.push('L4 flagged manual review required.')
  return reasons
}
