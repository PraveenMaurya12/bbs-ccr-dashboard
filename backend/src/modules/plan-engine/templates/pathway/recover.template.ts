import type { BbsPlanTemplate } from '../../plan-engine.types'

/** v3.0 §8.3 TPL_RECOVER_v1 — stability monitoring + credit rebuild, 4-6 mostly-monitoring actions, 4 milestones (30/90/180-day reviews). */
export const recoverTemplate: BbsPlanTemplate = {
  templateId: 'TPL_RECOVER_v1',
  cohort: null,
  pathway: 'RECOVER',
  objective: 'Support recovery from acute hardship and track the path back toward a stable, rebuildable credit position.',
  situationAssessmentTemplate: 'The customer is recovering from an acute hardship event — the focus is monitoring stability over time, not an immediate restructuring action.',
  problemDefinitionTemplate: 'Sustained, verified on-time behaviour over several months is the main evidence needed before any further product action is considered.',
  debtStrategy: 'Track remaining obligations; no immediate change to any obligation\'s terms is proposed.',
  successCriteria: ['3 consecutive on-time payments are observed, then 6', 'Outstanding balance reduces by at least 10% within 6 months'],
  risks: ['A relapse into missed payments during the monitoring window would require re-routing to a different pathway'],
  disclosures: ['No credit-score improvement is guaranteed.', 'Monitoring reflects the information available to BBS; bureau updates are not guaranteed.'],
  actions: [
    { actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Confirm remaining obligations to track for monitoring.', owner: 'CCR', timing: 'Within 3 business days' },
    { actionId: 'day30-1', ownerType: 'BBS', phase: 'DAY_30', description: 'Confirm a 30-day payment-on-time check.', owner: 'CCR', timing: 'Day 30 review' },
    { actionId: 'day60-1', ownerType: 'BBS', phase: 'DAY_60', description: 'Confirm a 60-day payment-on-time check.', owner: 'CCR', timing: 'Day 60 review' },
    { actionId: 'day90-1', ownerType: 'BBS', phase: 'DAY_90', description: 'Confirm a 90-day payment-on-time check and outstanding-balance trend.', owner: 'CCR', timing: 'Day 90 review' },
  ],
  conditions: [{ conditionId: 'cond-payment-streak', description: 'At least 3 consecutive on-time payments observed.', source: 'Monitoring' }],
  initialLifecycleStatus: 'DRAFT',
}
