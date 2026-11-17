import { computeDataQualityBand } from './data-quality'

// The L2 "risk flags" a financially stressed (but well-documented) customer typically triggers.
const BEHAVIOURAL = ['LOW_LIQUIDITY', 'NEGATIVE_BALANCE', 'RECURRING_DEFICIT', 'LOW_FREE_CASH_FLOW', 'HIGH_UPI_ACTIVITY', 'HIGH_TRANSACTION_ACTIVITY', 'LARGE_TRANSACTION', 'EXCEPTIONAL_MONTH', 'SELF_TRANSFER', 'CHRONIC_MEDICAL', 'MERCHANT_AMBIGUOUS', 'ROUND_TRIP', 'INCOME_STABLE', 'NO_CURRENT_DEFICIT']

describe('computeDataQualityBand', () => {
  it('does not let behavioural/positive L2 risk flags lower data quality (regression: stressed customers were pushed to X1)', () => {
    const r = computeDataQualityBand(90, 90, [], BEHAVIOURAL, [])
    expect(r.band).toBe('HIGH')
    expect(r.flags).toEqual([])
  })

  it('still counts genuine L2 data-quality flags', () => {
    const r = computeDataQualityBand(90, 90, [], ['FCF_UNRECONCILED', 'RECONCILIATION_FAILED', 'DATA_INCOMPLETE', 'UNCLASSIFIED_TRANSACTIONS', 'OTHER_ACCOUNTS_LIKELY', 'BUSINESS_PERSONAL_MIXED', 'LOW_CLASSIFICATION_CONFIDENCE'], [])
    expect(r.flags).toHaveLength(7)
    expect(r.band).toBe('LOW_MODERATE')
  })

  it('still counts every L1 and L3 flag', () => {
    const r = computeDataQualityBand(90, 90, ['EMI_SCHEDULED_MISSING', 'HISTORY_INCOMPLETE'], [], ['DATE_ALIGNMENT_WARNING', 'L1_DEBT_POST_STATEMENT', 'SINGLE_SNAPSHOT'])
    expect(r.flags).toHaveLength(5)
  })

  it('genuinely poor data is still LOW (more than 10 real data-quality flags)', () => {
    const l1 = ['EMI_SCHEDULED_MISSING', 'HISTORY_INCOMPLETE', 'ACCOUNT_COUNT_MISMATCH', 'A1', 'A2', 'A3']
    const r = computeDataQualityBand(90, 90, l1, ['DATA_INCOMPLETE', 'FCF_UNRECONCILED'], ['DATE_ALIGNMENT_WARNING', 'L1_DEBT_POST_STATEMENT', 'SINGLE_SNAPSHOT'])
    expect(r.band).toBe('LOW')
  })

  it('is INSUFFICIENT when either module has no score', () => {
    expect(computeDataQualityBand(null, 80, [], [], []).band).toBe('INSUFFICIENT')
  })
})
