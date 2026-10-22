import { env } from '@/lib/env'
import { apiRequest } from '@/services/api/client'
import { delay } from '@/services/mock/delay'
import type { FinancialAnalysisReport, FinancialAnalysisResponse } from '../types'

export interface FinancialAnalysisService {
  getForLead(bbsLeadId: string): Promise<FinancialAnalysisResponse>
  /** Re-runs the pipeline against the already-stored bank-statement bytes — NEVER a new upload/parse of fresh bytes from elsewhere. */
  reprocess(bbsLeadId: string, documentId: string): Promise<{ reprocessed: boolean; reason?: string }>
}

// --- Mock implementation ----------------------------------------------------

/**
 * One realistic fictional populated report, keyed by lead id, plus the
 * honest "no statement uploaded yet" fallback for every other lead —
 * mirrors the real backend's own behavior (and debtAnalysisService.ts's
 * identical convention) rather than always returning populated data.
 */
const mockReport: FinancialAnalysisReport = {
  reportAvailable: true,
  status: 'COMPLETED',
  statement: {
    bankName: 'Mock Bank',
    accountNumberMasked: 'XXXXXX1234',
    accountHolderName: 'MOCK CUSTOMER',
    ifscCode: 'MOCK0001234',
    accountType: 'Savings',
    statementPeriodStart: new Date(Date.UTC(2026, 0, 1)).toISOString(),
    statementPeriodEnd: new Date(Date.UTC(2026, 3, 30)).toISOString(),
    transactionCount: 11,
    monthsCovered: 4,
    sourceFileFormat: 'CSV',
    extractionConfidence: 0.95,
    documentId: 'mock-document-id',
    generatedAt: new Date().toISOString(),
  },
  score: {
    incomeStabilityScore: 15,
    incomeStabilityAvailability: 'AVAILABLE',
    cashFlowStrengthScore: 12,
    cashFlowStrengthAvailability: 'AVAILABLE',
    debtServicingCapacityScore: 17,
    debtServicingCapacityAvailability: 'AVAILABLE',
    liquidityScore: 13,
    liquidityAvailability: 'AVAILABLE',
    expenseBehaviourScore: 7,
    expenseBehaviourAvailability: 'AVAILABLE',
    borrowingDependencyScore: 10,
    borrowingDependencyAvailability: 'AVAILABLE',
    creditPaymentBehaviourScore: 5,
    creditPaymentBehaviourAvailability: 'AVAILABLE',
    transactionBehaviourScore: 5,
    transactionBehaviourAvailability: 'AVAILABLE',
    stressSignalsScore: 3,
    stressSignalsAvailability: 'AVAILABLE',
    totalScore: 87,
    scorePartial: false,
    maxAchievablePoints: 100,
    componentDetails: null,
    stressIndicator0to100: 22,
    stressBand: 'MODERATE',
    extendedAnalysis: {
      reconciliation: {
        availability: 'AVAILABLE',
        reconciled: true,
        openingBalance: 3000,
        closingBalance: 123500,
        expectedClosingBalance: 123500,
        gapRupees: 0,
        toleranceRupees: 100,
        detail: 'Opening balance plus classified credits/debits matches the reported closing balance within tolerance.',
      },
      fcfReconciliation: {
        availability: 'AVAILABLE',
        totalTheoreticalFcf: 168000,
        totalActualNetCashFlow: 120500,
        gapRupees: -47500,
        gapPercent: 28.3,
        unreconciled: false,
        attribution: {
          creditCardPayments: 0,
          transferOutflows: 0,
          cashWithdrawals: 2000,
          discretionaryExpenses: 45000,
          otherFinancialAndUnclassifiedOutflows: 500,
          nonIncomeInflowsOffset: 0,
        },
        detail: 'Mock: theoretical free cash flow approximately matches actual net cash flow for the statement window.',
      },
      dsrBreakdown: {
        availability: 'AVAILABLE',
        dsrFixedPercent: 16,
        dsrTotalPercent: 16,
        dsrWithDiscretionaryPercent: 38.5,
        detail: 'Mock: fixed-debt DSR 16%; including credit-card payments 16%; including discretionary spend 38.5%.',
      },
      scoreCashflowDivergence: {
        availability: 'AVAILABLE',
        divergent: false,
        totalScore: 87,
        deficitMonths: 1,
        lowBalanceFrequencyPercent: 0,
        fcfUnreconciled: false,
        attentionOrWorseFlagCount: 1,
        thresholdsRequireCalibration: true,
        detail: 'Mock: the Financial Health Score is consistent with the underlying cash-flow evidence — no divergence detected. These divergence thresholds are PROPOSED and not yet validated against a labelled sample (spec §15.3).',
      },
      dataQuality: {
        rawScore: 75,
        finalScore: 75,
        appliedCaps: [{ reason: '20% of transactions are unclassified', capPoints: 75 }],
        components: {
          statementCompleteness: { score: 8, maxPoints: 25, detail: '4 of 12 ideal month(s) covered.' },
          reconciliationStatus: { score: 15, maxPoints: 15, detail: 'Opening balance plus classified credits/debits matches the reported closing balance within tolerance.' },
          classificationConfidence: { score: 27, maxPoints: 35, detail: 'Average confidence 95%, 20% unclassified.' },
          statementHeaderCompleteness: { score: 15, maxPoints: 15, detail: '4 of 4 statement header field(s) captured (bank/account/period) — this system does not capture customer name, PAN, account type, or IFSC; see the Missing Information Register.' },
          otherAccountDetection: { score: 10, maxPoints: 10, detail: 'No material self-transfer volume suggesting an undisclosed account.' },
        },
        band: 'Good',
        detail: 'Raw data quality score 75/100, capped to 75 by: 20% of transactions are unclassified.',
      },
      missingInformationRegister: [
        { category: 'Customer identity', status: 'PARTIAL', description: 'PAN is never captured from a bank statement. Account holder name/IFSC/account type are captured only when the statement header explicitly states them.', reason: "This statement's own header supplied some identity fields; PAN and cross-verification against the CRM record remain out of scope for this module." },
        { category: 'Narration detail fields', status: 'PARTIAL', description: "Transaction mode, reference number, counterparty, purpose, and counterparty bank are now parsed for UPI/IMPS/NEFT/RTGS/ACH/SB-formatted narrations; other banks' narration formats are not yet covered.", reason: "Parsing is structural (slash/dash-delimited), not a general narration-understanding model." },
        { category: 'Multi-account aggregation', status: 'NOT_CAPTURED', description: 'Each uploaded statement is analyzed independently; no other statement is currently on file for this lead.', reason: 'Merging monthly financials across accounts risks double-counting inter-account transfers without a much more rigorous reconciliation step.' },
        { category: 'Family / household transfer network', status: 'NOT_CAPTURED', description: 'Mock: no counterparty in this statement matched enough signals to suggest a family/household transfer relationship.', reason: 'This is an INFERRED pattern only — this module can never confirm an actual relationship from a bank statement alone.' },
        { category: 'Event detection — income transition, medical, bonus, related-party employer', status: 'PARTIAL', description: 'Detected from real transaction evidence where present.', reason: 'Each of these is a pattern match over already-classified transactions, not a verified narrative.' },
        { category: 'Event detection — job loss, marital event, bereavement, property event', status: 'NOT_CAPTURED', description: 'These events are not detected at all.', reason: 'No bank-statement pattern reliably distinguishes these without speculative assumptions this module deliberately avoids making.' },
        { category: 'Other-account confirmation', status: 'PARTIAL', description: "OTHER_ACCOUNTS_LIKELY is inferred from self-transfer volume, refined by counterparty-bank parsing where the narration states a different bank.", reason: "A single account's statement cannot confirm the destination account's true owner or balance." },
        { category: 'Business/personal transaction mixing', status: 'NOT_CAPTURED', description: 'Mock: no co-occurring personal and business income subcategory was identified in this statement.', reason: 'This only detects co-occurrence of both patterns already classified elsewhere.' },
      ],
      transferProfile: {
        selfTransfers: { count: 0, volumeDebit: 0, volumeCredit: 0, net: 0 },
        roundTrips: { count: 0, volume: 0 },
        familyNetwork: [],
        largeRecurringTransfers: [],
        businessCounterparties: [],
        unclassifiedP2pCount: 0,
      },
      eventProfile: {
        incomeTransition: { detected: false, transitionMonth: null, previousAverage: null, currentAverage: null, deltaPercent: null },
        bonuses: [],
        medicalEvents: { monthlyEntries: [], shockMonths: [], chronic: false },
        relatedPartyEmployer: { detected: false, matchedName: null },
        otherAccountsLikely: false,
      },
      ccrBrief: {
        caseId: 'BBS-LD-900001',
        statementPeriod: { start: new Date(Date.UTC(2026, 0, 1)).toISOString(), end: new Date(Date.UTC(2026, 3, 30)).toISOString() },
        dataQuality: { score: 75, band: 'Good', capsApplied: true },
        bankAccountSummary: { banks: ['Mock Bank'], accountsMasked: ['XXXXXX1234'], statementMonths: 4, transactionCount: 11, reconciliation: 'OK' },
        financialHealthScore: {
          total: 87,
          band: 'Healthy',
          components: {
            incomeStability: { score: 15, maxPoints: 15 },
            cashFlowStrength: { score: 12, maxPoints: 15 },
            debtServicingCapacity: { score: 17, maxPoints: 20 },
            liquidity: { score: 13, maxPoints: 15 },
            expenseBehaviour: { score: 7, maxPoints: 10 },
            borrowingDependency: { score: 10, maxPoints: 10 },
            creditPaymentBehaviour: { score: 5, maxPoints: 5 },
            transactionBehaviour: { score: 5, maxPoints: 5 },
            stressSignals: { score: 3, maxPoints: 5 },
          },
        },
        incomeProfile: {
          normalizedMonthlyIncome: 50000,
          stabilityBand: 'Very stable',
          confidenceLevel: 'HIGH',
          tenureMonths: 12,
          confidenceDowngradeReason: null,
          trend: 'stable',
          singleSourceDependency: false,
          incomeTransition: 'No',
          relatedPartyEmployer: false,
        },
        debtServicing: { fixedMonthlyDebt: 8000, variableCardPayments: 0, dsrFixedPercent: 16, dsrTotalPercent: 16, activeLenders: null },
        cashFlow: { averageMonthlyInflow: 50000, averageMonthlyOutflow: 19875, theoreticalFcf: 42000, actualNetFlow: 30125, fcfGap: '₹-11875 (28.3%)', deficitMonths: '0 of 4' },
        liquidity: { averageBalance: 83750, minimumBalance: 45000, lowBalanceFrequencyPercent: 0, negativeBalanceEvents: 0, cashVisibilityGap: false },
        borrowingAndTransfers: { loanInflows: 0, loanInflowSharePercent: 0, familyNetwork: [], lrtCounterparties: [], selfTransfers: 0, roundTrips: 0 },
        eventProfile: { incomeTransition: false, bonus: false, medicalShock: 'No', relatedParty: false, otherAccountsDetected: [] },
        topRiskSignals: [
          { key: 'CONFIRMED_ECS_BOUNCE', severity: 'ELEVATED', detail: '1 confirmed bounce/return event(s).' },
          { key: 'LARGE_TRANSACTION', severity: 'INFORMATIONAL', detail: '1 large/unusual transaction(s) identified.' },
        ],
        missingInformationAgenda: [{ item: 'Customer identity', whyItMatters: 'PAN is never captured from a bank statement.' }],
        suggestedDiscoveryQuestions: ['Regarding customer identity: PAN is never captured from a bank statement.'],
      },
      cohortSignalPackage: {
        normalized_monthly_income: 50000,
        income_confidence: 'HIGH',
        income_source_count: 1,
        single_source_dependency: false,
        income_stability_band: 'Very stable',
        income_tenure_months: 12,
        monthly_debt_fixed: 8000,
        monthly_debt_variable: 0,
        debt_service_ratio_fixed: 16,
        debt_service_ratio_total: 16,
        active_lender_count: null,
        theoretical_fcf: 42000,
        actual_net_flow: 30125,
        fcf_reconciliation_gap: -11875,
        fcf_unreconciled: false,
        deficit_months: 0,
        low_balance_frequency: 0,
        negative_balance_events: 0,
        loan_inflow_total: 0,
        loan_inflow_share: 0,
        borrowing_dependency_band: null,
        confirmed_bounce_count: 1,
        possible_bounce_count: 0,
        cash_visibility_gap: false,
        recurring_deficit: false,
        self_transfer_volume: 0,
        round_trip_count: 0,
        family_net_flow: 0,
        lrt_volume: 0,
        income_transition_delta_pct: null,
        bonus_amount: 0,
        medical_shock_amount: 0,
        related_party_employer: false,
        other_accounts_likely: false,
        business_personal_mixed: false,
        unclassified_share: 0.2,
        financial_health_score: 87,
        financial_health_band: 'Healthy',
        data_quality: 75,
        data_quality_raw: 75,
        missing_information_count: 8,
      },
      incomeProfile: {
        availability: 'AVAILABLE',
        employmentType: 'SALARIED',
        tenureMonths: 12,
        confidenceLevel: 'HIGH',
        confidenceDowngradeReason: null,
        currentMonthlyAmount: 110613,
      },
      daysToNextIncome: {
        availability: 'AVAILABLE',
        daysToNextIncome: 18,
        nextExpectedDate: new Date(Date.UTC(2026, 4, 5)).toISOString(),
        reason: 'Mock: projected from 4 consistent occurrences (day-of-month stddev 0.5).',
      },
      whatL2CannotDecide: [
        'The reason for financial distress',
        'Customer intent',
        'Willingness to pay',
        'Cohort assignment',
        'Pathway recommendation',
        'Loan approval',
        'Settlement guarantees',
        'A BBS Plan',
        'Full income validation without CCR confirmation',
        'Transactions outside the provided statements',
        'Ambiguous narrations without CCR input',
        'Business vs. personal splits without separate statements',
        'Informal (cash-only) borrowing',
        'Family relationships',
        'Related-party employment context',
      ],
      reviewChecklist: [
        { item: 'Statement period (3+ months) confirmed?', status: 'PASS', detail: 'Mock: 4 month(s) covered.' },
        { item: 'Reconciliation verified?', status: 'PASS', detail: 'Mock: opening balance plus classified credits/debits matches the reported closing balance.' },
        { item: 'Narration parsing applied?', status: 'PARTIAL', detail: 'Mock: 0 of 11 transaction(s) had a narration-detail field parsed.' },
        { item: 'Self-transfers, round-trips, family network, and LRT counterparties identified?', status: 'PASS', detail: 'Mock: 0 self-transfer(s), 0 round-trip(s), 0 family-network entries, 0 LRT counterparties.' },
        { item: 'Income classified, normalized, and stability assessed?', status: 'PASS', detail: 'Mock: income stability 95% (Very stable).' },
        { item: 'Income transition, bonus, and related-party employer detected?', status: 'PASS', detail: 'Mock: income transition: no; bonus: no; related-party employer: no.' },
        { item: 'Expenses and merchant taxonomy applied?', status: 'PASS', detail: 'Mock: expenses are 16% of normalized income.' },
        { item: 'EMI reconstruction attempted against L1?', status: 'PARTIAL', detail: 'Mock: no linked credit report is available for this lead.' },
        { item: 'DSR fixed and total calculated?', status: 'PASS', detail: 'Mock: fixed-debt DSR 16%.' },
        { item: 'FCF reconciliation performed?', status: 'PASS', detail: 'Mock: theoretical free cash flow approximately matches actual net cash flow.' },
        { item: 'Liquidity, cash visibility, borrowing dependency, and transaction behaviour calculated?', status: 'PASS', detail: 'Mock: minimum balance observed 45000.' },
        { item: 'Bounce classification kept strict?', status: 'PASS', detail: 'An ECS/return fee alone is never promoted to a confirmed bounce (hard rule).' },
        { item: 'Medical shock and event profile completed?', status: 'PASS', detail: 'Mock: 0 medical-shock month(s) identified.' },
        { item: 'Other-account detection performed?', status: 'PASS', detail: 'Mock: no material self-transfer volume suggesting an undisclosed account.' },
        { item: 'Financial stress, FHS, divergence, DQ score, missing information, reconciliation, CCR brief, cohort package, provenance, versioning, and policy registry completed?', status: 'PASS', detail: 'Mock: FHS 87/100 (Healthy); stress band MODERATE; data quality 75/100; 7 missing-information item(s).' },
      ],
      finalSummary: {
        topFindings: ['Mock: no material events, divergences, or compliance signals were identified in this statement.'],
        dimensions: [
          { dimension: 'Income stability', finding: 'Mock: income stability 95% (Very stable).', severity: 'POSITIVE' },
          { dimension: 'Debt servicing (DSR)', finding: 'Mock: DSR 16%.', severity: 'POSITIVE' },
          { dimension: 'Liquidity', finding: 'Mock: minimum balance observed 45000.', severity: 'POSITIVE' },
          { dimension: 'Financial Health Score', finding: '87/100 (Healthy)', severity: 'POSITIVE' },
          { dimension: 'Score-cashflow divergence', finding: 'No', severity: 'POSITIVE' },
        ],
        bottomLine: 'Mock: the Financial Health Score (87/100, Healthy) is consistent with the observed cash-flow evidence.',
      },
    },
  },
  riskFlags: [
    { key: 'INCOME_STABLE', severity: 'POSITIVE', detail: 'Income pattern classified as very stable.', evidence: { band: 'Very stable' } },
    { key: 'CONFIRMED_ECS_BOUNCE', severity: 'ELEVATED', detail: '1 confirmed bounce/return event(s).', evidence: { confirmedCount: 1 } },
    { key: 'LARGE_TRANSACTION', severity: 'INFORMATIONAL', detail: '1 large/unusual transaction(s) identified.', evidence: { count: 1 } },
  ],
  months: [
    {
      periodMonth: new Date(Date.UTC(2026, 0, 1)).toISOString(),
      totalInflow: 50000, totalOutflow: 10000, netCashFlow: 40000, normalizedIncome: 50000,
      essentialExpenses: 0, financialExpenses: 8000, discretionaryExpenses: 0, mandatoryDebtPayments: 8000,
      creditCardPayments: 0, loanInflows: 0, transferInflows: 0, transferOutflows: 0, cashWithdrawals: 2000, cashDeposits: 0,
      closingBalance: 45000, minBalance: 45000, lowBalanceDays: 0, observedDays: 3, hadNegativeBalance: false,
      transactionCount: 3, isExceptionalMonth: false, exceptionalMonthReason: null,
    },
    {
      periodMonth: new Date(Date.UTC(2026, 1, 1)).toISOString(),
      totalInflow: 50000, totalOutflow: 8500, netCashFlow: 41500, normalizedIncome: 50000,
      essentialExpenses: 0, financialExpenses: 8000, discretionaryExpenses: 0, mandatoryDebtPayments: 8000,
      creditCardPayments: 0, loanInflows: 0, transferInflows: 0, transferOutflows: 0, cashWithdrawals: 0, cashDeposits: 0,
      closingBalance: 85000, minBalance: 84500, lowBalanceDays: 0, observedDays: 2, hadNegativeBalance: false,
      transactionCount: 2, isExceptionalMonth: false, exceptionalMonthReason: null,
    },
    {
      periodMonth: new Date(Date.UTC(2026, 2, 1)).toISOString(),
      totalInflow: 50000, totalOutflow: 53000, netCashFlow: -3000, normalizedIncome: 50000,
      essentialExpenses: 0, financialExpenses: 8000, discretionaryExpenses: 45000, mandatoryDebtPayments: 8000,
      creditCardPayments: 0, loanInflows: 0, transferInflows: 0, transferOutflows: 0, cashWithdrawals: 0, cashDeposits: 0,
      closingBalance: 81500, minBalance: 81500, lowBalanceDays: 0, observedDays: 2, hadNegativeBalance: false,
      transactionCount: 2, isExceptionalMonth: true, exceptionalMonthReason: 'A large one-time transaction materially changed this month.',
    },
    {
      periodMonth: new Date(Date.UTC(2026, 3, 1)).toISOString(),
      totalInflow: 50000, totalOutflow: 8000, netCashFlow: 42000, normalizedIncome: 50000,
      essentialExpenses: 0, financialExpenses: 8000, discretionaryExpenses: 0, mandatoryDebtPayments: 8000,
      creditCardPayments: 0, loanInflows: 0, transferInflows: 0, transferOutflows: 0, cashWithdrawals: 0, cashDeposits: 0,
      closingBalance: 123500, minBalance: 123500, lowBalanceDays: 0, observedDays: 2, hadNegativeBalance: false,
      transactionCount: 2, isExceptionalMonth: false, exceptionalMonthReason: null,
    },
  ],
  transactions: [
    { id: 't1', transactionDate: new Date(Date.UTC(2026, 0, 5)).toISOString(), valueDate: null, narration: 'SALARY CREDIT ABC CORP', amount: 50000, direction: 'CREDIT', balance: 55000, counterparty: null, transactionType: null, category: 'INCOME', subcategory: 'Salary', lender: null, confidence: 0.95, evidenceLevel: 'DERIVED', bounceEvidence: null, narrationDetail: null, sourceRowRef: 1 },
    { id: 't2', transactionDate: new Date(Date.UTC(2026, 0, 10)).toISOString(), valueDate: null, narration: 'EMI AUTO DEBIT HDFC', amount: 8000, direction: 'DEBIT', balance: 47000, counterparty: null, transactionType: null, category: 'EXPENSE', subcategory: 'EMI', lender: 'HDFC', confidence: 0.95, evidenceLevel: 'DERIVED', bounceEvidence: null, narrationDetail: null, sourceRowRef: 2 },
    { id: 't3', transactionDate: new Date(Date.UTC(2026, 0, 15)).toISOString(), valueDate: null, narration: 'ATM WDL', amount: 2000, direction: 'DEBIT', balance: 45000, counterparty: null, transactionType: 'ATM-CASH', category: 'CASH', subcategory: 'ATM withdrawal', lender: null, confidence: 0.95, evidenceLevel: 'CONFIRMED', bounceEvidence: null, narrationDetail: null, sourceRowRef: 3 },
    { id: 't6', transactionDate: new Date(Date.UTC(2026, 1, 12)).toISOString(), valueDate: null, narration: 'ECS RETURN CHARGES INSUFFICIENT FUNDS', amount: 500, direction: 'DEBIT', balance: 84500, counterparty: null, transactionType: 'ECS', category: 'UNCLASSIFIED', subcategory: null, lender: null, confidence: 0.95, evidenceLevel: 'CONFIRMED', bounceEvidence: 'CONFIRMED_BOUNCE', narrationDetail: null, sourceRowRef: 6 },
    { id: 't9', transactionDate: new Date(Date.UTC(2026, 2, 20)).toISOString(), valueDate: null, narration: 'AMAZON SHOPPING', amount: 45000, direction: 'DEBIT', balance: 81500, counterparty: null, transactionType: null, category: 'EXPENSE', subcategory: 'Shopping', lender: null, confidence: 0.95, evidenceLevel: 'CONFIRMED', bounceEvidence: null, narrationDetail: null, sourceRowRef: 9 },
  ],
  insights: {
    status: 'COMPLETED',
    findings: {
      executiveSummary: 'Mock financial assessment — no real AI provider was called.',
      financialPosition: 'Mock: income and expenses are broadly balanced with one exceptional month from a large discretionary purchase.',
      strengths: [
        { type: 'income_stability', severity: 'Positive', title: 'Stable recurring income', statement: 'Mock: a consistent monthly salary credit was identified across the statement window.', evidence: ['score.incomeStabilityScore=15'], evidenceLevel: 'CONFIRMED', confidence: 'high', relatedTransactions: [], relatedMonths: [], relatedAccounts: [] },
      ],
      concerns: [
        { type: 'bounce', severity: 'Elevated', title: 'A confirmed bounce event', statement: 'Mock: one confirmed ECS return was observed in February.', evidence: ['riskFlags.CONFIRMED_ECS_BOUNCE'], evidenceLevel: 'CONFIRMED', confidence: 'high', relatedTransactions: ['t6'], relatedMonths: ['2026-02'], relatedAccounts: [] },
      ],
      liquidityAssessment: 'Mock: no tight-liquidity events were observed.',
      cashFlowAssessment: 'Mock: cash flow is positive in 3 of 4 months.',
      incomeAssessment: 'Mock: income is classified as very stable.',
      debtServicingAssessment: 'Mock: debt service ratio is within a comfortable range.',
      borrowingAssessment: 'Mock: no loan inflows were observed.',
      transactionBehaviourAssessment: 'Mock: transaction activity is unremarkable.',
      creditCorrelationAssessment: 'Mock: no bureau correlation data was available to assess.',
      possibleDrivers: [],
      dataGaps: [
        { type: 'data_gap', severity: 'Informational', title: 'Income not declared', statement: 'Mock: declared monthly income was not available to cross-check.', evidence: [], evidenceLevel: 'CONFIRMED', confidence: 'medium', relatedTransactions: [], relatedMonths: [], relatedAccounts: [] },
      ],
      investigationPriorities: [
        { type: 'bounce', severity: 'Attention', title: 'Investigate the confirmed bounce', statement: 'Mock: confirm whether this was isolated or part of a recurring pattern.', evidence: [], evidenceLevel: 'CONFIRMED', confidence: 'medium', relatedTransactions: ['t6'], relatedMonths: [], relatedAccounts: [] },
      ],
      actionPriorities: [
        { type: 'verify', severity: 'Informational', title: 'Verify income', statement: 'Mock: confirm declared income directly with the borrower.', evidence: [], evidenceLevel: 'CONFIRMED', confidence: 'medium', relatedTransactions: [], relatedMonths: [], relatedAccounts: [], quadrant: 'VERIFY', suggestedNextStep: 'Mock: ask for a recent salary slip.' },
        { type: 'monitor', severity: 'Attention', title: 'Monitor for repeat bounces', statement: 'Mock: watch for any further ECS returns in subsequent months.', evidence: [], evidenceLevel: 'CONFIRMED', confidence: 'medium', relatedTransactions: [], relatedMonths: [], relatedAccounts: [], quadrant: 'MONITOR', suggestedNextStep: 'Mock: re-check next statement upload.' },
      ],
      overallAssessment: {
        whatIsHappening: 'Mock: the borrower shows a stable income with one isolated bounce event and one large discretionary purchase.',
        whatIsTheConcern: 'Mock: the confirmed bounce event warrants a closer look.',
        whatSupportsStability: 'Mock: consistent recurring salary and generally positive cash flow.',
        whatRequiresInvestigation: 'Mock: whether the bounce was isolated or recurring, and the purpose of the large purchase.',
        whatShouldBbsDoNext: 'Mock: verify income and ask about the bounce event.',
      },
    },
    confidence: 0,
    modelVersion: 'mock',
    generatedAt: new Date().toISOString(),
  },
  latestUploadFailed: null,
}

class MockFinancialAnalysisService implements FinancialAnalysisService {
  async getForLead(bbsLeadId: string): Promise<FinancialAnalysisResponse> {
    // Only the seeded demo lead gets the populated fixture — every other
    // mock lead honestly reports no bank statement has been uploaded yet,
    // same as a brand new lead would in the real backend.
    if (bbsLeadId === 'BBS-LD-900001') {
      return delay(mockReport, 300)
    }
    return delay({ reportAvailable: false }, 300)
  }

  async reprocess(): Promise<{ reprocessed: boolean; reason?: string }> {
    return delay({ reprocessed: false, reason: 'Mock mode has no stored statement to reprocess.' }, 300)
  }
}

// --- Real backend implementation --------------------------------------------

class ApiFinancialAnalysisService implements FinancialAnalysisService {
  async getForLead(bbsLeadId: string): Promise<FinancialAnalysisResponse> {
    return apiRequest<FinancialAnalysisResponse>(`/leads/${bbsLeadId}/financial-analysis`)
  }

  async reprocess(bbsLeadId: string, documentId: string): Promise<{ reprocessed: boolean; reason?: string }> {
    return apiRequest<{ reprocessed: boolean; reason?: string }>(`/leads/${bbsLeadId}/documents/${documentId}/reprocess-financial-analysis`, {
      method: 'POST',
    })
  }
}

export const financialAnalysisService: FinancialAnalysisService =
  env.apiMode === 'api' ? new ApiFinancialAnalysisService() : new MockFinancialAnalysisService()
