import type { BbsPlanTemplate } from '../../plan-engine.types'

/** v3.0 §8.3 TPL_STABILISE_STD_v1 — immediate priorities + essential protection, 5-8 actions (customer + CCR), 3 milestones (position established, first payment, review). */
export const stabiliseStandardTemplate: BbsPlanTemplate = {
  templateId: 'TPL_STABILISE_STD_v1',
  cohort: null,
  pathway: 'STABILISE',
  pathwayVariant: 'STANDARD',
  objective: 'Address immediate financial pressure and establish a sustainable short-term position before any structural change is considered.',
  situationAssessmentTemplate: 'The customer is under genuine short-term pressure — the priority is stabilising the immediate position, not yet restructuring debt.',
  problemDefinitionTemplate: 'Current obligations are not comfortably affordable against verified income and essential expenses right now.',
  debtStrategy: 'Identify and prioritise the most urgent obligations; no restructuring proposal is made until the position stabilises.',
  successCriteria: ['Income is verified by CCR', 'The customer\'s short-term position is stabilised', 'The first scheduled payment is made on time'],
  risks: ['A further income shock during the stabilisation period could require re-planning'],
  disclosures: ['This is a recommendation, not an approval.', 'No settlement or debt waiver is guaranteed.', 'No score-improvement is guaranteed.'],
  actions: [
    { actionId: 'CA-004', ownerType: 'CUSTOMER', phase: 'IMMEDIATE', description: 'Confirm income details.', owner: 'Customer', timing: 'Within 5 business days', slaDays: 5 },
    { actionId: 'CA-005', ownerType: 'CUSTOMER', phase: 'IMMEDIATE', description: 'Confirm essential expenses.', owner: 'Customer', timing: 'Within 5 business days', slaDays: 5 },
    { actionId: 'CCR-001', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Validate income.', owner: 'CCR', timing: 'Within 3 business days', slaDays: 3 },
    { actionId: 'CCR-004', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Confirm the reason for financial distress.', owner: 'CCR', timing: 'Within 3 business days', slaDays: 3 },
    { actionId: 'CCR-007', ownerType: 'BBS', phase: 'DAY_30', description: 'Explain the plan to the customer.', owner: 'CCR', timing: 'Within 2 business days', slaDays: 2 },
    { actionId: 'CA-007', ownerType: 'CUSTOMER', phase: 'DAY_30', description: 'Accept the plan.', owner: 'Customer', timing: 'Within 14 days', slaDays: 14, dependency: 'CCR-007' },
  ],
  conditions: [
    { conditionId: 'cond-income-verified', description: 'Income verified by CCR.', source: 'CCR validation' },
    { conditionId: 'cond-position-stabilised', description: 'Immediate financial pressure has reduced.', source: 'CCR review' },
  ],
  initialLifecycleStatus: 'DRAFT',
}
