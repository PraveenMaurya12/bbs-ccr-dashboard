import { correlateWithCreditReport } from './credit-correlation'
import { testConfig } from '../classification/test-helpers'
import type { RecurringDebtPayment } from '../classification/recurring-debt-detector'
import type { CreditAccountCorrelationInput } from '../financial-analysis.types'

function payment(overrides: Partial<RecurringDebtPayment> = {}): RecurringDebtPayment {
  return { narrationFingerprint: 'hdfc emi', lender: 'HDFC Bank', transactionCount: 3, monthsPresent: 3, averageAmount: 15000, evidenceLevel: 'DERIVED', ...overrides }
}

function account(overrides: Partial<CreditAccountCorrelationInput> = {}): CreditAccountCorrelationInput {
  return { lender: 'HDFC Bank Ltd', monthlyEmiAmount: 15000, lifecycleStatus: 'ACTIVE', openedOn: new Date('2023-01-15'), ...overrides }
}

describe('correlateWithCreditReport', () => {
  it('produces a high-confidence CREDIT_BANK_MATCH when lender name and amount both line up', () => {
    const result = correlateWithCreditReport([payment()], [account()], testConfig())
    const match = result.flags.find((f) => f.key === 'CREDIT_BANK_MATCH')
    expect(match?.evidence.confidenceLabel).toBe('high')
  })

  it('stamps the bureau account openedOn into evidence, so two same-lender tradelines can be told apart downstream', () => {
    const result = correlateWithCreditReport([payment()], [account({ openedOn: new Date('2022-06-01') })], testConfig())
    const match = result.flags.find((f) => f.key === 'CREDIT_BANK_MATCH')
    expect(match?.evidence.bureauAccountOpenedOn).toBe(new Date('2022-06-01').toISOString())
  })

  it('reports a low-confidence match (never force-merged into certainty) when only the name matches, not the amount', () => {
    const result = correlateWithCreditReport([payment({ averageAmount: 40000 })], [account({ monthlyEmiAmount: 15000 })], testConfig())
    const match = result.flags.find((f) => f.key === 'CREDIT_BANK_MATCH')
    expect(match?.evidence.confidenceLabel).toBe('low')
  })

  it('CRITICAL: an active bureau obligation with no observed repayment is phrased "not observed", never "not paying"', () => {
    const result = correlateWithCreditReport([], [account({ lender: 'ICICI Bank', monthlyEmiAmount: 20000 })], testConfig())
    const flag = result.flags.find((f) => f.key === 'CREDIT_OBLIGATION_NOT_OBSERVED')
    expect(flag).toBeDefined()
    expect(flag!.detail.toLowerCase()).toContain('not observed')
    expect(flag!.detail.toLowerCase()).not.toContain('not paying')
    expect(flag!.detail.toLowerCase()).not.toContain('defaulted')
  })

  it('flags a recurring statement payment with no bureau match at all as UNMATCHED_DEBT_PAYMENT', () => {
    const result = correlateWithCreditReport([payment({ lender: 'Some Fintech NBFC' })], [], testConfig())
    expect(result.flags.find((f) => f.key === 'UNMATCHED_DEBT_PAYMENT')).toBeDefined()
  })

  it('never substitutes a missing monthlyEmiAmount with 0 — a name-only match is reported as low confidence, not a false mismatch', () => {
    const result = correlateWithCreditReport([payment()], [account({ monthlyEmiAmount: null })], testConfig())
    const match = result.flags.find((f) => f.key === 'CREDIT_BANK_MATCH')
    expect(match?.evidence.confidenceLabel).toBe('low')
  })

  it('does not flag CREDIT_OBLIGATION_NOT_OBSERVED for a closed/settled account with no reported EMI', () => {
    const result = correlateWithCreditReport([], [account({ lifecycleStatus: 'CLOSED', monthlyEmiAmount: null })], testConfig())
    expect(result.flags.find((f) => f.key === 'CREDIT_OBLIGATION_NOT_OBSERVED')).toBeUndefined()
  })
})
