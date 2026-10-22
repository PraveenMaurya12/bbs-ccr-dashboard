import type { BbsPlanTemplate } from '../plan-engine.types'

/** C7 — Recovery/Hardship: distressed capacity, acute hardship — minimum sustainable near-term actions only. */
export const c7RecoveryTemplate: BbsPlanTemplate = {
  templateId: 'C7_RECOVERY',
  cohort: 'C7',
  pathway: null,
  objective: 'Support recovery from acute hardship with the minimum sustainable near-term actions, deferring larger commitments.',
  situationAssessmentTemplate: 'Repayment capacity is distressed — the immediate priority is stabilising essential living expenses, not debt repayment.',
  problemDefinitionTemplate: 'Sustainable cash flow is at or near zero; committing to any standard repayment/restructuring/consolidation plan now would not be realistic.',
  debtStrategy: 'Request temporary hardship consideration (payment pause/deferral) from lenders rather than a full restructuring commitment.',
  successCriteria: ['At least one lender grants a temporary hardship accommodation', 'Essential living expenses are being met'],
  risks: ['Lenders may not grant hardship consideration, and continued non-payment could still affect the credit report during this period'],
  disclosures: ['A hardship pause does not remove the underlying obligation and may still be reported to credit bureaus unless the lender confirms otherwise.'],
  actions: [
    { actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Request temporary hardship consideration from each active lender.', owner: 'CCR', timing: 'Within 2 business days' },
    { actionId: 'day30-1', ownerType: 'CREDITOR', phase: 'DAY_30', description: 'Respond to the hardship request.', owner: 'Lender(s)', timing: 'Within 30 days', dependency: 'immediate-1' },
    { actionId: 'day60-1', ownerType: 'BBS', phase: 'DAY_60', description: 'Reassess capacity; if improved, move toward a C3/C4 plan.', owner: 'CCR', timing: 'Day 60 review' },
  ],
  conditions: [{ conditionId: 'cond-1', description: 'At least one lender confirms a hardship accommodation.', source: 'Creditor response' }],
  initialLifecycleStatus: 'DRAFT',
}
