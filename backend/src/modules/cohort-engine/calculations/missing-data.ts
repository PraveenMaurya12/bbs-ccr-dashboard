import type { CohortInput, MissingDataItem } from '../cohort-engine.types'

export interface MasterProfileMissingItem {
  itemText: string
  sourceModule: string
  priority: 'P1' | 'P2' | 'P3'
  resolved?: boolean
}

/**
 * Spec's own X1 example shape (field, why, document, owner, next action) —
 * built from gaps CohortInput itself already knows about, plus (v3.0 §3.3/
 * §20's own register) Master Profile's already-computed P1/P2 missing-
 * information items, reused verbatim (never recounted from raw data, never
 * a duplicate parallel list). X1 "must not be a dead end."
 */
export function assessMissingDataAndDocuments(input: CohortInput, masterProfileMissingItems: MasterProfileMissingItem[] = []): { missingData: MissingDataItem[]; requiredDocuments: string[] } {
  const missingData: MissingDataItem[] = []
  const requiredDocuments: string[] = []

  for (const item of masterProfileMissingItems) {
    if (item.resolved) continue
    if (item.priority !== 'P1' && item.priority !== 'P2') continue
    missingData.push({ field: `masterProfile.${item.sourceModule}`, why: item.itemText, document: null, owner: 'CCR', nextAction: `Resolve this ${item.priority} item in the Master Profile Missing Information Register.` })
  }

  if (!input.readiness.debtAnalysisComplete) {
    missingData.push({ field: 'creditReport', why: 'A completed credit report is required to assess debt position.', document: null, owner: 'CCR', nextAction: 'Wait for or retry the bureau pull for this lead.' })
  }
  if (!input.readiness.financialAnalysisComplete) {
    missingData.push({ field: 'bankStatement', why: 'A completed bank-statement analysis is required to assess income and cash flow.', document: 'Bank statement (last 12 months)', owner: 'CCR', nextAction: 'Upload a bank statement under the Documents tab.' })
    requiredDocuments.push('Bank statement (last 12 months)')
  }
  if (input.readiness.financialAnalysisComplete && !input.financial.verifiedIncomeAvailable) {
    missingData.push({ field: 'verifiedMonthlyIncome', why: 'Capacity cannot be reliably assessed without a verified recurring income source.', document: 'Salary slip or income proof', owner: 'CCR', nextAction: 'Confirm income directly with the borrower and request supporting evidence.' })
    requiredDocuments.push('Salary slip or income proof')
  }
  if (input.reconciliation.unresolvedMismatch) {
    missingData.push({ field: 'reconciliation', why: 'An unresolved material mismatch exists between the credit report and bank statement.', document: null, owner: 'CCR', nextAction: 'Review the Master Profile\'s reconciliation evidence with the borrower.' })
  }
  if (!input.lead.consentGranted) {
    missingData.push({ field: 'consent', why: 'Valid consent is required before bureau/financial data can be processed further.', document: 'Consent record', owner: 'CCR', nextAction: 'Obtain explicit consent from the borrower.' })
  }
  if (!input.lead.panAvailable) {
    missingData.push({ field: 'panKyc', why: 'A verified PAN/KYC reference is required before proceeding.', document: 'PAN card / KYC document', owner: 'CCR', nextAction: 'Collect and verify the borrower\'s PAN/KYC document.' })
    requiredDocuments.push('PAN card / KYC document')
  }

  return { missingData, requiredDocuments }
}
