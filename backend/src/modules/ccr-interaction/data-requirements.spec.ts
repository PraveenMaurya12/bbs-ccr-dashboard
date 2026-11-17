import { buildDataRequirements, type RequirementInputs } from './data-requirements'

const base: RequirementInputs = {
  hasCreditReport: true,
  hasBankStatement: true,
  l1DataAsOf: '2026-10-13T00:00:00.000Z',
  l2DataAsOf: '2026-10-01T00:00:00.000Z',
  dataQualityBand: 'MODERATE',
  dataQualityFlags: [],
  readinessOutcome: 'READY',
  alignmentState: 'ALIGNED_HEALTHY',
  complianceHold: false,
  complianceReason: null,
  postStatementDebt: { detected: false, accountCount: 0 },
  unresolvedP1Count: 0,
  unansweredCcrQuestions: 0,
}
const codes = (i: Partial<RequirementInputs>) => buildDataRequirements({ ...base, ...i }).map((r) => r.code)

describe('buildDataRequirements', () => {
  it('lists nothing for a lead that has current data and nothing open', () => {
    expect(codes({})).toEqual([])
  })

  it('asks for a bank statement when none has completed, and a credit report when none has', () => {
    expect(codes({ hasBankStatement: false })).toContain('BANK_STATEMENT_MISSING')
    expect(codes({ hasCreditReport: false })).toContain('CREDIT_REPORT_MISSING')
  })

  it('says exactly which period a new statement must cover when the current one ends >60 days before the report', () => {
    const [r] = buildDataRequirements({ ...base, l2DataAsOf: '2026-03-31T00:00:00.000Z' })
    expect(r).toMatchObject({ code: 'STATEMENT_NOT_CURRENT', severity: 'BLOCKING', action: { type: 'UPLOAD_BANK_STATEMENT' } })
    expect(r.why).toContain('2026-03-31')
    expect(r.why).toContain('196 days')
    expect(r.detail?.needed).toMatch(/2026-03-31 to 2026-10-13/)
  })

  it('does not call a statement out of date at exactly the 60-day threshold', () => {
    expect(codes({ l2DataAsOf: '2026-08-14T00:00:00.000Z' })).not.toContain('STATEMENT_NOT_CURRENT')
  })

  it('sends unresolved post-statement items to the CCR questions, and to a newer statement once the CCR has recorded them', () => {
    const open = buildDataRequirements({ ...base, postStatementDebt: { detected: true, accountCount: 2 }, unresolvedP1Count: 2 }).find((r) => r.code === 'POST_STATEMENT_DEBT')!
    expect(open).toMatchObject({ severity: 'BLOCKING', action: { type: 'ANSWER_CCR_QUESTIONS' } })
    const answered = buildDataRequirements({ ...base, postStatementDebt: { detected: true, accountCount: 2 }, unresolvedP1Count: 0 }).find((r) => r.code === 'POST_STATEMENT_DEBT')!
    expect(answered).toMatchObject({ severity: 'IMPROVES', action: { type: 'UPLOAD_BANK_STATEMENT' } })
    expect(answered.why).toMatch(/customer-declared, unverified/)
  })

  it('never tells anyone to add data to clear a compliance hold', () => {
    const r = buildDataRequirements({ ...base, complianceHold: true, complianceReason: 'related-party employer' }).find((x) => x.code === 'COMPLIANCE_HOLD')!
    expect(r.action.type).toBe('SUPERVISOR_REVIEW')
    expect(r.why).toMatch(/supervisor/)
  })

  it('splits low data quality honestly into flags a new statement can clear and flags no data can change', () => {
    const r = buildDataRequirements({
      ...base,
      dataQualityBand: 'LOW',
      dataQualityFlags: ['DATE_ALIGNMENT_WARNING', 'L1_DEBT_POST_STATEMENT', 'EMI_SCHEDULED_MISSING', 'SINGLE_SNAPSHOT', 'LOW_LIQUIDITY'],
    }).find((x) => x.code === 'DATA_QUALITY_LOW')!
    expect(r.detail).toEqual({ fixableByNewStatement: ['DATE_ALIGNMENT_WARNING', 'L1_DEBT_POST_STATEMENT'], structural: ['EMI_SCHEDULED_MISSING', 'SINGLE_SNAPSHOT'], reflectTransactions: ['LOW_LIQUIDITY'] })
    expect(r.why).toMatch(/not guaranteed/)
  })

  it('flags unanswered CCR questions as an improvement, not a block', () => {
    expect(buildDataRequirements({ ...base, unansweredCcrQuestions: 3 })[0]).toMatchObject({ code: 'CCR_QUESTIONS_OPEN', severity: 'IMPROVES' })
  })

  it('explains an unclassifiable alignment only when no clearer cause was already listed', () => {
    expect(codes({ alignmentState: null })).toContain('ALIGNMENT_UNCLASSIFIED')
    expect(codes({ alignmentState: null, l2DataAsOf: '2026-03-31T00:00:00.000Z' })).not.toContain('ALIGNMENT_UNCLASSIFIED')
  })
})
