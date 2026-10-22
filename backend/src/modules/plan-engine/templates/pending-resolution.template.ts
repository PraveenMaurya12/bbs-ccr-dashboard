import type { BbsPlanTemplate } from '../plan-engine.types'

/**
 * The one template beyond the spec's literal 9, named explicitly rather
 * than left to a silent default — covers the 4 upstream-gate
 * `CohortPrimaryState` values that are not C1-C7/X1/X2 but can still reach
 * Plan Engine with a COMPLETED Cohort Decision: CONSENT_PENDING,
 * KYC_PENDING, MANUAL_REVIEW, CUSTOMER_UNRESPONSIVE. `cohort: null` here
 * is deliberate — `templates/registry.ts` routes to this template by
 * exclusion (any resolved cohort not covered by one of the other 9), not
 * by matching this field.
 */
export const pendingResolutionTemplate: BbsPlanTemplate = {
  templateId: 'PENDING_RESOLUTION',
  cohort: null,
  pathway: null,
  objective: 'Hold a minimal placeholder plan pending resolution of an upstream gate before a full intervention plan can be composed.',
  situationAssessmentTemplate: 'The Cohort Decision has not yet reached a treatment-track cohort (C1-C7/X1/X2) — an upstream gate (consent, KYC, manual review, or customer contact) must resolve first.',
  problemDefinitionTemplate: 'No intervention strategy can responsibly be proposed until the upstream gate is cleared.',
  debtStrategy: 'None proposed — this plan exists only to track the upstream gate to resolution.',
  successCriteria: ['The upstream gate is resolved and a re-evaluated Cohort Decision produces a C1-C7/X1/X2 cohort'],
  risks: ['Prolonged delay in resolving the gate leaves the customer without an active intervention plan'],
  disclosures: ['This is a placeholder plan — no debt-resolution strategy has been proposed yet.'],
  actions: [{ actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Resolve the upstream gate blocking a full Cohort Decision (consent, KYC, manual review, or customer contact, as applicable).', owner: 'CCR', timing: 'Within 2 business days' }],
  conditions: [{ conditionId: 'cond-1', description: 'The upstream gate is resolved and the Cohort Decision is re-evaluated.', source: 'Cohort Engine re-evaluation' }],
  initialLifecycleStatus: 'CCR_REVIEW',
}
