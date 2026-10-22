/**
 * The AI output contract for RECOVERY_PLAN_GENERATION only (the Plan
 * Engine's own narrative job — see modules/plan-engine). Mirrors the BBS
 * Plan Engine spec's "Customer-Facing Plan" structure: 11 fixed sections,
 * each explaining an already-decided, deterministic fact the Plan Engine
 * itself computed (see plan-engine/calculations/compose-plan.ts) — this
 * contract never includes a field the parser could use to invent a new
 * action, condition, target, or cohort (spec's own AI Guardrails: AI may
 * summarize/explain/translate/personalize only).
 *
 * Advisory only (see AnalysisResult's own doc comment in
 * prisma/schema.prisma) — never written into BbsPlan's own deterministic
 * columns directly.
 */
export interface BbsPlanNarrative {
  whereYouAreToday: string
  whatNeedsAttention: string
  whyThisPlan: string
  whatHappensFirst: string
  yourJourney: string
  whatBbsWillDo: string
  whatWeNeedFromYou: string
  lenderDependencies: string
  whatCanChangeThePlan: string
  howProgressIsMeasured: string
  reviewDate: string
  confidence: 'high' | 'medium' | 'low'
}
