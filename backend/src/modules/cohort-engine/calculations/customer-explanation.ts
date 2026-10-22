import type { CohortPrimaryState, CohortRuleResultOutput } from '../cohort-engine.types'

/**
 * Spec §13.2/§24's own neutral customer-safe templates, verbatim/adapted —
 * deterministic, never AI-generated (see this module's own build notes:
 * "Rules over free-form AI" is the spec's first product principle).
 * Never names an internal archetype label, a rule ID, a cohort code, or
 * (per §13.1's own non-disclosure rules) the words "compliance,"
 * "investigation," or any specific compliance trigger — only
 * plain-language framing of what was observed and what happens next.
 */
const TEMPLATES: Record<CohortPrimaryState, string> = {
  CONSENT_PENDING: 'We need your consent before we can review your credit and financial information. Once provided, we can continue your assessment.',
  KYC_PENDING: 'We need to verify your identity documents before continuing. Please share the requested identity document so we can proceed.',
  X1: 'We need a bit more information to complete your assessment — our team will reach out with a short list of what is still required.',
  C6: 'Your case involves details that require a specialist review before we can recommend a standard pathway. This is a routine check, not a decision against you.',
  C5: 'We identified multiple active credit obligations and recent borrowing activity. Your current plan focuses first on stabilising monthly cash flow and preventing further debt accumulation before reassessing your options.',
  C4: 'Based on your current income and expenses, your existing obligations may not be sustainably serviceable through a standard plan. We will explore the resolution options available to you.',
  C3: 'Your income supports some repayment capacity, but your current debt structure needs to be restructured to fit comfortably within your budget.',
  C2: 'You may be eligible to have your eligible debts consolidated into a single, more manageable payment. This is an assessment, not a final approval.',
  C1: 'Based on your verified income and expenses, you appear ready for our standard stabilisation support, subject to final checks and your acceptance.',
  C7: 'Your account shows steady, improving payment behaviour. We will continue monitoring your progress as you rebuild your financial standing.',
  X2: 'Based on what we currently see, your situation does not require the kind of support this program provides right now.',
  MANUAL_REVIEW: 'Your case needs a closer look from our team before we can recommend a pathway — this ensures we give you accurate guidance.',
  CUSTOMER_UNRESPONSIVE: 'We have been unable to reach you. Please get in touch so we can continue your assessment.',
  // §13.1's non-disclosure rules: never name "compliance," "investigation," or the specific trigger — "verification" is the approved neutral word.
  COMPLIANCE_HOLD: 'We need to complete some verification before proceeding. Our team will contact you shortly.',
  DATA_REFRESH_REQUIRED: 'We need an updated bank statement to complete your assessment.',
  OTHER_ACCOUNTS_REQUIRED: 'To give you the best plan, we need statements from your other bank accounts.',
  P1_INFORMATION_REQUIRED: 'A few pieces of information are needed to finalize your profile.',
  SPECIALIST_REQUIRED: 'Your case involves details that require a specialist review before we can recommend a standard pathway. This is a routine check, not a decision against you.',
  CCR_REQUIRED: 'Our team needs to review your case directly before we can continue — this ensures we give you accurate guidance.',
}

/**
 * Builds the deterministic customer-safe explanation for a resolved
 * primary cohort — the fixed per-cohort template, never the matched
 * rules' own free-text reasons (those stay in the CCR-only rule-
 * evaluation table) to guarantee no internal vocabulary (rule IDs,
 * archetype labels, cohort codes, compliance triggers) ever leaks into
 * customer-facing text.
 */
export function buildCustomerExplanation(primaryCohort: CohortPrimaryState): string {
  return TEMPLATES[primaryCohort]
}

/**
 * v3.0 §17.1's exact 5-part customer explanation structure ("what we
 * found / what needs attention / what happens next / what we need from
 * you / what is not guaranteed"), built deterministically from the same
 * fixed templates plus the already-computed `requiredDocuments` list —
 * never free-text rule reasons, same non-disclosure discipline as
 * `buildCustomerExplanation` above.
 */
export function buildCustomerReasons(primaryCohort: CohortPrimaryState, requiredDocuments: string[]): string[] {
  const reasons = [TEMPLATES[primaryCohort]]
  if (requiredDocuments.length > 0) {
    reasons.push(`What we need from you: ${requiredDocuments.join(', ')}.`)
  }
  reasons.push('What happens next: our team will review your case and follow up with the next step.')
  reasons.push('What is not guaranteed: no plan or outcome is final until your information is complete and verified.')
  return reasons
}

/**
 * CCR-only internal reasons (§12/§17.1) — unlike the customer-facing
 * templates above, these MAY use rule IDs and matched-rule evidence
 * verbatim, since this array is never shown to a customer.
 */
export function buildInternalReasons(ruleResults: CohortRuleResultOutput[]): string[] {
  return ruleResults.filter((r) => r.matched).map((r) => `${r.ruleId}: ${r.reason}`)
}
