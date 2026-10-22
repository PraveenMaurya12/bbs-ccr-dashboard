import type { BbsPlanTemplate } from '../plan-engine.types'

/** C3 — Restructuring: tight/stressed capacity, real but reduced repayment ability. */
export const c3RestructuringTemplate: BbsPlanTemplate = {
  templateId: 'C3_RESTRUCTURING',
  cohort: 'C3',
  pathway: null,
  objective: 'Restructure repayment terms (tenure/amount) to align with reduced but real repayment capacity.',
  situationAssessmentTemplate: 'Repayment capacity has tightened — the customer can still service debt, but not on the current terms without strain.',
  problemDefinitionTemplate: 'Current monthly obligations exceed a comfortable share of sustainable cash flow; terms need to change, not just intentions.',
  debtStrategy: 'Propose extended tenure and/or reduced instalment amounts to lenders, grounded in the Cohort Engine’s own sustainable-cash-flow figure.',
  successCriteria: ['A restructuring proposal is submitted to each affected lender', 'Post-restructure instalments fit within the sustainable cash-flow figure'],
  risks: ['A lender may decline restructuring, or approve only partially, leaving a residual gap to re-plan around'],
  disclosures: ['Restructuring terms are subject to individual lender approval and may affect the total interest paid over the loan’s life.'],
  actions: [
    { actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Calculate the proposed restructured instalment for each affected obligation against sustainable cash flow.', owner: 'CCR', timing: 'Within 3 business days' },
    { actionId: 'day30-1', ownerType: 'CREDITOR', phase: 'DAY_30', description: 'Review and respond to the restructuring proposal.', owner: 'Lender(s)', timing: 'Within 30 days', dependency: 'immediate-1' },
    { actionId: 'day30-2', ownerType: 'CUSTOMER', phase: 'DAY_30', description: 'Confirm acceptance of any restructured terms a lender offers.', owner: 'Customer', timing: 'Within 7 days of lender response' },
    { actionId: 'day60-1', ownerType: 'BBS', phase: 'DAY_60', description: 'Verify the first restructured instalment was paid on the new schedule.', owner: 'CCR', timing: 'Day 60 review' },
  ],
  conditions: [
    { conditionId: 'cond-1', description: 'Lender approves revised tenure/instalment terms.', source: 'Creditor response' },
    { conditionId: 'cond-2', description: 'Approved instalment fits within sustainable cash flow.', source: 'Cohort Engine capacity model' },
  ],
  initialLifecycleStatus: 'DRAFT',
}
