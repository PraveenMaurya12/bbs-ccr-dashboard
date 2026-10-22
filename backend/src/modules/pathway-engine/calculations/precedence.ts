import type { CohortPathway, PathwayInput, PathwayPrecedenceResult, PathwayRuleResultOutput } from '../pathway-engine.types'

function ruleFired(results: PathwayRuleResultOutput[], ruleId: string): boolean {
  return results.some((r) => r.ruleId === ruleId && r.evaluation === 'FIRED')
}

/**
 * §9.3's own "C1 Disambiguation Matrix (COMPLETE)" — verbatim. Only
 * called when L4's primary cohort is C1.
 */
export function disambiguateC1(input: PathwayInput): CohortPathway | null {
  const overdue = (input.l4.currentOverdue ?? 0) > 0
  const capacity = input.l4.capacityBand
  const debtCycle = input.l4.debtCycleSignal
  const archetype = input.l4.archetype

  if (overdue) return 'STABILISE'
  if (capacity === 'STRESSED') return 'STABILISE'
  if (capacity === 'DISTRESSED') return 'STABILISE'
  if (capacity === 'TIGHT') {
    if (debtCycle) return 'STABILISE'
    if (archetype === 'CIRCUMSTANTIAL') return 'OPTIMISE'
    if (archetype === 'DEBT_SPIRAL') return 'STABILISE'
    if (archetype === 'HABITUAL_AVOIDER') return 'OPTIMISE' // with monitoring — see service.ts's own riskFlags handling
    return 'STABILISE' // UNCLASSIFIED archetype, no debt-cycle signal — rule's own default per the table row ordering (Tight falls through to STABILISE absent a clear OPTIMISE-qualifying archetype)
  }
  if (capacity === 'COMFORTABLE') return 'OPTIMISE'
  return null // capacity Unknown -> null (FCF_UNRECONCILED), handled by the caller via P005
}

/**
 * §9.4's own "OPTIMISE Outside C1" strict condition set — only called
 * when L4's primary cohort is C7. Returns true only when ALL 8 conditions
 * pass; the caller defaults to RECOVER otherwise (§7 row 13's own default).
 */
export function qualifiesForOptimiseOutsideC1(input: PathwayInput): boolean {
  const capacityOk = input.l4.capacityBand === 'TIGHT' || input.l4.capacityBand === 'COMFORTABLE'
  const fcfOk = input.l3.fcfReconciled === true
  const dsrOk = input.l3.masterDsrPercent !== null && input.l3.masterDsrPercent <= 40
  const noOverdue = (input.l4.currentOverdue ?? 0) === 0
  const noAdverseStatuses = !input.l4.legalStatusActive
  const noDebtCycle = !input.l4.debtCycleSignal
  const noComplianceHold = !input.l4.complianceHold
  const noP1Items = input.l3.p1Count === 0
  return capacityOk && fcfOk && dsrOk && noOverdue && noAdverseStatuses && noDebtCycle && noComplianceHold && noP1Items
}

/**
 * BBS Pathway Engine Module v3.0 §7's single authoritative, 14-row
 * precedence table, verbatim. Reads ONLY already-computed L4/L3 facts and
 * this file's own C1/C7 disambiguation helpers — never re-derives a raw
 * signal (that happens once, in normalize-input.ts, reading Cohort
 * Engine's own persisted rule evidence).
 */
export function resolvePathwayPrecedence(input: PathwayInput, ruleResults: PathwayRuleResultOutput[]): PathwayPrecedenceResult {
  const { l4 } = input

  // Priority 1 — L4 = BLOCKED (any reason).
  if (l4.primaryState === 'BLOCKED') {
    return {
      primaryPathway: null,
      pathwayStatus: 'BLOCKED',
      blockingReason: l4.primaryReasonCode,
      inheritedBlocks: [l4.primaryReasonCode, ...l4.secondaryFlags.map((f) => f.key)].filter((v): v is string => Boolean(v)),
      matchedPriority: 1,
      precedenceExplanation: `Priority 1: L4 is BLOCKED (${l4.primaryReasonCode}) — pathway is null, blocks inherited from L4 verbatim.`,
    }
  }

  // Priority 2 — L4 = X1.
  if (l4.primaryCohort === 'X1') {
    return { primaryPathway: null, pathwayStatus: 'INSUFFICIENT_DATA', blockingReason: 'INSUFFICIENT_DATA', inheritedBlocks: [], matchedPriority: 2, precedenceExplanation: 'Priority 2: L4 = X1 (Insufficient Data) — pathway is null.' }
  }

  // Priority 3 — L4 = X2.
  if (l4.primaryCohort === 'X2') {
    return { primaryPathway: null, pathwayStatus: 'OUT_OF_SCOPE', blockingReason: 'OUT_OF_SCOPE', inheritedBlocks: [], matchedPriority: 3, precedenceExplanation: 'Priority 3: L4 = X2 (Outside Current Program) — pathway is null.' }
  }

  // Priority 4 — L4 = C6 (Specialist Review).
  if (l4.primaryCohort === 'C6') {
    return { primaryPathway: null, pathwayStatus: 'SPECIALIST_REVIEW', blockingReason: 'SPECIALIST_REVIEW', inheritedBlocks: [], matchedPriority: 4, precedenceExplanation: 'Priority 4: L4 = C6 (Specialist Review) — pathway is null.' }
  }

  // Priorities 5/6 — defensive re-checks: Cohort Engine's own precedence
  // (§6.1 priorities 1.4/1.7/1.8) already routes a high exception count or
  // P1 count to a BLOCKED primary state before a real C1-C7 cohort is ever
  // assigned, so these should be structurally unreachable here — kept as
  // genuine, evaluated checks (not silently skipped) in case a future L4
  // change ever decouples the two.
  if (ruleFired(ruleResults, 'P015') && l4.exceptionTier === 'MANUAL_REVIEW') {
    return { primaryPathway: null, pathwayStatus: 'MANUAL_REVIEW', blockingReason: 'MANUAL_REVIEW', inheritedBlocks: [], matchedPriority: 5, precedenceExplanation: `Priority 5: exception count ${l4.exceptionCount} meets the manual-review threshold.` }
  }
  if (ruleFired(ruleResults, 'P015') && l4.exceptionTier === 'SPECIALIST') {
    return { primaryPathway: null, pathwayStatus: 'SPECIALIST_REVIEW', blockingReason: 'SPECIALIST_REVIEW', inheritedBlocks: [], matchedPriority: 5, precedenceExplanation: `Priority 5: exception count ${l4.exceptionCount} meets the specialist-review threshold.` }
  }
  if (ruleFired(ruleResults, 'P016')) {
    return { primaryPathway: null, pathwayStatus: 'INSUFFICIENT_DATA', blockingReason: 'INSUFFICIENT_DATA', inheritedBlocks: [], matchedPriority: 6, precedenceExplanation: `Priority 6: ${input.l3.p1Count} P1 item(s) outstanding.` }
  }

  // Priority 7 — FCF unreconciled >30%. Genuinely reachable: Cohort Engine
  // only CAPS the capacity band at STRESSED for this signal (R022), it
  // never blocks L4's own primary state on it.
  if (ruleFired(ruleResults, 'P005')) {
    return { primaryPathway: null, pathwayStatus: 'BLOCKED', blockingReason: 'FCF_UNRECONCILED', inheritedBlocks: ['FCF_UNRECONCILED'], matchedPriority: 7, precedenceExplanation: 'Priority 7: free cash flow is unreconciled (>30% gap) — capacity unverifiable, pathway is null.' }
  }

  // Priorities 8-13 — direct cohort -> pathway mapping, with C1/C7 disambiguation.
  switch (l4.primaryCohort) {
    case 'C4':
      return { primaryPathway: 'RESOLVE', pathwayStatus: 'READY', blockingReason: null, inheritedBlocks: [], matchedPriority: 8, precedenceExplanation: 'Priority 8: L4 = C4 -> RESOLVE.' }
    case 'C3':
      return { primaryPathway: 'RESTRUCTURE', pathwayStatus: 'READY', blockingReason: null, inheritedBlocks: [], matchedPriority: 9, precedenceExplanation: 'Priority 9: L4 = C3 -> RESTRUCTURE.' }
    case 'C2':
      return { primaryPathway: 'CONSOLIDATE', pathwayStatus: 'READY', blockingReason: null, inheritedBlocks: [], matchedPriority: 10, precedenceExplanation: 'Priority 10: L4 = C2 -> CONSOLIDATE.' }
    case 'C5':
      return { primaryPathway: 'STABILISE', pathwayStatus: 'READY', blockingReason: null, inheritedBlocks: [], matchedPriority: 11, precedenceExplanation: 'Priority 11: L4 = C5 -> STABILISE.' }
    case 'C1': {
      const pathway = disambiguateC1(input)
      if (pathway === null) {
        return { primaryPathway: null, pathwayStatus: 'BLOCKED', blockingReason: 'FCF_UNRECONCILED', inheritedBlocks: ['FCF_UNRECONCILED'], matchedPriority: 12, precedenceExplanation: 'Priority 12: L4 = C1 with Unknown capacity band — §9.3\'s own disambiguation matrix routes to null (FCF_UNRECONCILED).' }
      }
      return { primaryPathway: pathway, pathwayStatus: 'READY', blockingReason: null, inheritedBlocks: [], matchedPriority: 12, precedenceExplanation: `Priority 12: L4 = C1 -> ${pathway} per §9.3's own disambiguation matrix.` }
    }
    case 'C7': {
      const toOptimise = qualifiesForOptimiseOutsideC1(input)
      return { primaryPathway: toOptimise ? 'OPTIMISE' : 'RECOVER', pathwayStatus: 'READY', blockingReason: null, inheritedBlocks: [], matchedPriority: 13, precedenceExplanation: toOptimise ? "Priority 13: L4 = C7, but §9.4's own strict OPTIMISE-outside-C1 condition set is fully met -> OPTIMISE." : 'Priority 13: L4 = C7 -> RECOVER (default; §9.4\'s own OPTIMISE-outside-C1 conditions are not all met).' }
    }
    default:
      // Priority 14 — no match.
      return { primaryPathway: null, pathwayStatus: 'MANUAL_REVIEW', blockingReason: 'MANUAL_REVIEW', inheritedBlocks: [], matchedPriority: 14, precedenceExplanation: `Priority 14: no precedence row matched L4 cohort ${l4.primaryCohort} — routed to MANUAL_REVIEW rather than an arbitrary default.` }
  }
}
