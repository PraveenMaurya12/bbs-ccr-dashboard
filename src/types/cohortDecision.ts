/** The cohort a customer is placed into after Level 3 assessment, driving the recovery plan strategy. */
export interface CohortDecision {
  id: string
  leadId: string
  level3ProfileId: string
  cohort: 'standard' | 'watchlist' | 'high_risk' | 'declined'
  decisionRationale: string
  decidedBy: string
  decidedAt: string
  requiresManualOverride: boolean
}
