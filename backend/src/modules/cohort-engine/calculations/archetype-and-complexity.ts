import type { CohortArchetype, DebtComplexityBand } from '../cohort-engine.types'

/**
 * Output Schema's `debt_complexity_band` — no formula is given in either
 * source document. Derived here from already-computed Debt Analysis
 * figures only (lenderCount, Master Profile's own totalDebtBand,
 * distinct-product-type count) — a new, documented BBS convention, same
 * banding discipline Master Profile's own bandDebt()/bandCreditScore()
 * already use. Low-risk: every input is a real, already-available figure.
 */
export function debtComplexityBand(lenderCount: number, totalDebtBand: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'UNKNOWN', productTypesCount: number | null): DebtComplexityBand {
  let score = 0
  score += lenderCount <= 1 ? 0 : lenderCount <= 3 ? 1 : lenderCount <= 6 ? 2 : 3
  score += totalDebtBand === 'LOW' || totalDebtBand === 'UNKNOWN' ? 0 : totalDebtBand === 'MODERATE' ? 1 : totalDebtBand === 'HIGH' ? 2 : 3
  score += productTypesCount === null || productTypesCount <= 1 ? 0 : productTypesCount === 2 ? 1 : 2

  if (score <= 1) return 'LOW'
  if (score <= 3) return 'MODERATE'
  if (score <= 5) return 'HIGH'
  return 'VERY_HIGH'
}

/**
 * BBS Cohort Engine Module v3.0 §5.5's own archetype table, verbatim —
 * INTERNAL-ONLY (§24), never exposed to the customer:
 *
 *   Circumstantial Defaulter: an identifiable adverse circumstance
 *     (medical shock OR income transition — R023/R024) AND no debt-cycle
 *     signal.
 *   Debt Spiral Borrower: borrowing-to-repay (R009) OR stacking index
 *     >15/year OR an enquiry burst (R011) — three independent conditions,
 *     per §5.5's own literal wording.
 *   Habitual Avoider: an escalating DPD trend (R007) AND no recoverable
 *     pattern AND no adverse circumstance — unlike the v2.0-era proxy this
 *     replaces (which never assigned this value at all, reasoning that no
 *     engagement-history data existed to ground it), v3.0's own definition
 *     needs no engagement history — it is now genuinely derivable from
 *     already-available signals, so it is implemented rather than
 *     permanently suppressed. Still the rarest of the three: both
 *     conditions (escalating AND no adverse circumstance) must hold.
 *   Unclassified: none of the above — insufficient evidence to determine.
 *
 * CRITICAL, found via a traced discrepancy against the attached reference
 * report (see cohort-scenarios.spec.ts's Praveenkumar case and the parity
 * matrix's own corrected-discrepancy entry): `debtCycleSignal` here is
 * DELIBERATELY narrower than R010's own cohort-precedence `matched` value.
 * R010 (used to route a lead to C5 in the §6.1 precedence table) also
 * fires from a real account-opening cluster alone
 * (`recentStackingClusterDetected`) — a signal §5.5's own archetype table
 * never lists. The caller (cohort-engine.service.ts) computes
 * `debtCycleSignal` from R009's `matched` plus R010's own
 * `stackingIndexHigh`/`enquiryBurstHigh` evidence fields directly, NEVER
 * from R010's `matched` as a whole — reusing the broader value here
 * previously caused this function to report DEBT_SPIRAL for a lead whose
 * only debt-cycle evidence was a real cluster (correct for C5 cohort
 * routing) but who had no stacking-index/enquiry-burst/borrowing-to-repay
 * signal at all (making DEBT_SPIRAL wrong for archetype purposes
 * specifically) — confirmed by reproducing the exact Praveenkumar
 * reference case, whose own stated archetype is "Circumstantial Defaulter
 * (candidate)," not Debt Spiral.
 *
 * Checked in this order (Debt Spiral before Circumstantial) because a lead
 * can show both an adverse circumstance AND a debt-cycle signal — the
 * spec's own Circumstantial definition explicitly requires the ABSENCE of
 * a debt-cycle signal, so Debt Spiral takes precedence when both are true.
 */
export function deriveArchetype(debtCycleSignal: boolean, adverseCircumstance: boolean, escalatingDpd: boolean): CohortArchetype {
  if (debtCycleSignal) return 'DEBT_SPIRAL'
  if (adverseCircumstance) return 'CIRCUMSTANTIAL'
  if (escalatingDpd) return 'HABITUAL_AVOIDER'
  return 'UNCLASSIFIED'
}
