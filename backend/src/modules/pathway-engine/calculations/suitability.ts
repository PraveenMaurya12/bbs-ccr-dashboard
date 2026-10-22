import type { CohortPathway, PathwayInput, SuitabilityCondition, SuitabilityEvaluation } from '../pathway-engine.types'

function cond(condition: string, status: SuitabilityCondition['status'], source: string): SuitabilityCondition {
  return { condition, status, source }
}

const UNKNOWN_NO_INTEGRATION = 'No live integration exists in this codebase for this condition — never fabricated as MET or FAILED.'

function capacityAtLeastTight(band: PathwayInput['l4']['capacityBand']): boolean {
  return band === 'TIGHT' || band === 'COMFORTABLE'
}

/** §5.2.1 — OPTIMISE. */
function evaluateOptimise(input: PathwayInput): SuitabilityCondition[] {
  const { l4, l3 } = input
  return [
    cond('Capacity band >= Tight', capacityAtLeastTight(l4.capacityBand) ? 'MET' : l4.capacityBand ? 'FAILED' : 'UNKNOWN', 'L4'),
    cond('No current overdue', l4.currentOverdue === null ? 'UNKNOWN' : l4.currentOverdue === 0 ? 'MET' : 'FAILED', 'L1 (via L4 R008 evidence)'),
    cond('No adverse statuses', l4.legalStatusActive ? 'FAILED' : 'MET', 'L1 (via L4 R006)'),
    cond('FCF reconciled', l3.fcfReconciled === null ? 'UNKNOWN' : l3.fcfReconciled ? 'MET' : 'FAILED', 'L2'),
    cond('Master DSR <= 40%', l3.masterDsrPercent === null ? 'UNKNOWN' : l3.masterDsrPercent <= 40 ? 'MET' : 'FAILED', 'L3'),
    cond('No debt-cycle signals', l4.debtCycleSignal ? 'FAILED' : 'MET', 'L4'),
    cond('No compliance hold', l4.complianceHold ? 'FAILED' : 'MET', 'L4'),
    cond('No P1 items', l3.p1Count === 0 ? 'MET' : 'FAILED', 'L3'),
  ]
}

/** §5.2.2 — STABILISE. */
function evaluateStabilise(input: PathwayInput): SuitabilityCondition[] {
  const { l4 } = input
  const distressOrOverdue = l4.debtCycleSignal || (l4.currentOverdue ?? 0) > 0
  return [
    cond('Capacity in {Tight, Stressed}', l4.capacityBand === 'TIGHT' || l4.capacityBand === 'STRESSED' ? 'MET' : l4.capacityBand ? 'FAILED' : 'UNKNOWN', 'L4'),
    cond('Distress signal OR overdue', l4.currentOverdue === null ? 'UNKNOWN' : distressOrOverdue ? 'MET' : 'FAILED', 'L1/L4'),
  ]
}

/** §5.2.3 — CONSOLIDATE. */
function evaluateConsolidate(input: PathwayInput): SuitabilityCondition[] {
  const { l4, l3 } = input
  return [
    cond('Capacity >= Tight', capacityAtLeastTight(l4.capacityBand) ? 'MET' : l4.capacityBand ? 'FAILED' : 'UNKNOWN', 'L4'),
    cond('FCF reconciled', l3.fcfReconciled === null ? 'UNKNOWN' : l3.fcfReconciled ? 'MET' : 'FAILED', 'L2'),
    cond('2+ eligible active obligations', l4.activeAccounts === null ? 'UNKNOWN' : l4.activeAccounts >= 2 ? 'MET' : 'FAILED', 'L1 (via L4 R012 evidence)'),
    cond('No debt-cycle signals', l4.debtCycleSignal ? 'FAILED' : 'MET', 'L4'),
    cond('Approved product available', 'UNKNOWN', 'L6 pre-check — ' + UNKNOWN_NO_INTEGRATION),
    cond('Master DSR <= 50%', l3.masterDsrPercent === null ? 'UNKNOWN' : l3.masterDsrPercent <= 50 ? 'MET' : 'FAILED', 'L3'),
    cond('No compliance hold', l4.complianceHold ? 'FAILED' : 'MET', 'L4'),
    cond('No P1 items', l3.p1Count === 0 ? 'MET' : 'FAILED', 'L3'),
  ]
}

/** §5.2.4 — RESTRUCTURE. */
function evaluateRestructure(input: PathwayInput): SuitabilityCondition[] {
  const { l4, l3 } = input
  return [
    cond('Capacity in {Tight, Stressed}', l4.capacityBand === 'TIGHT' || l4.capacityBand === 'STRESSED' ? 'MET' : l4.capacityBand ? 'FAILED' : 'UNKNOWN', 'L4'),
    cond('Master DSR > 40%', l3.masterDsrPercent === null ? 'UNKNOWN' : l3.masterDsrPercent > 40 ? 'MET' : 'FAILED', 'L3'),
    cond('Lender restructuring option available', 'UNKNOWN', 'External — ' + UNKNOWN_NO_INTEGRATION),
    cond('No compliance hold', l4.complianceHold ? 'FAILED' : 'MET', 'L4'),
    cond('No P1 items', l3.p1Count === 0 ? 'MET' : 'FAILED', 'L3'),
  ]
}

/** §5.2.5 — RESOLVE. */
function evaluateResolve(input: PathwayInput): SuitabilityCondition[] {
  const { l4 } = input
  return [
    cond('Capacity = Distressed', l4.capacityBand === 'DISTRESSED' ? 'MET' : l4.capacityBand ? 'FAILED' : 'UNKNOWN', 'L4'),
    cond('Other standard pathways assessed', 'MET', 'L5 — the alternative-pathway algorithm (§8) always evaluates all 5 other pathways before RESOLVE is confirmed primary.'),
    cond('Legal/specialist review completed', l4.legalStatusActive ? 'UNKNOWN' : 'MET', 'L4 — no legal/specialist signal is active, so no review is outstanding; if one were active, L4 would already be BLOCKED/SPECIALIST_REQUIRED (caught upstream of this pathway ever being reached).'),
    cond('No compliance hold (or cleared)', l4.complianceHold ? 'FAILED' : 'MET', 'L4'),
  ]
}

/** §5.2.6 — RECOVER. */
function evaluateRecover(input: PathwayInput): SuitabilityCondition[] {
  const { l4 } = input
  return [
    cond('Acute distress resolved', l4.currentOverdue === null ? 'UNKNOWN' : l4.currentOverdue === 0 && !l4.legalStatusActive ? 'MET' : 'FAILED', 'L1/L4'),
    cond('Agreed repayment/resolution active', l4.lifecycleState === 'ACTIVE' || l4.lifecycleState === 'COMPLETED' ? 'MET' : l4.lifecycleState ? 'FAILED' : 'UNKNOWN', 'L4 lifecycle'),
    cond('No critical blockers', l4.complianceHold || l4.legalStatusActive ? 'FAILED' : 'MET', 'L4'),
    cond('Capacity >= Tight', capacityAtLeastTight(l4.capacityBand) ? 'MET' : l4.capacityBand ? 'FAILED' : 'UNKNOWN', 'L4'),
  ]
}

const EVALUATORS: Record<CohortPathway, (input: PathwayInput) => SuitabilityCondition[]> = {
  OPTIMISE: evaluateOptimise,
  STABILISE: evaluateStabilise,
  CONSOLIDATE: evaluateConsolidate,
  RESTRUCTURE: evaluateRestructure,
  RESOLVE: evaluateResolve,
  RECOVER: evaluateRecover,
}

/**
 * §5.2/§5.3 — evaluates one pathway's own suitability conditions and
 * returns the met/total score §8.2 needs ("suitability_score =
 * met_conditions / total_conditions"). An UNKNOWN condition counts toward
 * neither met nor failed — it is excluded from `totalCount` entirely,
 * since this codebase has no honest way to say a condition requiring a
 * live external integration (product availability, lender approval) is
 * actually satisfied or not; counting it as FAILED would unfairly
 * penalize a pathway for a gap in THIS codebase, not in the customer's
 * own facts.
 */
export function evaluateSuitability(pathway: CohortPathway, input: PathwayInput): SuitabilityEvaluation {
  const conditions = EVALUATORS[pathway](input)
  const knownConditions = conditions.filter((c) => c.status !== 'UNKNOWN')
  const metCount = knownConditions.filter((c) => c.status === 'MET').length
  const totalCount = knownConditions.length
  const suitabilityScore = totalCount === 0 ? 0 : metCount / totalCount
  return { pathway, conditions, metCount, totalCount, suitabilityScore }
}

export const ALL_PATHWAYS: CohortPathway[] = ['OPTIMISE', 'STABILISE', 'CONSOLIDATE', 'RESTRUCTURE', 'RESOLVE', 'RECOVER']
