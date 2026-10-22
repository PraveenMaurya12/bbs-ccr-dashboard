import type { ComplianceRoutingResult, CreditFinancialAlignmentState, DateAlignmentResult, DebtAnalysisFacts, DsrComparisonResult, FinancialAnalysisFacts, StressProfileResult } from '../master-profile.types'

/**
 * BBS Master Profile Module v3.0 §12.1/§12.2 — the primary AI-synthesis
 * input: five descriptive profile states, deliberately never turned into a
 * score or ranking. Each state is backed by an explicit, documented rule
 * rather than a fuzzy judgment call.
 *
 * §12.3: COMPLIANCE_HOLD always supersedes every other state whenever a
 * related-party or legal compliance flag is active — checked first, before
 * any credit/financial evidence is even considered, exactly matching the
 * reference case this module was rebuilt against (a clean 748 credit score
 * on genuinely stressed cash flow would otherwise read as
 * CREDIT_STRONG_FINANCIAL_STRESSED, but a related-party employer match
 * forces COMPLIANCE_HOLD regardless).
 *
 * v3.0 §12.1 explicitly removed the prior version's
 * HIGH_DEBT_CAPACITY_ALIGNED and DATA_CONFLICT_VALIDATION_REQUIRED states
 * ("these are now flags or handled via readiness gate") — when evidence is
 * genuinely too thin to responsibly assert any of the 4 non-compliance
 * states, this returns `null` rather than forcing a 6th pseudo-state; the
 * Readiness Gate (readiness-gate.ts) is where "insufficient evidence" is
 * now surfaced as its own real, actionable condition (R2/R3/R7).
 */
export function classifyAlignment(
  debt: Pick<DebtAnalysisFacts, 'currentMaxDpd' | 'writtenOffCount' | 'settledCount' | 'suitFiledCount'>,
  financial: Pick<FinancialAnalysisFacts, 'stressBand'>,
  dsrComparison: DsrComparisonResult,
  stressProfile: StressProfileResult,
  dateAlignment: DateAlignmentResult,
  complianceRouting: ComplianceRoutingResult,
): CreditFinancialAlignmentState | null {
  if (complianceRouting.complianceHold) return 'COMPLIANCE_HOLD'

  const hasCurrentOverdue = (debt.currentMaxDpd ?? 0) > 0
  const hasHistoricalCreditStress = debt.writtenOffCount > 0 || debt.settledCount > 0 || debt.suitFiledCount > 0
  const creditStressed = hasCurrentOverdue || hasHistoricalCreditStress

  const financiallyStressed = financial.stressBand === 'ELEVATED' || financial.stressBand === 'HIGH' || financial.stressBand === 'CRITICAL'
  const financiallyCapable = financial.stressBand === 'LOW' || financial.stressBand === 'MODERATE'

  const masterDsrAvailable = dsrComparison.masterDsr.availability === 'AVAILABLE'
  const manageableMasterDsr = masterDsrAvailable && (dsrComparison.masterDsr.percent ?? 100) < 40

  // Insufficient evidence to responsibly assert any of the 4 states — no
  // longer a 6th named state, just an honest null (see this function's own
  // doc comment on why, and readiness-gate.ts for where this surfaces).
  if (!dateAlignment.aligned) return null
  if (stressProfile.confidence === 'LOW' && !masterDsrAvailable) return null

  if (!creditStressed && financiallyCapable && (manageableMasterDsr || masterDsrAvailable)) return 'ALIGNED_HEALTHY'
  if (!creditStressed && financiallyStressed) return 'CREDIT_STRONG_FINANCIAL_STRESSED'
  if (hasHistoricalCreditStress && !hasCurrentOverdue && financiallyCapable) return 'CREDIT_STRESSED_FINANCIAL_STRONG'
  if (creditStressed && financiallyStressed) return 'BOTH_STRESSED'

  return null
}
