import { buildCustomerExplanation } from './customer-explanation'

const ARCHETYPE_WORDS = ['circumstantial', 'debt spiral', 'habitual avoider', 'unclassified']
const RULE_ID_PATTERN = /\bR0\d\d\b/i

describe('buildCustomerExplanation', () => {
  const allCohorts: Array<Parameters<typeof buildCustomerExplanation>[0]> = ['CONSENT_PENDING', 'KYC_PENDING', 'X1', 'C6', 'C5', 'C4', 'C3', 'C2', 'C1', 'C7', 'X2', 'MANUAL_REVIEW', 'CUSTOMER_UNRESPONSIVE']

  it.each(allCohorts)('CRITICAL: %s never leaks an internal archetype label, a rule ID, or the bare cohort code into customer-facing text', (cohort) => {
    const text = buildCustomerExplanation(cohort).toLowerCase()
    for (const word of ARCHETYPE_WORDS) expect(text).not.toContain(word)
    expect(text).not.toMatch(RULE_ID_PATTERN)
    expect(text).not.toContain(cohort.toLowerCase())
  })

  it('returns a non-empty, plain-language sentence for every cohort', () => {
    for (const cohort of allCohorts) {
      expect(buildCustomerExplanation(cohort).length).toBeGreaterThan(20)
    }
  })

  it('never promises a specific outcome (settlement, score increase, approval) for the resolution/recovery/consolidation cohorts', () => {
    const forbidden = ['guarantee', 'approved', 'will improve your score', 'settlement amount']
    for (const cohort of ['C2', 'C4', 'C7'] as const) {
      const text = buildCustomerExplanation(cohort).toLowerCase()
      for (const word of forbidden) expect(text).not.toContain(word)
    }
  })
})
