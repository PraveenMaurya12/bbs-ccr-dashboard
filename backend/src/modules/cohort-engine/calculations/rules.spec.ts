import { evaluateAllRules } from './rules'
import { cleanCohortInput, testConfig } from './test-helpers'

describe('evaluateAllRules', () => {
  it('evaluates all 24 rules unconditionally, every time, regardless of which cohort would ultimately be selected', () => {
    const results = evaluateAllRules(cleanCohortInput(), testConfig())
    const ids = results.map((r) => r.ruleId)
    const expected = Array.from({ length: 24 }, (_, i) => `R${String(i + 1).padStart(3, '0')}`)
    expect(ids).toEqual(expected)
  })

  it('CRITICAL: never crashes and never fabricates a match when every optional input is null/unavailable', () => {
    const blank = cleanCohortInput({
      credit: { score: null, scoreBand: 'not_found', currentOverdue: null, currentDpd: null, historicalMaxDpd: null, writeoffStatus: null, settlementStatus: null, suitFiled: false, arcAssigned: false, willfulDefault: null, legalOrSpecialistTrigger: false, enquiries30d: null, dpdTrend: 'UNKNOWN', recentEnquiries: null },
      debt: { totalDebt: 0, unsecuredRatio: null, activeAccounts: 0, lenderCount: 0, debtComplexityBand: 'LOW', recentStackingClusterDetected: false, newAccountsPerYear: null, activeOverdueRatio: null },
      financial: { verifiedIncomeAvailable: false, verifiedMonthlyIncome: null, essentialExpenses: null, mandatoryDebtPayments: null, sustainableSurplus: null, capacityRatio: null, capacityBand: 'UNKNOWN', liquidityBand: 'UNKNOWN', incomeStability: 'UNKNOWN', incomeTrajectory: 'UNKNOWN' },
      otherAccounts: { likely: false, incomeSharePercent: null },
      postStatementDebt: { detected: true, accountCount: 1, totalAmount: 10000, repaymentUnverified: true, percentOfActiveDebt: null },
      dataQuality: { band: null, p1Count: 0, p2Count: 0, exceptionCount: 0 },
    })
    expect(() => evaluateAllRules(blank, testConfig())).not.toThrow()
    const results = evaluateAllRules(blank, testConfig())
    // Rules whose required source signal is genuinely missing report evaluated:false, never a fabricated match.
    const r007 = results.find((r) => r.ruleId === 'R007')!
    const r008 = results.find((r) => r.ruleId === 'R008')!
    const r011 = results.find((r) => r.ruleId === 'R011')!
    const r012 = results.find((r) => r.ruleId === 'R012')!
    const r013 = results.find((r) => r.ruleId === 'R013')!
    const r018 = results.find((r) => r.ruleId === 'R019')!
    const r022 = results.find((r) => r.ruleId === 'R022')!
    expect(r007.evaluated).toBe(false)
    expect(r008.evaluated).toBe(false)
    expect(r011.evaluated).toBe(false)
    expect(r012.evaluated).toBe(false)
    expect(r013.evaluated).toBe(false)
    expect(r018.evaluated).toBe(false) // post-statement detected but % of active debt unavailable
    expect(r022.evaluated).toBe(false) // dataQuality.band unavailable
    for (const r of [r007, r008, r011, r012, r013, r018, r022]) expect(r.matched).toBe(false)
  })

  describe('R004 — financial readiness', () => {
    it('CRITICAL: matches when income is available but essential expenses are null (not just when income itself is missing)', () => {
      const input = cleanCohortInput({ financial: { ...cleanCohortInput().financial, verifiedIncomeAvailable: true, essentialExpenses: null } })
      const r004 = evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R004')!
      expect(r004.matched).toBe(true)
    })

    it('CRITICAL: matches when income is available but mandatory debt payments are null', () => {
      const input = cleanCohortInput({ financial: { ...cleanCohortInput().financial, verifiedIncomeAvailable: true, mandatoryDebtPayments: null } })
      const r004 = evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R004')!
      expect(r004.matched).toBe(true)
    })

    it('does not match when income, essential expenses, and mandatory debt payments are all available', () => {
      const input = cleanCohortInput({ financial: { ...cleanCohortInput().financial, verifiedIncomeAvailable: true, essentialExpenses: 20000, mandatoryDebtPayments: 8000 } })
      const r004 = evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R004')!
      expect(r004.matched).toBe(false)
    })
  })

  describe('R008 — overdue pressure (₹1 lakh boundary)', () => {
    it('does not match exactly at ₹100,000', () => {
      const input = cleanCohortInput({ credit: { ...cleanCohortInput().credit, currentOverdue: 100000 } })
      const r008 = evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R008')!
      expect(r008.matched).toBe(false)
    })
    it('matches just above ₹100,000', () => {
      const input = cleanCohortInput({ credit: { ...cleanCohortInput().credit, currentOverdue: 100001 } })
      const r008 = evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R008')!
      expect(r008.matched).toBe(true)
    })
  })

  describe('R010 — debt-cycle stacking', () => {
    it('matches from a real account-opening cluster alone, with no overdue precondition (see this rule\'s own doc comment on the §22 reference case)', () => {
      const input = cleanCohortInput({ debt: { ...cleanCohortInput().debt, recentStackingClusterDetected: true }, credit: { ...cleanCohortInput().credit, currentOverdue: 0 } })
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R010')!.matched).toBe(true)
    })
    it('matches from corroborated stacking-index + enquiry-burst alone, with no overdue precondition', () => {
      const input = cleanCohortInput({ debt: { ...cleanCohortInput().debt, newAccountsPerYear: 20 }, credit: { ...cleanCohortInput().credit, enquiries30d: 6, currentOverdue: 0 } })
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R010')!.matched).toBe(true)
    })
    it('does not match a stacking index alone without a corroborating enquiry burst', () => {
      const input = cleanCohortInput({ debt: { ...cleanCohortInput().debt, newAccountsPerYear: 20 }, credit: { ...cleanCohortInput().credit, enquiries30d: 1 } })
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R010')!.matched).toBe(false)
    })
  })

  describe('R011 — enquiry burst (>4/30d boundary)', () => {
    it('does not match at exactly 4', () => {
      const input = cleanCohortInput({ credit: { ...cleanCohortInput().credit, enquiries30d: 4 } })
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R011')!.matched).toBe(false)
    })
    it('matches at 5', () => {
      const input = cleanCohortInput({ credit: { ...cleanCohortInput().credit, enquiries30d: 5 } })
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R011')!.matched).toBe(true)
    })
  })

  describe('R013 — capacity band (unified)', () => {
    it('reports whichever of the 5 bands the already-computed capacity.ts output carries — one row, never 3', () => {
      const stressed = cleanCohortInput({ financial: { ...cleanCohortInput().financial, capacityBand: 'STRESSED' } })
      const r013 = evaluateAllRules(stressed, testConfig()).find((r) => r.ruleId === 'R013')!
      expect(r013.matched).toBe(true)
      expect(r013.evidence.capacityBand).toBe('STRESSED')
    })
    it('reports evaluated:false only when the band itself is UNKNOWN', () => {
      const unknown = cleanCohortInput({ financial: { ...cleanCohortInput().financial, capacityBand: 'UNKNOWN', sustainableSurplus: null, capacityRatio: null } })
      expect(evaluateAllRules(unknown, testConfig()).find((r) => r.ruleId === 'R013')!.evaluated).toBe(false)
    })
  })

  describe('R014 — stabilisation coverage', () => {
    it('always reports evaluated:false — no BBS Plan Engine support-amount integration exists', () => {
      const r014 = evaluateAllRules(cleanCohortInput(), testConfig()).find((r) => r.ruleId === 'R014')!
      expect(r014.evaluated).toBe(false)
      expect(r014.matched).toBe(false)
    })
  })

  describe('R015 — recovery state', () => {
    it('CRITICAL: never matches for a lead with a perfectly clean history (nothing to "recover" from)', () => {
      const input = cleanCohortInput() // historicalMaxDpd: 0
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R015')!.matched).toBe(false)
    })
    it('matches when prior adverse history exists but current status is clean and stable', () => {
      const input = cleanCohortInput({ credit: { ...cleanCohortInput().credit, historicalMaxDpd: 95, currentOverdue: 0, dpdTrend: 'IMPROVING' } })
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R015')!.matched).toBe(true)
    })
  })

  describe('R016 — outside current program', () => {
    it('matches a clean, comfortable, no-debt-cycle lead regardless of total debt amount', () => {
      const input = cleanCohortInput()
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R016')!.matched).toBe(true)
    })
  })

  describe('R017 — compliance signal (unified)', () => {
    it('matches verbatim from Master Profile\'s own complianceRouting.complianceHold, never re-derived', () => {
      const input = cleanCohortInput({ compliance: { hold: true, reason: 'PEP_MATCH', matchedEntity: null, since: null, slaHours: 24, escalationHours: 16 } })
      const r017 = evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R017')!
      expect(r017.matched).toBe(true)
      expect(r017.evidence.reason).toBe('PEP_MATCH')
    })
  })

  describe('R018 — other accounts (graduated, §9.3)', () => {
    it('is informational-only below 5%', () => {
      const r018 = evaluateAllRules(cleanCohortInput({ otherAccounts: { likely: true, incomeSharePercent: 4 } }), testConfig()).find((r) => r.ruleId === 'R018')!
      expect(r018.matched).toBe(false)
      expect(r018.severity).toBe('LOW')
    })
    it('flags (not blocks) between 5% and 10%', () => {
      const r018 = evaluateAllRules(cleanCohortInput({ otherAccounts: { likely: true, incomeSharePercent: 7 } }), testConfig()).find((r) => r.ruleId === 'R018')!
      expect(r018.matched).toBe(false)
      expect(r018.severity).toBe('MEDIUM')
    })
    it('blocks above 10%', () => {
      const r018 = evaluateAllRules(cleanCohortInput({ otherAccounts: { likely: true, incomeSharePercent: 11 } }), testConfig()).find((r) => r.ruleId === 'R018')!
      expect(r018.matched).toBe(true)
      expect(r018.severity).toBe('HIGH')
    })
  })

  describe('R019 — post-statement debt (graduated, §9.4)', () => {
    it('reports the clean "none detected" case honestly rather than evaluated:false', () => {
      const r019 = evaluateAllRules(cleanCohortInput(), testConfig()).find((r) => r.ruleId === 'R019')!
      expect(r019.evaluated).toBe(true)
      expect(r019.matched).toBe(false)
    })
    it('blocks above 30% of active debt', () => {
      const input = cleanCohortInput({ postStatementDebt: { detected: true, accountCount: 1, totalAmount: 40000, repaymentUnverified: true, percentOfActiveDebt: 31 } })
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R019')!.matched).toBe(true)
    })
  })

  describe('R020 — P1 missing information (§9.5)', () => {
    it('blocks at 4+ items', () => {
      const input = cleanCohortInput({ dataQuality: { ...cleanCohortInput().dataQuality, p1Count: 4 } })
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R020')!.matched).toBe(true)
    })
    it('flags (not blocks) at 1-3 items', () => {
      const input = cleanCohortInput({ dataQuality: { ...cleanCohortInput().dataQuality, p1Count: 2 } })
      const r020 = evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R020')!
      expect(r020.matched).toBe(false)
      expect(r020.severity).toBe('MEDIUM')
    })
  })

  describe('R021 — exception count (§9.6)', () => {
    it('is clean below 5', () => {
      const input = cleanCohortInput({ dataQuality: { ...cleanCohortInput().dataQuality, exceptionCount: 4 } })
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R021')!.matched).toBe(false)
    })
    it('tiers to SPECIALIST at 5-7', () => {
      const input = cleanCohortInput({ dataQuality: { ...cleanCohortInput().dataQuality, exceptionCount: 7 } })
      const r021 = evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R021')!
      expect(r021.matched).toBe(true)
      expect(r021.evidence.tier).toBe('SPECIALIST')
    })
    it('tiers to MANUAL_REVIEW at 8+', () => {
      const input = cleanCohortInput({ dataQuality: { ...cleanCohortInput().dataQuality, exceptionCount: 8 } })
      const r021 = evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R021')!
      expect(r021.matched).toBe(true)
      expect(r021.evidence.tier).toBe('MANUAL_REVIEW')
    })
  })

  describe('R022 — FCF unreconciled capacity cap', () => {
    it('matches when the cap actually fired (capacity capped at STRESSED with a non-negative theoretical surplus)', () => {
      const input = cleanCohortInput({ dataQuality: { ...cleanCohortInput().dataQuality, band: 'LOW' }, financial: { ...cleanCohortInput().financial, capacityBand: 'STRESSED', sustainableSurplus: 5000 } })
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R022')!.matched).toBe(true)
    })
    it('does not match when capacity is COMFORTABLE (no cap applied)', () => {
      const input = cleanCohortInput({ dataQuality: { ...cleanCohortInput().dataQuality, band: 'HIGH' } })
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R022')!.matched).toBe(false)
    })
  })

  describe('R023 — income transition (§9.1)', () => {
    it('matches verbatim from Financial Analysis\'s own eventProfile.incomeTransition detector', () => {
      const input = cleanCohortInput({ incomeTransition: { detected: true, deltaPercent: 18, direction: 'UP', monthsSinceTransition: 3 } })
      const r023 = evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R023')!
      expect(r023.matched).toBe(true)
      expect(r023.evidence.shortTenure).toBe(true) // <6 months at the new level
    })
    it('does not match when no transition was detected', () => {
      expect(evaluateAllRules(cleanCohortInput(), testConfig()).find((r) => r.ruleId === 'R023')!.matched).toBe(false)
    })
  })

  describe('R024 — medical shock (§9.2)', () => {
    it('matches verbatim from Financial Analysis\'s own eventProfile.medicalEvents detector', () => {
      const input = cleanCohortInput({ medicalShock: { shockMonthCount: 2, chronic: false, maxIncomeSharePercent: 10 } })
      expect(evaluateAllRules(input, testConfig()).find((r) => r.ruleId === 'R024')!.matched).toBe(true)
    })
    it('does not match when no shock was detected', () => {
      expect(evaluateAllRules(cleanCohortInput(), testConfig()).find((r) => r.ruleId === 'R024')!.matched).toBe(false)
    })
  })
})
