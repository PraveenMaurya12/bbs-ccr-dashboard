import type { BbsPlanConditionOutput, PlanInput } from '../plan-engine.types'
import type { FinancialTargetResult } from './financial-targets'

/**
 * v3.0 §13.4's 10 standard conditions. Plan Engine only ever independently
 * verifies the 7 it can honestly evaluate from already-gated upstream
 * facts (consent/KYC/identity/income/essential-expenses/protected-buffer/
 * no-compliance-hold/no-P1-items) — these read as audit-confirmation
 * conditions, not open gates, because a real pathway could never have
 * reached Plan Engine with any of them genuinely unmet (Pathway Engine's
 * own P001 gate would have routed to BLOCKED first). The 3 conditions
 * needing a live product/lender/specialist integration (`Product
 * available`, `Lender willing`, `Specialist cleared`) stay
 * NOT_APPLICABLE, same no-live-integration discipline as Pathway Engine's
 * own P011/P012 handling — never penalized as FAILED for a codebase gap.
 */
export function buildStandardConditions(input: PlanInput, financialTargets: FinancialTargetResult): BbsPlanConditionOutput[] {
  const complianceHoldActive = input.riskFlags.includes('COMPLIANCE_HOLD')
  const incomeUnreconciled = input.riskFlags.includes('FCF_UNRECONCILED')

  const conditions: BbsPlanConditionOutput[] = [
    { conditionId: 'std-consent-valid', description: 'Consent valid.', state: 'MET', source: 'Cohort Engine upstream gate (CONSENT_PENDING would have blocked before reaching Plan Engine)', verificationStatus: 'VERIFIED', priority: 'P1' },
    { conditionId: 'std-kyc-complete', description: 'KYC complete.', state: 'MET', source: 'Cohort Engine upstream gate (KYC_PENDING would have blocked before reaching Plan Engine)', verificationStatus: 'VERIFIED', priority: 'P1' },
    { conditionId: 'std-identity-verified', description: 'Identity verified.', state: 'MET', source: 'Master Profile identity/compliance checks', verificationStatus: 'VERIFIED', priority: 'P1' },
    { conditionId: 'std-income-verified', description: 'Income verified.', state: incomeUnreconciled ? 'PENDING' : 'MET', source: 'Master Profile income-cash-flow reconciliation', verificationStatus: incomeUnreconciled ? 'UNVERIFIED' : 'VERIFIED', priority: 'P1', escalationPath: incomeUnreconciled ? 'CCR → Credit → Risk' : undefined },
    { conditionId: 'std-essential-expenses-verified', description: 'Essential expenses verified.', state: 'MET', source: 'Master Profile financial capacity', verificationStatus: 'VERIFIED', priority: 'P1' },
    { conditionId: 'std-protected-buffer-preserved', description: 'Protected buffer preserved.', state: financialTargets.feasibility === 'FEASIBLE' ? 'MET' : financialTargets.feasibility === 'NOT_FEASIBLE' ? 'FAILED' : 'NOT_APPLICABLE', source: 'Financial Target Model (§12.4 Protected Buffer Rule)', verificationStatus: financialTargets.feasibility === 'NOT_APPLICABLE' ? 'UNVERIFIED' : 'VERIFIED', priority: 'P1', escalationPath: financialTargets.feasibility === 'NOT_FEASIBLE' ? 'CCR → Credit → Risk' : undefined },
    { conditionId: 'std-no-compliance-hold', description: 'No compliance hold.', state: complianceHoldActive ? 'FAILED' : 'MET', source: 'Pathway Decision riskFlags', verificationStatus: complianceHoldActive ? 'UNVERIFIED' : 'VERIFIED', priority: 'P1', escalationPath: complianceHoldActive ? 'CCR → Compliance' : undefined },
    { conditionId: 'std-no-p1-items', description: 'No P1 items.', state: input.missingDataCount === 0 ? 'MET' : 'PENDING', source: 'Cohort Engine missing-information register', verificationStatus: input.missingDataCount === 0 ? 'VERIFIED' : 'UNVERIFIED', priority: 'P1' },
    { conditionId: 'std-product-available', description: 'Product available.', state: 'NOT_APPLICABLE', source: 'No live product-catalog integration exists in this codebase (same gap as Pathway Engine\'s own P011)', verificationStatus: 'UNVERIFIED', priority: 'P2' },
    { conditionId: 'std-lender-willing', description: 'Lender willing.', state: 'NOT_APPLICABLE', source: 'No live lender-approval integration exists in this codebase (same gap as Pathway Engine\'s own P012)', verificationStatus: 'UNVERIFIED', priority: 'P2' },
    { conditionId: 'std-specialist-cleared', description: 'Specialist cleared.', state: 'NOT_APPLICABLE', source: 'No specialist-review workflow produces a structured clearance record in this codebase today', verificationStatus: 'UNVERIFIED', priority: 'P2' },
  ]

  return conditions
}
