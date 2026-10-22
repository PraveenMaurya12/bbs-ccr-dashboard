import type { BbsPlanTemplate } from '../plan-engine.types'

/** C4 — Resolution: debt burden beyond sustainable repayment capacity, no legal/specialist trigger yet. */
export const c4ResolutionTemplate: BbsPlanTemplate = {
  templateId: 'C4_RESOLUTION',
  cohort: 'C4',
  pathway: null,
  objective: 'Negotiate a structured resolution (settlement or write-down) for debt beyond sustainable repayment capacity.',
  situationAssessmentTemplate: 'Total debt materially exceeds what sustainable cash flow can service even under restructured terms — a negotiated resolution is the realistic path, not further repayment-term changes alone.',
  problemDefinitionTemplate: 'The gap between obligations and sustainable capacity is large enough that continuing to service all debt in full is not realistic without a negotiated reduction.',
  debtStrategy: 'Pursue a one-time settlement or structured write-down with each lender, prioritised by outstanding balance and legal exposure.',
  successCriteria: ['A settlement/write-down proposal is submitted to each major lender', 'At least one lender confirms a negotiated resolution amount'],
  risks: ['Lenders may refuse to negotiate, in which case the case may need specialist (C6) escalation', 'A negotiated settlement can affect the customer’s credit report status'],
  disclosures: ['A settlement may be reported to credit bureaus and can affect future credit eligibility; BBS cannot guarantee any lender will accept a reduced settlement.'],
  actions: [
    { actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Prioritise lenders by outstanding balance and legal exposure for settlement outreach.', owner: 'CCR', timing: 'Within 3 business days' },
    { actionId: 'day30-1', ownerType: 'CREDITOR', phase: 'DAY_30', description: 'Respond to the settlement/write-down proposal.', owner: 'Lender(s)', timing: 'Within 30 days', dependency: 'immediate-1' },
    { actionId: 'day30-2', ownerType: 'CUSTOMER', phase: 'DAY_30', description: 'Confirm ability to fund any lump-sum settlement amount negotiated.', owner: 'Customer', timing: 'Within 7 days of lender response' },
    { actionId: 'day60-1', ownerType: 'BBS', phase: 'DAY_60', description: 'Confirm settlement execution and update credit-bureau reporting status with the lender.', owner: 'CCR', timing: 'Day 60 review' },
  ],
  conditions: [
    { conditionId: 'cond-1', description: 'Lender confirms a negotiated settlement/write-down amount.', source: 'Creditor response' },
    { conditionId: 'cond-2', description: 'Customer confirms ability to fund the settlement.', source: 'CCR verification' },
  ],
  initialLifecycleStatus: 'DRAFT',
}
