import type { CcrAnswerInput, CcrQuestionItem, CcrResponseStatus } from '../../../types'

/** What the CCR has typed for one question, before it is saved. Strings stay strings until validated. */
export interface AnswerDraft {
  responseStatus: CcrResponseStatus | ''
  text: string
  amount: string
  yesNo: boolean | null
}

export const EMPTY_DRAFT: AnswerDraft = { responseStatus: '', text: '', amount: '', yesNo: null }

export const MAX_TEXT_LENGTH = 2000

/** The draft that reproduces a question's saved answer (or an empty one when it is unanswered). */
export function draftFromQuestion(question: CcrQuestionItem): AnswerDraft {
  const a = question.answer
  if (!a) return EMPTY_DRAFT
  return {
    responseStatus: a.responseStatus,
    text: a.answerText ?? '',
    amount: a.answerAmount === null ? '' : String(a.answerAmount),
    yesNo: a.answerBoolean,
  }
}

export function draftsEqual(a: AnswerDraft, b: AnswerDraft): boolean {
  return a.responseStatus === b.responseStatus && a.text === b.text && a.amount === b.amount && a.yesNo === b.yesNo
}

/** Returns an error message, or null when the draft is a complete, valid response for this question. */
export function validateDraft(question: CcrQuestionItem, draft: AnswerDraft): string | null {
  if (draft.responseStatus === '') return 'Choose how the customer responded.'
  if (draft.responseStatus !== 'ANSWERED') return null
  if (question.answerType === 'AMOUNT') {
    if (draft.amount.trim() === '') return 'Enter an amount in ₹.'
    const n = Number(draft.amount)
    if (!Number.isFinite(n)) return 'Enter a valid number.'
    if (n < 0) return 'The amount cannot be negative.'
    if (n > 1_000_000_000) return 'The amount is too large.'
    if (Math.round(n * 100) !== n * 100 && Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return 'Use at most 2 decimal places.'
    return null
  }
  if (question.answerType === 'YES_NO') return draft.yesNo === null ? 'Choose Yes or No.' : null
  if (draft.text.trim() === '') return 'Enter the customer’s answer.'
  if (draft.text.length > MAX_TEXT_LENGTH) return `Keep the answer under ${MAX_TEXT_LENGTH} characters.`
  return null
}

/** Converts a validated draft to the API payload. Declined / not-known responses carry no value. */
export function toAnswerInput(question: CcrQuestionItem, draft: AnswerDraft): CcrAnswerInput {
  if (draft.responseStatus === '') throw new Error('A response is required')
  if (draft.responseStatus !== 'ANSWERED') return { questionKey: question.key, responseStatus: draft.responseStatus }
  if (question.answerType === 'AMOUNT') return { questionKey: question.key, responseStatus: 'ANSWERED', answerAmount: Number(draft.amount) }
  if (question.answerType === 'YES_NO') return { questionKey: question.key, responseStatus: 'ANSWERED', answerBoolean: draft.yesNo === true }
  return { questionKey: question.key, responseStatus: 'ANSWERED', answerText: draft.text.trim() }
}
