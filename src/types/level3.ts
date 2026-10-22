import type { CohortDecision } from './cohortDecision'

/** Level 3: final holistic assessment used to place the customer into a cohort. */
export interface Level3CustomerProfile {
  id: string
  leadId: string
  level2ProfileId: string
  compositeRiskScore: number
  stabilityIndicators: {
    residenceStability: 'low' | 'medium' | 'high'
    employmentStability: 'low' | 'medium' | 'high'
    repaymentHistory: 'low' | 'medium' | 'high'
  }
  recommendedCohort: CohortDecision['cohort']
  assessorId: string
  assessorNotes?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  assessedAt: string
}
