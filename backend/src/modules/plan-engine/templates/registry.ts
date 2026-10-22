import type { BbsPlanPathwayVariant, BbsPlanTemplate, CohortPathway, CohortPrimaryState } from '../plan-engine.types'
import { c1StabilisationTemplate } from './c1-stabilisation.template'
import { c2ConsolidationTemplate } from './c2-consolidation.template'
import { c3RestructuringTemplate } from './c3-restructuring.template'
import { c4ResolutionTemplate } from './c4-resolution.template'
import { c5DebtCycleTemplate } from './c5-debt-cycle.template'
import { c6SpecialistReviewTemplate } from './c6-specialist-review.template'
import { c7RecoveryTemplate } from './c7-recovery.template'
import { pendingResolutionTemplate } from './pending-resolution.template'
import { consolidateTemplate } from './pathway/consolidate.template'
import { optimiseTemplate } from './pathway/optimise.template'
import { recoverTemplate } from './pathway/recover.template'
import { resolveTemplate } from './pathway/resolve.template'
import { restructureTemplate } from './pathway/restructure.template'
import { stabilise90DayTemplate } from './pathway/stabilise-90day.template'
import { stabiliseStandardTemplate } from './pathway/stabilise-standard.template'
import { x1DataCompletionTemplate } from './x1-data-completion.template'
import { x2OutsideProgramTemplate } from './x2-outside-program.template'

// v3.0 §8.1's deterministic pathway->template mapping — the PRIMARY
// routing key once a real Pathway Decision exists (pathwayStatus READY,
// primary_pathway non-null). Confirmed via Pathway Engine's own P001 gate
// that a non-null pathway can only ever accompany a real, unblocked
// cohort (C1-C7 excl. C6) — so this table, not the cohort-keyed one
// below, is what actually serves every "ready" plan from this point on.
const TEMPLATES_BY_PATHWAY: Record<CohortPathway, BbsPlanTemplate> = {
  OPTIMISE: optimiseTemplate,
  STABILISE: stabiliseStandardTemplate, // variant-specific override applied in getTemplate() below
  CONSOLIDATE: consolidateTemplate,
  RESTRUCTURE: restructureTemplate,
  RESOLVE: resolveTemplate,
  RECOVER: recoverTemplate,
}

// v3.0's Cohort Engine rebuild added 6 new BLOCKED reason codes
// (COMPLIANCE_HOLD, DATA_REFRESH_REQUIRED, OTHER_ACCOUNTS_REQUIRED,
// P1_INFORMATION_REQUIRED, SPECIALIST_REQUIRED, CCR_REQUIRED) — all fall
// through to the same generic `pendingResolutionTemplate` as the
// pre-existing CONSENT_PENDING/KYC_PENDING/MANUAL_REVIEW/
// CUSTOMER_UNRESPONSIVE states, consistent with this registry's own
// "generation never refuses based on which cohort was decided" principle:
// a BLOCKED reason is never a real cohort, so it never gets its own
// dedicated Plan template either.
//
// The C1-C5/C7 entries below are now a DEFENSIVE FALLBACK only, reachable
// solely if a Pathway Decision is somehow null/not-READY for one of these
// cohorts (which Pathway Engine's own gate logic says should not happen
// in practice) — kept rather than deleted per this codebase's own
// "never silently drop a working code path" discipline.
const TEMPLATES_BY_COHORT: Record<Exclude<CohortPrimaryState, 'CONSENT_PENDING' | 'KYC_PENDING' | 'MANUAL_REVIEW' | 'CUSTOMER_UNRESPONSIVE' | 'COMPLIANCE_HOLD' | 'DATA_REFRESH_REQUIRED' | 'OTHER_ACCOUNTS_REQUIRED' | 'P1_INFORMATION_REQUIRED' | 'SPECIALIST_REQUIRED' | 'CCR_REQUIRED'>, BbsPlanTemplate> = {
  C1: c1StabilisationTemplate,
  C2: c2ConsolidationTemplate,
  C3: c3RestructuringTemplate,
  C4: c4ResolutionTemplate,
  C5: c5DebtCycleTemplate,
  C6: c6SpecialistReviewTemplate,
  C7: c7RecoveryTemplate,
  X1: x1DataCompletionTemplate,
  X2: x2OutsideProgramTemplate,
}

/**
 * The single typed lookup point for the Template Registry (v3.0 §8.1,
 * PL002) — a static, versioned TS registry, not a dynamic admin-editable
 * table (see this module's own build notes / BbsPlan's schema doc
 * comment for why).
 *
 * `pathway` is now genuinely load-bearing (it was previously accepted but
 * silently ignored — see this module's own parity matrix for that gap):
 * when a real Pathway Decision exists (`pathway` non-null), it is the
 * PRIMARY routing key, with `pathwayVariant` selecting between
 * STABILISE's two template variants. `cohort` is used ONLY as the
 * fallback for blocked/thin states where no primary pathway exists
 * (X1/X2/C6/CONSENT_PENDING/etc.) — generation never refuses based on
 * which cohort/pathway was decided; every combination resolves to exactly
 * one template here.
 */
export function getTemplate(cohort: CohortPrimaryState | null, pathway: CohortPathway | null, pathwayVariant?: BbsPlanPathwayVariant | null): BbsPlanTemplate {
  if (pathway) {
    if (pathway === 'STABILISE' && pathwayVariant === 'NINETY_DAY') return stabilise90DayTemplate
    return TEMPLATES_BY_PATHWAY[pathway]
  }
  if (cohort && cohort in TEMPLATES_BY_COHORT) {
    return TEMPLATES_BY_COHORT[cohort as keyof typeof TEMPLATES_BY_COHORT]
  }
  return pendingResolutionTemplate
}
