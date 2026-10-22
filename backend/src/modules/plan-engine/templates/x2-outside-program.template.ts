import type { BbsPlanTemplate } from '../plan-engine.types'

/** X2 — Outside Program: the Cohort Decision determined this case falls outside BBS's program scope. */
export const x2OutsideProgramTemplate: BbsPlanTemplate = {
  templateId: 'X2_OUTSIDE_PROGRAM',
  cohort: 'X2',
  pathway: null,
  objective: 'Record that this case falls outside BBS’s program scope and the resulting outcome for the customer.',
  situationAssessmentTemplate: 'The Cohort Decision classified this case as out of scope for the BBS program.',
  problemDefinitionTemplate: 'No BBS intervention plan applies to this case under the current Cohort Decision.',
  debtStrategy: 'None proposed by BBS — the customer should be directed to an appropriate alternative resource where relevant.',
  successCriteria: ['The customer has been informed of the outside-program outcome and any relevant alternative resources'],
  risks: ['The customer may not have another resolution path readily available'],
  disclosures: ['This case is outside the scope of what the BBS program can offer; this is not a judgment on the customer’s situation.'],
  actions: [{ actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Inform the customer of the outside-program outcome and share any applicable alternative resources.', owner: 'CCR', timing: 'Within 2 business days' }],
  conditions: [],
  initialLifecycleStatus: 'CCR_REVIEW',
}
