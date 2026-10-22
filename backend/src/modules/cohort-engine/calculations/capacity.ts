import type { CapacityBand, CohortEngineConfig } from '../cohort-engine.types'

export interface CapacityResult {
  sustainableSurplus: number | null
  capacityRatio: number | null
  capacityBand: CapacityBand
}

/**
 * v3.0 §5.2 R013 (Capacity Band, unified) + §8.1/§8.2 (Sustainable Surplus /
 * Capacity Bands), verbatim:
 *
 *   Sustainable Surplus = verified sustainable income − essential expenses
 *                         − mandatory existing debt payments
 *   Capacity Ratio = surplus ÷ verified monthly income (when income > 0)
 *
 *   IF fcf_reconciled = FALSE:
 *     capacity_band = "Unknown" (or capped at "Stressed" if a theoretical
 *     surplus exists) — the pseudocode's own two-branch instruction: once
 *     income/essentialExpenses/mandatoryDebtPayments are all present, a
 *     theoretical surplus DOES exist (the arithmetic above still runs), so
 *     the real behaviour is "cap whatever band the numbers would otherwise
 *     produce at STRESSED" — never claim COMFORTABLE/TIGHT capacity while
 *     the underlying free-cash-flow figure (Master Profile's own
 *     `dataQuality.flags` containing `FCF_UNRECONCILED`) hasn't actually
 *     been reconciled. A genuinely DISTRESSED band (surplus < 0) is never
 *     upgraded by the cap — a cap only ever lowers a band, never raises one.
 *   ELIF surplus > 20% of income: COMFORTABLE
 *   ELIF surplus 10-20%: TIGHT
 *   ELIF surplus 0-10%: STRESSED
 *   ELSE (surplus < 0): DISTRESSED
 *
 * `fcfReconciled: null` means Master Profile hasn't computed a data-quality
 * verdict at all (e.g. a legacy pre-v3.0 Master Profile row) — treated as
 * the honest `UNKNOWN` band, never assumed reconciled.
 */
export function calculateCapacity(verifiedMonthlyIncome: number | null, essentialExpenses: number | null, mandatoryDebtPayments: number | null, fcfReconciled: boolean | null, config: CohortEngineConfig): CapacityResult {
  if (verifiedMonthlyIncome === null || essentialExpenses === null || mandatoryDebtPayments === null) {
    return { sustainableSurplus: null, capacityRatio: null, capacityBand: 'UNKNOWN' }
  }

  const sustainableSurplus = verifiedMonthlyIncome - essentialExpenses - mandatoryDebtPayments
  const capacityRatio = verifiedMonthlyIncome > 0 ? sustainableSurplus / verifiedMonthlyIncome : null

  if (fcfReconciled === false) {
    // A theoretical surplus exists (the arithmetic above already ran) —
    // capped at STRESSED, never upgraded to TIGHT/COMFORTABLE, but a
    // genuinely negative surplus stays DISTRESSED (the cap never raises a
    // worse-than-Stressed reading).
    return { sustainableSurplus, capacityRatio, capacityBand: sustainableSurplus < 0 ? 'DISTRESSED' : 'STRESSED' }
  }

  if (fcfReconciled === null) {
    return { sustainableSurplus, capacityRatio, capacityBand: 'UNKNOWN' }
  }

  let capacityBand: CapacityBand
  if (sustainableSurplus < 0) capacityBand = 'DISTRESSED'
  else if (verifiedMonthlyIncome <= 0 || capacityRatio === null) capacityBand = 'STRESSED'
  else if (capacityRatio < config.stressedCapacityRatioMax) capacityBand = 'STRESSED'
  else if (capacityRatio < config.tightCapacityRatioMax) capacityBand = 'TIGHT'
  else capacityBand = 'COMFORTABLE'

  return { sustainableSurplus, capacityRatio, capacityBand }
}

const BAND_DOWNGRADE: Record<CapacityBand, CapacityBand> = {
  COMFORTABLE: 'TIGHT',
  TIGHT: 'STRESSED',
  STRESSED: 'DISTRESSED',
  DISTRESSED: 'DISTRESSED',
  UNKNOWN: 'UNKNOWN',
}

/**
 * v3.0 §9.1/§9.2's own capacity-impacting effects: a downward income
 * transition >15%, or a chronic medical-spending pattern, each reduce the
 * capacity band by exactly one level (never two, never below DISTRESSED,
 * never applied to an already-UNKNOWN band). Applied once, after the base
 * R013 band is computed, so R013 itself stays a pure function of income/
 * expenses/FCF-reconciliation — these are separate, documented, additive
 * downgrades, not a change to R013's own formula.
 */
export function applyEventDrivenCapacityDowngrade(band: CapacityBand, incomeDownwardTransition: boolean, medicalChronic: boolean): CapacityBand {
  let result = band
  if (incomeDownwardTransition) result = BAND_DOWNGRADE[result]
  if (medicalChronic) result = BAND_DOWNGRADE[result]
  return result
}

export interface StabilisationCoverageResult {
  availability: 'AVAILABLE' | 'NOT_APPLICABLE'
  coverage: number | null
  band: 'STRONG' | 'CCR_REVIEW' | 'NOT_ELIGIBLE_STANDARD_OFFER' | null
}

/**
 * v3.0 §5.1 R014 / §8.3: (eligible free cash x 3) ÷ approved support
 * amount, tested against the coverage bands (≥1.25 Strong, 1.00-1.24 CCR
 * review, <1.00 Not eligible — a ratio around 1.0, confirming division,
 * not the PDF-extracted "+" between the two terms: a rupee SUM of two
 * five/six-figure amounts could never naturally land in a ~1.0-1.25 range,
 * and this exact division formula already matched the pre-existing
 * implementation this function replaces — kept, not reinvented, per this
 * task's own "trace the discrepancy, never force a transcription" rule).
 * `approvedSupportAmount` is a BBS Plan Engine concept (the actual approved
 * 90-day support offer) that does not exist anywhere in this codebase yet
 * — this function always reports NOT_APPLICABLE until a real Plan Engine/
 * support-amount value is wired in, never a fabricated coverage figure.
 */
export function calculateStabilisationCoverage(eligibleFreeCash: number | null, approvedSupportAmount: number | null, config: CohortEngineConfig): StabilisationCoverageResult {
  if (eligibleFreeCash === null || approvedSupportAmount === null || approvedSupportAmount <= 0) {
    return { availability: 'NOT_APPLICABLE', coverage: null, band: null }
  }
  const coverage = (eligibleFreeCash * 3) / approvedSupportAmount
  const band = coverage >= config.stabilisationCoverageStrongMin ? 'STRONG' : coverage >= config.stabilisationCoverageMinimum ? 'CCR_REVIEW' : 'NOT_ELIGIBLE_STANDARD_OFFER'
  return { availability: 'AVAILABLE', coverage, band }
}
