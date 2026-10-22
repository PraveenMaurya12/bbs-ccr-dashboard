import { evaluateAllRules } from './rules'
import { resolvePrecedence } from './precedence'
import { cleanCohortInput, testConfig } from './test-helpers'
import type { CohortInput } from '../cohort-engine.types'

function resolve(input: CohortInput) {
  const results = evaluateAllRules(input, testConfig())
  return resolvePrecedence(results, input, testConfig())
}

describe('resolvePrecedence (BBS Cohort Engine Module v3.0 §6.1)', () => {
  it('X2 — a clean, comfortable, no-distress lead is Outside Current Program', () => {
    expect(resolve(cleanCohortInput()).primaryCohort).toBe('X2')
  })

  it('CONSENT_PENDING takes the highest precedence, above everything else including a compliance hold', () => {
    const input = cleanCohortInput({
      lead: { ...cleanCohortInput().lead, consentGranted: false },
      compliance: { ...cleanCohortInput().compliance, hold: true, reason: 'RELATED_PARTY_EMPLOYER' },
    })
    expect(resolve(input).primaryCohort).toBe('CONSENT_PENDING')
  })

  it('KYC_PENDING when consent is granted but no PAN reference exists', () => {
    const input = cleanCohortInput({ lead: { ...cleanCohortInput().lead, panAvailable: false } })
    expect(resolve(input).primaryCohort).toBe('KYC_PENDING')
  })

  it('COMPLIANCE_HOLD (R017) takes precedence over every other BLOCKED reason except CONSENT_PENDING/KYC_PENDING (§6.1 priority 1.2)', () => {
    const input = cleanCohortInput({
      compliance: { ...cleanCohortInput().compliance, hold: true, reason: 'RELATED_PARTY_EMPLOYER' },
      credit: { ...cleanCohortInput().credit, suitFiled: true, legalOrSpecialistTrigger: true },
    })
    const result = resolve(input)
    expect(result.primaryCohort).toBe('COMPLIANCE_HOLD')
    expect(result.secondaryFlags.some((f) => f.key === 'SPECIALIST_REQUIRED')).toBe(true)
  })

  it('DATA_REFRESH_REQUIRED (R019, §6.1 priority 1.25) takes precedence over OTHER_ACCOUNTS_REQUIRED/P1_INFORMATION_REQUIRED', () => {
    const input = cleanCohortInput({
      postStatementDebt: { detected: true, accountCount: 1, totalAmount: 90000, repaymentUnverified: true, percentOfActiveDebt: 90 },
      otherAccounts: { likely: true, incomeSharePercent: 20 },
      dataQuality: { ...cleanCohortInput().dataQuality, p1Count: 5 },
    })
    const result = resolve(input)
    expect(result.primaryCohort).toBe('DATA_REFRESH_REQUIRED')
    expect(result.secondaryFlags.some((f) => f.key === 'OTHER_ACCOUNTS_REQUIRED')).toBe(true)
    expect(result.secondaryFlags.some((f) => f.key === 'P1_INFORMATION_REQUIRED')).toBe(true)
  })

  it('OTHER_ACCOUNTS_REQUIRED (R018, §6.1 priority 1.3) takes precedence over P1_INFORMATION_REQUIRED', () => {
    const input = cleanCohortInput({
      otherAccounts: { likely: true, incomeSharePercent: 20 },
      dataQuality: { ...cleanCohortInput().dataQuality, p1Count: 5 },
    })
    const result = resolve(input)
    expect(result.primaryCohort).toBe('OTHER_ACCOUNTS_REQUIRED')
  })

  it('P1_INFORMATION_REQUIRED (R020, §6.1 priority 1.4) takes precedence over material mismatch', () => {
    const input = cleanCohortInput({
      dataQuality: { ...cleanCohortInput().dataQuality, p1Count: 4 },
      reconciliation: { ...cleanCohortInput().reconciliation, unresolvedMismatch: true },
    })
    const result = resolve(input)
    expect(result.primaryCohort).toBe('P1_INFORMATION_REQUIRED')
  })

  it('MANUAL_REVIEW (material mismatch, R005, §6.1 priority 1.5) takes precedence over specialist review (legal status, R006, priority 1.6)', () => {
    const input = cleanCohortInput({
      reconciliation: { ...cleanCohortInput().reconciliation, unresolvedMismatch: true },
      credit: { ...cleanCohortInput().credit, suitFiled: true, legalOrSpecialistTrigger: true },
    })
    const result = resolve(input)
    expect(result.primaryCohort).toBe('MANUAL_REVIEW')
    expect(result.secondaryFlags.some((f) => f.key === 'SPECIALIST_REQUIRED')).toBe(true)
  })

  it('SPECIALIST_REQUIRED (legal status, R006) takes precedence over a confirmed debt-cycle trigger (C5)', () => {
    const input = cleanCohortInput({
      credit: { ...cleanCohortInput().credit, suitFiled: true, legalOrSpecialistTrigger: true },
      behaviour: { ...cleanCohortInput().behaviour, borrowingToRepay: true },
    })
    const result = resolve(input)
    expect(result.primaryCohort).toBe('SPECIALIST_REQUIRED')
    expect(result.secondaryFlags.some((f) => f.key === 'C5')).toBe(true)
  })

  it('MANUAL_REVIEW (exception count >= 8, §6.1 priority 1.7) takes precedence over SPECIALIST_REQUIRED (exception count 5-7, priority 1.8)', () => {
    const input = cleanCohortInput({ dataQuality: { ...cleanCohortInput().dataQuality, exceptionCount: 8 } })
    expect(resolve(input).primaryCohort).toBe('MANUAL_REVIEW')
  })

  it('SPECIALIST_REQUIRED from exception count 5-7 (§6.1 priority 1.8)', () => {
    const input = cleanCohortInput({ dataQuality: { ...cleanCohortInput().dataQuality, exceptionCount: 6 } })
    expect(resolve(input).primaryCohort).toBe('SPECIALIST_REQUIRED')
  })

  it('C5 vs C4: a confirmed debt-cycle trigger takes precedence over a Distressed capacity band', () => {
    const input = cleanCohortInput({
      behaviour: { ...cleanCohortInput().behaviour, borrowingToRepay: true },
      financial: { ...cleanCohortInput().financial, sustainableSurplus: -5000, capacityBand: 'DISTRESSED' },
    })
    const result = resolve(input)
    expect(result.primaryCohort).toBe('C5')
    expect(result.secondaryFlags.some((f) => f.key === 'C4')).toBe(true)
  })

  it('C4 — Distressed capacity band alone (no debt-cycle signal) is Resolution Candidate', () => {
    const input = cleanCohortInput({ financial: { ...cleanCohortInput().financial, sustainableSurplus: -1000, capacityRatio: null, capacityBand: 'DISTRESSED' } })
    expect(resolve(input).primaryCohort).toBe('C4')
  })

  it('C3 vs C2: a Stressed capacity band takes precedence over consolidation eligibility', () => {
    const input = cleanCohortInput({
      debt: { ...cleanCohortInput().debt, activeAccounts: 3 },
      financial: { ...cleanCohortInput().financial, sustainableSurplus: 2000, capacityRatio: 0.05, capacityBand: 'STRESSED' },
    })
    const result = resolve(input)
    expect(result.primaryCohort).toBe('C3')
    expect(result.secondaryFlags.some((f) => f.key === 'C2')).toBe(true)
  })

  it('C2 vs C1: consolidation eligibility takes precedence over stabilisation readiness when both are plausible', () => {
    const input = cleanCohortInput({
      credit: { ...cleanCohortInput().credit, currentOverdue: 5000 },
      debt: { ...cleanCohortInput().debt, activeAccounts: 2 },
    })
    const result = resolve(input)
    expect(result.primaryCohort).toBe('C2')
    expect(result.secondaryFlags.some((f) => f.key === 'C1')).toBe(true)
  })

  it('C1 — overdue pressure with comfortable capacity and no blockers is Stabilisation Ready', () => {
    const input = cleanCohortInput({ credit: { ...cleanCohortInput().credit, currentOverdue: 5000 } })
    expect(resolve(input).primaryCohort).toBe('C1')
  })

  it('C7 transition: prior adverse history, now clean and stable', () => {
    const input = cleanCohortInput({ credit: { ...cleanCohortInput().credit, historicalMaxDpd: 90, dpdTrend: 'IMPROVING' } })
    expect(resolve(input).primaryCohort).toBe('C7')
  })

  it('C7 reversal: a new overdue event takes the lead out of C7 back into an active cohort', () => {
    const input = cleanCohortInput({ credit: { ...cleanCohortInput().credit, historicalMaxDpd: 90, dpdTrend: 'IMPROVING', currentOverdue: 8000 } })
    const result = resolve(input)
    expect(result.primaryCohort).not.toBe('C7')
  })

  it('CONFIRMED NARROWING vs. the pre-v3.0 implementation: a TIGHT capacity band with no other qualifying condition (no overdue, <2 accounts) falls through to MANUAL_REVIEW — §6.1\'s own precedence table only routes a STRESSED band to C3, not TIGHT. This is a deliberate reading of the spec\'s own literal table, not a bug: a TIGHT band alone is not inherently actionable, it only becomes so when paired with another trigger (overdue -> C1, 2+ accounts -> C2), both already covered by their own rows.', () => {
    const input = cleanCohortInput({ financial: { ...cleanCohortInput().financial, sustainableSurplus: 6000, capacityRatio: 0.12, capacityBand: 'TIGHT' } })
    const result = resolve(input)
    expect(result.primaryCohort).toBe('MANUAL_REVIEW')
  })

  it('MANUAL_REVIEW is the resolver\'s own structural fallback — never crashes, never defaults to an arbitrary cohort, when genuinely no candidate matches', () => {
    const result = resolvePrecedence([], cleanCohortInput({ financial: { ...cleanCohortInput().financial, capacityBand: 'COMFORTABLE' }, credit: { ...cleanCohortInput().credit, currentOverdue: null } }), testConfig())
    expect(result.primaryCohort).toBe('MANUAL_REVIEW')
    expect(result.manualReviewRequired).toBe(true)
  })

  it('CRITICAL invariant: exactly one primary cohort is ever selected, and it never also appears in its own secondaryFlags', () => {
    const scenarios = [cleanCohortInput(), cleanCohortInput({ credit: { ...cleanCohortInput().credit, suitFiled: true, legalOrSpecialistTrigger: true } }), cleanCohortInput({ financial: { ...cleanCohortInput().financial, sustainableSurplus: -1000, capacityBand: 'DISTRESSED' } })]
    for (const input of scenarios) {
      const result = resolve(input)
      expect(typeof result.primaryCohort).toBe('string')
      expect(result.secondaryFlags.every((f) => f.key !== result.primaryCohort)).toBe(true)
    }
  })

  it('CRITICAL invariant: a hard specialist trigger is never silently absorbed into a secondary flag only', () => {
    const input = cleanCohortInput({ credit: { ...cleanCohortInput().credit, arcAssigned: true, legalOrSpecialistTrigger: true } })
    const result = resolve(input)
    expect(result.primaryCohort).toBe('SPECIALIST_REQUIRED')
    expect(result.specialistReviewRequired).toBe(true)
    expect(result.specialistReviewReason).not.toBeNull()
  })
})
