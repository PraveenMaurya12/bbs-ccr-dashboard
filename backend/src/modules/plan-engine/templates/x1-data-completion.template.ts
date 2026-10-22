import type { BbsPlanTemplate } from '../plan-engine.types'

/** X1 — Data Completion: Cohort Decision itself could not resolve a confident cohort due to missing/unreported data. Never a dead end — this plan's own job IS data completion. */
export const x1DataCompletionTemplate: BbsPlanTemplate = {
  templateId: 'X1_DATA_COMPLETION',
  cohort: 'X1',
  pathway: null,
  objective: 'Complete the missing data required before a resolution plan can be properly assessed.',
  situationAssessmentTemplate: 'The Cohort Decision could not resolve a confident treatment track because required data is missing or unverified — this plan exists to close that gap, not to propose a resolution strategy yet.',
  problemDefinitionTemplate: 'Without the data listed in this plan’s missing-data panel, no capacity, debt-strategy, or target figures can be responsibly set.',
  debtStrategy: 'No debt strategy is proposed until the required data is collected and the Cohort Decision is re-evaluated.',
  successCriteria: ['Every item in the missing-data list is resolved', 'A re-evaluated Cohort Decision produces a confident, non-X1 cohort'],
  risks: ['If the customer cannot be reached to provide missing data, this case may need to move to CUSTOMER_UNRESPONSIVE'],
  disclosures: ['This is a data-completion plan, not a debt-resolution plan — no repayment/settlement terms are proposed at this stage.'],
  actions: [{ actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Review the missing-data list with the customer and request each item.', owner: 'CCR', timing: 'Within 2 business days' }],
  conditions: [{ conditionId: 'cond-1', description: 'All missing-data items are resolved and the Cohort Decision is re-evaluated.', source: 'Cohort Engine re-evaluation' }],
  initialLifecycleStatus: 'CCR_REVIEW',
}
