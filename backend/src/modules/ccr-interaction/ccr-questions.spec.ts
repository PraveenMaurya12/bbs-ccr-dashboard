import { buildCcrQuestions, buildQuestionKey } from './ccr-questions'

describe('buildCcrQuestions', () => {
  it('orders L1 before L2, tags the source, and gives every question a stable key', () => {
    const questions = buildCcrQuestions(['Do you have any disputes with any lender?'], ['Can you provide statements for any other bank accounts you hold?'])

    expect(questions.map((q) => q.source)).toEqual(['L1_DEBT_ANALYSIS', 'L2_FINANCIAL_ANALYSIS'])
    expect(questions[0].key).toBe(buildQuestionKey('L1_DEBT_ANALYSIS', 'Do you have any disputes with any lender?'))
    expect(questions[0].key).toMatch(/^L1-[0-9a-f]{12}$/)
    expect(questions[1].key).toMatch(/^L2-[0-9a-f]{12}$/)
  })

  it('maps the four structured L1 questions to typed fields and leaves everything else as free text', () => {
    const questions = buildCcrQuestions(
      ['What is your current monthly income?', 'What are your essential monthly expenses?', 'What are the EMI amounts on your active loans?', 'Are you able to comfortably service all current EMIs?', 'What is your employment status?'],
      [],
    )

    expect(questions.map((q) => [q.answerType, q.fieldKey])).toEqual([
      ['AMOUNT', 'MONTHLY_INCOME'],
      ['AMOUNT', 'ESSENTIAL_EXPENSES'],
      ['AMOUNT', 'MONTHLY_EMI'],
      ['YES_NO', 'CAN_SERVICE_EMIS'],
      ['TEXT', null],
    ])
  })

  it('never treats an L2 question as a structured field, even with identical wording', () => {
    const [q] = buildCcrQuestions([], ['What is your current monthly income?'])
    expect(q).toMatchObject({ answerType: 'TEXT', fieldKey: null })
  })

  it('collapses duplicates within a source, ignoring case and whitespace, and drops blanks', () => {
    const questions = buildCcrQuestions(['Do you have any disputes?', '  do you   have any DISPUTES?  ', '   '], [])
    expect(questions).toHaveLength(1)
  })

  it('keeps the same text from different sources as two separately-keyed questions', () => {
    const questions = buildCcrQuestions(['Same text?'], ['Same text?'])
    expect(questions).toHaveLength(2)
    expect(questions[0].key).not.toBe(questions[1].key)
  })

  it('produces a different key when the question text (e.g. a lender name) differs — so answers never cross leads', () => {
    expect(buildQuestionKey('L1_DEBT_ANALYSIS', 'What was the HDFC debt used for?')).not.toBe(buildQuestionKey('L1_DEBT_ANALYSIS', 'What was the SBI debt used for?'))
  })
})
