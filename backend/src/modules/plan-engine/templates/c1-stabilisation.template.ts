import type { BbsPlanTemplate } from '../plan-engine.types'

/** C1 — Stabilisation: comfortable capacity, no active legal/specialist trigger, no escalating DPD. */
export const c1StabilisationTemplate: BbsPlanTemplate = {
  templateId: 'C1_STABILISATION',
  cohort: 'C1',
  pathway: null,
  objective: 'Stabilise short-term cash flow and keep repayments current while capacity remains comfortable.',
  situationAssessmentTemplate: 'The customer currently has comfortable repayment capacity with no active legal or specialist trigger — the goal is to keep it that way, not to rescue a failing position.',
  problemDefinitionTemplate: 'No acute debt-resolution problem exists; the risk is drift (a missed payment, a new borrowing event, or an income shock) eroding an otherwise stable position.',
  debtStrategy: 'Maintain existing repayment schedules as reported; no consolidation or restructuring is indicated at this capacity band.',
  successCriteria: ['No new overdue account in the review window', 'Capacity ratio remains at or above the comfortable band', 'No new borrowing/stacking event detected'],
  risks: ['An income shock or new borrowing event could move the customer into a tighter capacity band without warning'],
  disclosures: ['This plan is a stabilisation guide, not a credit facility — it does not change any existing loan terms.'],
  actions: [
    { actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Confirm the customer understands their current repayment schedule and has no near-term income disruption.', owner: 'CCR', timing: 'Within 2 business days' },
    { actionId: 'day30-1', ownerType: 'CUSTOMER', phase: 'DAY_30', description: 'Continue servicing all existing obligations on schedule.', owner: 'Customer', timing: 'Ongoing' },
    { actionId: 'day60-1', ownerType: 'BBS', phase: 'DAY_60', description: 'Check in on repayment status and capacity stability.', owner: 'CCR', timing: 'Day 60 review' },
  ],
  conditions: [{ conditionId: 'cond-1', description: 'No new overdue account reported since plan generation.', source: 'Debt Analysis (next Cohort re-evaluation)' }],
  initialLifecycleStatus: 'DRAFT',
}
