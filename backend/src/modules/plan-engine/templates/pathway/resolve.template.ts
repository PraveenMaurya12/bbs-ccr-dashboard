import type { BbsPlanTemplate } from '../../plan-engine.types'

/** v3.0 §8.3 TPL_RESOLVE_v1 — resolution options assessment, 8-12 actions (customer + BBS + legal + lender), 5 milestones (options assessment, negotiation, agreement, monitoring, closure). RESOLVE's own financial targets remain PROPOSED per §12.2. */
export const resolveTemplate: BbsPlanTemplate = {
  templateId: 'TPL_RESOLVE_v1',
  cohort: null,
  pathway: 'RESOLVE',
  objective: 'Assess structured resolution options (e.g. negotiated settlement) for obligations that cannot realistically be serviced on current or restructured terms.',
  situationAssessmentTemplate: 'Capacity is insufficient even with restructuring — a negotiated resolution may be the only realistic path forward.',
  problemDefinitionTemplate: 'Sustainable cash flow cannot cover even a restructured repayment across the affected obligations.',
  debtStrategy: 'Identify resolution candidates and prepare a resolution proposal for lender review. Financial resolution-range targets are PROPOSED pending Business/Legal/Risk sign-off (v3.0 §12.6).',
  successCriteria: ['Resolution candidates are identified', 'A resolution proposal is submitted', 'The lender responds to the proposal'],
  risks: ['A lender may decline resolution entirely, requiring escalation to specialist review', 'A resolution may affect the customer\'s credit history beyond what a restructuring would'],
  disclosures: ['No settlement or debt waiver is guaranteed.', 'This depends on the lender\'s own resolution options and approval.', 'Fees, if any, are disclosed before acceptance and require Business/Legal/Compliance approval.'],
  actions: [
    { actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Assess resolution candidates against sustainable cash flow.', owner: 'CCR', timing: 'Within 3 business days' },
    { actionId: 'CA-009', ownerType: 'CUSTOMER', phase: 'DAY_30', description: 'Provide lender details for the obligations in scope.', owner: 'Customer', timing: 'Within 7 business days', slaDays: 7 },
    { actionId: 'BBS-003', ownerType: 'BBS', phase: 'DAY_30', description: 'Prepare the resolution proposal.', owner: 'BBS Operations', timing: 'Within 5 business days', slaDays: 5, dependency: 'CA-009' },
    { actionId: 'BBS-002', ownerType: 'BBS', phase: 'DAY_30', description: 'Coordinate with the lender on the proposed resolution.', owner: 'BBS Operations', timing: 'Within 5 business days', slaDays: 5, dependency: 'BBS-003' },
    { actionId: 'LND-003', ownerType: 'CREDITOR', phase: 'DAY_60', description: 'Accept or reject the proposed resolution.', owner: 'Lender', timing: 'Within 15 days', slaDays: 15, dependency: 'BBS-002' },
    { actionId: 'LND-004', ownerType: 'CREDITOR', phase: 'DAY_60', description: 'Confirm settlement terms.', owner: 'Lender', timing: 'Within 15 days', slaDays: 15, dependency: 'LND-003' },
    { actionId: 'CA-011', ownerType: 'CUSTOMER', phase: 'DAY_90', description: 'Acknowledge the terms of the resolution.', owner: 'Customer', timing: 'Within 14 days', slaDays: 14, dependency: 'LND-004' },
  ],
  conditions: [
    { conditionId: 'cond-resolution-candidate-identified', description: 'A viable resolution candidate obligation is identified.', source: 'Debt strategy assessment' },
    { conditionId: 'cond-lender-accepts-resolution', description: 'Lender accepts the resolution proposal.', source: 'Creditor response' },
  ],
  initialLifecycleStatus: 'DRAFT',
}
