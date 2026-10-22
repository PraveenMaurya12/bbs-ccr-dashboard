import type { BbsPlanComposition, BbsPlanTemplate, PlanEngineConfig, PlanInput } from '../plan-engine.types'
import { generateConditionalActions } from './action-library'
import { computeFinancialTargets } from './financial-targets'
import { buildMissingDataActions } from './missing-data'
import { checkCustomerSafeLanguage, evaluateAllRules, evaluateCcrReviewTrigger, mergeCcrReviewReasons } from './rules'
import { buildStandardConditions } from './standard-conditions'

/**
 * Deterministic, template-governed plan composition — never AI. Reads
 * ONLY `PlanInput` (already distilled from Cohort Decision + Pathway
 * Decision + Master Profile) and the resolved `BbsPlanTemplate`; never
 * fabricates a value not present in one of those two. AI (see
 * bbs-plan-narrative.types.ts) only ever explains this already-decided
 * output afterward.
 */
export function composePlan(input: PlanInput, template: BbsPlanTemplate, config: PlanEngineConfig): BbsPlanComposition {
  const situationAssessment = {
    narrative: template.situationAssessmentTemplate,
    cohort: input.cohort,
    pathway: input.pathway,
    pathwayVariant: input.pathwayVariant,
    alignmentState: input.alignmentState,
    resolutionCapacity: input.resolutionCapacity,
    capacityBand: input.capacityBand,
  }

  const problemDefinition = {
    narrative: template.problemDefinitionTemplate,
    secondaryFlags: input.secondaryFlags,
    riskFlags: input.riskFlags,
    debtComplexityBand: input.debtComplexityBand,
  }

  const financialCapacity = {
    capacityBand: input.capacityBand,
    capacityRatio: input.capacityRatio,
    sustainableCashFlow: input.sustainableCashFlow,
    stabilisationCoverage: input.stabilisationCoverage,
    bureauDsrPercent: input.bureauDsrPercent,
    bankDsrPercent: input.bankDsrPercent,
    masterDsrPercent: input.masterDsrPercent,
  }

  const debtStrategy = {
    narrative: template.debtStrategy,
    debtComplexityBand: input.debtComplexityBand,
  }

  // v3.0 §12.1-12.4 (PL004) — real, forward-looking per-pathway targets,
  // replacing the old verbatim current*-value passthrough.
  const financialTargetResult = computeFinancialTargets(input)
  const financialTargets = { ...financialTargetResult.targets, feasibility: financialTargetResult.feasibility, protectedBuffer: financialTargetResult.protectedBuffer, proposedPayment: financialTargetResult.proposedPayment }
  const debtTargets = { currentDebtComplexityBand: input.debtComplexityBand }

  const monitoringTriggers = {
    scheduledDaysFromNow: config.reviewCadenceDays,
    // Data, never an actually-scheduled job (no scheduler infra exists in
    // this codebase) — surfaced to a CCR, same discipline as Cohort
    // Engine's own nextReviewEvent.
    eventTriggers: ['action_overdue', 'condition_failed', 'new_cohort_decision', 'missed_payment', 'lender_decline', 'material_data_change'],
  }

  const reviewSchedule = {
    cadenceDays: config.reviewCadenceDays,
    nextReviewDueInDays: config.reviewCadenceDays[0] ?? 30,
  }

  const dataProvenance = [
    { field: 'cohort', source: 'COHORT_ENGINE', verified: true, confidence: input.confidence ?? 'LOW' },
    { field: 'pathway', source: 'PATHWAY_ENGINE', verified: input.pathway !== null, confidence: input.confidence ?? 'LOW' },
    { field: 'capacityBand', source: 'COHORT_ENGINE', verified: true, confidence: 'HIGH' },
    { field: 'alignmentState', source: 'MASTER_PROFILE', verified: input.alignmentState !== null, confidence: input.masterProfileConfidence ?? 'MEDIUM' },
  ]

  // v3.0 §10.1-10.4 (PL005) — template base actions + the Action Library's
  // own conditional-injection algorithm, deduped by actionId.
  const missingDataActions = buildMissingDataActions(input.cohortMissingData)
  const conditionalActions = generateConditionalActions(input)
  const rawActions = [...template.actions.map((a) => ({ ...a, status: 'PENDING' as const })), ...missingDataActions, ...conditionalActions]
  const seenActionIds = new Set<string>()
  const actions = rawActions.filter((a) => (seenActionIds.has(a.actionId) ? false : (seenActionIds.add(a.actionId), true)))

  // v3.0 §13.2-13.4 — template-authored conditions + the standard-
  // conditions set Plan Engine can honestly self-verify.
  const templateConditions = template.conditions.map((c) => ({ ...c, state: 'UNKNOWN' as const, verificationStatus: 'UNVERIFIED' }))
  const standardConditions = buildStandardConditions(input, financialTargetResult)
  const conditions = [...templateConditions, ...standardConditions]

  // Deterministic, customer-safe explanation — reuses Cohort Engine's own
  // already-customer-safe sentence, never the internal archetype/rule-ID
  // vocabulary (same discipline as cohort-engine's own
  // buildCustomerExplanation).
  const customerExplanation = [input.cohortCustomerExplanation, template.objective].filter(Boolean).join(' ')

  // v3.0 §7's rule catalog, run unconditionally + PL014/PL015 (which need
  // the conditions/customerExplanation computed just above).
  const baseRuleResults = evaluateAllRules(input, config)
  const anyConditionFailed = conditions.some((c) => c.state === 'FAILED')
  const requiresPaymentCommitment = input.pathway !== null && ['CONSOLIDATE', 'RESTRUCTURE', 'RESOLVE'].includes(input.pathway)
  const ccrReviewTrigger = mergeCcrReviewReasons(evaluateCcrReviewTrigger(input), { anyConditionFailed, requiresPaymentCommitment })
  const languageCheck = checkCustomerSafeLanguage(customerExplanation)
  const ruleResults = [...baseRuleResults, ccrReviewTrigger, languageCheck]

  const risks = financialTargetResult.feasibility === 'NOT_FEASIBLE' ? [...template.risks, 'CAPACITY_EXCEEDED: the proposed payment target exceeds the customer\'s protected buffer — re-plan before presenting.'] : template.risks

  return {
    templateId: template.templateId,
    templateVersion: config.templateRegistryVersion,
    cohort: input.cohort,
    pathway: input.pathway,
    lifecycleStatus: template.initialLifecycleStatus,
    situationAssessment,
    problemDefinition,
    financialCapacity,
    debtStrategy,
    financialTargets,
    debtTargets,
    risks,
    disclosures: template.disclosures,
    successCriteria: template.successCriteria,
    monitoringTriggers,
    reviewSchedule,
    dataProvenance,
    missingData: input.cohortMissingData.length > 0 ? input.cohortMissingData : null,
    customerExplanation,
    specialistReviewRequired: input.specialistReviewRequired || template.cohort === 'C6',
    actions,
    conditions,
    ruleResults,
    feasibility: financialTargetResult.feasibility,
    planTtlDays: input.pathway ? config.ttlDaysByPathway[input.pathway] : null,
  }
}
