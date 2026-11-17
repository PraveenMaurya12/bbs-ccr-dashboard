import { env } from '@/lib/env'
import { apiRequest } from '@/services/api/client'
import { delay } from '@/services/mock/delay'
import type { CcrAnswerInput, CcrInteractionState, CcrQuestionItem, CcrSubmitResult } from '../types'

export interface CcrInteractionService {
  get(bbsLeadId: string): Promise<CcrInteractionState>
  saveAnswers(bbsLeadId: string, answers: CcrAnswerInput[]): Promise<CcrInteractionState>
  submit(bbsLeadId: string): Promise<CcrSubmitResult>
}

// --- Mock implementation ----------------------------------------------------

/** In-memory only: mock mode has no L1/L2 engines to generate real questions from, so it offers three sample ones. */
const MOCK_QUESTIONS: Omit<CcrQuestionItem, 'answer'>[] = [
  { key: 'L1-mock00000001', source: 'L1_DEBT_ANALYSIS', text: 'What is your current monthly income?', answerType: 'AMOUNT', fieldKey: 'MONTHLY_INCOME' },
  { key: 'L1-mock00000002', source: 'L1_DEBT_ANALYSIS', text: 'Are you able to comfortably service all current EMIs?', answerType: 'YES_NO', fieldKey: 'CAN_SERVICE_EMIS' },
  { key: 'L2-mock00000003', source: 'L2_FINANCIAL_ANALYSIS', text: 'Can you provide statements for any other bank accounts you hold?', answerType: 'TEXT', fieldKey: null },
]

class MockCcrInteractionService implements CcrInteractionService {
  private answers = new Map<string, CcrQuestionItem['answer']>()
  private status: 'DRAFT' | 'SUBMITTED' = 'DRAFT'

  private snapshot(bbsLeadId: string): CcrInteractionState {
    const questions = MOCK_QUESTIONS.map((q) => ({ ...q, answer: this.answers.get(`${bbsLeadId}:${q.key}`) ?? null }))
    const answered = questions.filter((q) => q.answer).length
    return {
      bbsLeadId,
      questionsAvailable: true,
      unavailableReason: null,
      status: this.status,
      submittedAt: null,
      progress: { total: questions.length, answered, remaining: questions.length - answered },
      canSubmit: answered === questions.length && this.status !== 'SUBMITTED',
      questions,
      retiredAnswers: [],
    }
  }

  async get(bbsLeadId: string) {
    return delay(this.snapshot(bbsLeadId), 300)
  }

  async saveAnswers(bbsLeadId: string, answers: CcrAnswerInput[]) {
    for (const a of answers) {
      this.answers.set(`${bbsLeadId}:${a.questionKey}`, {
        responseStatus: a.responseStatus,
        answerText: a.answerText ?? null,
        answerAmount: a.answerAmount ?? null,
        answerBoolean: a.answerBoolean ?? null,
        appliedTo: null,
        conflictNote: null,
        answeredAt: new Date().toISOString(),
      })
    }
    this.status = 'DRAFT'
    return delay(this.snapshot(bbsLeadId), 300)
  }

  async submit(bbsLeadId: string) {
    this.status = 'SUBMITTED'
    return delay({ ...this.snapshot(bbsLeadId), downstream: { applied: [], masterProfile: { generated: false, reason: 'Mock mode has no live upstream modules to regenerate.' }, recalculated: null } }, 300)
  }
}

// --- Real backend implementation --------------------------------------------

class ApiCcrInteractionService implements CcrInteractionService {
  async get(bbsLeadId: string) {
    return apiRequest<CcrInteractionState>(`/leads/${bbsLeadId}/ccr-interaction`)
  }

  async saveAnswers(bbsLeadId: string, answers: CcrAnswerInput[]) {
    return apiRequest<CcrInteractionState>(`/leads/${bbsLeadId}/ccr-interaction/answers`, { method: 'PUT', body: JSON.stringify({ answers }) })
  }

  async submit(bbsLeadId: string) {
    return apiRequest<CcrSubmitResult>(`/leads/${bbsLeadId}/ccr-interaction/submit`, { method: 'POST' })
  }
}

export const ccrInteractionService: CcrInteractionService = env.apiMode === 'api' ? new ApiCcrInteractionService() : new MockCcrInteractionService()
