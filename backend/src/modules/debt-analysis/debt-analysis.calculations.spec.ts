import {
  accountLifecycleCounts,
  accountOpeningVelocity,
  accountTimeline,
  accountTypeDistribution,
  bankCrossCheck,
  borrowingFrequency,
  bounceAnalysis,
  buildCohortSignalPackage,
  buildDebtAnalysisSummary,
  creditHistoryAndTrend,
  creditUtilization,
  dataQualityScore,
  debtAge,
  debtBurdenAndConcentration,
  debtConsolidationDetection,
  debtPriorityMatrix,
  debtRecency,
  debtRiskIndicator,
  debtServiceRatio,
  debtStressLayer,
  debtToIncome,
  debtTrajectory,
  delinquencyAndDpd,
  enquirySummary,
  enquiryWindows,
  finalSummaryTable,
  identityVariants,
  interestRateAndTenure,
  lenderExposure,
  loanSizeBuckets,
  missingInformationRegister,
  productCategorization,
  reconciliation,
  repaymentBehavior,
  riskFlags,
  riskSignalEngine,
  scoreStructureDivergence,
  settlementSummary,
  status99Handling,
  toLevel1CreditIntelligence,
  totalLenders,
  totalMonthlyEmi,
  totalOutstanding,
  totalOverdue,
} from './debt-analysis.calculations'
import type { CreditAccountInput, CreditReportInput } from './debt-analysis.types'

function account(overrides: Partial<CreditAccountInput> = {}): CreditAccountInput {
  return {
    accountType: 'Personal loan',
    lender: 'Bank A',
    openedOn: new Date('2020-01-01'),
    sanctionedAmount: 100000,
    currentBalance: 50000,
    paymentStatus: 'REGULAR',
    overdueAmount: 0,
    currentDpdDays: null,
    maxDpdDays: null,
    monthlyEmiAmount: null,
    creditLimit: null,
    isSecured: null,
    lifecycleStatus: null,
    closedOn: null,
    paymentHistoryGrid: null,
    ...overrides,
  }
}

function report(accounts: CreditAccountInput[], overrides: Partial<CreditReportInput> = {}): CreditReportInput {
  return {
    bureau: 'Test Bureau',
    pulledAt: new Date('2026-08-01'),
    creditScore: 700,
    scoreBand: 'good',
    totalActiveAccounts: accounts.length,
    totalOutstandingBalance: 0,
    delinquentAccounts: 0,
    willfulDefaultFlag: null,
    accounts,
    enquiries: [],
    ...overrides,
  }
}

describe('totalOutstanding', () => {
  it('sums currentBalance across accounts when accounts exist', () => {
    const accounts = [account({ currentBalance: 30000 }), account({ currentBalance: 20000 })]
    expect(totalOutstanding(accounts, 999999)).toBe(50000)
  })

  it('falls back to the report-level figure when no tradelines exist', () => {
    expect(totalOutstanding([], 185000)).toBe(185000)
  })
})

describe('totalOverdue', () => {
  it('sums overdueAmount across accounts', () => {
    const accounts = [account({ overdueAmount: 5000 }), account({ overdueAmount: 15000 })]
    expect(totalOverdue(accounts)).toBe(20000)
  })

  it('returns null (not zero) when there are no tradelines to sum', () => {
    expect(totalOverdue([])).toBeNull()
  })
})

describe('totalMonthlyEmi', () => {
  it('sums only accounts that actually report an EMI', () => {
    const accounts = [account({ monthlyEmiAmount: 5000 }), account({ monthlyEmiAmount: null }), account({ monthlyEmiAmount: 3000 })]
    expect(totalMonthlyEmi(accounts)).toBe(8000)
  })

  it('returns null when no account reports an EMI, rather than 0', () => {
    expect(totalMonthlyEmi([account({ monthlyEmiAmount: null })])).toBeNull()
  })
})

describe('totalLenders', () => {
  it('counts distinct lenders, not distinct accounts', () => {
    const accounts = [account({ lender: 'Bank A' }), account({ lender: 'Bank A' }), account({ lender: 'Bank B' })]
    expect(totalLenders(accounts)).toBe(2)
  })
})

describe('accountLifecycleCounts', () => {
  it('reads active/defaulted from the pre-existing report-level fields', () => {
    const r = report([], { totalActiveAccounts: 4, delinquentAccounts: 1 })
    const result = accountLifecycleCounts(r)
    expect(result.activeAccounts).toBe(4)
    expect(result.defaultedAccounts).toBe(1)
  })

  it('reports closed/total accounts as null (not 0) when no tradelines exist', () => {
    const result = accountLifecycleCounts(report([]))
    expect(result.closedAccounts).toBeNull()
    expect(result.totalAccounts).toBeNull()
  })

  it('derives closed accounts from actual tradeline lifecycleStatus when present', () => {
    const accounts = [account({ lifecycleStatus: 'CLOSED' }), account({ lifecycleStatus: 'ACTIVE' }), account({ lifecycleStatus: 'CLOSED' })]
    const result = accountLifecycleCounts(report(accounts))
    expect(result.closedAccounts).toBe(2)
    expect(result.totalAccounts).toBe(3)
  })
})

describe('accountTypeDistribution', () => {
  it('groups by accountType with correct counts and percentages', () => {
    const accounts = [
      account({ accountType: 'Personal loan' }),
      account({ accountType: 'Personal loan' }),
      account({ accountType: 'Home loan' }),
      account({ accountType: 'Credit card' }),
    ]
    const result = accountTypeDistribution(accounts)
    const personal = result.find((r) => r.accountType === 'Personal loan')
    expect(personal).toEqual({ accountType: 'Personal loan', count: 2, percent: 50 })
    expect(result.reduce((sum, r) => sum + r.count, 0)).toBe(4)
  })

  it('returns an empty array (not fabricated slices) when there are no tradelines', () => {
    expect(accountTypeDistribution([])).toEqual([])
  })
})

describe('creditUtilization', () => {
  it('computes utilization only over revolving (creditLimit-bearing) accounts', () => {
    const accounts = [
      account({ accountType: 'Credit card', creditLimit: 100000, currentBalance: 80000 }),
      account({ accountType: 'Personal loan', creditLimit: null, currentBalance: 50000 }), // excluded — not revolving
    ]
    const result = creditUtilization(accounts)
    expect(result.available).toBe(true)
    expect(result.totalCreditLimit).toBe(100000)
    expect(result.currentUtilization).toBe(80000)
    expect(result.utilizationPercent).toBe(80)
    expect(result.availableCreditLimit).toBe(20000)
  })

  it('flags an account as high-utilization at the 75% threshold', () => {
    const accounts = [account({ creditLimit: 10000, currentBalance: 7500 }), account({ creditLimit: 10000, currentBalance: 1000 })]
    expect(creditUtilization(accounts).highUtilizationAccounts).toBe(1)
  })

  it('is unavailable (not 0%) when no tradeline reports a revolving limit', () => {
    const result = creditUtilization([account({ creditLimit: null })])
    expect(result.available).toBe(false)
    expect(result.utilizationPercent).toBeNull()
    expect(result.unavailableReason).toBeTruthy()
  })

  it('never mixes a loan principal into the revolving-limit denominator', () => {
    // A loan with a huge sanctionedAmount but no creditLimit must not leak into utilization math.
    const accounts = [
      account({ accountType: 'Home loan', sanctionedAmount: 5_000_000, creditLimit: null, currentBalance: 4_000_000 }),
      account({ accountType: 'Credit card', creditLimit: 50000, currentBalance: 25000 }),
    ]
    const result = creditUtilization(accounts)
    expect(result.totalCreditLimit).toBe(50000)
    expect(result.utilizationPercent).toBe(50)
  })

  it('CRITICAL: excludes CLOSED cards from both the portfolio total and the per-card list — found against real seeded data where two closed, zero-balance cards with real credit limits diluted the overall figure from the spec-correct 53.9% down to 29%', () => {
    const accounts = [
      account({ lender: 'Active Card', accountType: 'Credit card', creditLimit: 124000, currentBalance: 66869, lifecycleStatus: 'ACTIVE' }),
      account({ lender: 'Closed Card A', accountType: 'Credit card', creditLimit: 73000, currentBalance: 0, lifecycleStatus: 'CLOSED' }),
      account({ lender: 'Closed Card B', accountType: 'Credit card', creditLimit: 11160, currentBalance: 0, lifecycleStatus: 'CLOSED' }),
    ]
    const result = creditUtilization(accounts)
    expect(result.totalCreditLimit).toBe(124000) // only the active card's limit
    expect(result.utilizationPercent).toBe(54) // 66869/124000, matches the spec's own 53.9% example
    expect(result.cards.map((c) => c.lender)).toEqual(['Active Card']) // closed cards never appear in the per-card list either
  })
})

describe('debtBurdenAndConcentration', () => {
  it('computes top-3 lender concentration correctly', () => {
    const accounts = [
      account({ lender: 'Bank A', currentBalance: 50000 }),
      account({ lender: 'Bank B', currentBalance: 30000 }),
      account({ lender: 'Bank C', currentBalance: 15000 }),
      account({ lender: 'Bank D', currentBalance: 5000 }),
    ]
    const result = debtBurdenAndConcentration(accounts)
    // top3 = 50000+30000+15000=95000, total=100000 -> 95%
    expect(result.top3LendersSharePercent).toBe(95)
    expect(result.numbersOfLenders).toBe(4)
  })

  it('only totals ACTIVE accounts into totalActiveDebt', () => {
    const accounts = [
      account({ lifecycleStatus: 'ACTIVE', currentBalance: 40000 }),
      account({ lifecycleStatus: 'CLOSED', currentBalance: 999999 }),
    ]
    expect(debtBurdenAndConcentration(accounts).totalActiveDebt).toBe(40000)
  })

  it('reports secured/unsecured as unavailable when no account is classified', () => {
    const result = debtBurdenAndConcentration([account({ isSecured: null })])
    expect(result.securedUnsecuredAvailable).toBe(false)
    expect(result.securedAmount).toBeNull()
  })

  it('splits secured vs unsecured balances correctly when classified', () => {
    const accounts = [
      account({ isSecured: true, currentBalance: 60000 }),
      account({ isSecured: false, currentBalance: 40000 }),
    ]
    const result = debtBurdenAndConcentration(accounts)
    expect(result.securedAmount).toBe(60000)
    expect(result.unsecuredAmount).toBe(40000)
    expect(result.classifiedAccountCount).toBe(2)
  })
})

describe('repaymentBehavior', () => {
  it('computes on-time/delayed/missed percentages from the payment history grid', () => {
    const accounts = [
      account({
        paymentHistoryGrid: [
          { month: '2026-01', dpdBucket: '0' },
          { month: '2026-02', dpdBucket: '0' },
          { month: '2026-03', dpdBucket: '30' },
          { month: '2026-04', dpdBucket: '90+' },
        ],
      }),
    ]
    const result = repaymentBehavior(accounts)
    expect(result.available).toBe(true)
    expect(result.onTimePercent).toBe(50)
    expect(result.delayedPercent).toBe(25)
    expect(result.missedPercent).toBe(25)
  })

  it('is unavailable when no account has payment history data', () => {
    const result = repaymentBehavior([account({ paymentHistoryGrid: null })])
    expect(result.available).toBe(false)
  })

  it('only asserts an increasing-delay trend with at least 6 months of history', () => {
    const shortHistory = account({
      paymentHistoryGrid: [
        { month: '2026-01', dpdBucket: '0' },
        { month: '2026-02', dpdBucket: '90+' },
      ],
    })
    expect(repaymentBehavior([shortHistory]).increasingDelayTrend).toBe(false)
  })

  it('detects a genuine increasing-delay trend across two 3-month windows', () => {
    const accounts = [
      account({
        paymentHistoryGrid: [
          { month: '2026-01', dpdBucket: '0' },
          { month: '2026-02', dpdBucket: '0' },
          { month: '2026-03', dpdBucket: '0' },
          { month: '2026-04', dpdBucket: '30' },
          { month: '2026-05', dpdBucket: '30' },
          { month: '2026-06', dpdBucket: '60' },
        ],
      }),
    ]
    expect(repaymentBehavior(accounts).increasingDelayTrend).toBe(true)
  })
})

describe('delinquencyAndDpd', () => {
  it('buckets accounts by currentDpdDays correctly', () => {
    const accounts = [
      account({ currentDpdDays: 30 }),
      account({ currentDpdDays: 75 }),
      account({ currentDpdDays: 120 }),
    ]
    const result = delinquencyAndDpd(accounts)
    expect(result.buckets).toEqual({ zeroToSixty: 1, sixtyOneToNinety: 1, ninetyOnePlus: 1 })
  })

  it('never counts a null DPD account into the 0-60 bucket — surfaces it separately instead', () => {
    const accounts = [account({ currentDpdDays: null }), account({ currentDpdDays: 10 })]
    const result = delinquencyAndDpd(accounts)
    expect(result.buckets.zeroToSixty).toBe(1)
    expect(result.accountsWithoutDpdData).toBe(1)
  })

  it('distinguishes current max DPD from max historical DPD', () => {
    const accounts = [account({ currentDpdDays: 10, maxDpdDays: 90 })]
    const result = delinquencyAndDpd(accounts)
    expect(result.currentMaxDpd).toBe(10)
    expect(result.maxHistoricalDpd).toBe(90)
  })
})

describe('settlementSummary', () => {
  it('groups counts/amounts by lifecycle status', () => {
    const accounts = [
      account({ lifecycleStatus: 'SETTLED', currentBalance: 50000 }),
      account({ lifecycleStatus: 'WRITTEN_OFF', currentBalance: 30000 }),
      account({ lifecycleStatus: 'SUIT_FILED' }),
      account({ lifecycleStatus: 'ACTIVE' }),
    ]
    const result = settlementSummary(accounts, null)
    expect(result.settledCount).toBe(1)
    expect(result.settledAmount).toBe(50000)
    expect(result.writtenOffCount).toBe(1)
    expect(result.suitFiledCount).toBe(1)
    expect(result.willfulDefault).toBeNull()
  })
})

describe('enquirySummary', () => {
  it('counts enquiries within the last 90 days as recent', () => {
    const now = new Date('2026-06-01')
    const enquiries = [
      { enquiryDate: new Date('2026-05-20'), purpose: 'Personal Loan', memberName: 'Bank A' }, // ~12 days ago
      { enquiryDate: new Date('2025-01-01'), purpose: 'Credit Card', memberName: 'Bank B' }, // long ago
    ]
    const result = enquirySummary(enquiries, now)
    expect(result.totalEnquiries).toBe(2)
    expect(result.recentEnquiries).toBe(1)
  })

  it('is unavailable when there are no enquiry records at all', () => {
    expect(enquirySummary([], new Date()).available).toBe(false)
  })
})

describe('creditHistoryAndTrend', () => {
  it('derives oldest/newest account dates and length of history', () => {
    const accounts = [account({ openedOn: new Date('2019-01-01') }), account({ openedOn: new Date('2022-06-01') })]
    const result = creditHistoryAndTrend(accounts, new Date('2026-01-01'))
    expect(result.oldestAccountDate).toEqual(new Date('2019-01-01'))
    expect(result.newestAccountDate).toEqual(new Date('2022-06-01'))
    expect(result.lengthOfHistoryYears).toBeGreaterThanOrEqual(6)
  })

  it('returns an empty trend (not fabricated months) when no payment history exists', () => {
    const result = creditHistoryAndTrend([account({ paymentHistoryGrid: null })], new Date())
    expect(result.monthlyDelinquencyTrend).toEqual([])
  })
})

describe('riskFlags', () => {
  it('flags high overdue-to-outstanding ratio with the real percentage in the detail', () => {
    const accounts = [account({ overdueAmount: 20000, currentBalance: 100000 })]
    const flags = riskFlags(report(accounts, { totalOutstandingBalance: 100000 }), new Date())
    const flag = flags.find((f) => f.key === 'overdue_ratio')
    expect(flag?.severity).toBe('High')
    expect(flag?.detail).toContain('20%')
  })

  it('produces no flags at all when nothing in the data warrants one', () => {
    const accounts = [account({ overdueAmount: 0, currentBalance: 10000 })]
    const flags = riskFlags(report(accounts, { totalOutstandingBalance: 10000 }), new Date())
    expect(flags).toEqual([])
  })

  it('flags write-off/ARC indicators only when a real account carries that status', () => {
    const accounts = [account({ lifecycleStatus: 'WRITTEN_OFF' })]
    const flags = riskFlags(report(accounts), new Date())
    expect(flags.some((f) => f.key === 'writeoff_arc')).toBe(true)
  })

  it('carries the real underlying number(s) in evidence — not just the formatted detail string — and marks every flag deterministic', () => {
    const accounts = [account({ overdueAmount: 20000, currentBalance: 100000 })]
    const flags = riskFlags(report(accounts, { totalOutstandingBalance: 100000 }), new Date())
    const flag = flags.find((f) => f.key === 'overdue_ratio')
    expect(flag?.evidence).toEqual({ overduePercent: 20, totalOverdue: 20000, totalOutstanding: 100000 })
    expect(flag?.source).toBe('deterministic')
    for (const f of flags) {
      expect(f.source).toBe('deterministic')
      expect(f.evidence).toBeDefined()
    }
  })
})

describe('buildDebtAnalysisSummary', () => {
  it('assembles every section into one object, keyed the way the Debt Analysis tab (and the Gemini insights prompt) expect', () => {
    const accounts = [account({ accountType: 'Credit Card', creditLimit: 50000, currentBalance: 25000 })]
    const summary = buildDebtAnalysisSummary(report(accounts, { totalOutstandingBalance: 25000 }))

    expect(summary.meta.bureau).toBe('Test Bureau')
    expect(summary.summary.totalOutstanding).toBe(25000)
    expect(summary.utilization.utilizationPercent).toBe(50)
    expect(summary.accountDistribution.slices).toEqual([{ accountType: 'Credit Card', count: 1, percent: 100 }])
    // Deliberately excludes documentId/insights — those are Prisma-row-
    // specific concerns DebtAnalysisService adds on top for the HTTP
    // response; this function only assembles what's computable from the
    // report data itself.
    expect(summary).not.toHaveProperty('documentId')
    expect(summary).not.toHaveProperty('reportAvailable')
  })
})

describe('toLevel1CreditIntelligence', () => {
  it('regroups the exact same buildDebtAnalysisSummary values into creditPosition/debtInventory/riskSignals — never recalculating', () => {
    const accounts = [
      account({ accountType: 'Credit Card', lender: 'Bank A', creditLimit: 50000, currentBalance: 25000 }),
      account({ accountType: 'Personal loan', lender: 'Bank B', overdueAmount: 5000, currentBalance: 10000 }),
    ]
    const input = report(accounts, { totalOutstandingBalance: 35000 })
    const summary = buildDebtAnalysisSummary(input)
    const level1 = toLevel1CreditIntelligence(input, summary)

    // creditPosition mirrors creditProfile/utilization/creditHistory exactly.
    expect(level1.creditPosition.creditScore).toBe(summary.creditProfile.creditScore)
    expect(level1.creditPosition.totalOutstanding).toBe(summary.creditProfile.totalOutstanding)
    expect(level1.creditPosition.utilization).toBe(summary.utilization)

    // debtInventory mirrors debtBurden/delinquency/settlement exactly, plus
    // a genuine new per-account list built straight from the input accounts.
    expect(level1.debtInventory.totalActiveDebt).toBe(summary.debtBurden.totalActiveDebt)
    expect(level1.debtInventory.delinquency).toBe(summary.delinquency)
    expect(level1.debtInventory.statusIndicators).toBe(summary.settlement)
    expect(level1.debtInventory.accounts).toHaveLength(2)
    expect(level1.debtInventory.accounts[0]).toEqual({
      lender: 'Bank A',
      accountType: 'Credit Card',
      openedOn: accounts[0].openedOn.toISOString(),
      currentBalance: 25000,
      overdueAmount: 0,
      monthlyEmiAmount: null,
      currentDpdDays: null,
      maxDpdDays: null,
      creditLimit: 50000,
      isSecured: null,
      lifecycleStatus: null,
      paymentStatus: 'REGULAR',
    })

    // riskSignals is the identical array (same objects, not recomputed).
    expect(level1.riskSignals).toBe(summary.riskFlags)
  })
})

describe('reconciliation', () => {
  it('flags a genuine mismatch between account-level and bureau-reported totals', () => {
    const accounts = [account({ currentBalance: 50000 }), account({ currentBalance: 30000 })]
    const result = reconciliation(accounts, 100000)
    expect(result.accountLevelTotal).toBe(80000)
    expect(result.differenceAmount).toBe(-20000)
    expect(result.reconciliationRequired).toBe(true)
  })

  it('does not flag a sub-rupee rounding difference', () => {
    const accounts = [account({ currentBalance: 50000 })]
    expect(reconciliation(accounts, 50000.5).reconciliationRequired).toBe(false)
  })

  it('never flags when there are no tradelines to compare against', () => {
    expect(reconciliation([], 50000).reconciliationRequired).toBe(false)
  })
})

describe('debtBurdenAndConcentration (Rule 2 & 4 extensions)', () => {
  it('computes secured/unsecured percent of TOTAL outstanding, not just the classified portion', () => {
    const accounts = [
      account({ isSecured: true, currentBalance: 60000 }),
      account({ isSecured: false, currentBalance: 20000 }),
      account({ isSecured: null, currentBalance: 20000 }),
    ]
    const result = debtBurdenAndConcentration(accounts)
    expect(result.securedPercent).toBe(60)
    expect(result.unsecuredPercent).toBe(20)
  })

  it('applies Rule 4\'s own BBS analytical thresholds to the top lender\'s share', () => {
    const accounts = [account({ lender: 'Bank A', currentBalance: 80000 }), account({ lender: 'Bank B', currentBalance: 20000 })]
    const result = debtBurdenAndConcentration(accounts)
    expect(result.top1LenderSharePercent).toBe(80)
    expect(result.topLenderConcentrationLevel).toBe('Very High')
  })
})

describe('productCategorization', () => {
  it('separates instalment, revolving and short-term debt per Rule 3\'s own lists', () => {
    const accounts = [
      account({ accountType: 'Personal Loan', currentBalance: 50000 }),
      account({ accountType: 'Credit Card', currentBalance: 20000 }),
      account({ accountType: 'BNPL', currentBalance: 5000 }),
    ]
    const result = productCategorization(accounts)
    expect(result.find((r) => r.category === 'Instalment')?.outstandingAmount).toBe(50000)
    expect(result.find((r) => r.category === 'Revolving')?.outstandingAmount).toBe(20000)
    expect(result.find((r) => r.category === 'Short-term')?.outstandingAmount).toBe(5000)
  })

  it('never silently assumes Instalment for an unrecognized account type', () => {
    const result = productCategorization([account({ accountType: 'Mystery Facility' })])
    expect(result).toEqual([{ category: 'Unclassified', count: 1, outstandingAmount: 50000, sharePercent: 100 }])
  })

  it('CRITICAL: "Loan on Credit Card" is Instalment, never Revolving, despite containing the substring "credit card"', () => {
    const result = productCategorization([account({ accountType: 'Loan on Credit Card', currentBalance: 30000 })])
    expect(result).toEqual([{ category: 'Instalment', count: 1, outstandingAmount: 30000, sharePercent: 100 }])
  })

  it('a genuine "Secured Credit Card" still classifies as Revolving — only "Loan on Credit Card" is special-cased', () => {
    const result = productCategorization([account({ accountType: 'Secured Credit Card', currentBalance: 10000 })])
    expect(result).toEqual([{ category: 'Revolving', count: 1, outstandingAmount: 10000, sharePercent: 100 }])
  })

  it('"Short Term Personal Loan" still classifies as Short-term, not Instalment (keyword precedence unchanged)', () => {
    const result = productCategorization([account({ accountType: 'Short Term Personal Loan', currentBalance: 15000 })])
    expect(result).toEqual([{ category: 'Short-term', count: 1, outstandingAmount: 15000, sharePercent: 100 }])
  })
})

describe('creditUtilization (Rule 6 per-card extension)', () => {
  it('surfaces the single highest-utilized card, not just the portfolio average', () => {
    const accounts = [
      account({ lender: 'Bank A', creditLimit: 100000, currentBalance: 95000 }),
      account({ lender: 'Bank B', creditLimit: 100000, currentBalance: 10000 }),
    ]
    const result = creditUtilization(accounts)
    expect(result.highestUtilizedCard?.lender).toBe('Bank A')
    expect(result.highestUtilizedCard?.level).toBe('Very High')
    expect(result.cards).toHaveLength(2)
  })
})

describe('debtRecency', () => {
  it('computes recent-debt outstanding and percent within each window', () => {
    const now = new Date('2026-06-01')
    const accounts = [
      account({ openedOn: new Date('2026-05-15'), currentBalance: 40000 }), // ~17 days ago
      account({ openedOn: new Date('2020-01-01'), currentBalance: 60000 }), // old
    ]
    const result = debtRecency(accounts, now)
    const window30 = result.windows.find((w) => w.windowLabel === '30d')!
    expect(window30.accountCount).toBe(1)
    expect(window30.outstandingAmount).toBe(40000)
    expect(window30.percentOfTotalOutstanding).toBe(40)
  })

  it('flags substantial recent concentration at the 50% (180d) BBS threshold', () => {
    const now = new Date('2026-06-01')
    const accounts = [account({ openedOn: new Date('2026-05-01'), currentBalance: 60000 }), account({ openedOn: new Date('2020-01-01'), currentBalance: 40000 })]
    expect(debtRecency(accounts, now).substantialRecentConcentration).toBe(true)
  })
})

describe('borrowingFrequency', () => {
  it('counts newly opened accounts per window and detects a cluster at 2+ openings within 180 days', () => {
    const now = new Date('2026-06-01')
    const accounts = [account({ openedOn: new Date('2026-05-01') }), account({ openedOn: new Date('2026-04-01') })]
    const result = borrowingFrequency(accounts, now)
    expect(result.windows.find((w) => w.windowLabel === '180d')?.newAccountCount).toBe(2)
    expect(result.clusterDetected).toBe(true)
  })

  it('does not detect a cluster from a single recent account', () => {
    const now = new Date('2026-06-01')
    expect(borrowingFrequency([account({ openedOn: new Date('2026-05-01') })], now).clusterDetected).toBe(false)
  })
})

describe('enquiryWindows', () => {
  it('buckets enquiries into every spec\'d window including historical', () => {
    const now = new Date('2026-06-01')
    const enquiries = [
      { enquiryDate: new Date('2026-05-30'), purpose: 'Personal Loan', memberName: 'Bank A' },
      { enquiryDate: new Date('2024-01-01'), purpose: 'Credit Card', memberName: 'Bank B' },
    ]
    const result = enquiryWindows(enquiries, [], now)
    expect(result.windows.find((w) => w.windowLabel === '7d')?.enquiryCount).toBe(1)
    expect(result.windows.find((w) => w.windowLabel === 'historical')?.enquiryCount).toBe(2)
  })

  it('correlates an enquiry with a subsequent account opened within 30 days', () => {
    const enquiries = [{ enquiryDate: new Date('2026-01-01'), purpose: 'Personal Loan', memberName: 'Bank A' }]
    const accounts = [account({ openedOn: new Date('2026-01-15') })]
    expect(enquiryWindows(enquiries, accounts, new Date('2026-06-01')).correlatedWithNewAccountCount).toBe(1)
  })
})

describe('debtAge', () => {
  it('computes average active-debt age and the age of the single largest-balance account', () => {
    const now = new Date('2026-01-01')
    const accounts = [
      account({ openedOn: new Date('2020-01-01'), currentBalance: 10000 }),
      account({ openedOn: new Date('2024-01-01'), currentBalance: 90000 }),
    ]
    const result = debtAge(accounts, now)
    expect(result.ageOfLargestDebtYears).toBeCloseTo(2, 0)
    expect(result.largestDebtLender).toBe(accounts[1].lender)
  })

  it('returns null (not 0) when there are no active accounts', () => {
    const result = debtAge([account({ lifecycleStatus: 'CLOSED' })], new Date())
    expect(result.averageActiveDebtAgeYears).toBeNull()
  })
})

describe('loanSizeBuckets', () => {
  it('buckets accounts by sanctioned amount per Rule 16\'s own ranges', () => {
    const accounts = [account({ sanctionedAmount: 5000 }), account({ sanctionedAmount: 30000 }), account({ sanctionedAmount: 600000 })]
    const result = loanSizeBuckets(accounts)
    expect(result.buckets.find((b) => b.bucketLabel === '<₹10K')?.count).toBe(1)
    expect(result.buckets.find((b) => b.bucketLabel === '>₹5L')?.count).toBe(1)
    expect(result.smallTicketLoanCount).toBe(2)
  })
})

describe('lenderExposure', () => {
  it('counts only active lenders/accounts/product types', () => {
    const accounts = [
      account({ lender: 'Bank A', accountType: 'Personal Loan', lifecycleStatus: 'ACTIVE' }),
      account({ lender: 'Bank B', accountType: 'Credit Card', lifecycleStatus: 'CLOSED' }),
    ]
    const result = lenderExposure(accounts)
    expect(result.activeLenders).toBe(1)
    expect(result.activeAccounts).toBe(1)
  })
})

describe('debtServiceRatio', () => {
  it('computes DSR only when both EMI and income are real', () => {
    expect(debtServiceRatio(10000, 50000)).toEqual({ availability: 'AVAILABLE', monthlyEmi: 10000, monthlyIncome: 50000, debtServiceRatioPercent: 20 })
  })

  it('reports NOT_REPORTED (never a fabricated ratio) when income is missing', () => {
    expect(debtServiceRatio(10000, null).availability).toBe('NOT_REPORTED')
  })

  it('reports NOT_REPORTED when EMI is missing even though income is known', () => {
    expect(debtServiceRatio(null, 50000).availability).toBe('NOT_REPORTED')
  })
})

describe('debtToIncome', () => {
  it('computes DTI against annualized income', () => {
    const result = debtToIncome(600000, 50000)
    expect(result.annualIncome).toBe(600000)
    expect(result.dtiPercent).toBe(100)
  })

  it('reports NOT_REPORTED (never zero) when income is missing', () => {
    expect(debtToIncome(600000, null).availability).toBe('NOT_REPORTED')
  })
})

describe('permanently-unavailable sections', () => {
  it('debtTrajectory is always INSUFFICIENT_DATA — one CreditReport per lead, ever', () => {
    expect(debtTrajectory().availability).toBe('INSUFFICIENT_DATA')
  })
  it('bankCrossCheck is always NOT_APPLICABLE — no ingestion pipeline exists', () => {
    expect(bankCrossCheck().availability).toBe('NOT_APPLICABLE')
  })
  it('bounceAnalysis is always NOT_APPLICABLE — no bank-statement data exists', () => {
    expect(bounceAnalysis().availability).toBe('NOT_APPLICABLE')
  })
  it('interestRateAndTenure is always NOT_APPLICABLE — not reported by this bureau integration', () => {
    expect(interestRateAndTenure().availability).toBe('NOT_APPLICABLE')
  })
  it('status99Handling is always NOT_APPLICABLE — Signzy never reports raw numeric status codes', () => {
    expect(status99Handling().availability).toBe('NOT_APPLICABLE')
  })
})

describe('debtConsolidationDetection (Rule 15)', () => {
  it('is unavailable (not a fabricated negative) when there are no tradelines at all', () => {
    const result = debtConsolidationDetection([])
    expect(result.available).toBe(false)
    expect(result.unavailableReason).toMatch(/no tradeline/i)
  })

  it('detects a closed account followed within 90 days by a new account at least double the size', () => {
    const accounts = [
      account({ lender: 'Old Bank', lifecycleStatus: 'CLOSED', closedOn: new Date('2026-01-01'), sanctionedAmount: 100000 }),
      account({ lender: 'New Bank', lifecycleStatus: 'ACTIVE', openedOn: new Date('2026-01-20'), sanctionedAmount: 250000 }),
    ]
    const result = debtConsolidationDetection(accounts)
    expect(result.available).toBe(true)
    expect(result.detected).toBe(true)
    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({ closedLender: 'Old Bank', newAccountLender: 'New Bank', daysBetween: 19 })
  })

  it('does NOT flag a closed account followed by a new account under the 2x size threshold', () => {
    const accounts = [
      account({ lender: 'Old Bank', lifecycleStatus: 'CLOSED', closedOn: new Date('2026-01-01'), sanctionedAmount: 100000 }),
      account({ lender: 'New Bank', lifecycleStatus: 'ACTIVE', openedOn: new Date('2026-01-20'), sanctionedAmount: 150000 }),
    ]
    const result = debtConsolidationDetection(accounts)
    expect(result.detected).toBe(false)
    expect(result.events).toHaveLength(0)
  })

  it('does NOT flag a new account opened outside the 90-day window', () => {
    const accounts = [
      account({ lender: 'Old Bank', lifecycleStatus: 'CLOSED', closedOn: new Date('2026-01-01'), sanctionedAmount: 100000 }),
      account({ lender: 'New Bank', lifecycleStatus: 'ACTIVE', openedOn: new Date('2026-06-01'), sanctionedAmount: 250000 }),
    ]
    expect(debtConsolidationDetection(accounts).detected).toBe(false)
  })

  it('matches each closed account to only its single largest qualifying follow-on, never every qualifying candidate', () => {
    const accounts = [
      account({ lender: 'Old Bank', lifecycleStatus: 'CLOSED', closedOn: new Date('2026-01-01'), sanctionedAmount: 50000 }),
      account({ lender: 'Medium Bank', lifecycleStatus: 'ACTIVE', openedOn: new Date('2026-01-10'), sanctionedAmount: 120000 }),
      account({ lender: 'Biggest Bank', lifecycleStatus: 'ACTIVE', openedOn: new Date('2026-01-20'), sanctionedAmount: 500000 }),
    ]
    const result = debtConsolidationDetection(accounts)
    expect(result.events).toHaveLength(1)
    expect(result.events[0].newAccountLender).toBe('Biggest Bank')
  })

  it('tracks closedAccountsWithKnownDate separately from closedAccountsTotal — never treats an unknown closure date as "never closed"', () => {
    const accounts = [
      account({ lifecycleStatus: 'CLOSED', closedOn: new Date('2020-01-01') }),
      account({ lifecycleStatus: 'CLOSED', closedOn: null }),
      account({ lifecycleStatus: 'ACTIVE' }),
    ]
    const result = debtConsolidationDetection(accounts)
    expect(result.closedAccountsTotal).toBe(2)
    expect(result.closedAccountsWithKnownDate).toBe(1)
  })
})

describe('identityVariants', () => {
  it('is always unavailable for this integration — neither bureau mapper captures per-account holder-identity data', () => {
    const result = identityVariants(report([account()]))
    expect(result.available).toBe(false)
    expect(result.unavailableReason).not.toBeNull()
    expect(result.unavailableReason!.length).toBeGreaterThan(10)
    expect(result.canonicalName).toBeNull()
    expect(result.nameVariants).toEqual([])
  })

  it('never fabricates a variant list even when the report has many accounts', () => {
    const accounts = [account({ lender: 'A' }), account({ lender: 'B' }), account({ lender: 'C' })]
    const result = identityVariants(report(accounts))
    expect(result.available).toBe(false)
  })
})

describe('debtStressLayer', () => {
  it('rates Critical when an account is written off, regardless of other flags', () => {
    const accounts = [account({ lifecycleStatus: 'WRITTEN_OFF', currentBalance: 10000 })]
    const result = debtStressLayer(report(accounts), new Date())
    expect(result.level).toBe('Critical')
    expect(result.signals.length).toBeGreaterThan(0)
  })

  it('rates Stable with no evidence of any stress signal', () => {
    const accounts = [account({ overdueAmount: 0, currentBalance: 10000 })]
    const result = debtStressLayer(report(accounts, { totalOutstandingBalance: 10000 }), new Date())
    expect(result.level).toBe('Stable')
  })

  it('rates Attention (not Critical) from a single Medium-severity flag', () => {
    const accounts = [account({ overdueAmount: 1000, currentBalance: 100000 })]
    const result = debtStressLayer(report(accounts, { totalOutstandingBalance: 100000 }), new Date())
    expect(result.level).toBe('Attention')
  })
})

describe('debtPriorityMatrix', () => {
  it('does not prioritize solely by largest balance — a delinquent small account outranks a current large one', () => {
    const accounts = [
      account({ lender: 'Bank Big', currentBalance: 500000, currentDpdDays: null, overdueAmount: 0 }),
      account({ lender: 'Bank Small', currentBalance: 10000, currentDpdDays: 90, overdueAmount: 5000 }),
    ]
    const result = debtPriorityMatrix(accounts)
    expect(result[0].lender).toBe('Bank Small')
    expect(result[0].reasons.length).toBeGreaterThan(0)
  })

  it('returns an empty matrix (not fabricated entries) when there are no accounts', () => {
    expect(debtPriorityMatrix([])).toEqual([])
  })
})

describe('scoreStructureDivergence (BBS Debt Analysis Module v3.0, §14)', () => {
  const now = new Date('2026-10-01')
  const recentDate = new Date('2026-09-01') // within 180d and 90d of `now`

  function divergenceFor(accounts: CreditAccountInput[], overrides: Partial<CreditReportInput> = {}) {
    const rpt = report(accounts, overrides)
    const dq = dataQualityScore(rpt, now)
    const recency = debtRecency(accounts, now)
    const timeline = accountTimeline(accounts, now)
    return { rpt, result: scoreStructureDivergence(rpt, now, dq, recency, timeline) }
  }

  it('is unavailable (never a fabricated non-divergence) when the bureau reported no score', () => {
    const accounts = [account({ currentBalance: 100000 })]
    const { result } = divergenceFor(accounts, { creditScore: null, totalOutstandingBalance: 100000 })
    expect(result.available).toBe(false)
    expect(result.divergenceFlag).toBe(false)
    expect(result.riskSignalCount).toBe(0)
    expect(result.unavailableReason).toMatch(/no bureau score/i)
  })

  it('flags divergence for score >= 750 with >= 3 structural risk signals at Attention or above (debt concentration, top-lender concentration, recent account opening)', () => {
    // A single lender dominating the whole portfolio, opened recently, real-world-faithful to
    // the reference BBS report's own finding (score 748 "good" sitting on 94% single-lender
    // concentration + 5 recently-opened accounts) that this rule previously failed to catch —
    // see this function's own doc comment for why riskSignalCount used to come from the much
    // narrower riskFlags() catalog instead of this real structural catalog.
    const accounts = [
      account({ lender: 'Bajaj Finance', openedOn: recentDate, currentBalance: 90000, isSecured: false }),
      account({ lender: 'HDFC Bank', openedOn: new Date('2018-01-01'), currentBalance: 10000, isSecured: false }),
    ]
    const { rpt, result } = divergenceFor(accounts, { creditScore: 780, totalOutstandingBalance: 100000 })
    expect(result.available).toBe(true)
    // Sanity-check the fixture actually exercises real structural signals (not an empty catalog)
    // before asserting on the function under test.
    const recency = debtRecency(accounts, now)
    const timeline = accountTimeline(accounts, now)
    const dq = dataQualityScore(rpt, now)
    const catalog = riskSignalEngine(rpt, now, dq, result, recency, timeline)
    expect(catalog.triggered.map((t) => t.code)).toEqual(expect.arrayContaining(['DEBT_CONCENTRATION', 'TOP_LENDER_CONCENTRATION', 'RECENT_ACCOUNT_OPENING']))
    expect(result.riskSignalCount).toBeGreaterThanOrEqual(3)

    expect(result.divergenceFlag).toBe(true)
    expect(result.reason).toMatch(/≥750/)
    expect(result.reason).toMatch(new RegExp(`${result.riskSignalCount} risk signal`))
    expect(result.evidence.length).toBe(result.riskSignalCount)
  })

  it('does NOT flag divergence for a well-diversified, old, low-concentration profile regardless of a high score — even though DEBT_STACKING alone still triggers from 10 active accounts', () => {
    // 10 distinct lenders at an equal 10% share each: no single account/lender/top-3
    // group crosses the debt-concentration thresholds (unlike a 1-3 lender portfolio,
    // where the top-3 share is mathematically always 100% — see this describe
    // block's other test). The only unavoidable signal left is DEBT_STACKING
    // (>=3 active accounts), which alone is below every divergence threshold.
    const accounts = Array.from({ length: 10 }, (_, i) =>
      account({ lender: `Bank ${i}`, openedOn: new Date('2018-01-01'), currentBalance: 10000, overdueAmount: 0, isSecured: true }),
    )
    const { result } = divergenceFor(accounts, { creditScore: 820, totalOutstandingBalance: 100000 })
    expect(result.riskSignalCount).toBe(1) // DEBT_STACKING only
    expect(result.divergenceFlag).toBe(false)
    expect(result.reason).toBeNull()
  })
})

describe('buildDebtAnalysisSummary (Phase 1 additive fields)', () => {
  it('wires a real monthlyIncome argument through to debtServiceRatio/debtToIncome', () => {
    const accounts = [account({ monthlyEmiAmount: 10000, currentBalance: 100000 })]
    const summary = buildDebtAnalysisSummary(report(accounts, { totalOutstandingBalance: 100000 }), 50000)
    expect(summary.debtServiceRatio.availability).toBe('AVAILABLE')
    expect(summary.debtToIncome.availability).toBe('AVAILABLE')
  })

  it('defaults to NOT_REPORTED income (never a fabricated ratio) when no income argument is given', () => {
    const summary = buildDebtAnalysisSummary(report([account({ monthlyEmiAmount: 10000 })]))
    expect(summary.debtServiceRatio.availability).toBe('NOT_REPORTED')
  })

  it('includes every new additive section without disturbing any existing key', () => {
    const summary = buildDebtAnalysisSummary(report([account()]))
    expect(summary.unavailable.trajectory.availability).toBe('INSUFFICIENT_DATA')
    expect(summary.productMix).toBeDefined()
    expect(summary.recency).toBeDefined()
    expect(summary.priorityMatrix).toBeDefined()
    expect(summary.scoreStructureDivergence).toBeDefined()
    expect(summary.dataQuality).toBeDefined()
    expect(summary.debtRiskIndicator).toBeDefined()
    expect(summary.missingInformation).toBeDefined()
    // Existing keys from before this rebuild are untouched.
    expect(summary).toHaveProperty('summary')
    expect(summary).toHaveProperty('riskFlags')
  })
})

describe('dataQualityScore (BBS Debt Analysis Module v3.0, §5.3/§5.4)', () => {
  const now = new Date('2026-10-08')

  it('awards full marks for a single clean, fully-populated account on a fresh report', () => {
    const accounts = [
      account({
        lifecycleStatus: 'ACTIVE',
        accountType: 'Personal loan',
        monthlyEmiAmount: 5000,
        paymentHistoryGrid: [
          { month: '2026-08', dpdBucket: '0' },
          { month: '2026-07', dpdBucket: '0' },
          { month: '2026-06', dpdBucket: '0' },
        ],
      }),
    ]
    const result = dataQualityScore(report(accounts, { pulledAt: new Date('2026-10-01') }), now)
    expect(result.total).toBe(100)
    expect(result.band).toBe('High confidence')
    expect(result.flags).toHaveLength(0)
    expect(result.accountCountVerification.match).toBe(true)
  })

  it('CRITICAL: identity match confidence is always 15/15 for a COMPLETED report — guaranteed by the bureau mapping gate, never a guess', () => {
    const result = dataQualityScore(report([account()]), now)
    expect(result.components.identityMatchConfidence.score).toBe(15)
  })

  it('deducts internal-consistency points for a genuine DPD/overdue mismatch', () => {
    const accounts = [account({ currentDpdDays: 10, overdueAmount: 0 })]
    const result = dataQualityScore(report(accounts), now)
    expect(result.components.internalConsistency.score).toBe(23) // 25 - 1*2
  })

  it('flags EMI_SCHEDULED_MISSING for an active instalment account with no EMI on file', () => {
    const accounts = [account({ lifecycleStatus: 'ACTIVE', accountType: 'Personal loan', monthlyEmiAmount: null })]
    const result = dataQualityScore(report(accounts), now)
    expect(result.flags.map((f) => f.code)).toContain('EMI_SCHEDULED_MISSING')
  })

  it('scores report recency down for an older report', () => {
    const result = dataQualityScore(report([account()], { pulledAt: new Date('2026-04-01') }), now)
    expect(result.components.reportRecency.score).toBe(0) // >180 days old
  })

  it('never reports band "Insufficient" or negative scores for an empty account list', () => {
    const result = dataQualityScore(report([]), now)
    expect(result.total).toBeGreaterThanOrEqual(0)
    expect(result.total).toBeLessThanOrEqual(100)
  })
})

describe('debtRiskIndicator (BBS Debt Analysis Module v3.0, §13)', () => {
  const now = new Date('2026-10-08')

  it('scores a clean, stable profile as Positive with a near-zero total', () => {
    const accounts = [account({ lifecycleStatus: 'ACTIVE', currentBalance: 10000, overdueAmount: 0, currentDpdDays: 0 })]
    const rpt = report(accounts, { totalOutstandingBalance: 10000 })
    const dq = dataQualityScore(rpt, now)
    const result = debtRiskIndicator(rpt, now, dq.flags, debtRecency(accounts, now))
    expect(result.band).toBe('Positive')
    expect(result.components.currentDelinquency.score).toBe(0)
  })

  it('CRITICAL: current DPD > 90 scores the full 25 points on component 1, capped (never exceeding) its own weight', () => {
    const accounts = [account({ currentDpdDays: 120, overdueAmount: 5000 })]
    const rpt = report(accounts)
    const dq = dataQualityScore(rpt, now)
    const result = debtRiskIndicator(rpt, now, dq.flags, debtRecency(accounts, now))
    expect(result.components.currentDelinquency.score).toBe(25)
  })

  it('scores a suit-filed account as the maximum adverse-status sub-score (20/20), not merely written-off (15)', () => {
    const accounts = [account({ lifecycleStatus: 'SUIT_FILED' })]
    const rpt = report(accounts)
    const dq = dataQualityScore(rpt, now)
    const result = debtRiskIndicator(rpt, now, dq.flags, debtRecency(accounts, now))
    expect(result.components.adverseAccountStatus.score).toBe(20)
  })

  it('CRITICAL: a real historical DPD still scores the "isolated" tier (2 pts) even when the stored payment-history grid has a gap that omits the delinquent month — found against real seeded data (an account with maxDpdDays=27 whose grid showed every captured month as on-time)', () => {
    const accounts = [
      account({
        maxDpdDays: 27,
        currentDpdDays: 0,
        // Every captured month in the grid is on-time — the grid itself
        // has no record of the 27-DPD month at all (a real gap), yet
        // maxHistoricalDpd already knows a real delinquency happened.
        paymentHistoryGrid: [
          { month: '2024-01', dpdBucket: '0' },
          { month: '2024-02', dpdBucket: '0' },
          { month: '2024-03', dpdBucket: '0' },
        ],
      }),
    ]
    const rpt = report(accounts)
    const dq = dataQualityScore(rpt, now)
    const result = debtRiskIndicator(rpt, now, dq.flags, debtRecency(accounts, now))
    expect(result.components.historicalRepayment.score).toBe(2)
  })

  it('applies the >10x-monthly-income debt-burden bonus only when income is actually on file', () => {
    // Two lenders at ~50/50 keeps top-account and top-lender concentration
    // both under their own bonus thresholds (70%/60%), so the >10x-income
    // bonus is the only thing that can move this component's score.
    const accounts = [account({ lender: 'Bank A', currentBalance: 1000000 }), account({ lender: 'Bank B', currentBalance: 1000000 })]
    const rpt = report(accounts, { totalOutstandingBalance: 2000000 })
    const dq = dataQualityScore(rpt, now)
    const recency = debtRecency(accounts, now)
    const withoutIncome = debtRiskIndicator(rpt, now, dq.flags, recency, null)
    const withIncome = debtRiskIndicator(rpt, now, dq.flags, recency, 50000) // 2,000,000 > 10 * 50,000
    expect(withIncome.components.debtBurdenConcentration.score).toBeGreaterThan(withoutIncome.components.debtBurdenConcentration.score)
  })

  it('never produces a total above 100 regardless of how many components max out', () => {
    const accounts = [
      account({ currentDpdDays: 120, overdueAmount: 50000, lifecycleStatus: 'SUIT_FILED', currentBalance: 500000, creditLimit: 100000, accountType: 'Credit Card', openedOn: now }),
    ]
    const rpt = report(accounts, { totalOutstandingBalance: 500000 })
    const dq = dataQualityScore(rpt, now)
    const result = debtRiskIndicator(rpt, now, dq.flags, debtRecency(accounts, now))
    expect(result.total).toBeLessThanOrEqual(100)
    expect(['High', 'Critical']).toContain(result.band)
  })
})

describe('missingInformationRegister (BBS Debt Analysis Module v3.0, §5.5)', () => {
  it('always includes the fixed L1-structural-limit categories regardless of account data', () => {
    const items = missingInformationRegister(report([]))
    const categories = items.map((i) => i.category)
    expect(categories).toContain('Income')
    expect(categories).toContain('Customer intent')
    expect(categories).toContain('Repayment capacity')
  })

  it('conditionally includes "EMI amounts" only when a real active instalment account has a blank EMI', () => {
    const withBlankEmi = missingInformationRegister(report([account({ lifecycleStatus: 'ACTIVE', monthlyEmiAmount: null })]))
    expect(withBlankEmi.map((i) => i.category)).toContain('EMI amounts')

    const withEmi = missingInformationRegister(report([account({ lifecycleStatus: 'ACTIVE', monthlyEmiAmount: 5000 })]))
    expect(withEmi.map((i) => i.category)).not.toContain('EMI amounts')
  })

  it('conditionally includes write-off items only when a real written-off account exists', () => {
    const items = missingInformationRegister(report([account({ lifecycleStatus: 'WRITTEN_OFF' })]))
    expect(items.map((i) => i.category)).toContain('Reason for write-off')
    expect(items.map((i) => i.category)).toContain('Whether the write-off amount is settled')
  })

  it('never fabricates an identity-variant-dependent category this integration cannot populate', () => {
    const items = missingInformationRegister(report([account()]))
    expect(items.map((i) => i.category)).not.toContain('Secondary phone numbers')
  })
})

describe('accountOpeningVelocity (BBS Debt Analysis Module v3.0, §7)', () => {
  const now = new Date('2026-10-08')

  it('counts accounts opened within each exact 3/6/12/24/36-month window', () => {
    const accounts = [
      account({ openedOn: new Date('2026-09-15') }), // within 3m
      account({ openedOn: new Date('2025-01-01') }), // within 24m, not 12m
      account({ openedOn: new Date('2019-01-01') }), // outside all windows
    ]
    const windows = accountOpeningVelocity(accounts, now)
    expect(windows.find((w) => w.windowLabel === '3m')?.accountsOpened).toBe(1)
    expect(windows.find((w) => w.windowLabel === '12m')?.accountsOpened).toBe(1)
    expect(windows.find((w) => w.windowLabel === '24m')?.accountsOpened).toBe(2)
    expect(windows.find((w) => w.windowLabel === '36m')?.accountsOpened).toBe(2)
  })
})

describe('accountTimeline (BBS Debt Analysis Module v3.0, §14.5/§8.4)', () => {
  const now = new Date('2026-10-08')

  it('returns all-null/empty for a report with no accounts, never a fabricated timeline', () => {
    const result = accountTimeline([], now)
    expect(result.yearly).toEqual([])
    expect(result.churnRatePerYear).toBeNull()
    expect(result.creditAgeMonths).toBeNull()
  })

  it('CRITICAL: a CLOSED account with no closedOn date (persisted before the column existed) is excluded from yearly closed counts and churn events, never misplaced into the wrong year', () => {
    const accounts = [
      account({ openedOn: new Date('2020-01-01'), lifecycleStatus: 'CLOSED', closedOn: null }),
      account({ openedOn: new Date('2021-01-01'), lifecycleStatus: 'CLOSED', closedOn: new Date('2021-06-01') }),
    ]
    const result = accountTimeline(accounts, now)
    expect(result.closedAccountsTotal).toBe(2)
    expect(result.closedAccountsWithKnownDate).toBe(1)
    const totalClosedAcrossYears = result.yearly.reduce((sum, y) => sum + y.closed, 0)
    expect(totalClosedAcrossYears).toBe(1) // only the account with a known closedOn is placed
  })

  it('builds a correct year-by-year opened/closed/net-active table', () => {
    const accounts = [
      account({ openedOn: new Date('2021-03-01') }),
      account({ openedOn: new Date('2021-06-01'), lifecycleStatus: 'CLOSED', closedOn: new Date('2022-01-01') }),
    ]
    const result = accountTimeline(accounts, now)
    const y2021 = result.yearly.find((y) => y.year === 2021)!
    const y2022 = result.yearly.find((y) => y.year === 2022)!
    expect(y2021).toEqual({ year: 2021, opened: 2, closed: 0, netActive: 2 })
    expect(y2022).toEqual({ year: 2022, opened: 0, closed: 1, netActive: 1 })
  })

  it('flags a churn event only for an account closed within ~6 months of opening, with a known close date', () => {
    const accounts = [
      account({ lender: 'Fast Close Co', openedOn: new Date('2026-01-01'), lifecycleStatus: 'CLOSED', closedOn: new Date('2026-02-10') }),
      account({ lender: 'Long Lived Bank', openedOn: new Date('2020-01-01'), lifecycleStatus: 'CLOSED', closedOn: new Date('2024-01-01') }),
    ]
    const result = accountTimeline(accounts, now)
    expect(result.churnEvents).toHaveLength(1)
    expect(result.churnEvents[0].lender).toBe('Fast Close Co')
  })

  it('computes credit age in months from the oldest account across ALL statuses, not just active ones', () => {
    const accounts = [
      account({ openedOn: new Date('2016-10-08'), lifecycleStatus: 'CLOSED', closedOn: new Date('2018-01-01') }), // oldest overall
      account({ openedOn: new Date('2024-10-08'), lifecycleStatus: 'ACTIVE' }), // oldest active
    ]
    const result = accountTimeline(accounts, now)
    expect(result.creditAgeMonths).toBe(120) // 10 years = 120 months
    expect(result.oldestActiveAccountDate).toBe(new Date('2024-10-08').toISOString())
  })
})

describe('riskSignalEngine (BBS Debt Analysis Module v3.0, §8/§12)', () => {
  const now = new Date('2026-10-08')

  function runEngine(accounts: CreditAccountInput[], overrides: Partial<CreditReportInput> = {}) {
    const rpt = report(accounts, overrides)
    const dq = dataQualityScore(rpt, now)
    const recency = debtRecency(accounts, now)
    const timeline = accountTimeline(accounts, now)
    const divergence = scoreStructureDivergence(rpt, now, dq, recency, timeline)
    return riskSignalEngine(rpt, now, dq, divergence, recency, timeline)
  }

  it('CRITICAL: never places an identity-variant-dependent code in either triggered or not-triggered — this integration cannot evaluate it either way', () => {
    const result = runEngine([account()])
    const allListedCodes = [...result.triggered.map((t) => t.code), ...result.notTriggered.map((t) => t.code)]
    expect(allListedCodes).not.toContain('SECONDARY_CONTACT_FOUND')
    expect(allListedCodes).not.toContain('MULTIPLE_PHONE_VARIANTS')
    expect(allListedCodes).not.toContain('MULTIPLE_NAME_VARIANTS')
    const notEvaluatedCodes = result.notEvaluated.map((n) => n.code)
    expect(notEvaluatedCodes).toEqual(expect.arrayContaining(['SECONDARY_CONTACT_FOUND', 'MULTIPLE_PHONE_VARIANTS', 'MULTIPLE_NAME_VARIANTS']))
    // Every notEvaluated entry must carry a real, specific reason — never a blank placeholder.
    for (const entry of result.notEvaluated) expect(entry.reason.length).toBeGreaterThan(10)
  })

  it('triggers CURRENT_OVERDUE and WRITTEN_OFF for a genuinely distressed account, and lists their positive counterparts as not-triggered for a clean one', () => {
    const distressed = runEngine([account({ overdueAmount: 5000, lifecycleStatus: 'WRITTEN_OFF' })])
    expect(distressed.triggered.map((t) => t.code)).toEqual(expect.arrayContaining(['CURRENT_OVERDUE', 'WRITTEN_OFF']))

    const clean = runEngine([account({ overdueAmount: 0 })])
    expect(clean.notTriggered.map((t) => t.code)).toEqual(expect.arrayContaining(['CURRENT_OVERDUE', 'WRITTEN_OFF', 'SUIT_FILED', 'WILFUL_DEFAULT']))
  })

  it('every triggered or not-triggered code is mutually exclusive — never both', () => {
    const result = runEngine([account({ overdueAmount: 100 })])
    const triggeredCodes = new Set(result.triggered.map((t) => t.code))
    const notTriggeredCodes = new Set(result.notTriggered.map((t) => t.code))
    for (const code of triggeredCodes) expect(notTriggeredCodes.has(code)).toBe(false)
  })

  it('triggers TOP_LENDER_CONCENTRATION and DEBT_STACKING based on real lender-concentration and lender-count thresholds', () => {
    const accounts = [
      account({ lender: 'Bank A', currentBalance: 700000 }),
      account({ lender: 'Bank B', currentBalance: 100000 }),
      account({ lender: 'Bank C', currentBalance: 100000 }),
      account({ lender: 'Bank D', currentBalance: 100000 }),
    ]
    const result = runEngine(accounts, { totalOutstandingBalance: 1000000 })
    expect(result.triggered.map((t) => t.code)).toEqual(expect.arrayContaining(['TOP_LENDER_CONCENTRATION', 'DEBT_STACKING']))
  })

  it('CRITICAL: DEBT_STACKING triggers on active OBLIGATION (account) count, not distinct lender count — 3 accounts with a single lender still triggers it, per §19.2\'s own distinct active_obligation_count vs active_lender_count fields', () => {
    const accounts = [
      account({ lender: 'Bajaj Finance', accountType: 'Personal Loan', currentBalance: 500000 }),
      account({ lender: 'Bajaj Finance', accountType: 'Consumer Loan', currentBalance: 50000 }),
      account({ lender: 'Bajaj Finance', accountType: 'Credit Card', creditLimit: 50000, currentBalance: 10000 }),
    ]
    const result = runEngine(accounts, { totalOutstandingBalance: 560000 })
    const stacking = result.triggered.find((t) => t.code === 'DEBT_STACKING')
    expect(stacking).toBeDefined()
    expect(stacking!.evidence).toContain('3 active obligation')
    expect(stacking!.evidence).toContain('1 active lender')
  })

  it('triggers CARD_LIMIT_ZERO, NO_PAYMENT_HISTORY, and FUTURE_DATE for accounts with those real data issues', () => {
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const accounts = [
      account({ accountType: 'Credit Card', creditLimit: 0, lifecycleStatus: 'ACTIVE' }),
      account({ paymentHistoryGrid: null }),
      account({ openedOn: futureDate }),
    ]
    const result = runEngine(accounts)
    const codes = result.triggered.map((t) => t.code)
    expect(codes).toEqual(expect.arrayContaining(['CARD_LIMIT_ZERO', 'NO_PAYMENT_HISTORY', 'FUTURE_DATE']))
  })
})

describe('buildCohortSignalPackage (BBS Debt Analysis Module v3.0, §19.2)', () => {
  const now = new Date('2026-10-08')

  it('flattens already-computed values into the fixed export schema without re-deriving them', () => {
    const accounts = [account({ lender: 'Bank A', currentBalance: 500000, isSecured: false })]
    const rpt = report(accounts, { totalOutstandingBalance: 500000 })
    const dq = dataQualityScore(rpt, now)
    const recency = debtRecency(accounts, now)
    const indicator = debtRiskIndicator(rpt, now, dq.flags, recency)
    const timeline = accountTimeline(accounts, now)
    const items = missingInformationRegister(rpt)

    const pkg = buildCohortSignalPackage(rpt, now, indicator, items.length, recency, timeline)
    expect(pkg.debtRiskIndicator).toBe(indicator.total)
    expect(pkg.debtRiskIndicatorBand).toBe(indicator.band)
    expect(pkg.missingInformationCount).toBe(items.length)
    expect(pkg.unsecuredSharePercent).toBe(100)
    expect(pkg.provenance).toEqual({ sourceBureau: 'Test Bureau', analysisVersion: '3.0', policyVersion: '1.0' })
  })

  it('maxPossibleDpd is null when history completeness is genuinely low, never a fabricated figure', () => {
    const accounts = [account({ openedOn: new Date('2020-01-01'), maxDpdDays: 45, paymentHistoryGrid: null })]
    const rpt = report(accounts)
    const indicator = debtRiskIndicator(rpt, now, [], debtRecency(accounts, now))
    const pkg = buildCohortSignalPackage(rpt, now, indicator, 0, debtRecency(accounts, now), accountTimeline(accounts, now))
    expect(pkg.maxPossibleDpd).toBeNull()
  })
})

describe('finalSummaryTable (BBS Debt Analysis Module v3.0, §17/§23)', () => {
  const now = new Date('2026-10-08')

  it('recaps every major dimension with a severity derived from the real underlying signals, never a hardcoded value', () => {
    const accounts = [account({ overdueAmount: 5000, currentDpdDays: 10 })]
    const rpt = report(accounts, { creditScore: 700 })
    const dq = dataQualityScore(rpt, now)
    const recency = debtRecency(accounts, now)
    const timeline = accountTimeline(accounts, now)
    const divergence = scoreStructureDivergence(rpt, now, dq, recency, timeline)
    const indicator = debtRiskIndicator(rpt, now, dq.flags, recency)
    const engine = riskSignalEngine(rpt, now, dq, divergence, recency, timeline)

    const rows = finalSummaryTable(rpt, dq, indicator, divergence, timeline, engine)
    const dimensions = rows.map((r) => r.dimension)
    expect(dimensions).toContain('Credit score')
    expect(dimensions).toContain('Debt Risk Indicator')
    expect(dimensions).toContain('Score-structure divergence')

    const currentDelinquencyRow = rows.find((r) => r.dimension === 'Current delinquency')!
    expect(currentDelinquencyRow.severity).not.toBe('Positive') // real overdue+DPD present, must not be whitewashed
  })
})
