import type { PathwayInput, PathwayRuleResultOutput } from '../pathway-engine.types'

function result(ruleId: string, ruleVersion: string, evaluation: PathwayRuleResultOutput['evaluation'], severity: PathwayRuleResultOutput['severity'], reason: string, evidence: PathwayRuleResultOutput['evidence'], sourceFields: string[]): PathwayRuleResultOutput {
  return { ruleId, ruleVersion, evaluation, severity, reason, evidence, sourceFields }
}

/** P001 — L4 Gate + Block Inheritance (Merged, §6.2): BLOCKED/X1/X2/C6 -> null pathway, FIRED. C1-C7 (real cohorts) -> proceed, NOT_FIRED. */
export function p001GateAndBlockInheritance(input: PathwayInput, v: string): PathwayRuleResultOutput {
  const { primaryState, primaryCohort, primaryReasonCode } = input.l4
  if (primaryState === 'BLOCKED') {
    return result('P001', v, 'FIRED', 'HIGH', `L4 primary state is BLOCKED (${primaryReasonCode}) — pathway is null, blocks inherited.`, { primaryState, primaryReasonCode }, ['l4.primaryState', 'l4.primaryReasonCode'])
  }
  if (primaryCohort === 'X1' || primaryCohort === 'X2' || primaryCohort === 'C6') {
    return result('P001', v, 'FIRED', 'HIGH', `L4 primary cohort is ${primaryCohort} — pathway is null, reason set from L4 state.`, { primaryCohort }, ['l4.primaryCohort'])
  }
  if (primaryState && ['C1', 'C2', 'C3', 'C4', 'C5', 'C7'].includes(primaryState)) {
    return result('P001', v, 'NOT_FIRED', 'HIGH', `L4 primary cohort ${primaryCohort} is a real terminal cohort — proceeding to pathway evaluation.`, { primaryCohort }, ['l4.primaryCohort'])
  }
  return result('P001', v, 'UNKNOWN', 'HIGH', 'No L4 decision is available for this lead.', { primaryState, primaryCohort }, ['l4.primaryState'])
}

/** P002 — Cohort -> Pathway mapping (hard rule): precondition L4 primary state in {C1-C7}. */
export function p002CohortToPathwayMapping(input: PathwayInput, gate: PathwayRuleResultOutput, v: string): PathwayRuleResultOutput {
  if (gate.evaluation !== 'NOT_FIRED') {
    return result('P002', v, 'NOT_EVALUATED', 'HIGH', 'Precondition fails — L4 is not a real terminal cohort.', {}, ['l4.primaryState'])
  }
  return result('P002', v, 'FIRED', 'HIGH', `Cohort ${input.l4.primaryCohort} maps to a pathway per §6.1/§7's own precedence table.`, { primaryCohort: input.l4.primaryCohort }, ['l4.primaryCohort'])
}

/** P003 — Capacity band -> pathway (soft rule): precondition capacity band != Unknown. */
export function p003CapacityBandToPathway(input: PathwayInput, gate: PathwayRuleResultOutput, v: string): PathwayRuleResultOutput {
  if (gate.evaluation !== 'NOT_FIRED') return result('P003', v, 'NOT_EVALUATED', 'MEDIUM', 'Precondition fails — L4 is not a real terminal cohort.', {}, ['l4.primaryState'])
  const known = input.l4.capacityBand !== null && input.l4.capacityBand !== 'UNKNOWN'
  return result('P003', v, known ? 'FIRED' : 'NOT_FIRED', 'MEDIUM', known ? `Capacity band is ${input.l4.capacityBand} — usable for pathway disambiguation.` : 'Capacity band is Unknown — cannot disambiguate on capacity alone.', { capacityBand: input.l4.capacityBand }, ['l4.capacityBand'])
}

/** P004 — Archetype influence (soft signal, §4.4): never decisive, informs preference only. */
export function p004ArchetypeInfluence(input: PathwayInput, v: string): PathwayRuleResultOutput {
  const known = input.l4.archetype !== null && input.l4.archetype !== 'UNCLASSIFIED'
  return result('P004', v, known ? 'FIRED' : 'NOT_FIRED', 'LOW', known ? `Archetype ${input.l4.archetype} informs pathway preference (secondary signal only — never decisive, §4.4's own rule).` : 'No determinate archetype to inform preference.', { archetype: input.l4.archetype }, ['l4.archetype'])
}

/** P005 — FCF reconciliation gate (hard gate, §6.1 priority 7): fires (blocks) when FCF is unreconciled. */
export function p005FcfReconciliationGate(input: PathwayInput, v: string): PathwayRuleResultOutput {
  if (input.l3.fcfReconciled === null) return result('P005', v, 'NOT_EVALUATED', 'HIGH', 'FCF reconciliation data is not available.', {}, ['l3.fcfReconciled'])
  const matched = input.l3.fcfReconciled === false
  return result('P005', v, matched ? 'FIRED' : 'NOT_FIRED', 'HIGH', matched ? 'Free cash flow is unreconciled (>30% gap) — pathway cannot be confirmed until resolved.' : 'Free cash flow is reconciled.', { fcfReconciled: input.l3.fcfReconciled }, ['l3.fcfReconciled'])
}

/** P006 — Compliance gate (hard gate): already folded into L4=BLOCKED (§7's own consolidation note) — evaluated here for audit completeness only, never independently changes precedence. */
export function p006ComplianceGate(input: PathwayInput, v: string): PathwayRuleResultOutput {
  return result('P006', v, input.l4.complianceHold ? 'FIRED' : 'NOT_FIRED', 'HIGH', input.l4.complianceHold ? `Compliance hold active (${input.l4.complianceReason ?? 'reason not specified'}) — already reflected in L4's own BLOCKED state (P001).` : 'No compliance hold is active.', { complianceHold: input.l4.complianceHold, complianceReason: input.l4.complianceReason }, ['l4.complianceHold', 'l4.complianceReason'])
}

/** P007 — Specialist review gate (hard gate): L4 specialist-review-required or C6. */
export function p007SpecialistReviewGate(input: PathwayInput, v: string): PathwayRuleResultOutput {
  const matched = input.l4.specialistReviewRequired || input.l4.primaryCohort === 'C6'
  return result('P007', v, matched ? 'FIRED' : 'NOT_FIRED', 'HIGH', matched ? 'Specialist review is required — already reflected in L4\'s own routing (P001/P007).' : 'No specialist review is required.', { specialistReviewRequired: input.l4.specialistReviewRequired, primaryCohort: input.l4.primaryCohort }, ['l4.specialistReviewRequired', 'l4.primaryCohort'])
}

/** P008 — Post-statement debt gate (hard gate): audit-only re-exposure of L4's own DATA_REFRESH_REQUIRED routing (already caught by P001). */
export function p008PostStatementDebtGate(input: PathwayInput, v: string): PathwayRuleResultOutput {
  const matched = input.l4.primaryReasonCode === 'DATA_REFRESH_REQUIRED' || input.l4.secondaryFlags.some((f) => f.key === 'DATA_REFRESH_REQUIRED')
  return result('P008', v, matched ? 'FIRED' : 'NOT_FIRED', 'HIGH', matched ? 'Post-statement debt block is active at L4 — already reflected in P001.' : 'No post-statement debt block is active.', { matched }, ['l4.primaryReasonCode', 'l4.secondaryFlags'])
}

/** P009 — Other accounts gate (hard gate): audit-only re-exposure of L4's own OTHER_ACCOUNTS_REQUIRED routing. */
export function p009OtherAccountsGate(input: PathwayInput, v: string): PathwayRuleResultOutput {
  const matched = input.l4.primaryReasonCode === 'OTHER_ACCOUNTS_REQUIRED' || input.l4.secondaryFlags.some((f) => f.key === 'OTHER_ACCOUNTS_REQUIRED')
  return result('P009', v, matched ? 'FIRED' : 'NOT_FIRED', 'HIGH', matched ? 'Other-accounts block is active at L4 — already reflected in P001.' : 'No other-accounts block is active.', { matched }, ['l4.primaryReasonCode', 'l4.secondaryFlags'])
}

/** P010 — Resolution capacity inheritance (hard rule): copies L3's resolutionCapacity through verbatim. */
export function p010ResolutionCapacityInheritance(input: PathwayInput, v: string): PathwayRuleResultOutput {
  if (input.l3.resolutionCapacity === null) return result('P010', v, 'NOT_EVALUATED', 'MEDIUM', 'L3 has not provided a resolution capacity rating.', {}, ['l3.resolutionCapacity'])
  return result('P010', v, 'FIRED', 'MEDIUM', `Resolution capacity ${input.l3.resolutionCapacity} inherited from L3 verbatim.`, { resolutionCapacity: input.l3.resolutionCapacity }, ['l3.resolutionCapacity'])
}

/** P011 — Product availability check (hard gate): no live lender/product-availability integration exists anywhere in this codebase — always NOT_EVALUATED, never fabricated. */
export function p011ProductAvailabilityCheck(v: string): PathwayRuleResultOutput {
  return result('P011', v, 'NOT_EVALUATED', 'MEDIUM', 'No live product-availability integration exists in this codebase — never fabricated as available or unavailable.', {}, [])
}

/** P012 — Lender approval requirement (soft gate): same reason as P011. */
export function p012LenderApprovalRequirement(v: string): PathwayRuleResultOutput {
  return result('P012', v, 'NOT_EVALUATED', 'LOW', 'No live lender-approval integration exists in this codebase.', {}, [])
}

/** P013 — Data quality band cap (soft rule, §4.3): caps pathway confidence at the DQ band's ceiling. */
export function p013DataQualityBandCap(input: PathwayInput, v: string): PathwayRuleResultOutput {
  if (input.l3.dataQualityBand === null) return result('P013', v, 'NOT_EVALUATED', 'MEDIUM', 'Data Quality band is not available.', {}, ['l3.dataQualityBand'])
  return result('P013', v, 'FIRED', 'MEDIUM', `Data Quality band ${input.l3.dataQualityBand} caps pathway confidence per §4.3's own table.`, { dataQualityBand: input.l3.dataQualityBand }, ['l3.dataQualityBand'])
}

/** P014 — Dimension confidence cap (soft rule, §4.1/§4.2 Method A): the MIN() of the 4 named dimensions. */
export function p014DimensionConfidenceCap(input: PathwayInput, v: string): PathwayRuleResultOutput {
  const { incomeCashFlowConfidence, alignmentCapacityConfidence } = input.l3
  if (incomeCashFlowConfidence === null || alignmentCapacityConfidence === null || input.l4.confidence === null) {
    return result('P014', v, 'NOT_EVALUATED', 'MEDIUM', 'One or more of the 4 confidence dimensions is not available.', {}, ['l3.incomeCashFlowConfidence', 'l3.alignmentCapacityConfidence', 'l4.confidence'])
  }
  return result('P014', v, 'FIRED', 'MEDIUM', 'All 4 confidence dimensions are available — Method A (MIN of dimensions) applied.', { incomeCashFlowConfidence, alignmentCapacityConfidence, l4Confidence: input.l4.confidence }, ['l3.incomeCashFlowConfidence', 'l3.alignmentCapacityConfidence', 'l4.confidence'])
}

/**
 * P015 — Exception count threshold (hard gate, §6.1 priorities 5/1.7-1.8):
 * audit-only re-exposure — Cohort Engine's own precedence already blocks
 * on this via L4's BLOCKED/SPECIALIST_REQUIRED or
 * BLOCKED/MANUAL_REVIEW_REQUIRED routing (caught by P001). Thresholds are
 * deliberately NOT re-declared here — this reads Cohort Engine's own
 * already-computed `exceptionTier` verbatim (Cohort Engine's own
 * `cohortEngine.exceptionSpecialistThreshold`/`exceptionManualReviewThreshold`
 * config, the single source of truth for this signal).
 */
export function p015ExceptionCountThreshold(input: PathwayInput, v: string): PathwayRuleResultOutput {
  const tier = input.l4.exceptionTier
  if (tier === null) return result('P015', v, 'NOT_EVALUATED', 'MEDIUM', 'Exception count is not available from L4.', {}, ['l4.exceptionTier'])
  const matched = tier !== 'NONE'
  return result('P015', v, matched ? 'FIRED' : 'NOT_FIRED', tier === 'MANUAL_REVIEW' ? 'HIGH' : tier === 'SPECIALIST' ? 'MEDIUM' : 'LOW', matched ? `Exception count ${input.l4.exceptionCount} meets the ${tier} threshold — already reflected in L4's own routing (P001).` : `Exception count ${input.l4.exceptionCount} is within the standard threshold.`, { exceptionCount: input.l4.exceptionCount, tier }, ['l4.exceptionCount', 'l4.exceptionTier'])
}

/**
 * P016 — P1 missing info threshold (hard gate, §6.1 priority 1.4):
 * audit-only re-exposure — already caught by P001 via L4's own
 * BLOCKED/P1_INFORMATION_REQUIRED routing. `threshold` is passed in from
 * Cohort Engine's own `cohortEngine.p1ForceBlockThreshold` config — the
 * single source of truth for this signal, never re-declared here.
 */
export function p016P1MissingInfoThreshold(input: PathwayInput, threshold: number, v: string): PathwayRuleResultOutput {
  const matched = input.l3.p1Count >= threshold
  const limited = input.l3.p1Count > 0 && input.l3.p1Count < threshold
  return result('P016', v, matched ? 'FIRED' : 'NOT_FIRED', matched ? 'HIGH' : limited ? 'MEDIUM' : 'LOW', matched ? `${input.l3.p1Count} P1 item(s) outstanding — already reflected in L4's own routing (P001).` : limited ? `${input.l3.p1Count} P1 item(s) outstanding (flagged, below the blocking threshold).` : 'No P1 items are outstanding.', { p1Count: input.l3.p1Count, threshold }, ['l3.p1Count'])
}

/** P017 — Sequential pathway logic (soft rule, §13): precondition a prior PathwayDecision exists for this lead. */
export function p017SequentialPathwayLogic(hasPriorDecision: boolean, priorPathway: string | null, newPathway: string | null, v: string): PathwayRuleResultOutput {
  if (!hasPriorDecision) return result('P017', v, 'NOT_EVALUATED', 'LOW', 'No prior Pathway Decision exists for this lead — first evaluation.', {}, [])
  const changed = priorPathway !== newPathway
  return result('P017', v, changed ? 'FIRED' : 'NOT_FIRED', 'LOW', changed ? `Pathway changed from ${priorPathway} to ${newPathway} — transition recorded per §13's own sequenced model.` : 'Pathway is unchanged from the prior decision.', { priorPathway, newPathway }, ['priorDecision.primaryPathway'])
}

/**
 * P018 — 90-day stabilisation eligibility (PROPOSED soft gate, §11): Status
 * banner in the spec itself is "PROPOSED — REQUIRES BUSINESS, LEGAL,
 * CREDIT, RISK SIGN-OFF." Preconditions 5-8 (product available/legal
 * structure approved/funding approved/underwriting ready) all require
 * external sign-off systems this codebase has no integration for — this
 * rule can therefore NEVER report all 8 preconditions met, and
 * `pathwayVariant` is always STANDARD regardless of this rule's own
 * result (see precedence.ts). Preconditions 1-4 are still genuinely
 * evaluated for audit visibility.
 */
export function p018NinetyDayEligibility(input: PathwayInput, primaryPathway: string | null, v: string): PathwayRuleResultOutput {
  if (primaryPathway !== 'STABILISE') return result('P018', v, 'NOT_EVALUATED', 'LOW', 'Primary pathway is not STABILISE — 90-day variant is not applicable.', {}, ['primaryPathway'])
  const capacityOk = input.l4.capacityBand === 'TIGHT' || input.l4.capacityBand === 'STRESSED'
  const overdueOk = (input.l4.currentOverdue ?? 0) > 0
  const fcfOk = input.l3.fcfReconciled === true
  const complianceOk = !input.l4.complianceHold
  const internalPreconditionsMet = capacityOk && overdueOk && fcfOk && complianceOk
  return result(
    'P018',
    v,
    'NOT_FIRED',
    'LOW',
    `90-day variant is PROPOSED and requires Business/Legal/Credit/Risk sign-off (§11) — preconditions 5-8 (product availability, legal structure, funding, underwriting) have no live integration in this codebase and can never be confirmed, so this variant is never auto-selected regardless of preconditions 1-4 (${internalPreconditionsMet ? 'met' : 'not met'}).`,
    { capacityOk, overdueOk, fcfOk, complianceOk, internalPreconditionsMet, externalPreconditionsAvailable: false },
    ['l4.capacityBand', 'l4.currentOverdue', 'l3.fcfReconciled', 'l4.complianceHold'],
  )
}

/** P019 — Pathway precedence (hard rule, §7): always fires once precedence resolution runs. */
export function p019PathwayPrecedence(matchedPriority: number, v: string): PathwayRuleResultOutput {
  return result('P019', v, 'FIRED', 'HIGH', `Priority ${matchedPriority} matched — highest-priority row in §7's own 14-row precedence table.`, { priority: matchedPriority }, [])
}

/** P020 — Alternative pathway determination (soft rule, §8): NOT_EVALUATED only when no primary pathway could be determined at all (matches §22's own Praveenkumar example — "NOT_EVALUATED, No primary" when BLOCKED). */
export function p020AlternativePathwayDetermination(primaryPathway: string | null, pathwayStatus: string, alternativesCount: number, v: string): PathwayRuleResultOutput {
  if (pathwayStatus === 'BLOCKED') return result('P020', v, 'NOT_EVALUATED', 'LOW', 'No primary pathway was determined — L4 is BLOCKED.', {}, ['primaryPathway'])
  return result('P020', v, 'FIRED', 'LOW', `${alternativesCount} alternative pathway(s) computed per §8's own deterministic algorithm.`, { alternativesCount, primaryPathway }, ['primaryPathway'])
}
