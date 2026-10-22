export type BureauName = 'MockBureau One' | 'MockBureau Two' | 'MockBureau Three'

export interface CreditTradeline {
  id: string
  accountType: 'credit_card' | 'personal_loan' | 'auto_loan' | 'consumer_durable_loan'
  lender: string
  openedOn: string
  sanctionedAmount: number
  currentBalance: number
  paymentStatus: 'current' | 'overdue_30' | 'overdue_60' | 'overdue_90_plus' | 'closed'
}

/**
 * A fully synthetic bureau report summary. `maskedIdNumber` is a fictional
 * placeholder pattern (e.g. "XXXX-XXXX-1234") and never a real identifier.
 */
export interface CreditReport {
  id: string
  leadId: string
  bureau: BureauName
  maskedIdNumber: string
  pulledAt: string
  creditScore: number
  scoreBand: 'poor' | 'fair' | 'good' | 'very_good' | 'excellent'
  totalActiveAccounts: number
  totalOutstandingBalance: number
  delinquentAccounts: number
  tradelines: CreditTradeline[]
  processingStatus: 'queued' | 'processing' | 'ready' | 'failed'
}
