import type { BbsPlanTemplate } from '../plan-engine.types'

/** C6 — Specialist Review: an active legal/specialist trigger (suit filed, ARC assignment, or willful default) requires case-specific review before any standard plan is committed. */
export const c6SpecialistReviewTemplate: BbsPlanTemplate = {
  templateId: 'C6_SPECIALIST_REVIEW',
  cohort: 'C6',
  pathway: null,
  objective: 'Escalate to a BBS specialist for case-specific legal/compliance assessment before any plan commitment.',
  situationAssessmentTemplate: 'An active legal or specialist trigger (a filed suit, ARC assignment, or a willful-default flag) is present — this requires individual case review, not a standard template plan.',
  problemDefinitionTemplate: 'A standard repayment/restructuring/settlement plan cannot responsibly be offered while an unresolved legal/specialist flag is active.',
  debtStrategy: 'No debt strategy is proposed by this template — it is deliberately thin; the strategy itself is set by the specialist after review.',
  successCriteria: ['A specialist has reviewed the case and either cleared it for a standard plan or set case-specific terms'],
  risks: ['Any standard plan action taken before specialist review could conflict with an active legal process'],
  disclosures: ['This case has an active legal/compliance flag and is being reviewed by a BBS specialist before any plan is finalised.'],
  actions: [{ actionId: 'immediate-1', ownerType: 'BBS', phase: 'IMMEDIATE', description: 'Route this case to a BBS specialist for legal/compliance review.', owner: 'Specialist', timing: 'Within 2 business days' }],
  conditions: [{ conditionId: 'cond-1', description: 'A BBS specialist has completed case-specific review.', source: 'Specialist sign-off' }],
  initialLifecycleStatus: 'SPECIALIST_REVIEW',
}
