import { env } from '@/lib/env'
import { apiRequest } from '@/services/api/client'
import { delay } from '@/services/mock/delay'
import type { CcrBriefResponse, DebtAnalysisResponse } from '../types'

export interface DebtAnalysisService {
  getForLead(bbsLeadId: string): Promise<DebtAnalysisResponse>
  /**
   * Re-runs the mapper against this lead's already-stored raw bureau
   * response (REQUIRES_REVIEW only) — NEVER triggers a second Experian
   * call. At most one Experian call is ever made per lead; see the
   * backend's BureauReportService.
   */
  reprocess(bbsLeadId: string): Promise<{ reprocessed: boolean; reason?: string }>
  /** §18.1's fixed CCR Brief template — a read-only projection of getForLead()'s own analysis, never a second call to the bureau. */
  getCallBrief(bbsLeadId: string): Promise<CcrBriefResponse>
}

// --- Mock implementation ----------------------------------------------------

/**
 * One realistic fictional populated report, keyed by lead id, plus the
 * honest "no report yet" fallback for every other lead — mirrors the real
 * backend's own behavior rather than always returning populated data.
 */
const mockReport: DebtAnalysisResponse = {
  reportAvailable: true,
  status: 'COMPLETED',
  meta: { bureau: 'MockBureau One', reportDate: new Date().toISOString() },
  summary: {
    totalOutstanding: 185000,
    totalOverdue: 0,
    monthlyEmi: 11500,
    totalLenders: 2,
  },
  creditProfile: {
    creditScore: 762,
    scoreBand: 'good',
    totalAccounts: 3,
    activeAccounts: 3,
    closedAccounts: 0,
    defaultedAccounts: 0,
    totalOutstanding: 185000,
    totalOverdue: 0,
    recentEnquiries: 1,
  },
  accountDistribution: {
    totalAccounts: 3,
    slices: [
      { accountType: 'Personal Loan', count: 1, percent: 33 },
      { accountType: 'Credit Card', count: 1, percent: 33 },
      { accountType: 'Vehicle Loan', count: 1, percent: 34 },
    ],
  },
  utilization: {
    available: true,
    utilizationPercent: 60,
    totalCreditLimit: 100000,
    currentUtilization: 60000,
    availableCreditLimit: 40000,
    highUtilizationAccounts: 0,
    totalCreditCards: 1,
    cards: [
      {
        lender: 'Mock Bank Card',
        creditLimit: 100000,
        currentBalance: 60000,
        utilizationPercent: 60,
        level: 'Elevated',
        overdueAmount: 0,
        currentDpdDays: 0,
      },
    ],
    highestUtilizedCard: {
      lender: 'Mock Bank Card',
      creditLimit: 100000,
      currentBalance: 60000,
      utilizationPercent: 60,
      level: 'Elevated',
      overdueAmount: 0,
      currentDpdDays: 0,
    },
    unavailableReason: null,
  },
  debtBurden: {
    totalActiveDebt: 185000,
    monthlyEmi: 11500,
    numbersOfLenders: 2,
    top3LendersSharePercent: 100,
    top1LenderSharePercent: 78,
    top2LenderSharePercent: 97,
    lenderConcentration: [
      { lender: 'Mock Bank A', outstandingAmount: 145000, sharePercent: 78 },
      { lender: 'Mock Bank Card', outstandingAmount: 40000, sharePercent: 22 },
    ],
    topLenderConcentrationLevel: 'Very High',
    securedUnsecuredAvailable: true,
    securedAmount: 40000,
    unsecuredAmount: 145000,
    securedPercent: 22,
    unsecuredPercent: 78,
    securedAccountCount: 1,
    unsecuredAccountCount: 2,
    classifiedAccountCount: 3,
  },
  repaymentBehavior: {
    available: true,
    onTimePercent: 88,
    delayedPercent: 12,
    missedPercent: 0,
    onTimeCount: 30,
    delayedCount: 4,
    missedCount: 0,
    increasingDelayTrend: false,
  },
  creditHistory: {
    lengthOfHistoryYears: 3,
    oldestAccountDate: new Date(Date.now() - 38 * 30 * 24 * 60 * 60 * 1000).toISOString(),
    newestAccountDate: new Date(Date.now() - 14 * 30 * 24 * 60 * 60 * 1000).toISOString(),
    monthlyDelinquencyTrend: [
      { month: '2026-03', accountsWithDelinquency: 0 },
      { month: '2026-04', accountsWithDelinquency: 1 },
      { month: '2026-05', accountsWithDelinquency: 0 },
      { month: '2026-06', accountsWithDelinquency: 0 },
    ],
  },
  enquiry: { available: true, totalEnquiries: 2, recentEnquiries: 1 },
  delinquency: {
    currentMaxDpd: 0,
    maxHistoricalDpd: 30,
    buckets: { zeroToSixty: 3, sixtyOneToNinety: 0, ninetyOnePlus: 0 },
    accountsWithoutDpdData: 0,
    accountsWithDpdOver0: 1,
    accountsWithDpdOver30: 0,
    accountsWithDpdOver60: 0,
    accountsWithDpdOver90: 0,
    delinquencyEventsCount: 1,
    mostRecentDelinquencyMonth: '2026-04',
  },
  settlement: {
    settledCount: 0,
    settledAmount: 0,
    writtenOffCount: 0,
    writtenOffAmount: 0,
    restructuredCount: 0,
    suitFiledCount: 0,
    arcAssignedCount: 0,
    willfulDefault: false,
  },
  riskFlags: [],
  documentId: null,
  insights: {
    status: 'COMPLETED',
    findings: {
      executiveSummary: 'Mock debt diagnosis — no real AI provider was called.',
      currentPosition: 'All mock accounts are reported current, with one isolated 30-day DPD event in the past.',
      primaryConcerns: [
        {
          type: 'concentration',
          severity: 'Medium',
          title: 'Lender concentration',
          statement: 'Mock Bank A holds 78% of total outstanding — a Very High BBS-analytical concentration.',
          evidence: ['debtBurden.top1LenderSharePercent=78'],
          evidenceLevel: 'KNOWN',
          relatedAccounts: ['Mock Bank A'],
          confidence: 'high',
        },
      ],
      secondaryConcerns: [],
      historicalContext: [
        {
          type: 'historical_dpd',
          severity: 'Low',
          title: 'Isolated historical DPD',
          statement: 'One account reported a 30-day DPD event in 2026-04; no recurrence since.',
          evidence: ['delinquency.mostRecentDelinquencyMonth=2026-04'],
          evidenceLevel: 'KNOWN',
          relatedAccounts: [],
          confidence: 'medium',
        },
      ],
      debtTrajectory: 'Insufficient data to determine debt trajectory — only one bureau snapshot is retained per lead.',
      stressSignals: [],
      possibleDrivers: [],
      dataGaps: ['Interest rate and remaining tenure are not reported for any account.'],
      accountInsights: [],
      resolutionOpportunities: [
        {
          type: 'utilization',
          severity: 'Low',
          title: 'Review card utilization',
          statement: 'Mock Bank Card is at 60% utilization — review balance and repayment capacity.',
          evidence: ['utilization.highestUtilizedCard.utilizationPercent=60'],
          evidenceLevel: 'KNOWN',
          relatedAccounts: ['Mock Bank Card'],
          confidence: 'medium',
        },
      ],
      actionPlan: {
        verify: ['Confirm current income and EMI affordability.'],
        immediateAttention: [],
        monitor: ['Mock Bank Card utilization trend.'],
        optimize: ['Consider consolidating unsecured balances if income supports it.'],
      },
    },
    confidence: 0,
    modelVersion: 'mock',
    generatedAt: new Date().toISOString(),
  },
  reconciliation: {
    accountLevelTotal: 185000,
    bureauReportedTotal: 185000,
    differenceAmount: 0,
    reconciliationRequired: false,
  },
  productMix: [
    { category: 'Instalment', count: 2, outstandingAmount: 145000, sharePercent: 78 },
    { category: 'Revolving', count: 1, outstandingAmount: 40000, sharePercent: 22 },
  ],
  recency: {
    windows: [
      { windowLabel: '30d', windowDays: 30, accountCount: 0, outstandingAmount: 0, percentOfTotalOutstanding: 0 },
      { windowLabel: '90d', windowDays: 90, accountCount: 0, outstandingAmount: 0, percentOfTotalOutstanding: 0 },
      { windowLabel: '180d', windowDays: 180, accountCount: 0, outstandingAmount: 0, percentOfTotalOutstanding: 0 },
      { windowLabel: '12mo', windowDays: 365, accountCount: 1, outstandingAmount: 40000, percentOfTotalOutstanding: 22 },
      { windowLabel: '24mo', windowDays: 730, accountCount: 2, outstandingAmount: 185000, percentOfTotalOutstanding: 100 },
    ],
    substantialRecentConcentration: false,
  },
  borrowing: {
    windows: [
      { windowLabel: '30d', windowDays: 30, newAccountCount: 0 },
      { windowLabel: '90d', windowDays: 90, newAccountCount: 0 },
      { windowLabel: '180d', windowDays: 180, newAccountCount: 0 },
      { windowLabel: '12mo', windowDays: 365, newAccountCount: 1 },
      { windowLabel: '24mo', windowDays: 730, newAccountCount: 2 },
    ],
    clusterDetected: false,
  },
  enquiryDetail: {
    windows: [
      { windowLabel: '7d', windowDays: 7, enquiryCount: 0 },
      { windowLabel: '30d', windowDays: 30, enquiryCount: 0 },
      { windowLabel: '90d', windowDays: 90, enquiryCount: 1 },
      { windowLabel: '180d', windowDays: 180, enquiryCount: 1 },
      { windowLabel: '12mo', windowDays: 365, enquiryCount: 2 },
      { windowLabel: 'historical', windowDays: null, enquiryCount: 2 },
    ],
    totalEnquiries: 2,
    correlatedWithNewAccountCount: 1,
  },
  debtAge: {
    oldestActiveAccountDate: new Date(Date.now() - 38 * 30 * 24 * 60 * 60 * 1000).toISOString(),
    newestActiveAccountDate: new Date(Date.now() - 14 * 30 * 24 * 60 * 60 * 1000).toISOString(),
    averageActiveDebtAgeYears: 2.1,
    ageOfLargestDebtYears: 3.2,
    largestDebtLender: 'Mock Bank A',
  },
  loanSize: {
    buckets: [
      { bucketLabel: '<₹10K', minAmount: 0, maxAmount: 10000, count: 0, sharePercent: 0 },
      { bucketLabel: '₹10K–₹50K', minAmount: 10000, maxAmount: 50000, count: 1, sharePercent: 33 },
      { bucketLabel: '₹50K–₹1L', minAmount: 50000, maxAmount: 100000, count: 0, sharePercent: 0 },
      { bucketLabel: '₹1L–₹5L', minAmount: 100000, maxAmount: 500000, count: 2, sharePercent: 67 },
      { bucketLabel: '>₹5L', minAmount: 500000, maxAmount: null, count: 0, sharePercent: 0 },
    ],
    smallTicketLoanCount: 1,
    smallTicketSharePercent: 33,
  },
  lenderExposure: { activeLenders: 2, activeAccounts: 3, productTypesCount: 3 },
  debtServiceRatio: { availability: 'AVAILABLE', monthlyEmi: 11500, monthlyIncome: 65000, debtServiceRatioPercent: 18 },
  debtToIncome: { availability: 'AVAILABLE', totalOutstanding: 185000, annualIncome: 780000, dtiPercent: 24 },
  stress: { level: 'Stable', signals: ['No current overdue, no elevated DPD, and no active risk flags were identified from reported data.'] },
  scoreStructureDivergence: {
    available: true,
    score: 762,
    scoreBand: 'good',
    riskSignalCount: 0,
    divergenceFlag: false,
    reason: null,
    evidence: [],
    unavailableReason: null,
  },
  dataQuality: {
    total: 92,
    band: 'High confidence',
    components: {
      fieldCompleteness: { weight: 30, score: 28, note: '3/3 accounts fully populated.' },
      internalConsistency: { weight: 25, score: 25, note: '0 inconsistency flag(s) found.' },
      reportRecency: { weight: 15, score: 15, note: 'Report is 2 day(s) old.' },
      identityMatchConfidence: { weight: 15, score: 15, note: 'Exact match guaranteed by bureau mapping gate for every COMPLETED report.' },
      accountLevelSufficiency: { weight: 15, score: 9, note: '2/3 accounts have all their expected fields populated.' },
    },
    flags: [{ code: 'EMI_SCHEDULED_MISSING', trigger: 'Scheduled EMI amount is blank on at least one active instalment loan.' }],
    accountCountVerification: {
      summaryActiveCount: 3,
      detailActiveCount: 3,
      match: true,
      note: 'Compares active-account counts only — this integration does not capture the bureau\'s CAIS_Summary total (active + closed + default) field.',
    },
  },
  debtRiskIndicator: {
    total: 14,
    band: 'Attention',
    components: {
      currentDelinquency: { weight: 25, score: 0, evidence: 'Current max DPD 0; overdue 0.' },
      adverseAccountStatus: { weight: 20, score: 0, evidence: 'No written-off, settled, suit-filed, or restructured accounts.' },
      debtBurdenConcentration: { weight: 15, score: 4, evidence: 'Top account 38%; top lender 54%.' },
      cardUtilisation: { weight: 10, score: 5, evidence: 'Overall utilisation 60%; 0 card(s) above 70%.' },
      recentBorrowing: { weight: 10, score: 3, evidence: '1 account(s) opened in the last 12 months; 20% of outstanding is recent.' },
      enquiryBehaviour: { weight: 5, score: 0, evidence: '0 enquiries in 180 days; 0 in 7 days.' },
      historicalRepayment: { weight: 10, score: 2, evidence: 'Max historical DPD 30; 1 delinquent month(s) reported.' },
      dataInconsistencies: { weight: 5, score: 0, evidence: '0 data quality flag(s).' },
    },
  },
  missingInformation: [
    { category: 'Income', whatL1CannotDetermine: 'Not available at L1.', whoResolves: 'L2' },
    { category: 'Expenses', whatL1CannotDetermine: 'Not available at L1.', whoResolves: 'L2' },
    { category: 'Customer intent', whatL1CannotDetermine: 'Not available at L1.', whoResolves: 'CCR' },
    { category: 'Repayment capacity', whatL1CannotDetermine: 'Cannot be derived from bureau data alone.', whoResolves: 'L2 + CCR' },
  ],
  riskSignalEngine: {
    triggered: [{ code: 'DEBT_STACKING', signal: 'Debt stacking', severity: 'Elevated', evidence: '3 active lender(s).' }],
    notTriggered: [
      { code: 'CURRENT_OVERDUE', reason: 'Rs. 0 overdue.' },
      { code: 'WRITTEN_OFF', reason: 'No written-off accounts.' },
      { code: 'SUIT_FILED', reason: 'No suit-filed accounts.' },
    ],
    notEvaluated: [
      { code: 'SECONDARY_CONTACT_FOUND', reason: 'No per-holder identity data is captured by either bureau mapper.' },
      { code: 'MULTIPLE_PHONE_VARIANTS', reason: 'No per-holder identity data is captured by either bureau mapper.' },
      { code: 'MULTIPLE_NAME_VARIANTS', reason: 'No per-holder identity data is captured by either bureau mapper.' },
    ],
  },
  accountOpeningVelocity: [
    { windowLabel: '3m', months: 3, accountsOpened: 0 },
    { windowLabel: '6m', months: 6, accountsOpened: 0 },
    { windowLabel: '12m', months: 12, accountsOpened: 1 },
    { windowLabel: '24m', months: 24, accountsOpened: 1 },
    { windowLabel: '36m', months: 36, accountsOpened: 2 },
  ],
  accountTimeline: {
    yearly: [
      { year: 2023, opened: 1, closed: 0, netActive: 1 },
      { year: 2024, opened: 1, closed: 0, netActive: 2 },
      { year: 2025, opened: 1, closed: 0, netActive: 3 },
    ],
    closedAccountsWithKnownDate: 0,
    closedAccountsTotal: 0,
    churnEvents: [],
    churnRatePerYear: 1,
    churnPattern: 'LOW',
    oldestAccountDate: new Date(Date.now() - 900 * 24 * 60 * 60 * 1000).toISOString(),
    oldestActiveAccountDate: new Date(Date.now() - 900 * 24 * 60 * 60 * 1000).toISOString(),
    creditAgeMonths: 30,
    averageAccountAgeMonths: 20,
  },
  finalSummary: [
    { dimension: 'Credit score', finding: '762 (good)', severity: 'Positive' },
    { dimension: 'Current delinquency', finding: 'None', severity: 'Positive' },
    { dimension: 'Debt stacking', finding: '3 active lender(s)', severity: 'Elevated' },
    { dimension: 'Debt Risk Indicator', finding: '14 / 100 (Attention)', severity: 'Attention' },
  ],
  identityVariants: {
    available: false,
    unavailableReason:
      'This integration\'s bureau source ("MockBureau One") does not expose per-account holder identity data needed for this section.',
    canonicalName: null,
    nameVariants: [],
    mobileVariants: [],
    addressVariants: [],
  },
  priorityMatrix: [
    {
      lender: 'Mock Bank Card',
      accountType: 'Credit Card',
      currentBalance: 60000,
      priorityScore: 12,
      reasons: ['Utilization at 60%.'],
    },
    {
      lender: 'Mock Bank A',
      accountType: 'Personal Loan',
      currentBalance: 125000,
      priorityScore: 10,
      reasons: ['No elevated delinquency, status, overdue, or utilization signal.'],
    },
  ],
  consolidationDetection: {
    available: true,
    detected: false,
    events: [],
    closedAccountsWithKnownDate: 0,
    closedAccountsTotal: 0,
    unavailableReason: null,
  },
  unavailable: {
    trajectory: {
      availability: 'INSUFFICIENT_DATA',
      reason: 'BBS stores exactly one credit report per lead — a trajectory requires at least two snapshots over time, which this integration does not retain.',
    },
    bankCrossCheck: { availability: 'NOT_APPLICABLE', reason: 'No bank-statement ingestion pipeline exists yet for any lead.' },
    bounceAnalysis: {
      availability: 'NOT_APPLICABLE',
      reason: 'Bounce and failed-payment events require bank-statement data, which this integration does not yet ingest for any lead.',
    },
    interestRateAndTenure: {
      availability: 'NOT_APPLICABLE',
      reason: 'Interest rate and remaining tenure are not reported by this bureau integration for any account.',
    },
    status99: {
      availability: 'NOT_APPLICABLE',
      reason: "This integration only ever receives a descriptive account status, never Experian's raw numeric status codes — a status-99 special case cannot arise here.",
    },
  },
  level1: {
    debtInventory: {
      accounts: [
        {
          lender: 'Mock Bank A',
          accountType: 'Personal Loan',
          openedOn: new Date(Date.now() - 38 * 30 * 24 * 60 * 60 * 1000).toISOString(),
          currentBalance: 125000,
          overdueAmount: 0,
          monthlyEmiAmount: 8000,
          currentDpdDays: 0,
          maxDpdDays: 30,
          creditLimit: null,
          isSecured: false,
          lifecycleStatus: 'ACTIVE',
          paymentStatus: 'REGULAR',
        },
        {
          lender: 'Mock Bank A',
          accountType: 'Vehicle Loan',
          openedOn: new Date(Date.now() - 20 * 30 * 24 * 60 * 60 * 1000).toISOString(),
          currentBalance: 20000,
          overdueAmount: 0,
          monthlyEmiAmount: 3500,
          currentDpdDays: 0,
          maxDpdDays: 0,
          creditLimit: null,
          isSecured: true,
          lifecycleStatus: 'ACTIVE',
          paymentStatus: 'REGULAR',
        },
        {
          lender: 'Mock Bank Card',
          accountType: 'Credit Card',
          openedOn: new Date(Date.now() - 14 * 30 * 24 * 60 * 60 * 1000).toISOString(),
          currentBalance: 60000,
          overdueAmount: 0,
          monthlyEmiAmount: null,
          currentDpdDays: 0,
          maxDpdDays: 0,
          creditLimit: 100000,
          isSecured: false,
          lifecycleStatus: 'ACTIVE',
          paymentStatus: 'REGULAR',
        },
      ],
    },
  },
}

const mockCallBrief: CcrBriefResponse = {
  who: { bbsLeadId: 'BBS-LD-900001', fullName: 'Mock Demo Lead', helpCategory: 'DEBT_MANAGEMENT', situation: 'Multiple active EMIs' },
  reportAvailable: true,
  status: 'COMPLETED',
  header: {
    caseId: 'BBS-LD-900001',
    customerName: 'Mock Demo Lead',
    score: 762,
    scoreBand: 'good',
    mobile: '+91 90000 00000',
    email: 'mock.demo@example.test',
    dataQuality: '92/100 (High confidence)',
  },
  discoveryAgenda: [
    'What was the Mock Bank A Personal Loan used for?',
    'What is your current monthly income?',
    'What are your essential monthly expenses?',
    'What are the EMI amounts on your active loans?',
    'Are you able to comfortably service all current EMIs?',
    'Do you have any other loans or informal borrowing?',
    'What is your primary financial concern right now?',
  ],
  accountsNeedingValidation: [{ lender: 'Mock Bank Card', accountType: 'Credit Card', issue: 'EMI blank', action: 'Confirm EMI amount' }],
  keyQuestionsForCcr: [],
  dataGaps: [],
  aiObservations: null,
}

class MockDebtAnalysisService implements DebtAnalysisService {
  async getForLead(bbsLeadId: string): Promise<DebtAnalysisResponse> {
    // Only the seeded demo lead gets the populated fixture — every other
    // mock lead honestly reports no credit report has been pulled yet,
    // same as a brand new lead would in the real backend.
    if (bbsLeadId === 'BBS-LD-900001') {
      return delay(mockReport, 300)
    }
    return delay({ reportAvailable: false }, 300)
  }

  async reprocess(): Promise<{ reprocessed: boolean; reason?: string }> {
    return delay({ reprocessed: false, reason: 'Mock mode has no stored raw response to reprocess.' }, 300)
  }

  async getCallBrief(bbsLeadId: string): Promise<CcrBriefResponse> {
    if (bbsLeadId === 'BBS-LD-900001') {
      return delay(mockCallBrief, 300)
    }
    return delay({ who: mockCallBrief.who, reportAvailable: false }, 300)
  }
}

// --- Real backend implementation --------------------------------------------

class ApiDebtAnalysisService implements DebtAnalysisService {
  async getForLead(bbsLeadId: string): Promise<DebtAnalysisResponse> {
    return apiRequest<DebtAnalysisResponse>(`/leads/${bbsLeadId}/debt-analysis`)
  }

  async reprocess(bbsLeadId: string): Promise<{ reprocessed: boolean; reason?: string }> {
    return apiRequest<{ reprocessed: boolean; reason?: string }>(`/leads/${bbsLeadId}/debt-analysis/reprocess`, {
      method: 'POST',
    })
  }

  async getCallBrief(bbsLeadId: string): Promise<CcrBriefResponse> {
    return apiRequest<CcrBriefResponse>(`/leads/${bbsLeadId}/debt-analysis/call-brief`)
  }
}

export const debtAnalysisService: DebtAnalysisService =
  env.apiMode === 'api' ? new ApiDebtAnalysisService() : new MockDebtAnalysisService()
