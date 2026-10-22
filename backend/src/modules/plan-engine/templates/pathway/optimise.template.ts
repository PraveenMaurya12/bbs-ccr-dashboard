import type { BbsPlanTemplate } from '../../plan-engine.types'

/** v3.0 §8.3 TPL_OPTIMISE_v1 — budget framework + payment prioritisation, 3-5 customer-owned actions, 2 milestones (budget, buffer). */
export const optimiseTemplate: BbsPlanTemplate = {
  templateId: 'TPL_OPTIMISE_v1',
  cohort: null,
  pathway: 'OPTIMISE',
  objective: 'Organise the customer\'s existing, comfortable repayment capacity — budget and payment prioritisation, not restructuring.',
  situationAssessmentTemplate: 'Repayment capacity is comfortable — the focus is organisation and a sustainable buffer, not intervention.',
  problemDefinitionTemplate: 'Budget disorganisation or a lack of a cash-flow buffer, not an affordability problem.',
  debtStrategy: 'No obligations need restructuring — monitor existing accounts and prioritise any discretionary adjustments.',
  successCriteria: ['A budget is established and accepted by the customer', 'A cash-flow buffer is built and maintained'],
  risks: ['Without a buffer, a minor income shock could re-introduce pressure later'],
  disclosures: ['This is a recommendation, not an approval.', 'No score-improvement or outcome is guaranteed.'],
  actions: [
    { actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Prepare a budget framework reflecting the customer\'s own sustainable cash flow.', owner: 'CCR', timing: 'Within 3 business days' },
    { actionId: 'CA-008', ownerType: 'CUSTOMER', phase: 'DAY_30', description: 'Complete the budget template.', owner: 'Customer', timing: 'Within 14 days', slaDays: 14 },
    { actionId: 'CCR-007', ownerType: 'BBS', phase: 'DAY_30', description: 'Explain the plan to the customer.', owner: 'CCR', timing: 'Within 2 business days', slaDays: 2 },
    { actionId: 'CA-007', ownerType: 'CUSTOMER', phase: 'DAY_30', description: 'Accept the plan.', owner: 'Customer', timing: 'Within 14 days', slaDays: 14, dependency: 'CCR-007' },
  ],
  conditions: [{ conditionId: 'cond-budget-accepted', description: 'Customer accepts the budget framework.', source: 'Customer decision' }],
  initialLifecycleStatus: 'DRAFT',
}
