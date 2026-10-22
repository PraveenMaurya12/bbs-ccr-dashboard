import type { BbsPlanTemplate } from '../plan-engine.types'

/** C2 — Consolidation: multiple active lenders/accounts, tight-but-workable capacity. */
export const c2ConsolidationTemplate: BbsPlanTemplate = {
  templateId: 'C2_CONSOLIDATION',
  cohort: 'C2',
  pathway: null,
  objective: 'Consolidate multiple obligations into a single, more serviceable repayment structure.',
  situationAssessmentTemplate: 'Debt is spread across multiple lenders/products, adding repayment complexity even though overall capacity is still workable.',
  problemDefinitionTemplate: 'Fragmented obligations across several lenders increase the chance of a missed payment and make the true monthly commitment harder for the customer to track.',
  debtStrategy: 'Explore consolidating eligible obligations into one facility/schedule, subject to lender willingness — no consolidation is assumed approved until a lender actually confirms it.',
  successCriteria: ['A documented consolidation proposal is shared with at least one lender', 'Monthly obligation count reduces without increasing total monthly outflow beyond sustainable capacity'],
  risks: ['A lender may decline consolidation — in that case the plan must be reassessed, not silently continued as if approved'],
  disclosures: ['Consolidation depends on individual lender approval; BBS cannot guarantee any lender will agree to consolidate.'],
  actions: [
    { actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Compile the full list of active obligations eligible for consolidation.', owner: 'CCR', timing: 'Within 3 business days' },
    { actionId: 'day30-1', ownerType: 'CREDITOR', phase: 'DAY_30', description: 'Respond to the consolidation proposal.', owner: 'Lender(s)', timing: 'Within 30 days', dependency: 'immediate-1' },
    { actionId: 'day30-2', ownerType: 'CUSTOMER', phase: 'DAY_30', description: 'Provide any additional documents a lender requests to evaluate consolidation.', owner: 'Customer', timing: 'As requested' },
    { actionId: 'day60-1', ownerType: 'BBS', phase: 'DAY_60', description: 'Confirm consolidation outcome and update the plan accordingly.', owner: 'CCR', timing: 'Day 60 review' },
  ],
  conditions: [
    { conditionId: 'cond-1', description: 'At least one lender confirms willingness to consolidate.', source: 'Creditor response' },
    { conditionId: 'cond-2', description: 'Consolidated monthly outflow stays within sustainable capacity.', source: 'Cohort Engine capacity model' },
  ],
  initialLifecycleStatus: 'DRAFT',
}
