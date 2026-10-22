/**
 * Plain, Prisma-independent shapes for the Pathway Engine's pure
 * rule-evaluation/precedence/alternatives functions in calculations/ —
 * same convention cohort-engine.types.ts and plan-engine.types.ts already
 * established.
 *
 * BBS Pathway Engine Module v3.0, L5 — sits strictly between Cohort
 * Engine (L4) and Plan Engine (L6, misnumbered in this codebase but left
 * as-is). Consumes ONLY Cohort Decision's + Master Profile's already-
 * computed output — never recomputes L1-L4 facts, never re-derives a
 * rule Cohort Engine already evaluated. Where this engine needs a signal
 * Cohort Engine already computed as a rule result (e.g. exception count,
 * P1 count, overdue amount), it reads that rule's own persisted evidence
 * verbatim rather than re-deriving it — see normalize-input.ts.
 */

import type { CohortArchetype, CohortBlockedReasonCode, CohortConfidenceLevel, CohortPathway, CohortPrimaryState, CohortRuleSeverity } from '@/modules/cohort-engine/cohort-engine.types'
import type { MasterConfidenceLevel, MasterDataQualityBand } from '@/modules/master-profile/master-profile.types'

export type { CohortArchetype, CohortConfidenceLevel, CohortPathway, CohortPrimaryState }

/** Mirrors `toPrimaryStateAndReasonCode()`'s own inline return-type literal in cohort-engine.types.ts (not separately exported there). */
export type CohortPrimaryStateCategory = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'X1' | 'X2' | 'BLOCKED'

export type CapacityBand = 'DISTRESSED' | 'STRESSED' | 'TIGHT' | 'COMFORTABLE' | 'UNKNOWN'

/** Spec §4.2's own 4-tier scale — a superset of CohortConfidenceLevel (adds UNRESOLVED for a null/blocked pathway). */
export type PathwayConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED'
export type PathwayConfidenceMethod = 'MIN_OF_DIMENSIONS' | 'WEIGHTED_PROPOSED'

/** Spec §15's own pathway_status vocabulary, verbatim. */
export type PathwayStatus = 'READY' | 'BLOCKED' | 'INSUFFICIENT_DATA' | 'SPECIALIST_REVIEW' | 'MANUAL_REVIEW' | 'OUT_OF_SCOPE' | 'NO_SUITABLE_PATHWAY' | 'EXPIRED' | 'EXPIRED_UNACCEPTED'

/** Spec §11 — 90_DAY is PROPOSED, never auto-selected by this implementation (see rules.ts's own P018). */
export type PathwayVariant = 'STANDARD' | 'NINETY_DAY'

/** Spec §6.2's own per-rule evaluation vocabulary. */
export type PathwayEvaluationResult = 'FIRED' | 'NOT_FIRED' | 'NOT_EVALUATED' | 'UNKNOWN'

export interface PathwayEngineConfig {
  ruleVersion: string
  /** §12's own fixed per-pathway TTL-day table. */
  ttlDaysByPathway: Record<CohortPathway, number>
  /** §4.3's own DQ-band → max-confidence ceiling table. */
  confidenceCapByDqBand: Record<MasterDataQualityBand, PathwayConfidenceLevel>
}

// --- PathwayInput — distilled L3 (Master Profile) + L4 (Cohort Decision) facts ---

export interface PathwayL4Input {
  decisionId: string | null
  version: number | null
  generatedAt: string | null
  primaryCohort: CohortPrimaryState | null
  primaryState: CohortPrimaryStateCategory | null
  primaryReasonCode: CohortBlockedReasonCode | null
  secondaryFlags: Array<{ key: string; label: string; reason: string }>
  capacityBand: CapacityBand | null
  archetype: CohortArchetype | null
  /** Cohort Engine's own single overall confidence rating — this codebase has no separate per-dimension (capacity vs. archetype) confidence, so the same value stands in for both `L4.capacity_confidence` and `L4.archetype_confidence` in Method A's MIN() formula (documented simplification, never a fabricated separate figure — see confidence.ts). */
  confidence: CohortConfidenceLevel | null
  complianceHold: boolean
  complianceReason: string | null
  specialistReviewRequired: boolean
  manualReviewRequired: boolean
  /** Read verbatim from L4's own `lifecycleState` — used only for RECOVER's "agreed repayment/resolution active" condition (§5.2.6); never re-derived. */
  lifecycleState: string | null
  /** From Cohort Engine's own R008 (Overdue pressure) rule evidence — never re-derived from raw Debt Analysis data. */
  currentOverdue: number | null
  /** From R006 (Legal status) matched. */
  legalStatusActive: boolean
  /** From R009 OR R010 matched (borrowing-to-repay / debt-cycle stacking). */
  debtCycleSignal: boolean
  /** From R012 (Consolidation eligibility) evidence.activeAccounts. */
  activeAccounts: number | null
  /** From R021 (Exception count) evidence.tier — audit-only re-exposure; Cohort Engine's own precedence already blocks on this (P001 catches it) before Pathway Engine ever sees it as a live gate. */
  exceptionTier: 'NONE' | 'SPECIALIST' | 'MANUAL_REVIEW' | null
  exceptionCount: number | null
}

export interface PathwayL3Input {
  version: number | null
  generatedAt: string | null
  dataQualityBand: MasterDataQualityBand | null
  /** `!dataQuality.flags.includes('FCF_UNRECONCILED')` — Master Profile exposes no separate boolean field; this is the one, honest derivation point (see normalize-input.ts). null when DQ band itself is unavailable. */
  fcfReconciled: boolean | null
  p1Count: number
  resolutionCapacity: string | null
  incomeCashFlowConfidence: MasterConfidenceLevel | null
  alignmentCapacityConfidence: MasterConfidenceLevel | null
  bureauDsrPercent: number | null
  bankDsrPercent: number | null
  masterDsrPercent: number | null
}

export interface PathwayInput {
  leadId: string
  bbsLeadId: string
  l4: PathwayL4Input
  l3: PathwayL3Input
}

// --- Rule evaluation output ------------------------------------------------

export interface PathwayRuleResultOutput {
  ruleId: string
  ruleVersion: string
  evaluation: PathwayEvaluationResult
  severity: CohortRuleSeverity
  evidence: Record<string, number | string | boolean | null>
  reason: string
  sourceFields: string[]
}

// --- Precedence / primary-pathway resolution -------------------------------

export interface PathwayPrecedenceResult {
  primaryPathway: CohortPathway | null
  pathwayStatus: PathwayStatus
  blockingReason: string | null
  inheritedBlocks: string[]
  matchedPriority: number
  precedenceExplanation: string
}

// --- Suitability (§5.2) ----------------------------------------------------

export type SuitabilityConditionStatus = 'MET' | 'FAILED' | 'UNKNOWN'

export interface SuitabilityCondition {
  condition: string
  status: SuitabilityConditionStatus
  source: string
}

export interface SuitabilityEvaluation {
  pathway: CohortPathway
  conditions: SuitabilityCondition[]
  metCount: number
  totalCount: number
  suitabilityScore: number
}

// --- Alternatives (§8) ------------------------------------------------------

export interface PathwayAlternative {
  pathway: CohortPathway
  suitabilityScore: number
  metConditions: string[]
  blockingConditions: string[]
  reasonNotPrimary: string
  switchTrigger: string
}

export interface SequencingHint {
  naturalNext: CohortPathway
  trigger: string
}

export interface CustomerReason {
  tier: 'primary' | 'detail'
  text: string
}
