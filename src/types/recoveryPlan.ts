export interface RecoveryPlanInstallment {
  installmentNumber: number
  dueDate: string
  amount: number
  status: 'upcoming' | 'paid' | 'overdue' | 'waived'
}

/** The repayment/recovery structure assigned to a customer after cohort placement. */
export interface RecoveryPlan {
  id: string
  leadId: string
  cohortDecisionId: string
  planType: 'standard_emi' | 'restructured_emi' | 'settlement' | 'legal_recovery'
  principalAmount: number
  tenureMonths: number
  interestRatePercent: number
  monthlyInstallmentAmount: number
  installments: RecoveryPlanInstallment[]
  ownerCcrId: string
  ownerCcrName: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  createdAt: string
  updatedAt: string
}
