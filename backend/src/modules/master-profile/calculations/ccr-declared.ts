import type { ValidationRequiredItem } from '../master-profile.types'

/**
 * What the CCR recorded from the customer in the submitted L1/L2 verification
 * interaction (see CcrInteractionService). These are CCR-declared, i.e.
 * unverified customer statements — Master Profile compares them against
 * observed data and reports disagreement; it never substitutes them for it.
 */
export interface CcrDeclaredFacts {
  monthlyIncome: number | null
  essentialExpenses: number | null
  monthlyEmi: number | null
  canServiceEmis: boolean | null
  submittedAt: string
}

export interface ObservedForCcrComparison {
  /** Bank-statement-derived averages (L2); null when no statement months exist. */
  avgMonthlyIncome: number | null
  avgEssentialExpenses: number | null
  /** Bureau-reported total monthly EMI (L1). */
  bureauMonthlyEmi: number | null
}

/** A declared value more than this far from the observed one (relative to the observed value) is worth a CCR's second look. */
export const CCR_DECLARED_DIVERGENCE_THRESHOLD = 0.25

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

function diverges(declared: number, observed: number): boolean {
  if (observed <= 0) return declared > 0
  return Math.abs(declared - observed) / observed > CCR_DECLARED_DIVERGENCE_THRESHOLD
}

/**
 * Turns declared-vs-observed disagreement into "validation required" items.
 * A missing declared or observed side produces nothing — absence of a
 * comparison is not a conflict.
 */
export function compareCcrDeclared(declared: CcrDeclaredFacts, observed: ObservedForCcrComparison): ValidationRequiredItem[] {
  const items: ValidationRequiredItem[] = []

  if (declared.monthlyIncome !== null && observed.avgMonthlyIncome !== null && diverges(declared.monthlyIncome, observed.avgMonthlyIncome)) {
    items.push({
      item: 'CCR-declared income differs from bank-observed income',
      why: `The customer declared ${inr(declared.monthlyIncome)}/month; the statement shows an average normalized income of ${inr(observed.avgMonthlyIncome)}/month. Neither value was overwritten — confirm which reflects current income.`,
    })
  }
  if (declared.essentialExpenses !== null && observed.avgEssentialExpenses !== null && observed.avgEssentialExpenses > 0 && diverges(declared.essentialExpenses, observed.avgEssentialExpenses)) {
    items.push({
      item: 'CCR-declared essential expenses differ from bank-observed expenses',
      why: `The customer declared ${inr(declared.essentialExpenses)}/month; the statement shows an average of ${inr(observed.avgEssentialExpenses)}/month classified as essential. Confirm whether other household costs are paid outside this account.`,
    })
  }
  if (declared.monthlyEmi !== null && observed.bureauMonthlyEmi !== null && diverges(declared.monthlyEmi, observed.bureauMonthlyEmi)) {
    items.push({
      item: 'CCR-declared EMI total differs from bureau-reported EMI',
      why: `The customer declared ${inr(declared.monthlyEmi)}/month in EMIs; the bureau reports ${inr(observed.bureauMonthlyEmi)}/month. Check for loans the bureau does not show, or closed/foreclosed ones.`,
    })
  }
  if (declared.canServiceEmis === false) {
    items.push({
      item: 'Customer reports difficulty servicing current EMIs',
      why: 'The customer told the CCR they cannot comfortably service all current EMIs (declared, not independently verified).',
    })
  }

  return items
}
