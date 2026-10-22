/**
 * Plain, Prisma-independent shapes for the Plan Engine's pure
 * normalization/template/composition functions in calculations/ and
 * templates/ — same convention cohort-engine.types.ts already established,
 * so every calculation can be unit-tested with plain object literals.
 *
 * The Plan Engine never re-analyzes raw bureau/bank data and never
 * re-decides the cohort itself — `PlanInput` is a thin, distilled
 * normalization built once by plan-engine.service.ts from the already-
 * computed Cohort Decision + Master Profile output only (see
 * normalize-input.ts's own doc comment).
 */

import type { CohortArchetype, CohortConfidenceLevel, CohortPathway, CohortPlanEligibility, CohortPrimaryState } from '@/modules/cohort-engine/cohort-engine.types'

export type { CohortArchetype, CohortConfidenceLevel, CohortPathway, CohortPlanEligibility, CohortPrimaryState }

export type BbsPlanActionOwner = 'CUSTOMER' | 'BBS' | 'CREDITOR'
export type BbsPlanActionPhase = 'IMMEDIATE' | 'DAY_30' | 'DAY_60' | 'DAY_90'
export type BbsPlanConditionState = 'MET' | 'PENDING' | 'FAILED' | 'NOT_APPLICABLE' | 'UNKNOWN'

/** v3.0 §11.2, verbatim — was an untyped, never-transitioned free string; see PlanEngineService.updateActionStatus() for the legal-transition table. */
export type BbsPlanActionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED' | 'FAILED' | 'CANCELLED' | 'ESCALATED'

/** v3.0 §8.1 — STABILISE's own two variants. Every other pathway has exactly one variant (STANDARD). NINETY_DAY is accepted by the registry but never reachable today (Pathway Engine's own pathwayVariant is hardcoded STANDARD — see v3.0 §11/§12.5's own isolation rule). */
export type BbsPlanPathwayVariant = 'STANDARD' | 'NINETY_DAY'

/** The spec's own 10-value business lifecycle — see BbsPlan's schema doc comment for why it's a separate enum from generationStatus/StageStatus. */
export type BbsPlanLifecycleStatus = 'DRAFT' | 'CCR_REVIEW' | 'SPECIALIST_REVIEW' | 'CUSTOMER_ACCEPTANCE_PENDING' | 'EXECUTION_READY' | 'ACTIVE' | 'PAUSED' | 'REASSESSMENT_REQUIRED' | 'COMPLETED' | 'CANCELLED'

export interface PlanEngineConfig {
  reviewCadenceDays: number[]
  templateRegistryVersion: string
  ruleVersion: string
  ttlDaysByPathway: Record<CohortPathway, number>
  placeholderTtlDays: number
}

// --- Rule Catalog (v3.0 §7) -------------------------------------------------

export type PlanRuleEvaluation = 'FIRED' | 'NOT_FIRED' | 'NOT_EVALUATED'
export type PlanGateOutcome = 'GENERATE' | 'PLACEHOLDER' | 'TERMINAL' | 'ERROR'

export interface PlanRuleResultOutput {
  ruleId: string
  evaluation: PlanRuleEvaluation
  reason: string
  evidence: Record<string, unknown>
}

export interface PlanGateResult {
  outcome: PlanGateOutcome
  reason: string
}

// --- PlanInput — distilled Cohort Decision + Master Profile facts only ---

export interface PlanInput {
  leadId: string
  bbsLeadId: string
  customerName: string

  cohort: CohortPrimaryState | null
  pathway: CohortPathway | null
  /** From Pathway Decision's own `pathwayVariant` — see BbsPlanPathwayVariant's own doc comment for why NINETY_DAY is accepted but never reachable today. */
  pathwayVariant: BbsPlanPathwayVariant | null
  planEligibility: CohortPlanEligibility | null
  /** Internal-only, same discipline as Cohort Engine's own archetype — never surfaced in customer-facing text. */
  archetype: CohortArchetype | null
  specialistReviewRequired: boolean
  manualReviewRequired: boolean
  confidence: CohortConfidenceLevel | null

  // Financial & Debt Target Model — explicitly the SAME model Cohort
  // Engine already computed, reused verbatim here, never recalculated.
  capacityBand: 'DISTRESSED' | 'STRESSED' | 'TIGHT' | 'COMFORTABLE' | null
  capacityRatio: number | null
  sustainableCashFlow: number | null
  stabilisationCoverage: number | null
  debtComplexityBand: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | null

  secondaryFlags: Array<{ key: string; label: string; reason: string }>
  cohortMissingData: Array<{ field: string; why: string; document: string | null; owner: string; nextAction: string }>
  cohortCustomerExplanation: string | null

  /**
   * v3.0 §10.3/§14.1 — Pathway Decision's own already-computed `riskFlags`
   * array (COMPLIANCE_HOLD, FCF_UNRECONCILED, P1_INFORMATION_OUTSTANDING,
   * plus every L4 secondaryFlags key e.g. OTHER_ACCOUNTS_LIKELY). Read-only
   * here — Plan Engine never re-derives a flag, only reacts to one already
   * raised upstream (same reuse-don't-recompute discipline as Pathway
   * Engine's own reads of Cohort Engine's evidence).
   */
  riskFlags: string[]
  /**
   * Count of `cohortMissingData` — Cohort Engine's own already-filtered
   * P1+P2 missing-information register (confirmed via its own
   * `assessMissingDataAndDocuments()`: P1/P2 Master Profile items plus
   * structural gaps like missing consent/KYC/bureau/bank data). Used as
   * an honest proxy for the spec's "L3 has P1 items" trigger (§10.3,
   * §13.4) — not a re-filtered pure-P1 count, since this layer never
   * re-reads Master Profile's own P1/P2/P3 register directly.
   */
  missingDataCount: number

  // A handful of already-computed Master Profile facts, used only to
  // ground the situation-assessment/problem-definition text — never
  // re-derived here.
  alignmentState: string | null
  resolutionCapacity: string | null
  masterProfileConfidence: string | null
  bureauDsrPercent: number | null
  bankDsrPercent: number | null
  masterDsrPercent: number | null
}

// --- Template Registry ----------------------------------------------------

export interface BbsPlanActionTemplate {
  actionId: string
  ownerType: BbsPlanActionOwner
  phase: BbsPlanActionPhase
  description: string
  owner: string
  timing: string
  dependency?: string
  evidenceRequired?: string[]
  /** v3.0 §10.4 — populated only for canonical Action Library actions (see action-library.ts); plan-specific template actions keep `timing` as prose and leave this unset. */
  slaDays?: number
}

export interface BbsPlanConditionTemplate {
  conditionId: string
  description: string
  source: string
  /** v3.0 §13.4 standard-conditions priority ("P1"/"P2"/"P3"). Optional — most template-authored conditions don't carry one; standard conditions injected via the Action Library do. */
  priority?: string
}

export interface BbsPlanTemplate {
  templateId: string
  cohort: CohortPrimaryState | null
  /** Non-null only for the 7 pathway-keyed templates (v3.0 §8.1) — null for the cohort-keyed thin/blocked templates, which are never reached by a real pathway. */
  pathway: CohortPathway | null
  pathwayVariant?: BbsPlanPathwayVariant | null
  objective: string
  situationAssessmentTemplate: string
  problemDefinitionTemplate: string
  debtStrategy: string
  successCriteria: string[]
  risks: string[]
  disclosures: string[]
  actions: BbsPlanActionTemplate[]
  conditions: BbsPlanConditionTemplate[]
  /** DRAFT for a full template; CCR_REVIEW/SPECIALIST_REVIEW for a thinner one (less for a CCR to draft — see this module's own build notes). */
  initialLifecycleStatus: BbsPlanLifecycleStatus
}

// --- Composition output (pre-persistence) ---------------------------------

export interface BbsPlanActionOutput extends BbsPlanActionTemplate {
  status: BbsPlanActionStatus
}

export interface BbsPlanConditionOutput {
  conditionId: string
  description: string
  state: BbsPlanConditionState
  source: string
  verificationStatus: string
  priority?: string | null
  escalationPath?: string | null
}

export interface BbsPlanComposition {
  templateId: string
  templateVersion: string
  cohort: CohortPrimaryState | null
  pathway: CohortPathway | null
  lifecycleStatus: BbsPlanLifecycleStatus
  situationAssessment: Record<string, unknown>
  problemDefinition: Record<string, unknown>
  financialCapacity: Record<string, unknown>
  debtStrategy: Record<string, unknown>
  financialTargets: Record<string, unknown>
  debtTargets: Record<string, unknown>
  risks: string[]
  disclosures: string[]
  successCriteria: string[]
  monitoringTriggers: Record<string, unknown>
  reviewSchedule: Record<string, unknown>
  dataProvenance: Array<{ field: string; source: string; verified: boolean; confidence: string }>
  missingData: PlanInput['cohortMissingData'] | null
  customerExplanation: string
  specialistReviewRequired: boolean
  actions: BbsPlanActionOutput[]
  conditions: BbsPlanConditionOutput[]
  /** v3.0 §7 rule-catalog results (PL001/PL004/PL005/PL007-PL010/PL013-PL015) — persisted alongside the plan for full explainability, same discipline as Cohort/Pathway Engine's own rule-result tables (though here kept as one Json array rather than a child table, since no per-row lifecycle is needed — these never change after generation). */
  ruleResults: PlanRuleResultOutput[]
  /** v3.0 §12.4 Protected Buffer Rule outcome. */
  feasibility: 'FEASIBLE' | 'NOT_FEASIBLE' | 'NOT_APPLICABLE'
  /** v3.0 §12.5 — the fixed per-pathway TTL this plan was stamped with at generation time (null for a blocked/thin plan with no real pathway). */
  planTtlDays: number | null
}
