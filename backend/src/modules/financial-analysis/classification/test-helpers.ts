import type { FinancialAnalysisConfig, NormalizedTransactionInput } from '../financial-analysis.types'

export function testConfig(overrides: Partial<FinancialAnalysisConfig> = {}): FinancialAnalysisConfig {
  return {
    lowBalanceThresholdRupees: 1000,
    largeTransactionMinimumRupees: 25000,
    largeTransactionIncomeMultiplier: 0.5,
    recurringIncomeMinMonths: 3,
    recurringIncomeAmountToleranceFraction: 0.15,
    recurringDebtMinMonths: 2,
    recurringDebtAmountToleranceFraction: 0.05,
    creditCorrelationAmountToleranceFraction: 0.1,
    exceptionalMonthInflowMultiplier: 1.5,
    directionInversionMinSampleSize: 20,
    directionInversionConfidenceThreshold: 0.95,
    balanceReconciliationToleranceRupees: 100,
    fcfUnreconciledGapPercentThreshold: 30,
    dataQualityUnclassifiedSharePercentThreshold: 10,
    dataQualityUnclassifiedCapPoints: 75,
    dataQualityOtherAccountsCapPoints: 80,
    dataQualityFcfUnreconciledCapPoints: 75,
    dataQualityReconciliationFailedCapPoints: 50,
    dataQualityBusinessPersonalMixedCapPoints: 78,
    singleSourceDependencyThresholdPercent: 90,
    otherAccountsLikelyIncomeSharePercent: 10,
    largeRecurringTransferMinOccurrences: 3,
    largeRecurringTransferMinTotalRupees: 100000,
    largeRecurringTransferMinAverageRupees: 25000,
    largeRecurringTransferHighVolumeRupees: 200000,
    bonusSalaryMultiplier: 1.5,
    incomeTransitionDeltaPercentThreshold: 15,
    medicalShockThresholdRupees: 10000,
    medicalShockIncomeSharePercent: 20,
    chronicMedicalMinMonths: 3,
    relatedPartyEmployerNames: [],
    incomeDayOfMonthMaxStdDevDays: 5,
    ...overrides,
  }
}

/** Shared transaction-literal factory reused by every classification/aggregation spec in this module. */
export function txn(overrides: Partial<NormalizedTransactionInput> = {}): NormalizedTransactionInput {
  return {
    transactionDate: new Date(Date.UTC(2026, 3, 1)),
    valueDate: null,
    narration: 'MISC TRANSACTION',
    amount: 1000,
    direction: 'CREDIT',
    balance: 10000,
    counterparty: null,
    transactionType: null,
    category: 'UNCLASSIFIED',
    subcategory: null,
    lender: null,
    confidence: 0.95,
    evidenceLevel: 'CONFIRMED',
    bounceEvidence: null,
    sourceRowRef: 1,
    narrationDetail: null,
    ...overrides,
  }
}
