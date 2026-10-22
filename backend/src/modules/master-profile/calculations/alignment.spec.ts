import { classifyAlignment } from './alignment'
import type { ComplianceRoutingResult, DateAlignmentResult, DsrComparisonResult, StressProfileResult } from '../master-profile.types'

const alignedDates: DateAlignmentResult = { creditReportDate: '2026-09-01', bankStatementPeriodStart: '2025-10-01', bankStatementPeriodEnd: '2026-08-31', aligned: true, warning: null }
const misalignedDates: DateAlignmentResult = { ...alignedDates, aligned: false, warning: 'stale' }
const noHold: ComplianceRoutingResult = { complianceHold: false, reason: null, matchedEntity: null, since: null, slaHours: null, escalationHours: null }
const hold: ComplianceRoutingResult = { complianceHold: true, reason: 'RELATED_PARTY_EMPLOYER', matchedEntity: 'Golden Legand Leasing & Finance Ltd', since: '2026-10-08T00:00:00.000Z', slaHours: 72, escalationHours: 48 }

function dsr(percent: number | null, availability: DsrComparisonResult['masterDsr']['availability'] = 'AVAILABLE'): DsrComparisonResult {
  return {
    bureauDsr: { availability: 'AVAILABLE', percent: 20 },
    bankDsr: { availability: 'AVAILABLE', percent: 20 },
    masterDsr: { availability, percent, confirmedMonthlyObligations: percent !== null ? 8000 : null },
    debtCoverage: { availability: 'AVAILABLE', ratio: 3 },
  }
}

function stress(confidence: StressProfileResult['confidence'] = 'HIGH'): StressProfileResult {
  return { level: 'Stable', drivers: [], confidence }
}

describe('classifyAlignment (BBS Master Profile Module v3.0 §12.1/§12.2)', () => {
  it('COMPLIANCE_HOLD supersedes every other state — even a clean-credit, capable-cash-flow profile', () => {
    const result = classifyAlignment({ currentMaxDpd: 0, writtenOffCount: 0, settledCount: 0, suitFiledCount: 0 }, { stressBand: 'LOW' }, dsr(20), stress(), alignedDates, hold)
    expect(result).toBe('COMPLIANCE_HOLD')
  })

  it('COMPLIANCE_HOLD supersedes even severely stressed credit+financial evidence', () => {
    const result = classifyAlignment({ currentMaxDpd: 95, writtenOffCount: 1, settledCount: 0, suitFiledCount: 0 }, { stressBand: 'CRITICAL' }, dsr(70), stress(), alignedDates, hold)
    expect(result).toBe('COMPLIANCE_HOLD')
  })

  it('ALIGNED_HEALTHY: no overdue/historical stress, capable cash flow, manageable Master DSR', () => {
    const result = classifyAlignment({ currentMaxDpd: 0, writtenOffCount: 0, settledCount: 0, suitFiledCount: 0 }, { stressBand: 'LOW' }, dsr(20), stress(), alignedDates, noHold)
    expect(result).toBe('ALIGNED_HEALTHY')
  })

  it('CREDIT_STRONG_FINANCIAL_STRESSED: no overdue/historical stress but high debt burden/low cash flow', () => {
    const result = classifyAlignment({ currentMaxDpd: 0, writtenOffCount: 0, settledCount: 0, suitFiledCount: 0 }, { stressBand: 'HIGH' }, dsr(60), stress(), alignedDates, noHold)
    expect(result).toBe('CREDIT_STRONG_FINANCIAL_STRESSED')
  })

  it('CREDIT_STRESSED_FINANCIAL_STRONG: historical defaults/write-offs but stable income and cash flow', () => {
    const result = classifyAlignment({ currentMaxDpd: 0, writtenOffCount: 1, settledCount: 0, suitFiledCount: 0 }, { stressBand: 'MODERATE' }, dsr(25), stress(), alignedDates, noHold)
    expect(result).toBe('CREDIT_STRESSED_FINANCIAL_STRONG')
  })

  it('BOTH_STRESSED: current/historical credit stress combined with high debt burden', () => {
    const result = classifyAlignment({ currentMaxDpd: 95, writtenOffCount: 0, settledCount: 0, suitFiledCount: 0 }, { stressBand: 'CRITICAL' }, dsr(70), stress(), alignedDates, noHold)
    expect(result).toBe('BOTH_STRESSED')
  })

  it('ALIGNED_HEALTHY (not a separate "high debt capacity" state — removed in v3.0): no credit stress, capable cash flow, Master DSR available even if non-trivial', () => {
    const result = classifyAlignment({ currentMaxDpd: 0, writtenOffCount: 0, settledCount: 0, suitFiledCount: 0 }, { stressBand: 'MODERATE' }, dsr(45), stress(), alignedDates, noHold)
    expect(result).toBe('ALIGNED_HEALTHY')
  })

  it('null (not a 6th state — v3.0 removed DATA_CONFLICT_VALIDATION_REQUIRED) when source periods are materially misaligned', () => {
    const result = classifyAlignment({ currentMaxDpd: 0, writtenOffCount: 0, settledCount: 0, suitFiledCount: 0 }, { stressBand: 'LOW' }, dsr(20), stress(), misalignedDates, noHold)
    expect(result).toBeNull()
  })

  it('null when evidence is too thin for a confident classification', () => {
    const result = classifyAlignment({ currentMaxDpd: 0, writtenOffCount: 0, settledCount: 0, suitFiledCount: 0 }, { stressBand: 'LOW' }, dsr(null, 'INSUFFICIENT_DATA'), stress('LOW'), alignedDates, noHold)
    expect(result).toBeNull()
  })
})
