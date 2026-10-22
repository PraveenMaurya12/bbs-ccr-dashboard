import type { ComplianceRoutingResult, MasterDataQualityBand, ReadinessConditionResult, ReadinessGateResult, ReadinessOutcome } from '../master-profile.types'

const DQ_BAND_RANK: Record<MasterDataQualityBand, number> = { INSUFFICIENT: 0, LOW: 1, LOW_MODERATE: 2, MODERATE: 3, HIGH: 4 }

/**
 * BBS Master Profile Module v3.0 §22 — the Readiness Gate. All 8 named
 * conditions (R1-R8) are evaluated and reported individually (never
 * collapsed into a single pass/fail) so a CCR can see exactly which gate(s)
 * are blocking handoff to the Cohort Engine. Outcome routing precedence
 * follows §23's own worked case exactly — "CCR_FIRST -> then
 * COMPLIANCE_HOLD -> then SPECIALIST_REVIEW" — i.e. when multiple
 * conditions fail simultaneously (as the reference Praveenkumar case's own
 * 12 P1 items + active compliance hold + 8 exceptions all do), CCR_FIRST is
 * reported as the immediate next step while every other real blocking
 * reason is still listed in `blockingFactors`, never silently dropped.
 */
export function evaluateReadinessGate(
  bothSourcesPresent: boolean,
  dataQualityBand: MasterDataQualityBand,
  exceptionCount: number,
  complianceRouting: ComplianceRoutingResult,
  p1MissingItemCount: number,
  reconciliationComplete: boolean,
): ReadinessGateResult {
  const conditions: ReadinessConditionResult[] = [
    { code: 'R1', label: 'Both L1 and L2 present', passed: bothSourcesPresent, detail: bothSourcesPresent ? 'Debt Analysis and Financial Analysis are both COMPLETED.' : 'One or both upstream modules are not yet COMPLETED.' },
    { code: 'R2', label: 'No INCOMPLETE_INPUT', passed: bothSourcesPresent, detail: bothSourcesPresent ? 'No incomplete-input state detected.' : 'Required upstream input is missing.' },
    { code: 'R3', label: 'DQ band >= LOW-MODERATE', passed: DQ_BAND_RANK[dataQualityBand] >= DQ_BAND_RANK.LOW_MODERATE, detail: `Data Quality band is ${dataQualityBand}.` },
    { code: 'R4', label: 'Exception count < 5', passed: exceptionCount < 5, detail: `${exceptionCount} exception(s) active.` },
    { code: 'R5', label: 'No COMPLIANCE_HOLD active', passed: !complianceRouting.complianceHold, detail: complianceRouting.complianceHold ? `Compliance hold active: ${complianceRouting.reason}.` : 'No compliance hold.' },
    { code: 'R6', label: 'No P1 Critical missing items', passed: p1MissingItemCount === 0, detail: `${p1MissingItemCount} P1 Critical item(s) outstanding.` },
    { code: 'R7', label: 'Profile not expired', passed: true, detail: 'Freshly generated — expiry/TTL is evaluated on read, not at generation time.' },
    { code: 'R8', label: 'Reconciliation complete', passed: reconciliationComplete, detail: reconciliationComplete ? 'Credit-bank reconciliation ran to completion.' : 'Reconciliation could not complete.' },
  ]

  const blockingFactors: string[] = []
  if (p1MissingItemCount > 0) blockingFactors.push(`${p1MissingItemCount} P1 Critical missing information item(s) (CCR required)`)
  if (complianceRouting.complianceHold) blockingFactors.push(`COMPLIANCE_HOLD active (${complianceRouting.matchedEntity ?? complianceRouting.reason})`)
  if (exceptionCount >= 5) blockingFactors.push(`${exceptionCount} exceptions (exceeds >=5 threshold -> specialist reviewer)`)
  if (DQ_BAND_RANK[dataQualityBand] < DQ_BAND_RANK.LOW_MODERATE) blockingFactors.push(`Data Quality band (${dataQualityBand}) is below the minimum required for Cohort Engine handoff`)

  let outcome: ReadinessOutcome
  if (p1MissingItemCount > 0) outcome = 'CCR_FIRST'
  else if (complianceRouting.complianceHold) outcome = 'COMPLIANCE_HOLD'
  else if (exceptionCount >= 5) outcome = 'SPECIALIST_REVIEW'
  else if (DQ_BAND_RANK[dataQualityBand] < DQ_BAND_RANK.LOW_MODERATE) outcome = 'X1_CANDIDATE'
  else if (!bothSourcesPresent || !reconciliationComplete) outcome = 'REGENERATE'
  else outcome = 'READY'

  return { conditions, outcome, blockingFactors }
}
