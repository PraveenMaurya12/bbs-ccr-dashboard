import type { BbsPlanTemplate } from '../../plan-engine.types'

/** v3.0 §8.3 TPL_CONSOLIDATE_v1 — consolidated debt structure (proposed), 6-10 actions (customer + BBS + lender), 4 milestones (product check, lender check, offer, execution). */
export const consolidateTemplate: BbsPlanTemplate = {
  templateId: 'TPL_CONSOLIDATE_v1',
  cohort: null,
  pathway: 'CONSOLIDATE',
  objective: 'Evaluate consolidating multiple eligible obligations into a single, more manageable repayment.',
  situationAssessmentTemplate: 'Multiple obligations are eligible for consolidation into one repayment, grounded in the customer\'s own sustainable cash flow.',
  problemDefinitionTemplate: 'Managing several separate obligations adds complexity and risk of missed payments relative to a single consolidated repayment.',
  debtStrategy: 'Propose a single consolidated repayment covering the eligible obligations, subject to lender review and approval.',
  successCriteria: ['A consolidation application is submitted', 'The lender approves the consolidation', 'The first consolidated payment is made on time'],
  risks: ['The lender may decline or only partially approve consolidation, leaving some obligations outside the arrangement'],
  disclosures: ['Consolidation is subject to individual lender approval.', 'This is a recommendation, not an approval.', 'Fees, if any, are disclosed before acceptance.'],
  actions: [
    { actionId: 'BBS-004', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Verify eligibility for consolidation.', owner: 'BBS Operations', timing: 'Within 5 business days', slaDays: 5 },
    { actionId: 'CA-009', ownerType: 'CUSTOMER', phase: 'DAY_30', description: 'Provide lender details for the obligations in scope.', owner: 'Customer', timing: 'Within 7 business days', slaDays: 7 },
    { actionId: 'BBS-001', ownerType: 'BBS', phase: 'DAY_30', description: 'Process the consolidation application.', owner: 'BBS Operations', timing: 'Within 5 business days', slaDays: 5, dependency: 'CA-009' },
    { actionId: 'LND-001', ownerType: 'CREDITOR', phase: 'DAY_30', description: 'Review the consolidation request.', owner: 'Lender', timing: 'Within 15 days', slaDays: 15, dependency: 'BBS-001' },
    { actionId: 'CA-011', ownerType: 'CUSTOMER', phase: 'DAY_60', description: 'Acknowledge the terms of the proposed consolidation.', owner: 'Customer', timing: 'Within 14 days', slaDays: 14, dependency: 'LND-001' },
    { actionId: 'CA-012', ownerType: 'CUSTOMER', phase: 'DAY_60', description: 'Make the first consolidated payment.', owner: 'Customer', timing: 'Within 30 days', slaDays: 30, dependency: 'CA-011' },
  ],
  conditions: [
    { conditionId: 'cond-2-eligible-obligations', description: 'At least 2 eligible obligations exist for consolidation.', source: 'Debt Analysis account list' },
    { conditionId: 'cond-lender-approves', description: 'Lender approves the consolidation request.', source: 'Creditor response' },
  ],
  initialLifecycleStatus: 'DRAFT',
}
