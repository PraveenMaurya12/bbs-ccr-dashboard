import type { MissingInformationItemResult } from '../master-profile.types'

/** The slice of a submitted CCR answer needed to decide whether it addresses a register item. */
export interface CcrAnswerForResolution {
  source: string
  questionText: string
  responseStatus: string
  answerText: string | null
}

export type ResolvedRegisterItem = MissingInformationItemResult & { resolved: boolean; resolutionSource: 'CCR_DECLARED' | null }

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * A register item is addressed by exactly one kind of CCR question:
 *  - an item Master Profile itself raised (P1 post-statement debt, family
 *    member, related-party context) is asked verbatim, as a MASTER_PROFILE
 *    question whose text IS the item text;
 *  - an L2 item is asked as "Regarding <category>: <description>", so the
 *    question ends with the item's description.
 * L1's fixed caveats ("Not available at L1.") are never asked as questions —
 * they describe what a bureau report cannot contain — so they stay open.
 */
function addresses(answer: CcrAnswerForResolution, item: MissingInformationItemResult): boolean {
  const question = norm(answer.questionText)
  const text = norm(item.itemText)
  if (answer.source === 'MASTER_PROFILE') return question === text
  if (answer.source === 'L2_FINANCIAL_ANALYSIS' && item.sourceModule.includes('L2')) return text.length > 0 && question.endsWith(`: ${text}`)
  return false
}

/**
 * Marks register items the CCR has actually responded to as resolved.
 * Only an ANSWERED response with real text counts: "not known" and "customer
 * declined" leave the item open, because nothing was learned. A resolution
 * is CCR-declared — the customer's own statement, not independent
 * verification — and is labelled as such; it clears the item from the
 * CCR-first gate but never changes the underlying data-quality flags.
 */
export function applyCcrResolutions(items: MissingInformationItemResult[], answers: CcrAnswerForResolution[]): ResolvedRegisterItem[] {
  const usable = answers.filter((a) => a.responseStatus === 'ANSWERED' && (a.answerText ?? '').trim().length > 0)
  return items.map((item) => {
    const resolved = usable.some((a) => addresses(a, item))
    return { ...item, resolved, resolutionSource: resolved ? 'CCR_DECLARED' : null }
  })
}
