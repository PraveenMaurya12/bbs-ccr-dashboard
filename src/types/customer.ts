export type CustomerStage =
  | 'lead'
  | 'credit_reviewed'
  | 'financially_assessed'
  | 'cohort_decided'
  | 'in_recovery_plan'
  | 'onboarded'
  | 'rejected'

export interface Customer {
  id: string
  customerId: string
  leadId: string
  fullName: string
  phone: string
  email: string
  city: string
  dateOfBirth: string
  occupation: string
  monthlyIncomeBand: 'under_25k' | '25k_50k' | '50k_100k' | '100k_plus'
  stage: CustomerStage
  createdAt: string
  updatedAt: string
}
