import type { BbsPlanTemplate } from '../../plan-engine.types'

/**
 * v3.0 §8.3 TPL_STABILISE_90D_v1 — PROPOSED, requires Business/Legal/
 * Credit/Risk sign-off. Built honestly per spec, but NEVER reachable
 * today: Pathway Engine's own `pathwayVariant` is hardcoded `STANDARD`
 * and the 90-Day Stabilisation Variant is never auto-selected (confirmed
 * via Pathway Engine's own parity matrix) — `templates/registry.ts` only
 * routes here if `pathwayVariant === 'NINETY_DAY'`, which cannot occur
 * through the normal evaluate()/reassess() flow.
 */
export const stabilise90DayTemplate: BbsPlanTemplate = {
  templateId: 'TPL_STABILISE_90D_v1',
  cohort: null,
  pathway: 'STABILISE',
  pathwayVariant: 'NINETY_DAY',
  objective: 'PROPOSED — a structured 90-day overdue-handling and monitoring arrangement. Requires Business/Legal/Credit/Risk sign-off before use; not auto-selectable in this build.',
  situationAssessmentTemplate: 'PROPOSED 90-day overdue support arrangement — requires sign-off not yet obtained.',
  problemDefinitionTemplate: 'Overdue obligations exceed what a standard stabilisation plan can address within 30 days.',
  debtStrategy: 'PROPOSED overdue-handling strategy — funding/product/legal preconditions are not currently confirmable (no live lender/product integration exists in this codebase).',
  successCriteria: ['PROPOSED — approval obtained', 'PROPOSED — disbursement completed', 'PROPOSED — 30/60/90-day reviews completed'],
  risks: ['This variant has not received the required Business/Legal/Credit/Risk sign-off and must not be presented to a customer'],
  disclosures: ['This plan variant is PROPOSED and is not available for customer presentation until formally approved.'],
  actions: [
    { actionId: 'BBS-005', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Disburse the stabilisation fund. (PROPOSED — requires sign-off.)', owner: 'BBS Operations', timing: 'Within 5 business days', slaDays: 5 },
    { actionId: 'CA-012', ownerType: 'CUSTOMER', phase: 'DAY_30', description: 'Make the first payment under the arrangement.', owner: 'Customer', timing: 'Within 30 days', slaDays: 30 },
  ],
  conditions: [{ conditionId: 'cond-90day-signoff', description: 'Business/Legal/Credit/Risk sign-off obtained for the 90-Day Stabilisation Variant.', source: 'Production readiness sign-off register (§25)' }],
  initialLifecycleStatus: 'SPECIALIST_REVIEW',
}
