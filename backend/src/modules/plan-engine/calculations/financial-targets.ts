import type { PlanInput } from '../plan-engine.types'

/**
 * v3.0 §12.1-12.4 — per-pathway Financial Target Model, PL004. Was a total
 * gap before this pass: `financialTargets`/`debtTargets` used to be a
 * verbatim copy-forward of Cohort Engine's own `current*`-named fields,
 * relabeled, with zero arithmetic performed here. This file now computes
 * real, forward-looking target values per §12.2's own formulas.
 *
 * Honest data-availability caveat: several of the spec's own formula inputs
 * (essential_expenses, monthly_income, existing per-account EMIs, total
 * outstanding debt, original tenure, overdue totals) are NOT exposed to
 * Plan Engine at this layer — `PlanInput` only carries Cohort Engine's own
 * already-computed `sustainableCashFlow`/`capacityRatio`/
 * `stabilisationCoverage`/band fields (the Plan Engine's own first product
 * principle: consume ONLY the Final Master Profile + Final Cohort
 * Decision, never raw bureau/bank data). Every target below that needs one
 * of those missing inputs is computed using the closest available proxy —
 * `sustainableCashFlow` standing in for the formula's income/EMI terms —
 * and is explicitly marked `dataAvailability: 'PARTIAL'` with a note on
 * what a CCR must independently verify before relying on the number. A
 * target that cannot be computed at all without a genuinely absent input
 * (e.g. RESOLVE's resolution_range, which needs total outstanding debt as
 * a number, not a band) is marked `'UNAVAILABLE'` with a null value —
 * never fabricated.
 */

export type TargetAvailability = 'COMPUTED' | 'PARTIAL' | 'UNAVAILABLE'

export interface FinancialTarget {
  label: string
  value: number | string | null
  formula: string
  dataAvailability: TargetAvailability
  note?: string
}

export interface FinancialTargetResult {
  targets: Record<string, FinancialTarget>
  feasibility: 'FEASIBLE' | 'NOT_FEASIBLE' | 'NOT_APPLICABLE'
  protectedBuffer: number | null
  proposedPayment: number | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** v3.0 §12.4 Protected Buffer Rule — proxy protected buffer = 10% of sustainableCashFlow (L3.stress_buffer itself is not separately exposed to Plan Engine). */
function protectedBufferFor(sustainableCashFlow: number): number {
  return round2(sustainableCashFlow * 0.1)
}

/**
 * v3.0 §9.3/§12.4's own Protected Buffer Rule, exported as a standalone,
 * independently-testable pure function (mirrors the spec's own pseudocode
 * exactly: `IF proposed_payment <= sustainable_surplus - protected_buffer:
 * FEASIBLE ELSE: NOT_FEASIBLE`). Note: with this layer's own proportional
 * CONSOLIDATE (×0.8)/RESTRUCTURE (×0.7) target formulas — both using
 * `sustainableCashFlow` as the ONLY proxy input for both the proposed
 * payment AND the buffer baseline (no separate current_EMI/existing-
 * obligation figure is exposed to Plan Engine) — the composed
 * `proposedPayment` can never mathematically exceed `sustainableCashFlow
 * - protectedBuffer` (0.7x and 0.8x are always below 0.9x for any
 * nonzero x). This function is therefore tested directly, at the spec's
 * own exact boundary values, rather than only through composeFinancialTargets().
 */
export function evaluateProtectedBufferRule(proposedPayment: number | null, sustainableCashFlow: number | null): { feasibility: FinancialTargetResult['feasibility']; protectedBuffer: number | null } {
  if (proposedPayment === null || sustainableCashFlow === null) return { feasibility: 'NOT_APPLICABLE', protectedBuffer: null }
  const protectedBuffer = protectedBufferFor(sustainableCashFlow)
  const feasibility = proposedPayment <= sustainableCashFlow - protectedBuffer ? 'FEASIBLE' : 'NOT_FEASIBLE'
  return { feasibility, protectedBuffer }
}

const checkFeasibility = evaluateProtectedBufferRule

export function computeFinancialTargets(input: PlanInput): FinancialTargetResult {
  const scf = input.sustainableCashFlow
  const noScf: FinancialTargetResult = { targets: {}, feasibility: 'NOT_APPLICABLE', protectedBuffer: null, proposedPayment: null }

  if (!input.pathway) {
    return { ...noScf, targets: { note: { label: 'No targets computed', value: null, formula: 'N/A', dataAvailability: 'UNAVAILABLE', note: 'No primary pathway — blocked/thin plan carries no financial targets.' } } }
  }

  switch (input.pathway) {
    case 'OPTIMISE': {
      if (scf === null) return noScf
      const budgetTarget = round2(scf)
      const bufferTarget = round2(scf * 0.05)
      return {
        targets: {
          budgetTarget: { label: 'Budget target', value: budgetTarget, formula: 'essential_expenses + discretionary_allowance (proxy: Cohort Engine\'s own sustainableCashFlow — essential_expenses/discretionary_allowance are not separately exposed to Plan Engine)', dataAvailability: 'PARTIAL', note: 'CCR should confirm the actual essential-expense/discretionary split with the customer before presenting.' },
          bufferTarget: { label: 'Buffer target', value: bufferTarget, formula: 'monthly_income × 0.05 (proxy: sustainableCashFlow × 0.05 — monthly_income is not separately exposed)', dataAvailability: 'PARTIAL' },
        },
        ...checkFeasibility(null, scf),
        proposedPayment: null,
      }
    }
    case 'STABILISE': {
      if (scf === null) return noScf
      if (input.pathwayVariant === 'NINETY_DAY') {
        // §12.5 isolation: unreachable today (Pathway Engine's own
        // pathwayVariant is hardcoded STANDARD), but built honestly per
        // spec. overdue_support needs a total-overdue figure this layer
        // never receives — never fabricated.
        return {
          targets: {
            overdueSupport: { label: 'Overdue support (PROPOSED)', value: null, formula: 'sum_of_overdue_amounts', dataAvailability: 'UNAVAILABLE', note: 'Requires a total-overdue figure not exposed to Plan Engine at this layer — see Debt Analysis for the real figure.' },
            ninetyDayRepayment: { label: '90-day repayment (PROPOSED)', value: null, formula: 'overdue_support / 3', dataAvailability: 'UNAVAILABLE' },
            interest: { label: 'Interest (PROPOSED)', value: 0, formula: '0 (proposed)', dataAvailability: 'COMPUTED' },
          },
          feasibility: 'NOT_APPLICABLE',
          protectedBuffer: null,
          proposedPayment: null,
        }
      }
      // §12.4's Protected Buffer Rule applies only to CONSOLIDATE/
      // RESTRUCTURE/STABILISE_90D (verbatim from the spec's own IF
      // condition) — standard STABILISE reports the buffer as
      // informational data, never a CAPACITY_EXCEEDED feasibility check.
      const shortTermPlanTarget = round2(scf)
      return {
        targets: {
          shortTermPlanTarget: { label: 'Short-term plan target', value: shortTermPlanTarget, formula: 'essential_expenses + prioritized_payments (proxy: sustainableCashFlow)', dataAvailability: 'PARTIAL' },
          protectedBuffer: { label: 'Protected buffer', value: protectedBufferFor(scf), formula: 'L3.stress_buffer (proxy: 10% of sustainableCashFlow)', dataAvailability: 'PARTIAL' },
        },
        feasibility: 'NOT_APPLICABLE',
        protectedBuffer: protectedBufferFor(scf),
        proposedPayment: null,
      }
    }
    case 'CONSOLIDATE': {
      if (scf === null) return noScf
      const proposedSingleRepayment = round2(scf * 0.8)
      const feasibilityResult = checkFeasibility(proposedSingleRepayment, scf)
      return {
        targets: {
          proposedSingleRepayment: { label: 'Proposed single repayment', value: proposedSingleRepayment, formula: 'MIN(sustainableCashFlow × 0.8, existingEMIs × 0.9) — only the capacity-based cap is applied; existingEMIs is not exposed to Plan Engine', dataAvailability: 'PARTIAL', note: 'CCR must independently verify the sum of existing EMIs via Debt Analysis before finalizing — this figure may overstate true capacity if existing obligations are unusually high.' },
          totalRepaymentTarget: { label: 'Total repayment target', value: null, formula: 'sum_of_consolidated_obligations', dataAvailability: 'UNAVAILABLE', note: 'Requires per-account outstanding balances, not exposed to Plan Engine.' },
          tenure: { label: 'Tenure', value: '36 months (product default)', formula: 'product_default', dataAvailability: 'COMPUTED' },
        },
        ...feasibilityResult,
        proposedPayment: proposedSingleRepayment,
      }
    }
    case 'RESTRUCTURE': {
      if (scf === null) return noScf
      const revisedPayment = round2(scf * 0.7)
      const feasibilityResult = checkFeasibility(revisedPayment, scf)
      return {
        targets: {
          revisedPayment: { label: 'Revised payment', value: revisedPayment, formula: 'MIN(current_EMI, sustainableCashFlow × 0.7) — only the capacity-based cap is applied; current_EMI is not exposed to Plan Engine', dataAvailability: 'PARTIAL', note: 'CCR must confirm the current EMI figure directly against the affected obligation before presenting.' },
          extendedTenure: { label: 'Extended tenure', value: null, formula: 'original_tenure × 1.5 (subject to lender)', dataAvailability: 'UNAVAILABLE', note: 'Requires the original tenure, not exposed to Plan Engine.' },
          totalCost: { label: 'Total cost', value: null, formula: 'revised_payment × revised_tenure', dataAvailability: 'UNAVAILABLE' },
        },
        ...feasibilityResult,
        proposedPayment: revisedPayment,
      }
    }
    case 'RESOLVE': {
      // PROPOSED per spec's own marking — requires total outstanding debt
      // as a number, which Plan Engine never receives (only a band).
      return {
        targets: {
          resolutionRange: { label: 'Resolution range (PROPOSED)', value: null, formula: '(outstanding × 0.6) to (outstanding × 0.8)', dataAvailability: 'UNAVAILABLE', note: 'PROPOSED — requires total outstanding debt as a number (Plan Engine only receives a debtComplexityBand), and requires Business/Legal/Risk sign-off per the spec\'s own fee-structure caveat.' },
        },
        feasibility: 'NOT_APPLICABLE',
        protectedBuffer: null,
        proposedPayment: null,
      }
    }
    case 'RECOVER': {
      return {
        targets: {
          paymentStreak: { label: 'Payment streak', value: '3 months on-time, then 6 months', formula: '3 months on-time (then 6 months)', dataAvailability: 'COMPUTED' },
          outstandingReduction: { label: 'Outstanding reduction', value: '≥10% in 6 months', formula: '≥10% in 6 months', dataAvailability: 'COMPUTED' },
        },
        feasibility: 'NOT_APPLICABLE',
        protectedBuffer: null,
        proposedPayment: null,
      }
    }
    default:
      return noScf
  }
}
