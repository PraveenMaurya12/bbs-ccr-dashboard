import type { DimensionConfidences, DsrComparisonResult, IdentitySnapshot, MasterConfidenceLevel, MasterDataQualityBand } from '../master-profile.types'

/** Collapses the 5-value DQ band onto the 3-value MasterConfidenceLevel scale. */
function confidenceFromDqBand(band: MasterDataQualityBand): MasterConfidenceLevel {
  if (band === 'HIGH') return 'HIGH'
  if (band === 'MODERATE') return 'MEDIUM'
  return 'LOW'
}

/**
 * BBS Master Profile Module v3.0 §4.2/§7 — per-dimension confidence for the
 * 5 named dimensions, replacing a single "overall confidence" (§4.2: "No
 * single 'overall confidence.' Instead, report per-dimension confidence.").
 * Each rule below is quoted from §4.2's own table.
 */
export function assessDimensionConfidences(identitySnapshot: IdentitySnapshot, l1DqBand: MasterDataQualityBand, dsrComparison: DsrComparisonResult, incomeTenureMonths: number | null): DimensionConfidences {
  const identity: MasterConfidenceLevel = identitySnapshot.panRefConflict || identitySnapshot.hasConflict ? 'MEDIUM' : identitySnapshot.panAvailable ? 'HIGH' : 'LOW'
  const creditHealth = confidenceFromDqBand(l1DqBand)
  // Income & Cash Flow: "Inherit from L2 income confidence, tenure-adjusted" —
  // this integration's income-confidence signal is tenure itself (a short
  // employment history caps confidence at MEDIUM regardless of how clean the
  // statement data is, matching the reference case's own MEDIUM rating for
  // a 7-month tenure).
  const incomeCashFlow: MasterConfidenceLevel = incomeTenureMonths === null ? 'LOW' : incomeTenureMonths >= 12 ? 'HIGH' : incomeTenureMonths >= 3 ? 'MEDIUM' : 'LOW'
  const debtLiquidity: MasterConfidenceLevel = dsrComparison.masterDsr.availability === 'AVAILABLE' ? 'HIGH' : 'MEDIUM'
  const allHigh = identity === 'HIGH' && creditHealth === 'HIGH' && incomeCashFlow === 'HIGH' && debtLiquidity === 'HIGH'
  const alignmentCapacity: MasterConfidenceLevel = allHigh ? 'HIGH' : 'MEDIUM'

  return {
    IDENTITY_COMPLIANCE: identity,
    CREDIT_HEALTH: creditHealth,
    INCOME_CASH_FLOW: incomeCashFlow,
    DEBT_LIQUIDITY: debtLiquidity,
    ALIGNMENT_CAPACITY: alignmentCapacity,
  }
}
