import { compareDebtServicing } from './debt-servicing'
import type { MonthlyFinancialAggregateInput } from '@/modules/financial-analysis/financial-analysis.types'
import type { ReconciliationRowResult } from '../master-profile.types'

function month(overrides: Partial<MonthlyFinancialAggregateInput> = {}): MonthlyFinancialAggregateInput {
  return {
    periodMonth: new Date('2026-01-01'),
    totalInflow: 60000,
    totalOutflow: 40000,
    netCashFlow: 20000,
    normalizedIncome: 50000,
    essentialExpenses: 15000,
    financialExpenses: 8000,
    discretionaryExpenses: 5000,
    mandatoryDebtPayments: 8000,
    creditCardPayments: 0,
    loanInflows: 0,
    transferInflows: 0,
    transferOutflows: 0,
    cashWithdrawals: 0,
    cashDeposits: 0,
    closingBalance: 50000,
    minBalance: 20000,
    lowBalanceDays: 0,
    observedDays: 30,
    hadNegativeBalance: false,
    transactionCount: 20,
    isExceptionalMonth: false,
    exceptionalMonthReason: null,
    ...overrides,
  }
}

function row(overrides: Partial<ReconciliationRowResult> = {}): ReconciliationRowResult {
  return { lender: 'HDFC', product: 'Personal Loan', reportedOutstanding: 50000, reportedEmi: 8000, observedPayment: 8000, observedFrequencyMonths: null, matchStatus: 'MATCHED', confidence: 0.9, explanation: 'matched', ...overrides }
}

describe('compareDebtServicing', () => {
  it('passes Bureau DSR through from Debt Analysis verbatim, never recalculating it', () => {
    const result = compareDebtServicing({ debtServiceRatio: { availability: 'AVAILABLE', debtServiceRatioPercent: 16, monthlyIncome: 50000 } }, [month()], 1, [row()])
    expect(result.bureauDsr).toEqual({ availability: 'AVAILABLE', percent: 16 })
  })

  it('derives Bank DSR from Financial Analysis\'s own scoring function, matching its dsrPercent evidence', () => {
    const result = compareDebtServicing({ debtServiceRatio: { availability: 'NOT_REPORTED', debtServiceRatioPercent: null, monthlyIncome: null } }, [month()], 1, [row()])
    expect(result.bankDsr.availability).toBe('AVAILABLE')
    expect(result.bankDsr.percent).toBe(16) // 8000/50000 = 16%
  })

  it('computes Master DSR only from MATCHED/PARTIALLY_MATCHED reconciliation rows, excluding NOT_OBSERVED/UNKNOWN', () => {
    const result = compareDebtServicing(
      { debtServiceRatio: { availability: 'AVAILABLE', debtServiceRatioPercent: 16, monthlyIncome: 50000 } },
      [month()],
      2,
      [row({ reportedEmi: 8000, matchStatus: 'MATCHED' }), row({ lender: 'ICICI', reportedEmi: 20000, matchStatus: 'NOT_OBSERVED' })],
    )
    expect(result.masterDsr.confirmedMonthlyObligations).toBe(8000)
    expect(result.masterDsr.percent).toBe(16)
  })

  it('never substitutes a missing normalized income with 0 — reports NOT_REPORTED instead', () => {
    const result = compareDebtServicing({ debtServiceRatio: { availability: 'NOT_REPORTED', debtServiceRatioPercent: null, monthlyIncome: null } }, [month({ normalizedIncome: 0 })], null, [])
    expect(result.masterDsr.availability).toBe('NOT_REPORTED')
  })

  it('reports INSUFFICIENT_DATA for Master DSR when no reconciliation row is confirmed', () => {
    const result = compareDebtServicing({ debtServiceRatio: { availability: 'AVAILABLE', debtServiceRatioPercent: 16, monthlyIncome: 50000 } }, [month()], 1, [row({ matchStatus: 'UNKNOWN' })])
    expect(result.masterDsr.availability).toBe('INSUFFICIENT_DATA')
  })
})
