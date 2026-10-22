import type { MonthlyFinancialAggregateInput } from '../financial-analysis.types'

export function month(overrides: Partial<MonthlyFinancialAggregateInput> = {}): MonthlyFinancialAggregateInput {
  return {
    periodMonth: new Date(Date.UTC(2026, 0, 1)),
    totalInflow: 50000,
    totalOutflow: 30000,
    netCashFlow: 20000,
    normalizedIncome: 50000,
    essentialExpenses: 15000,
    financialExpenses: 10000,
    discretionaryExpenses: 5000,
    mandatoryDebtPayments: 10000,
    creditCardPayments: 0,
    loanInflows: 0,
    transferInflows: 0,
    transferOutflows: 0,
    cashWithdrawals: 0,
    cashDeposits: 0,
    closingBalance: 30000,
    minBalance: 20000,
    lowBalanceDays: 0,
    observedDays: 20,
    hadNegativeBalance: false,
    transactionCount: 20,
    isExceptionalMonth: false,
    exceptionalMonthReason: null,
    ...overrides,
  }
}
