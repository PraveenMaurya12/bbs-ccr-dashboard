import type { BounceSummary } from '../classification/bounce-detector'
import type { FinancialRiskFlagResult, FinancialSeverity, MonthlyFinancialAggregateInput, NormalizedTransactionInput } from '../financial-analysis.types'
import type { ComponentScoreResult } from './financial-health-scoring'

export interface BuildRiskFlagsInput {
  transactions: NormalizedTransactionInput[]
  months: MonthlyFinancialAggregateInput[]
  incomeStability: ComponentScoreResult
  cashFlowStrength: ComponentScoreResult
  debtServicing: ComponentScoreResult
  liquidity: ComponentScoreResult
  expenseBehaviour: ComponentScoreResult
  borrowingDependency: ComponentScoreResult
  creditPaymentBehaviour: ComponentScoreResult
  transactionBehaviour: ComponentScoreResult
  bounceSummary: BounceSummary
  recurringP2pCounterpartyCount: number
  unclassifiedP2pCount: number
  largeTransactionCount: number
  borrowingDependencyPatternDetected: boolean
}

function flag(key: string, severity: FinancialSeverity, detail: string, evidence: Record<string, number | string | boolean | null>): FinancialRiskFlagResult {
  return { key, severity, detail, evidence, relatedMonth: null, relatedTransactionIndex: null }
}

/**
 * Every flag here is a NEW rule established for this module — no prior
 * approved BBS scoring logic exists to reuse (same convention as the Debt
 * Analysis module's own riskFlags()). A flag is only produced when its
 * underlying figure was itself AVAILABLE (never defaulted from missing
 * data — D12), and `evidence` always carries the real number(s) behind it,
 * not just the formatted `detail` string.
 */
export function buildFinancialRiskFlags(input: BuildRiskFlagsInput): FinancialRiskFlagResult[] {
  const flags: FinancialRiskFlagResult[] = []
  const { incomeStability, cashFlowStrength, debtServicing, liquidity, expenseBehaviour, borrowingDependency, creditPaymentBehaviour, transactionBehaviour } = input

  // --- Income ---
  if (incomeStability.availability === 'AVAILABLE') {
    const band = String(incomeStability.evidence.band ?? '')
    if (band === 'Very stable' || band === 'Stable') {
      flags.push(flag('INCOME_STABLE', 'POSITIVE', `Income pattern classified as ${band.toLowerCase()}.`, incomeStability.evidence))
    } else if (band === 'Volatile' || band === 'Highly volatile') {
      flags.push(flag('INCOME_VOLATILE', band === 'Highly volatile' ? 'ELEVATED' : 'ATTENTION', `Income pattern classified as ${band.toLowerCase()}.`, incomeStability.evidence))
    }
  }

  // --- Expenses / cash flow ---
  if (expenseBehaviour.availability === 'AVAILABLE' && (expenseBehaviour.evidence.expenseRatioPercent as number) >= 80) {
    flags.push(flag('HIGH_EXPENSE_RATIO', (expenseBehaviour.evidence.expenseRatioPercent as number) >= 95 ? 'ELEVATED' : 'ATTENTION', `Expenses are ${expenseBehaviour.evidence.expenseRatioPercent}% of normalized income.`, expenseBehaviour.evidence))
  }
  const deficitMonths = input.months.filter((m) => m.netCashFlow < 0).length
  if (deficitMonths >= 3) {
    flags.push(flag('RECURRING_DEFICIT', deficitMonths > 5 ? 'ELEVATED' : 'ATTENTION', `${deficitMonths} month(s) with a net cash-flow deficit.`, { deficitMonths }))
  }
  if (cashFlowStrength.availability === 'AVAILABLE' && (cashFlowStrength.evidence.retentionPercent as number) < 5) {
    flags.push(flag('LOW_FREE_CASH_FLOW', 'ATTENTION', `Annual retention is only ${cashFlowStrength.evidence.retentionPercent}% of total inflow.`, cashFlowStrength.evidence))
  }

  // --- Debt ---
  if (debtServicing.availability === 'AVAILABLE') {
    const dsrPercent = debtServicing.evidence.dsrPercent as number
    if (dsrPercent > 50) flags.push(flag('HIGH_DEBT_SERVICE', 'CRITICAL', `Debt service ratio is ${dsrPercent}%.`, debtServicing.evidence))
    else if (dsrPercent > 30) flags.push(flag('MODERATE_DEBT_SERVICE', 'ATTENTION', `Debt service ratio is ${dsrPercent}%.`, debtServicing.evidence))

    const activeLenderCount = debtServicing.evidence.activeLenderCount as number | null
    if (activeLenderCount !== null && activeLenderCount > 4) {
      flags.push(flag('MULTIPLE_ACTIVE_LENDERS', activeLenderCount > 6 ? 'ELEVATED' : 'ATTENTION', `${activeLenderCount} active lenders identified.`, { activeLenderCount }))
    }
  }

  // --- Liquidity ---
  if (liquidity.availability === 'AVAILABLE' && (liquidity.evidence.lowBalanceFrequencyPercent as number) >= 20) {
    flags.push(flag('LOW_LIQUIDITY', (liquidity.evidence.lowBalanceFrequencyPercent as number) >= 30 ? 'ELEVATED' : 'ATTENTION', `Balance was below the tight-liquidity threshold on ${liquidity.evidence.lowBalanceFrequencyPercent}% of observed days.`, liquidity.evidence))
  }
  if (liquidity.availability === 'AVAILABLE' && liquidity.evidence.hadNegativeBalance === true) {
    flags.push(flag('NEGATIVE_BALANCE', 'CRITICAL', 'The account balance went negative at least once.', liquidity.evidence))
  }

  // --- Borrowing ---
  if (borrowingDependency.availability === 'AVAILABLE' && (borrowingDependency.evidence.dependencyPercent as number) >= 25) {
    flags.push(flag('HIGH_BORROWING_DEPENDENCY', (borrowingDependency.evidence.dependencyPercent as number) >= 40 ? 'ELEVATED' : 'ATTENTION', `Loan inflows are ${borrowingDependency.evidence.dependencyPercent}% of total inflow.`, borrowingDependency.evidence))
  }
  if (input.borrowingDependencyPatternDetected) {
    // Rule 16: an investigation signal only — never "debt trap" or any other conclusion.
    flags.push(flag('BORROWING_DEPENDENCY_PATTERN', 'ATTENTION', 'A loan credit followed by large transfers/withdrawals and a subsequent low balance was observed — warrants investigation, not a conclusion.', {}))
  }

  // --- Credit ---
  if (creditPaymentBehaviour.availability === 'AVAILABLE' && (creditPaymentBehaviour.evidence.intensityPercent as number) >= 20) {
    flags.push(flag('HIGH_CREDIT_PAYMENT_ACTIVITY', 'ATTENTION', `Credit-card/CRED payments are ${creditPaymentBehaviour.evidence.intensityPercent}% of normalized income.`, creditPaymentBehaviour.evidence))
  }

  // --- Transactions (descriptive — Positive/Informational by default, per Rule F18's own "not inherently negative") ---
  if (transactionBehaviour.availability === 'AVAILABLE' && transactionBehaviour.evidence.highVelocity === true) {
    flags.push(flag('HIGH_TRANSACTION_ACTIVITY', 'INFORMATIONAL', `${transactionBehaviour.evidence.avgTransactionsPerMonth} transactions/month on average.`, transactionBehaviour.evidence))
  }
  if (transactionBehaviour.availability === 'AVAILABLE' && transactionBehaviour.evidence.cashVisibilityGap === true) {
    flags.push(flag('HIGH_CASH_WITHDRAWAL', 'ATTENTION', `Cash withdrawals are ${transactionBehaviour.evidence.cashWithdrawalPercent}% of normalized income — final use of this cash cannot be determined from the statement.`, transactionBehaviour.evidence))
  }
  const upiCount = input.transactions.filter((t) => /\bupi\b/i.test(t.narration)).length
  if (upiCount > 0 && input.months.length > 0 && upiCount / input.months.length > 30) {
    flags.push(flag('HIGH_UPI_ACTIVITY', 'INFORMATIONAL', `${Math.round(upiCount / input.months.length)} UPI transactions/month on average.`, { upiCount }))
  }

  // --- Returns ---
  if (input.bounceSummary.confirmedCount > 0) {
    flags.push(flag('CONFIRMED_ECS_BOUNCE', input.bounceSummary.confirmedCount > 1 ? 'CRITICAL' : 'ELEVATED', `${input.bounceSummary.confirmedCount} confirmed bounce/return event(s).`, { confirmedCount: input.bounceSummary.confirmedCount }))
  }
  if (input.bounceSummary.possibleCount > 0) {
    flags.push(flag('POSSIBLE_ECS_BOUNCE', 'ATTENTION', `${input.bounceSummary.possibleCount} possible bounce/return event(s) (fee-only evidence — never treated as confirmed).`, { possibleCount: input.bounceSummary.possibleCount }))
  }

  // --- Large / exceptional ---
  if (input.largeTransactionCount > 0) {
    flags.push(flag('LARGE_TRANSACTION', 'INFORMATIONAL', `${input.largeTransactionCount} large/unusual transaction(s) identified.`, { count: input.largeTransactionCount }))
  }
  const exceptionalMonthCount = input.months.filter((m) => m.isExceptionalMonth).length
  if (exceptionalMonthCount > 0) {
    flags.push(flag('EXCEPTIONAL_MONTH', 'INFORMATIONAL', `${exceptionalMonthCount} exceptional month(s) identified — excluded from normal-income baselines.`, { exceptionalMonthCount }))
  }

  // --- Transfers (descriptive) ---
  const selfTransferCount = input.transactions.filter((t) => t.subcategory === 'Self transfer').length
  if (selfTransferCount > 0) {
    flags.push(flag('SELF_TRANSFER', 'INFORMATIONAL', `${selfTransferCount} self-transfer transaction(s) identified — excluded from income/expense.`, { selfTransferCount }))
  }
  if (input.recurringP2pCounterpartyCount > 0) {
    flags.push(flag('P2P_TRANSFER', 'INFORMATIONAL', `${input.recurringP2pCounterpartyCount} recurring P2P counterpart(ies) identified.`, { recurringP2pCounterpartyCount: input.recurringP2pCounterpartyCount }))
  }

  // --- Data quality ---
  const lowConfidenceCount = input.transactions.filter((t) => t.confidence < 0.7).length
  if (lowConfidenceCount > 0) {
    flags.push(flag('LOW_CLASSIFICATION_CONFIDENCE', 'INFORMATIONAL', `${lowConfidenceCount} transaction(s) have below-threshold extraction/classification confidence (typically PDF-derived).`, { lowConfidenceCount }))
  }
  if (input.unclassifiedP2pCount > 0) {
    flags.push(flag('DATA_INCOMPLETE', 'INFORMATIONAL', `${input.unclassifiedP2pCount} P2P transfer(s) could not be attributed to an identifiable, recurring counterparty.`, { unclassifiedP2pCount: input.unclassifiedP2pCount }))
  }

  return flags
}
