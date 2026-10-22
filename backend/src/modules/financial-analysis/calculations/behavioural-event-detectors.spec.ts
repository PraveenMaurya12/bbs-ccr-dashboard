import { narrationFingerprint } from '../classification/recurring-cluster-utils'
import { testConfig, txn } from '../classification/test-helpers'
import { month } from '../scoring/test-helpers'
import type { RecurringIncomeSource } from '../classification/recurring-income-detector'
import {
  detectBonuses,
  detectBusinessPersonalMixing,
  detectIncomeTransition,
  detectMedicalEvents,
  detectRelatedPartyEmployer,
} from './behavioural-event-detectors'

function incomeSource(overrides: Partial<RecurringIncomeSource> = {}): RecurringIncomeSource {
  return { narrationFingerprint: 'salary abc', subcategory: 'Salary', transactionCount: 6, monthsPresent: 6, averageAmount: 100000, evidenceLevel: 'DERIVED', ...overrides }
}

describe('detectBonuses', () => {
  it('reclassifies a one-off unclassified credit above the salary multiplier threshold as INCOME/Bonus', () => {
    const bonus = txn({ narration: 'FESTIVAL BONUS', amount: 160000, direction: 'CREDIT', category: 'UNCLASSIFIED' })
    const result = detectBonuses([bonus], [incomeSource()], testConfig())
    expect(result.bonuses).toHaveLength(1)
    expect(result.transactions[0].category).toBe('INCOME')
    expect(result.transactions[0].subcategory).toBe('Bonus')
    expect(result.transactions[0].evidenceLevel).toBe('INFERRED')
  })

  it('never runs without at least one recurring income source to establish a baseline', () => {
    const bonus = txn({ narration: 'BIG CREDIT', amount: 500000, direction: 'CREDIT', category: 'UNCLASSIFIED' })
    const result = detectBonuses([bonus], [], testConfig())
    expect(result.bonuses).toHaveLength(0)
  })

  it('does not reclassify a credit below the multiplier threshold', () => {
    const small = txn({ narration: 'SMALL EXTRA', amount: 120000, direction: 'CREDIT', category: 'UNCLASSIFIED' })
    const result = detectBonuses([small], [incomeSource()], testConfig())
    expect(result.bonuses).toHaveLength(0)
  })

  it("CRITICAL: a real Diwali bonus that fell into the generic P2P-transfer bucket (\"DiwaliBo\" matches no income keyword) is reclassified when it shares the confirmed employer's narration fingerprint", () => {
    const narrationDetail = { referenceNumber: '1', counterpartyRaw: 'GOLDENLE', purpose: 'DiwaliBo', counterpartyBank: 'AUSMALLF' }
    const employerFingerprint = narrationFingerprint('GOLDENLE')
    const bonus = txn({
      narration: 'IMPS/P2A/529016654030/GOLDENLE/AUSMALLF/DiwaliBo/9186557660239765000',
      amount: 166000,
      direction: 'CREDIT',
      category: 'TRANSFERS',
      subcategory: 'P2P transfer',
      narrationDetail,
    })
    const result = detectBonuses([bonus], [incomeSource({ narrationFingerprint: employerFingerprint, averageAmount: 110613 })], testConfig())
    expect(result.bonuses).toHaveLength(1)
    expect(result.transactions[0].category).toBe('INCOME')
    expect(result.transactions[0].subcategory).toBe('Bonus')
  })

  it('does NOT reclassify a large one-off P2P transfer from an unrelated counterparty (different fingerprint) as a bonus', () => {
    const narrationDetail = { referenceNumber: '1', counterpartyRaw: 'JAMBHAD KISHAN ANUPKUMAR', purpose: null, counterpartyBank: 'National Cooperative Bank' }
    const transfer = txn({
      narration: 'UPI/P2A/1/JAMBHAD KISHAN ANUPKUMAR/NA/National Cooperative Bank',
      amount: 175000,
      direction: 'CREDIT',
      category: 'TRANSFERS',
      subcategory: 'P2P transfer',
      narrationDetail,
    })
    const result = detectBonuses([transfer], [incomeSource()], testConfig())
    expect(result.bonuses).toHaveLength(0)
    expect(result.transactions[0].category).toBe('TRANSFERS')
  })

  it('never touches a transaction that already has a confident classification', () => {
    const salary = txn({ narration: 'SALARY', amount: 500000, direction: 'CREDIT', category: 'INCOME', subcategory: 'Salary' })
    const result = detectBonuses([salary], [incomeSource()], testConfig())
    expect(result.bonuses).toHaveLength(0)
    expect(result.transactions[0].subcategory).toBe('Salary')
  })
})

describe('detectIncomeTransition', () => {
  it('detects a sustained income increase at its real transition point', () => {
    const months = [
      month({ periodMonth: new Date(Date.UTC(2026, 0, 1)), normalizedIncome: 80000 }),
      month({ periodMonth: new Date(Date.UTC(2026, 1, 1)), normalizedIncome: 80000 }),
      month({ periodMonth: new Date(Date.UTC(2026, 2, 1)), normalizedIncome: 110000 }),
      month({ periodMonth: new Date(Date.UTC(2026, 3, 1)), normalizedIncome: 110000 }),
    ]
    const result = detectIncomeTransition(months, testConfig())
    expect(result.detected).toBe(true)
    expect(result.previousAverage).toBe(80000)
    expect(result.currentAverage).toBe(110000)
    expect(result.deltaPercent).toBeGreaterThan(15)
  })

  it('does not flag a transition below the configured delta threshold', () => {
    const months = [
      month({ periodMonth: new Date(Date.UTC(2026, 0, 1)), normalizedIncome: 100000 }),
      month({ periodMonth: new Date(Date.UTC(2026, 1, 1)), normalizedIncome: 100000 }),
      month({ periodMonth: new Date(Date.UTC(2026, 2, 1)), normalizedIncome: 105000 }),
      month({ periodMonth: new Date(Date.UTC(2026, 3, 1)), normalizedIncome: 105000 }),
    ]
    expect(detectIncomeTransition(months, testConfig()).detected).toBe(false)
  })

  it('requires at least 4 months of data', () => {
    expect(detectIncomeTransition([month(), month(), month()], testConfig()).detected).toBe(false)
  })

  it("CRITICAL: a run of pre-employment months with no RECOGNIZED income (normalizedIncome=0) is never averaged into the \"before\" side — a real statement produced a fabricated-looking 454% jump from a diluted ₹19,943 figure before this fix", () => {
    const months = [
      month({ periodMonth: new Date(Date.UTC(2025, 3, 1)), normalizedIncome: 0 }),
      month({ periodMonth: new Date(Date.UTC(2025, 4, 1)), normalizedIncome: 0 }),
      month({ periodMonth: new Date(Date.UTC(2025, 5, 1)), normalizedIncome: 0 }),
      month({ periodMonth: new Date(Date.UTC(2025, 6, 1)), normalizedIncome: 0 }),
      month({ periodMonth: new Date(Date.UTC(2025, 7, 1)), normalizedIncome: 99715 }),
      month({ periodMonth: new Date(Date.UTC(2025, 8, 1)), normalizedIncome: 110613 }),
      month({ periodMonth: new Date(Date.UTC(2025, 9, 1)), normalizedIncome: 110613 }),
      month({ periodMonth: new Date(Date.UTC(2025, 10, 1)), normalizedIncome: 110613 }),
      month({ periodMonth: new Date(Date.UTC(2025, 11, 1)), normalizedIncome: 110613 }),
      month({ periodMonth: new Date(Date.UTC(2026, 0, 1)), normalizedIncome: 110613 }),
      month({ periodMonth: new Date(Date.UTC(2026, 1, 1)), normalizedIncome: 110613 }),
      month({ periodMonth: new Date(Date.UTC(2026, 2, 1)), normalizedIncome: 110613 }),
    ]
    const result = detectIncomeTransition(months, testConfig())
    // Only 1 month of recognized income precedes the steady run, so no
    // candidate split ever has >= 2 recognized months on BOTH sides —
    // correctly "not detected" rather than a fabricated-looking jump.
    expect(result.detected).toBe(false)
  })

  it('still detects a genuine transition when BOTH the prior and current employer have >= 2 recognized months (no unrecognized-income months involved)', () => {
    const months = [
      month({ periodMonth: new Date(Date.UTC(2026, 0, 1)), normalizedIncome: 87242 }),
      month({ periodMonth: new Date(Date.UTC(2026, 1, 1)), normalizedIncome: 87242 }),
      month({ periodMonth: new Date(Date.UTC(2026, 2, 1)), normalizedIncome: 110613 }),
      month({ periodMonth: new Date(Date.UTC(2026, 3, 1)), normalizedIncome: 110613 }),
    ]
    const result = detectIncomeTransition(months, testConfig())
    expect(result.detected).toBe(true)
    expect(result.previousAverage).toBe(87242)
    expect(result.currentAverage).toBe(110613)
  })
})

describe('detectMedicalEvents', () => {
  it('flags a month exceeding the medical-shock threshold, and ACUTE when it also exceeds the income-share threshold', () => {
    const medicalTxns = [
      txn({ narration: 'CHILDRENS HOSPITAL', amount: 15000, direction: 'DEBIT', category: 'EXPENSE', subcategory: 'Medical', transactionDate: new Date(Date.UTC(2025, 11, 13)) }),
      txn({ narration: 'CHILDRENS HOSPITAL', amount: 15000, direction: 'DEBIT', category: 'EXPENSE', subcategory: 'Medical', transactionDate: new Date(Date.UTC(2025, 11, 17)) }),
    ]
    const months = [month({ periodMonth: new Date(Date.UTC(2025, 11, 1)), normalizedIncome: 100000 })]
    const result = detectMedicalEvents(medicalTxns, months, testConfig())
    expect(result.shockMonths).toHaveLength(1)
    expect(result.shockMonths[0].acute).toBe(true)
    expect(result.shockMonths[0].distinctMerchantCount).toBe(1)
  })

  it('flags CHRONIC_MEDICAL when medical activity spans 3+ distinct months', () => {
    const medicalTxns = [
      txn({ narration: 'CLINIC', amount: 500, direction: 'DEBIT', category: 'EXPENSE', subcategory: 'Medical', transactionDate: new Date(Date.UTC(2025, 9, 1)) }),
      txn({ narration: 'CLINIC', amount: 500, direction: 'DEBIT', category: 'EXPENSE', subcategory: 'Medical', transactionDate: new Date(Date.UTC(2025, 10, 1)) }),
      txn({ narration: 'CLINIC', amount: 500, direction: 'DEBIT', category: 'EXPENSE', subcategory: 'Medical', transactionDate: new Date(Date.UTC(2025, 11, 1)) }),
    ]
    const result = detectMedicalEvents(medicalTxns, [], testConfig())
    expect(result.chronic).toBe(true)
  })

  it('does not flag chronic medical for isolated single-month activity', () => {
    const medicalTxns = [txn({ narration: 'CLINIC', amount: 500, direction: 'DEBIT', category: 'EXPENSE', subcategory: 'Medical', transactionDate: new Date(Date.UTC(2025, 9, 1)) })]
    expect(detectMedicalEvents(medicalTxns, [], testConfig()).chronic).toBe(false)
  })
})

describe('detectRelatedPartyEmployer', () => {
  it('never fires when no affiliate names are configured (empty by default)', () => {
    const result = detectRelatedPartyEmployer([incomeSource()], [], testConfig())
    expect(result.detected).toBe(false)
  })

  it('fires when a configured affiliate name appears in an income-category narration', () => {
    const configured = testConfig({ relatedPartyEmployerNames: ['Golden Legand Leasing'] })
    const salaryTxn = txn({ narration: 'NEFT/REF123/GOLDEN LEGAND LEASING/ICICI BANK', direction: 'CREDIT', category: 'INCOME', subcategory: 'Salary' })
    const result = detectRelatedPartyEmployer([incomeSource()], [salaryTxn], configured)
    expect(result.detected).toBe(true)
    expect(result.matchedName).toBe('Golden Legand Leasing')
  })
})

describe('detectBusinessPersonalMixing', () => {
  it('fires only when both personal income and business income subcategories are present', () => {
    const txns = [
      txn({ direction: 'CREDIT', category: 'INCOME', subcategory: 'Salary' }),
      txn({ direction: 'CREDIT', category: 'INCOME', subcategory: 'Business income' }),
    ]
    expect(detectBusinessPersonalMixing(txns)).toBe(true)
  })

  it('does not fire for personal income alone', () => {
    expect(detectBusinessPersonalMixing([txn({ direction: 'CREDIT', category: 'INCOME', subcategory: 'Salary' })])).toBe(false)
  })
})
