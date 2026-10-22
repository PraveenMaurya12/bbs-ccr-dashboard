import type { PlanInput } from '../plan-engine.types'

/**
 * The plain params plan-engine.service.ts extracts from the Cohort
 * Decision + Master Profile `getForLead()` COMPLETED shapes — nothing
 * here is re-derived; every field is read verbatim from one of those two
 * upstream services. No raw bureau/bank field is ever read directly (the
 * Plan Engine's own first product principle: consume ONLY the Final
 * Master Profile + Final Cohort Decision).
 */
export interface NormalizeInputParams {
  leadId: string
  bbsLeadId: string
  customerName: string
  cohortDecision: {
    primaryCohort: string | null
    pathway: string | null
    pathwayVariant: string | null
    planEligibility: string | null
    archetype: string | null
    specialistReviewRequired: boolean
    manualReviewRequired: boolean
    confidence: string | null
    capacityBand: string | null
    capacityRatio: number | null
    sustainableCashFlow: number | null
    stabilisationCoverage: number | null
    debtComplexityBand: string | null
    secondaryFlags: Array<{ key: string; label: string; reason: string }> | null
    missingData: Array<{ field: string; why: string; document: string | null; owner: string; nextAction: string }> | null
    customerExplanation: string | null
  }
  /** Pathway Decision's own already-computed riskFlags array — see PlanInput.riskFlags' own doc comment. */
  pathwayRiskFlags: string[]
  masterProfile: {
    alignmentState: string | null
    resolutionCapacity: string | null
    overallConfidence: string | null
    bureauDsrPercent: number | null
    bankDsrPercent: number | null
    masterDsrPercent: number | null
  } | null
}

/** Pure mapping, no derivation — see this file's own doc comment. */
export function buildPlanInput(params: NormalizeInputParams): PlanInput {
  return {
    leadId: params.leadId,
    bbsLeadId: params.bbsLeadId,
    customerName: params.customerName,
    cohort: params.cohortDecision.primaryCohort as PlanInput['cohort'],
    pathway: params.cohortDecision.pathway as PlanInput['pathway'],
    pathwayVariant: params.cohortDecision.pathwayVariant as PlanInput['pathwayVariant'],
    planEligibility: params.cohortDecision.planEligibility as PlanInput['planEligibility'],
    archetype: params.cohortDecision.archetype as PlanInput['archetype'],
    specialistReviewRequired: params.cohortDecision.specialistReviewRequired,
    manualReviewRequired: params.cohortDecision.manualReviewRequired,
    confidence: params.cohortDecision.confidence as PlanInput['confidence'],
    capacityBand: params.cohortDecision.capacityBand as PlanInput['capacityBand'],
    capacityRatio: params.cohortDecision.capacityRatio,
    sustainableCashFlow: params.cohortDecision.sustainableCashFlow,
    stabilisationCoverage: params.cohortDecision.stabilisationCoverage,
    debtComplexityBand: params.cohortDecision.debtComplexityBand as PlanInput['debtComplexityBand'],
    secondaryFlags: params.cohortDecision.secondaryFlags ?? [],
    cohortMissingData: params.cohortDecision.missingData ?? [],
    cohortCustomerExplanation: params.cohortDecision.customerExplanation,
    riskFlags: params.pathwayRiskFlags,
    missingDataCount: (params.cohortDecision.missingData ?? []).length,
    alignmentState: params.masterProfile?.alignmentState ?? null,
    resolutionCapacity: params.masterProfile?.resolutionCapacity ?? null,
    masterProfileConfidence: params.masterProfile?.overallConfidence ?? null,
    bureauDsrPercent: params.masterProfile?.bureauDsrPercent ?? null,
    bankDsrPercent: params.masterProfile?.bankDsrPercent ?? null,
    masterDsrPercent: params.masterProfile?.masterDsrPercent ?? null,
  }
}
