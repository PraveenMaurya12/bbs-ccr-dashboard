import { testConfig, txn } from '../classification/test-helpers'
import type { RecurringIncomeSource } from '../classification/recurring-income-detector'
import { buildIncomeProfile, computeDaysToNextIncome } from './income-profile'

function source(overrides: Partial<RecurringIncomeSource> = {}): RecurringIncomeSource {
  return { narrationFingerprint: 'salary abc', subcategory: 'Salary', transactionCount: 6, monthsPresent: 12, averageAmount: 100000, evidenceLevel: 'DERIVED', ...overrides }
}

describe('buildIncomeProfile', () => {
  it('is NOT_REPORTED with no recurring income sources', () => {
    expect(buildIncomeProfile([]).availability).toBe('NOT_REPORTED')
  })

  it('currentMonthlyAmount is null with no recurring income sources', () => {
    expect(buildIncomeProfile([]).currentMonthlyAmount).toBeNull()
  })

  it("CRITICAL: currentMonthlyAmount is the primary (largest) source's own average amount, not an average across other sources", () => {
    const primary = source({ averageAmount: 110613, subcategory: 'Salary' })
    const secondary = source({ averageAmount: 5000, subcategory: 'Interest' })
    expect(buildIncomeProfile([primary, secondary]).currentMonthlyAmount).toBe(110613)
  })

  it('classifies SALARIED employment type from a Salary subcategory, HIGH confidence at 12+ months tenure', () => {
    const result = buildIncomeProfile([source({ monthsPresent: 12 })])
    expect(result.employmentType).toBe('SALARIED')
    expect(result.confidenceLevel).toBe('HIGH')
    expect(result.confidenceDowngradeReason).toBeNull()
  })

  it('classifies BUSINESS employment type from a Business income subcategory', () => {
    expect(buildIncomeProfile([source({ subcategory: 'Business income', monthsPresent: 12 })]).employmentType).toBe('BUSINESS')
  })

  it('classifies GIG employment type from a Gig income subcategory', () => {
    expect(buildIncomeProfile([source({ subcategory: 'Gig income', monthsPresent: 12 })]).employmentType).toBe('GIG')
  })

  it('classifies UNKNOWN for any other recurring-income subcategory', () => {
    expect(buildIncomeProfile([source({ subcategory: 'Interest', monthsPresent: 12 })]).employmentType).toBe('UNKNOWN')
  })

  it('downgrades confidence one level for 6-11 months tenure', () => {
    const result = buildIncomeProfile([source({ monthsPresent: 7 })])
    expect(result.confidenceLevel).toBe('MEDIUM')
  })

  it('downgrades confidence two levels for 3-5 months tenure', () => {
    const result = buildIncomeProfile([source({ monthsPresent: 4 })])
    expect(result.confidenceLevel).toBe('LOW')
  })

  it('flags INSUFFICIENT_TENURE below 3 months', () => {
    const result = buildIncomeProfile([source({ monthsPresent: 2 })])
    expect(result.confidenceLevel).toBe('INSUFFICIENT_TENURE')
  })
})

describe('computeDaysToNextIncome', () => {
  const salarySource = source({ subcategory: 'Salary', monthsPresent: 4 })

  it('is INSUFFICIENT_DATA with no primary source', () => {
    expect(computeDaysToNextIncome([], null, new Date(), testConfig()).availability).toBe('INSUFFICIENT_DATA')
  })

  it('projects a next expected date from consistent day-of-month income credits', () => {
    const incomeTxns = [
      txn({ transactionDate: new Date(Date.UTC(2026, 0, 5)), direction: 'CREDIT', category: 'INCOME', subcategory: 'Salary' }),
      txn({ transactionDate: new Date(Date.UTC(2026, 1, 5)), direction: 'CREDIT', category: 'INCOME', subcategory: 'Salary' }),
      txn({ transactionDate: new Date(Date.UTC(2026, 2, 5)), direction: 'CREDIT', category: 'INCOME', subcategory: 'Salary' }),
    ]
    const referenceDate = new Date(Date.UTC(2026, 2, 20))
    const result = computeDaysToNextIncome(incomeTxns, salarySource, referenceDate, testConfig())
    expect(result.availability).toBe('AVAILABLE')
    expect(result.daysToNextIncome).toBeGreaterThan(0)
    expect(result.nextExpectedDate?.getUTCMonth()).toBe(3) // April
  })

  it('is INSUFFICIENT_DATA (never a guessed date) when income dates are too inconsistent', () => {
    const incomeTxns = [
      txn({ transactionDate: new Date(Date.UTC(2026, 0, 2)), direction: 'CREDIT', category: 'INCOME', subcategory: 'Salary' }),
      txn({ transactionDate: new Date(Date.UTC(2026, 1, 28)), direction: 'CREDIT', category: 'INCOME', subcategory: 'Salary' }),
      txn({ transactionDate: new Date(Date.UTC(2026, 2, 15)), direction: 'CREDIT', category: 'INCOME', subcategory: 'Salary' }),
    ]
    const result = computeDaysToNextIncome(incomeTxns, salarySource, new Date(Date.UTC(2026, 2, 20)), testConfig())
    expect(result.availability).toBe('INSUFFICIENT_DATA')
    expect(result.daysToNextIncome).toBeNull()
  })

  it('is INSUFFICIENT_DATA below the recurring-income minimum-months floor', () => {
    const incomeTxns = [txn({ transactionDate: new Date(Date.UTC(2026, 0, 5)), direction: 'CREDIT', category: 'INCOME', subcategory: 'Salary' })]
    const result = computeDaysToNextIncome(incomeTxns, salarySource, new Date(Date.UTC(2026, 0, 20)), testConfig())
    expect(result.availability).toBe('INSUFFICIENT_DATA')
  })
})
