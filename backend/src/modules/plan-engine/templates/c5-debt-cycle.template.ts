import type { BbsPlanTemplate } from '../plan-engine.types'

/** C5 — Debt-Cycle Intervention: active stacking/enquiry-burst signal (R010-R013) ahead of further escalation. */
export const c5DebtCycleTemplate: BbsPlanTemplate = {
  templateId: 'C5_DEBT_CYCLE_INTERVENTION',
  cohort: 'C5',
  pathway: null,
  objective: 'Break an active debt-stacking/debt-cycle pattern before further new borrowing escalates risk.',
  situationAssessmentTemplate: 'Recent borrowing activity (new accounts, enquiry bursts, or an active stacking cluster) indicates an active debt cycle rather than a one-time event.',
  problemDefinitionTemplate: 'Continued new borrowing against an already-stretched position will outpace any repayment or restructuring plan unless the cycle itself is addressed first.',
  debtStrategy: 'Freeze any new borrowing as a precondition before pursuing restructuring/consolidation; address the underlying driver (per possible-cause evidence from Master Profile) directly with the customer.',
  successCriteria: ['No new credit account opened during the review window', 'Enquiry volume returns to baseline (below the Cohort Engine’s enquiry-burst threshold)'],
  risks: ['Without addressing the underlying driver, the customer may continue borrowing even after this plan is accepted'],
  disclosures: ['This plan does not freeze the customer’s credit facilities directly — it is a commitment the customer agrees to, not a technical block BBS can enforce.'],
  actions: [
    { actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Discuss the recent borrowing pattern with the customer and identify the underlying driver.', owner: 'CCR', timing: 'Within 2 business days' },
    { actionId: 'immediate-2', ownerType: 'CUSTOMER', phase: 'IMMEDIATE', description: 'Commit to not taking on new unsecured credit for the duration of this plan.', owner: 'Customer', timing: 'Immediate' },
    { actionId: 'day30-1', ownerType: 'BBS', phase: 'DAY_30', description: 'Re-check enquiry/new-account activity against the Cohort Engine’s own thresholds.', owner: 'CCR', timing: 'Day 30 review' },
    { actionId: 'day60-1', ownerType: 'BBS', phase: 'DAY_60', description: 'If the cycle has stopped, reassess for a C2/C3 consolidation/restructuring plan; if not, escalate.', owner: 'CCR', timing: 'Day 60 review' },
  ],
  conditions: [{ conditionId: 'cond-1', description: 'No new credit account opened since plan generation.', source: 'Debt Analysis (next Cohort re-evaluation)' }],
  initialLifecycleStatus: 'DRAFT',
}
