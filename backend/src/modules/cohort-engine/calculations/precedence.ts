import type { CohortEngineConfig, CohortInput, CohortPrimaryState, CohortRuleResultOutput, PrecedenceResult } from '../cohort-engine.types'

function ruleMatched(results: CohortRuleResultOutput[], ruleId: string): boolean {
  return results.some((r) => r.ruleId === ruleId && r.matched)
}

function ruleEvidence(results: CohortRuleResultOutput[], ruleId: string): CohortRuleResultOutput['evidence'] | undefined {
  return results.find((r) => r.ruleId === ruleId)?.evidence
}

interface CandidateCohort {
  cohort: CohortPrimaryState
  label: string
  matched: boolean
  reason: string
}

/**
 * BBS Cohort Engine Module v3.0 §6.1's single authoritative precedence
 * table, verbatim — priorities 1.0 through 1.8 (all BLOCKED, each its own
 * reason code), then 2 through 9 (real Type-A cohorts, falling through to
 * MANUAL_REVIEW_REQUIRED at priority 9 when nothing else matches). Every
 * condition below reads ONLY already-computed rule results / input facts,
 * never re-evaluating a raw signal itself (that happens once, in
 * rules.ts). Evaluates EVERY candidate independently (never an if/else
 * short-circuit that skips a lower-priority check) so every match can be
 * preserved as a secondary flag, then picks the single highest-priority
 * match as primary.
 *
 * Deliberately does NOT apply the §3.2 Master Profile readiness-gate
 * short-circuit (CCR_FIRST/COMPLIANCE_HOLD/SPECIALIST_REVIEW/X1_CANDIDATE/
 * REGENERATE) — that happens one layer up, in cohort-engine.service.ts,
 * BEFORE this function's result is used, because "Cohort Engine never
 * overrides L3's readiness gate" (§3.2's own explicit rule) and the
 * readiness gate is Master Profile's own field, not a rule result this
 * function should re-derive. Keeping that override outside this function
 * is also what makes `resolvePrecedence` itself independently unit-testable
 * against synthetic rule results, per the task's own requirement.
 *
 * NOTE on C1 (priority 6): the table's own condition is "overdue pressure +
 * 90-day stabilisation coverage >= 1.00" (R008 + R014), which needs an
 * approved BBS Plan Engine support amount that does not exist anywhere in
 * this codebase yet (R014 always reports NOT_APPLICABLE). Until that
 * integration exists, this resolver treats "has overdue + comfortable
 * capacity + no specialist/debt-cycle/escalating-DPD/overdue-threshold
 * blocker" as a necessary-but-not-sufficient PROXY for C1 eligibility — it
 * never claims the real 90-day coverage test actually passed. Flagged here
 * and in the parity matrix, not silently assumed.
 */
export function resolvePrecedence(results: CohortRuleResultOutput[], input: CohortInput, config: CohortEngineConfig): PrecedenceResult {
  const consentMissing = ruleMatched(results, 'R001')
  const identityMissing = ruleMatched(results, 'R002')
  const legalStatus = ruleMatched(results, 'R006')
  const escalatingDpd = ruleMatched(results, 'R007')
  const overdueThreshold = ruleMatched(results, 'R008')
  const borrowingToRepay = ruleMatched(results, 'R009')
  const debtCycleStacking = ruleMatched(results, 'R010')
  const consolidationEligible = ruleMatched(results, 'R012')
  const complianceSignal = ruleMatched(results, 'R017')
  const otherAccountsBlocking = ruleMatched(results, 'R018')
  const postStatementBlocking = ruleMatched(results, 'R019')
  const p1Blocking = ruleMatched(results, 'R020')
  const materialMismatch = ruleMatched(results, 'R005')
  const exceptionTier = (ruleEvidence(results, 'R021')?.tier as string | undefined) ?? 'NONE'
  const recoveryState = ruleMatched(results, 'R015')
  const outOfScope = ruleMatched(results, 'R016')

  const debtCycleConfirmed = borrowingToRepay || debtCycleStacking
  const hasOverdue = (input.credit.currentOverdue ?? 0) > 0
  const comfortableCapacity = input.financial.capacityBand === 'COMFORTABLE'
  const capacityDistressed = input.financial.capacityBand === 'DISTRESSED'
  const capacityStressed = input.financial.capacityBand === 'STRESSED'

  // Priorities 1.0-1.8 — every BLOCKED candidate, each its own reason code.
  const blockedCandidates: CandidateCohort[] = [
    { cohort: 'CONSENT_PENDING', label: 'Consent pending', matched: consentMissing, reason: 'Consent is not active for this lead.' },
    { cohort: 'KYC_PENDING', label: 'KYC pending', matched: !consentMissing && identityMissing, reason: 'No PAN/KYC reference is on file.' },
    { cohort: 'COMPLIANCE_HOLD', label: 'Compliance hold', matched: complianceSignal, reason: 'A related-party, PEP/sanctions, fraud, or legal-status compliance signal requires a hold.' },
    { cohort: 'DATA_REFRESH_REQUIRED', label: 'Data refresh required', matched: postStatementBlocking, reason: 'Post-statement debt is a material share of active balance — current data is unreliable until refreshed.' },
    { cohort: 'OTHER_ACCOUNTS_REQUIRED', label: 'Other accounts required', matched: otherAccountsBlocking, reason: 'Self-transfer activity suggesting another bank account exceeds the blocking threshold.' },
    { cohort: 'P1_INFORMATION_REQUIRED', label: 'P1 information required', matched: p1Blocking, reason: 'P1 Critical missing-information items meet or exceed the blocking threshold.' },
    { cohort: 'MANUAL_REVIEW', label: 'Manual review (material mismatch)', matched: materialMismatch, reason: 'An unresolved material mismatch between the credit report and bank statement requires manual review.' },
    { cohort: 'SPECIALIST_REQUIRED', label: 'Specialist required (legal status)', matched: legalStatus, reason: 'A suit-filed, wilful-default, or ARC-assigned status requires specialist/legal review.' },
    { cohort: 'MANUAL_REVIEW', label: 'Manual review (exception count)', matched: exceptionTier === 'MANUAL_REVIEW', reason: 'Exception count meets the manual-review threshold.' },
    { cohort: 'SPECIALIST_REQUIRED', label: 'Specialist required (exception count)', matched: exceptionTier === 'SPECIALIST', reason: 'Exception count meets the specialist-review threshold.' },
  ]

  // Priorities 2-8 — real Type-A cohorts.
  const cohortCandidates: CandidateCohort[] = [
    { cohort: 'C5', label: 'Debt-cycle intervention', matched: debtCycleConfirmed, reason: 'A confirmed debt-cycle trigger was detected (borrowing-to-repay or debt-cycle stacking).' },
    { cohort: 'C4', label: 'Resolution candidate', matched: capacityDistressed, reason: 'Capacity band is Distressed — existing debt does not appear serviceable under a standard offer.' },
    { cohort: 'C3', label: 'Restructure candidate', matched: !capacityDistressed && capacityStressed, reason: 'Capacity band is Stressed — the current debt structure does not meet comfortable affordability.' },
    { cohort: 'C2', label: 'Consolidation candidate', matched: consolidationEligible, reason: '2+ active accounts, non-distressed capacity, and no legal blocker make this lead eligible for a consolidation assessment.' },
    // Narrowly scoped blockers, C1-only (never block C2-C7/X2) — see this
    // function's own doc comment on R008/R014/R007's exact role here.
    { cohort: 'C1', label: 'Stabilisation ready', matched: hasOverdue && comfortableCapacity && !legalStatus && !debtCycleConfirmed && !escalatingDpd && !overdueThreshold, reason: 'Overdue pressure exists alongside comfortable capacity and no specialist/debt-cycle/escalating-DPD/overdue-threshold blocker (90-day coverage test not yet confirmable — see this function\'s own doc comment).' },
    { cohort: 'C7', label: 'Recovery / credit rebuild', matched: recoveryState, reason: 'Acute distress appears resolved with stable/improving payment behaviour.' },
    { cohort: 'X2', label: 'Outside current program', matched: outOfScope, reason: 'No relevant debt distress was identified for this lead.' },
  ]

  const allCandidates = [...blockedCandidates, ...cohortCandidates]
  const primaryCandidate = allCandidates.find((c) => c.matched)
  const primaryCohort: CohortPrimaryState = primaryCandidate?.cohort ?? 'MANUAL_REVIEW'

  const secondaryFlags: PrecedenceResult['secondaryFlags'] = []
  for (const candidate of allCandidates) {
    if (candidate.matched && !(candidate.cohort === primaryCohort && candidate === primaryCandidate)) {
      secondaryFlags.push({ key: candidate.cohort, label: candidate.label, reason: candidate.reason })
    }
  }
  // Preserve every other individually-fired rule not already represented
  // by a cohort-level flag above — "never discard a lower-priority match."
  const extraRuleFlags: Array<[string, boolean, string]> = [
    ['ESCALATING_DPD', escalatingDpd, 'DPD trend is escalating — standard C1 offer held pending review.'],
    ['OVERDUE_THRESHOLD_EXCEEDED', overdueThreshold, 'Total overdue exceeds the configured capacity/review trigger.'],
    ['BORROWING_TO_REPAY', borrowingToRepay, 'A borrowing-to-repay pattern was observed.'],
    ['DEBT_CYCLE_STACKING', debtCycleStacking, 'A debt-cycle stacking pattern was observed.'],
    ['FCF_UNRECONCILED_CAP', ruleMatched(results, 'R022'), 'Capacity band is capped because free cash flow is unreconciled.'],
    ['INCOME_TRANSITION', ruleMatched(results, 'R023'), 'An income transition was detected.'],
    ['MEDICAL_SHOCK', ruleMatched(results, 'R024'), 'Medical-spending shock was detected.'],
  ]
  for (const [key, matched, reason] of extraRuleFlags) {
    if (matched) secondaryFlags.push({ key, label: key.replace(/_/g, ' '), reason })
  }

  const specialistReviewRequired = legalStatus || exceptionTier === 'SPECIALIST'
  const specialistReviewReason = legalStatus ? 'A suit-filed, wilful-default, or ARC-assigned status requires specialist/legal review.' : exceptionTier === 'SPECIALIST' ? 'Exception count meets the specialist-review threshold.' : null
  const manualReviewRequired = primaryCohort === 'MANUAL_REVIEW'

  const precedenceExplanation = primaryCandidate
    ? `${primaryCohort} selected because it has the highest precedence among all matched conditions under Cohort Policy ${config.ruleVersion}.`
    : `No approved precedence row matched this lead's combination of signals — routed to MANUAL_REVIEW rather than an arbitrary default assignment.`

  return { primaryCohort, secondaryFlags, specialistReviewRequired, specialistReviewReason, manualReviewRequired, precedenceExplanation }
}
