import { createHash } from 'node:crypto'

/** MASTER_PROFILE = a P1 missing-information item the Master Profile itself raised (e.g. purpose of post-statement borrowing). */
export type CcrQuestionSource = 'L1_DEBT_ANALYSIS' | 'L2_FINANCIAL_ANALYSIS' | 'MASTER_PROFILE'

/** How the CCR's answer is captured. AMOUNT/YES_NO are the structured types that can feed a profile field. */
export type CcrAnswerType = 'TEXT' | 'AMOUNT' | 'YES_NO'

/** The profile/derived field a structured question's answer feeds, if any. */
export type CcrFieldKey = 'MONTHLY_INCOME' | 'ESSENTIAL_EXPENSES' | 'MONTHLY_EMI' | 'CAN_SERVICE_EMIS'

export interface CcrQuestion {
  /** Stable per (source, text) — the only link between a persisted answer and its question. */
  key: string
  source: CcrQuestionSource
  text: string
  answerType: CcrAnswerType
  fieldKey: CcrFieldKey | null
}

/**
 * L1's fixed discovery questions (see buildCcrDiscoveryAgenda in
 * DebtAnalysisService) whose answer is a number or yes/no that downstream
 * modules can actually consume. Matched on the exact generated text — a
 * reworded question is deliberately treated as free text rather than
 * guessed into a structured field.
 */
const STRUCTURED_L1_QUESTIONS: Record<string, { answerType: CcrAnswerType; fieldKey: CcrFieldKey }> = {
  'what is your current monthly income?': { answerType: 'AMOUNT', fieldKey: 'MONTHLY_INCOME' },
  'what are your essential monthly expenses?': { answerType: 'AMOUNT', fieldKey: 'ESSENTIAL_EXPENSES' },
  'what are the emi amounts on your active loans?': { answerType: 'AMOUNT', fieldKey: 'MONTHLY_EMI' },
  'are you able to comfortably service all current emis?': { answerType: 'YES_NO', fieldKey: 'CAN_SERVICE_EMIS' },
}

function normalise(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function buildQuestionKey(source: CcrQuestionSource, text: string): string {
  const prefix = source === 'L1_DEBT_ANALYSIS' ? 'L1' : source === 'L2_FINANCIAL_ANALYSIS' ? 'L2' : 'MP'
  return `${prefix}-${createHash('sha256').update(normalise(text)).digest('hex').slice(0, 12)}`
}

/**
 * Merges the L1 and L2 question lists into one ordered list: L1 first (as
 * generated), then L2, then the Master Profile's own P1 items (the ones that actually hold a lead at the CCR-first gate). A question appearing twice (same source and text) is
 * collapsed to one so it can never be answered twice; blank strings are
 * dropped. L2 and Master Profile questions are always free text — none of L2's generated
 * questions map to a structured field.
 */
export function buildCcrQuestions(l1Questions: readonly string[], l2Questions: readonly string[], masterQuestions: readonly string[] = []): CcrQuestion[] {
  const seen = new Set<string>()
  const questions: CcrQuestion[] = []

  const add = (source: CcrQuestionSource, raw: string) => {
    const text = raw.trim()
    if (!text) return
    const key = buildQuestionKey(source, text)
    if (seen.has(key)) return
    seen.add(key)
    const structured = source === 'L1_DEBT_ANALYSIS' ? STRUCTURED_L1_QUESTIONS[normalise(text)] : undefined
    questions.push({ key, source, text, answerType: structured?.answerType ?? 'TEXT', fieldKey: structured?.fieldKey ?? null })
  }

  l1Questions.forEach((q) => add('L1_DEBT_ANALYSIS', q))
  l2Questions.forEach((q) => add('L2_FINANCIAL_ANALYSIS', q))
  masterQuestions.forEach((q) => add('MASTER_PROFILE', q))
  return questions
}
