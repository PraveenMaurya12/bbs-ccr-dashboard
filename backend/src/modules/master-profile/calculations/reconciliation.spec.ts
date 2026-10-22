import { buildReconciliationRows } from './reconciliation'
import type { DebtAccountFact, FinancialRiskFlagFact } from '../master-profile.types'

function account(overrides: Partial<DebtAccountFact> = {}): DebtAccountFact {
  return { lender: 'HDFC Bank', accountType: 'Personal Loan', openedOn: '2023-01-15T00:00:00.000Z', currentBalance: 50000, monthlyEmiAmount: 8000, lifecycleStatus: 'ACTIVE', ...overrides }
}

function matchFlag(overrides: Partial<FinancialRiskFlagFact> = {}): FinancialRiskFlagFact {
  return {
    key: 'CREDIT_BANK_MATCH',
    severity: 'POSITIVE',
    detail: 'HDFC Bank: bureau-reported obligation matched to a recurring bank repayment (high confidence).',
    evidence: { bureauLender: 'HDFC Bank', bureauAccountOpenedOn: '2023-01-15T00:00:00.000Z', reportedEmi: 8000, observedPayment: 8000, confidence: 0.95, confidenceLabel: 'high' },
    relatedMonth: null,
    ...overrides,
  }
}

describe('buildReconciliationRows', () => {
  it('produces a MATCHED row for a high-confidence CREDIT_BANK_MATCH', () => {
    const rows = buildReconciliationRows([account()], [matchFlag()])
    expect(rows).toHaveLength(1)
    expect(rows[0].matchStatus).toBe('MATCHED')
  })

  it('produces a PARTIALLY_MATCHED row for a low-confidence CREDIT_BANK_MATCH', () => {
    const rows = buildReconciliationRows([account()], [matchFlag({ evidence: { ...matchFlag().evidence, confidenceLabel: 'low' } })])
    expect(rows[0].matchStatus).toBe('PARTIALLY_MATCHED')
  })

  it('produces a NOT_OBSERVED row, never treating it as an anomaly for an active account with a reported EMI', () => {
    const rows = buildReconciliationRows(
      [account()],
      [{ key: 'CREDIT_OBLIGATION_NOT_OBSERVED', severity: 'ATTENTION', detail: 'HDFC Bank: reported obligation — repayment not observed in this statement.', evidence: { bureauLender: 'HDFC Bank', bureauAccountOpenedOn: '2023-01-15T00:00:00.000Z', reportedEmi: 8000 }, relatedMonth: null }],
    )
    expect(rows[0].matchStatus).toBe('NOT_OBSERVED')
    expect(rows[0].explanation.toLowerCase()).toContain('not observed in this statement')
  })

  it('CRITICAL: a closed account with a reported EMI and no flag is OMITTED, never marked UNKNOWN', () => {
    const rows = buildReconciliationRows([account({ lifecycleStatus: 'CLOSED' })], [])
    expect(rows).toHaveLength(0)
  })

  it('marks an in-scope active account genuinely missing any flag as UNKNOWN (Financial Analysis gap, not a closed-debt false positive)', () => {
    const rows = buildReconciliationRows([account()], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].matchStatus).toBe('UNKNOWN')
  })

  it('disambiguates two same-lender tradelines via the openedOn join key', () => {
    const accountA = account({ openedOn: '2022-06-01T00:00:00.000Z', currentBalance: 10000, monthlyEmiAmount: 2000 })
    const accountB = account({ openedOn: '2023-06-01T00:00:00.000Z', currentBalance: 90000, monthlyEmiAmount: 15000 })
    const flagA = matchFlag({ evidence: { ...matchFlag().evidence, bureauAccountOpenedOn: '2022-06-01T00:00:00.000Z', reportedEmi: 2000, confidenceLabel: 'high' } })
    const flagB = { key: 'CREDIT_OBLIGATION_NOT_OBSERVED', severity: 'ATTENTION', detail: 'HDFC Bank: reported obligation — repayment not observed in this statement.', evidence: { bureauLender: 'HDFC Bank', bureauAccountOpenedOn: '2023-06-01T00:00:00.000Z', reportedEmi: 15000 }, relatedMonth: null } as FinancialRiskFlagFact

    const rows = buildReconciliationRows([accountA, accountB], [flagA, flagB])
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.reportedEmi === 2000)?.matchStatus).toBe('MATCHED')
    expect(rows.find((r) => r.reportedEmi === 15000)?.matchStatus).toBe('NOT_OBSERVED')
  })

  it('produces an UNMATCHED_PAYMENT row with no reported side for a bank-only recurring payment', () => {
    const rows = buildReconciliationRows(
      [],
      [{ key: 'UNMATCHED_DEBT_PAYMENT', severity: 'ATTENTION', detail: 'A recurring debt payment (Some Fintech NBFC) was observed...', evidence: { statementLender: 'Some Fintech NBFC', averageAmount: 5000, monthsPresent: 4 }, relatedMonth: null }],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].matchStatus).toBe('UNMATCHED_PAYMENT')
    expect(rows[0].reportedEmi).toBeNull()
    expect(rows[0].observedFrequencyMonths).toBe(4)
  })
})
