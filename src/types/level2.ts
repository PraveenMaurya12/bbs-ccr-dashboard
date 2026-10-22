/** Level 2: deeper financial profile combining declared and verified income/expense data. */
export interface Level2FinancialProfile {
  id: string
  leadId: string
  level1ProfileId: string
  declaredMonthlyIncome: number
  verifiedMonthlyIncome: number | null
  monthlyExpenses: number
  existingEmiObligations: number
  disposableIncome: number
  employmentType: 'salaried' | 'self_employed' | 'business_owner' | 'unemployed'
  employmentTenureMonths: number
  bankStatementSummary: {
    averageMonthlyBalance: number
    bounceCountLast6Months: number
  }
  affordabilityBand: 'low' | 'medium' | 'high'
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  reviewedAt: string
}
