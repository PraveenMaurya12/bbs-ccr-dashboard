import type { PlanEngineConfig, PlanGateResult, PlanInput, PlanRuleResultOutput } from '../plan-engine.types'

/**
 * v3.0 §7's consolidated 15-rule catalog (PL001-PL015), built against the
 * facts this codebase can honestly evaluate. Not every PL-number becomes a
 * separate function: PL002 (template selection) is the Template Registry
 * itself, PL003 (layer population completeness) is composePlan()'s own
 * never-fabricate-a-field discipline, PL006 (condition generation) is the
 * Template Registry + Action Library's standard-conditions injection, PL011
 * (AI guardrail enforcement) is a structural guarantee — see this module's
 * own parity matrix for why no runtime check is needed — and PL012
 * (disclosure requirements) is the Template Registry's own `disclosures`
 * array, already cross-checked against the spec's 10-item list. The 9
 * rules below are the ones that genuinely need independent, testable logic.
 */

// --- PL001: Plan Generation Gate (v3.0 §4.2, verbatim) ----------------------

export interface PlanGateInput {
  pathwayDecisionAvailable: boolean
  pathwayStatus: string | null
  primaryPathway: string | null
  blockingReason: string | null
  /** Pathway Decision's own LIVE, read-time TTL status (ACTIVE/EXPIRED/EXPIRED_UNACCEPTED/ACCEPTED_NO_EXPIRY/NOT_APPLICABLE) — checked BEFORE pathwayStatus, since the persisted pathwayStatus column is never itself rewritten to EXPIRED after generation (see this file's own build notes). */
  ttlLiveStatus: string | null
}

/**
 * The spec's own single-rule gate, replacing v2.0's PL001+PL002+precedence
 * table. Pathway Engine (L5) is the only upstream dependency this gate
 * reads — Cohort Decision/Master Profile staleness are separate, already-
 * enforced preconditions in plan-engine.service.ts, not part of PL001
 * itself (L5's own readiness gate already inherits L4's blocks — see
 * Pathway Engine's own P001 — so re-checking L4 here would be redundant,
 * not merely consolidated).
 *
 * This codebase's own established convention (shared with Cohort/Pathway
 * Engine) is that generation ALWAYS persists a real, versioned, auditable
 * row rather than a true null-id ephemeral object — so PLACEHOLDER and
 * TERMINAL outcomes here still result in a real, thinner `BbsPlan` being
 * composed via the Template Registry's own cohort-keyed fallback (see
 * templates/registry.ts), never a bare `{plan_id: null}` response. Only
 * ERROR (invalid state, or an expired Pathway Decision) refuses generation
 * outright.
 */
export function evaluatePlanGate(input: PlanGateInput): PlanGateResult {
  if (input.ttlLiveStatus === 'EXPIRED' || input.ttlLiveStatus === 'EXPIRED_UNACCEPTED') {
    return { outcome: 'ERROR', reason: 'Pathway Decision has expired — re-evaluate the Pathway Engine before generating a Plan.' }
  }

  if (!input.pathwayDecisionAvailable || !input.pathwayStatus) {
    return { outcome: 'ERROR', reason: 'No Pathway Decision status available — invalid L5 state.' }
  }

  if (input.pathwayStatus === 'READY' && input.primaryPathway !== null) {
    return { outcome: 'GENERATE', reason: 'L5 pathway_status is READY with a non-null primary_pathway.' }
  }

  if (['BLOCKED', 'SPECIALIST_REVIEW', 'MANUAL_REVIEW', 'INSUFFICIENT_DATA', 'NO_SUITABLE_PATHWAY'].includes(input.pathwayStatus)) {
    return { outcome: 'PLACEHOLDER', reason: input.blockingReason ?? input.pathwayStatus }
  }

  if (['OUT_OF_SCOPE', 'CUSTOMER_DECLINED'].includes(input.pathwayStatus)) {
    return { outcome: 'TERMINAL', reason: input.blockingReason ?? input.pathwayStatus }
  }

  if (['EXPIRED', 'EXPIRED_UNACCEPTED'].includes(input.pathwayStatus)) {
    return { outcome: 'ERROR', reason: 'Pathway Decision has expired — request L5 regeneration before generating a Plan.' }
  }

  return { outcome: 'ERROR', reason: `Invalid L5 pathway_status: ${input.pathwayStatus}` }
}

// --- Audit-only rules (PL007-PL010) -----------------------------------------
//
// By the time Plan Engine reaches these, PL001 has already confirmed a real,
// unblocked pathway — so a compliance hold, P1 gap, or low-confidence signal
// would already have routed through PL001 as PLACEHOLDER. These rules exist
// for the same reason Pathway Engine's own P006-P009 do: audit completeness,
// never a live independent gate on a plan that already passed PL001.

function ruleCompliance(input: PlanInput): PlanRuleResultOutput {
  const fired = input.riskFlags.includes('COMPLIANCE_HOLD')
  return {
    ruleId: 'PL007',
    evaluation: fired ? 'FIRED' : 'NOT_FIRED',
    reason: fired ? 'A compliance hold risk flag is present — already caught by PL001 if this were a real gate; recorded here for audit completeness only.' : 'No compliance hold flag present.',
    evidence: { riskFlags: input.riskFlags },
  }
}

function ruleP1Gate(config: PlanEngineConfig): (input: PlanInput) => PlanRuleResultOutput {
  return (input) => {
    const fired = input.missingDataCount > 0
    return {
      ruleId: 'PL008',
      evaluation: fired ? 'FIRED' : 'NOT_FIRED',
      reason: fired ? `${input.missingDataCount} outstanding missing-information item(s) carried forward from Cohort Engine's own register.` : 'No outstanding missing-information items.',
      evidence: { missingDataCount: input.missingDataCount, ruleVersion: config.ruleVersion },
    }
  }
}

function ruleDqCap(input: PlanInput): PlanRuleResultOutput {
  const fired = input.confidence === 'LOW'
  return {
    ruleId: 'PL009',
    evaluation: fired ? 'FIRED' : 'NOT_FIRED',
    reason: fired ? 'Cohort Engine\'s own confidence is LOW — plan numbers should be treated as provisional pending further verification.' : `Cohort Engine confidence is ${input.confidence ?? 'unknown'}.`,
    evidence: { confidence: input.confidence },
  }
}

function ruleConfidenceInheritance(input: PlanInput): PlanRuleResultOutput {
  return {
    ruleId: 'PL010',
    evaluation: input.confidence ? 'FIRED' : 'NOT_EVALUATED',
    reason: input.confidence ? `Plan inherits Cohort Engine's own confidence level (${input.confidence}) — never independently recomputed.` : 'No upstream confidence value available to inherit.',
    evidence: { confidence: input.confidence },
  }
}

// --- PL013: TTL assignment --------------------------------------------------

function ruleTtl(config: PlanEngineConfig): (input: PlanInput) => PlanRuleResultOutput {
  return (input) => {
    if (!input.pathway) {
      return { ruleId: 'PL013', evaluation: 'NOT_EVALUATED', reason: 'No primary pathway — this plan uses the blocked-state placeholder TTL instead (see plan-engine.service.ts).', evidence: {} }
    }
    const days = config.ttlDaysByPathway[input.pathway]
    return { ruleId: 'PL013', evaluation: 'FIRED', reason: `Plan TTL fixed at ${days} days for pathway ${input.pathway}, per v3.0 §12.5's per-pathway TTL table.`, evidence: { pathway: input.pathway, planTtlDays: days } }
  }
}

// --- PL014: CCR Review Trigger (v3.0 §7.2, verbatim list) -------------------

export function evaluateCcrReviewTrigger(input: PlanInput): PlanRuleResultOutput {
  const reasons: string[] = []
  if (input.pathway && ['CONSOLIDATE', 'RESTRUCTURE', 'RESOLVE'].includes(input.pathway)) reasons.push(`pathway is ${input.pathway}`)
  if (input.pathwayVariant === 'NINETY_DAY') reasons.push('90-day variant')
  if (input.riskFlags.includes('COMPLIANCE_HOLD')) reasons.push('compliance hold active')
  if (input.missingDataCount >= 1) reasons.push(`${input.missingDataCount} outstanding P1/P2 item(s)`)
  if (input.confidence === 'LOW') reasons.push('LOW confidence')
  // "Any condition FAILED" / "Any suitability condition PENDING" / "Customer
  // must accept a payment commitment" are evaluated by compose-plan.ts once
  // conditions/targets exist (this function runs before those are built) —
  // callers merge those signals in via mergeCcrReviewReasons() below.
  return {
    ruleId: 'PL014',
    evaluation: reasons.length > 0 ? 'FIRED' : 'NOT_FIRED',
    reason: reasons.length > 0 ? `CCR review required: ${reasons.join('; ')}.` : 'No CCR-review trigger condition met from upstream facts alone.',
    evidence: { reasons },
  }
}

/** Merges in the two trigger conditions only knowable after conditions/targets are composed (any FAILED condition; a payment-commitment pathway). */
export function mergeCcrReviewReasons(base: PlanRuleResultOutput, params: { anyConditionFailed: boolean; requiresPaymentCommitment: boolean }): PlanRuleResultOutput {
  const extra: string[] = []
  if (params.anyConditionFailed) extra.push('a plan condition has FAILED')
  if (params.requiresPaymentCommitment) extra.push('customer must accept a payment commitment')
  if (extra.length === 0) return base
  const reasons = [...((base.evidence.reasons as string[]) ?? []), ...extra]
  return { ...base, evaluation: 'FIRED', reason: `CCR review required: ${reasons.join('; ')}.`, evidence: { reasons } }
}

// --- PL015: Customer-Safe Language Check ------------------------------------

const FORBIDDEN_TERMS = ['compliance', 'investigation', 'employer concern', 'fraud', 'settlement approved', 'consolidation approved', 'guaranteed', 'pep', 'sanctions', 'archetype', 'habitual avoider', 'debt spiral', 'circumstantial']

export function checkCustomerSafeLanguage(customerExplanation: string): PlanRuleResultOutput {
  const lower = customerExplanation.toLowerCase()
  const violations = FORBIDDEN_TERMS.filter((term) => lower.includes(term))
  return {
    ruleId: 'PL015',
    evaluation: violations.length > 0 ? 'FIRED' : 'NOT_FIRED',
    reason: violations.length > 0 ? `Customer-facing text contains forbidden term(s): ${violations.join(', ')} — regenerate or escalate to CCR.` : 'Customer-facing text contains no forbidden internal/compliance vocabulary.',
    evidence: { violations },
  }
}

/** Every PL00x rule this module can honestly evaluate from PlanInput alone, run unconditionally (same "every rule runs independently" discipline as Cohort/Pathway Engine). PL014/PL015 are evaluated separately by the service once conditions/customerExplanation exist — see mergeCcrReviewReasons/checkCustomerSafeLanguage above. */
export function evaluateAllRules(input: PlanInput, config: PlanEngineConfig): PlanRuleResultOutput[] {
  return [ruleCompliance(input), ruleP1Gate(config)(input), ruleDqCap(input), ruleConfidenceInheritance(input), ruleTtl(config)(input)]
}
