/** Level 1: initial automated credit screening derived from the bureau report. */
export interface Level1CreditProfile {
  id: string
  leadId: string
  creditReportId: string
  creditScore: number
  riskGrade: 'A' | 'B' | 'C' | 'D' | 'E'
  debtToIncomeEstimate: number
  eligibilityFlag: 'eligible' | 'conditionally_eligible' | 'not_eligible'
  flaggedReasons: string[]
  reviewedAt: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'requires_review'
}
