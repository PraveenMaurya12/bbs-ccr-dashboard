import type { BbsPlanTemplate } from '../../plan-engine.types'

/** v3.0 §8.3 TPL_RESTRUCTURE_v1 — restructuring options per lender, 6-10 actions (customer + BBS + lender), 4 milestones (lender contact, proposal, approval, execution). */
export const restructureTemplate: BbsPlanTemplate = {
  templateId: 'TPL_RESTRUCTURE_v1',
  cohort: null,
  pathway: 'RESTRUCTURE',
  objective: 'Restructure repayment terms (tenure/amount) to align with reduced but real repayment capacity.',
  situationAssessmentTemplate: 'Repayment capacity has tightened — the customer can still service debt, but not on the current terms without strain.',
  problemDefinitionTemplate: 'Current monthly obligations exceed a comfortable share of sustainable cash flow; terms need to change, not just intentions.',
  debtStrategy: 'Propose extended tenure and/or reduced instalment amounts to lenders, grounded in the customer\'s own sustainable cash-flow figure.',
  successCriteria: ['A restructuring proposal is submitted to each affected lender', 'Post-restructure instalments fit within the sustainable cash-flow figure'],
  risks: ['A lender may decline restructuring, or approve only partially, leaving a residual gap to re-plan around'],
  disclosures: ['Restructuring terms are subject to individual lender approval and may affect the total interest paid over the loan\'s life.'],
  actions: [
    { actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Calculate the proposed restructured instalment for each affected obligation against sustainable cash flow.', owner: 'CCR', timing: 'Within 3 business days' },
    { actionId: 'CA-009', ownerType: 'CUSTOMER', phase: 'DAY_30', description: 'Provide lender details for the obligations in scope.', owner: 'Customer', timing: 'Within 7 business days', slaDays: 7 },
    { actionId: 'BBS-002', ownerType: 'BBS', phase: 'DAY_30', description: 'Coordinate with the lender on the proposed restructure.', owner: 'BBS Operations', timing: 'Within 5 business days', slaDays: 5, dependency: 'CA-009' },
    { actionId: 'LND-002', ownerType: 'CREDITOR', phase: 'DAY_30', description: 'Review the restructure request.', owner: 'Lender', timing: 'Within 15 days', slaDays: 15, dependency: 'BBS-002' },
    { actionId: 'CA-011', ownerType: 'CUSTOMER', phase: 'DAY_60', description: 'Acknowledge the restructured terms.', owner: 'Customer', timing: 'Within 14 days', slaDays: 14, dependency: 'LND-002' },
    { actionId: 'day60-1', ownerType: 'BBS', phase: 'DAY_60', description: 'Verify the first restructured instalment was paid on the new schedule.', owner: 'CCR', timing: 'Day 60 review' },
  ],
  conditions: [
    { conditionId: 'cond-lender-approves-terms', description: 'Lender approves revised tenure/instalment terms.', source: 'Creditor response' },
    { conditionId: 'cond-fits-sustainable-cashflow', description: 'Approved instalment fits within sustainable cash flow.', source: 'Financial Target Model' },
  ],
  initialLifecycleStatus: 'DRAFT',
}
