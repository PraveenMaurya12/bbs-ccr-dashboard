import { explainBlock, type BlockExplanationInput } from './block-explanation'

const base: BlockExplanationInput = { blockCode: 'SPECIALIST_REQUIRED', secondaryFlagKeys: [], ruleEvidence: {}, dataQualityFlags: [], p1Open: 0 }

describe('explainBlock', () => {
  it('returns nothing when there is no block', () => {
    expect(explainBlock({ ...base, blockCode: null })).toBeNull()
  })

  it('explains a legal-status specialist block from the actual evidence, and says more data will not clear it', () => {
    const r = explainBlock({ ...base, ruleEvidence: { R006: { matched: true, evidence: { suitFiled: true, willfulDefault: false, arcAssigned: true } } } })!
    expect(r.whyThisLead[0]).toContain('a suit has been filed')
    expect(r.whyThisLead[0]).toContain('asset-reconstruction company')
    expect(r.whyThisLead[0]).not.toContain('wilful')
    expect(r.whatToDo.join(' ')).toMatch(/adding more data does not change it/)
    expect(r.whoCanClear).toMatch(/supervisor/)
  })

  it('explains an exception-count specialist block with the count, the flags, and which a statement can clear', () => {
    const r = explainBlock({
      ...base,
      ruleEvidence: { R021: { matched: true, evidence: { exceptionCount: 6, tier: 'SPECIALIST' } } },
      dataQualityFlags: ['DATE_ALIGNMENT_WARNING', 'L1_DEBT_POST_STATEMENT', 'EMI_SCHEDULED_MISSING', 'SINGLE_SNAPSHOT', 'HISTORY_INCOMPLETE', 'RECONCILIATION_FAILED'],
    })!
    expect(r.whyThisLead[0]).toContain('6 data issues')
    expect(r.whyThisLead[0]).toContain('EMI_SCHEDULED_MISSING')
    expect(r.whatToDo[0]).toMatch(/clear 2 of them \(DATE_ALIGNMENT_WARNING, L1_DEBT_POST_STATEMENT/)
    expect(r.whatToDo.join(' ')).toMatch(/does not guarantee/)
  })

  it('says a document cannot help when none of the active issues are statement-clearable', () => {
    const r = explainBlock({ ...base, ruleEvidence: { R021: { matched: true, evidence: { exceptionCount: 5, tier: 'SPECIALIST' } } }, dataQualityFlags: ['EMI_SCHEDULED_MISSING', 'SINGLE_SNAPSHOT'] })!
    expect(r.whatToDo[0]).toMatch(/None of the active issues can be cleared by adding a new document/)
  })

  it('lists secondary matches as "also matched", not as extra blockers, in plain words', () => {
    const r = explainBlock({ ...base, secondaryFlagKeys: ['SPECIALIST_REQUIRED', 'C5', 'BORROWING_TO_REPAY'] })!
    expect(r.alsoMatched).toEqual([
      { code: 'C5', label: expect.stringMatching(/borrowing to keep up/) },
      { code: 'BORROWING_TO_REPAY', label: expect.stringMatching(/repay existing debt/) },
    ])
  })

  it('sends CCR_REQUIRED to the blocking questions with the open count', () => {
    const r = explainBlock({ ...base, blockCode: 'CCR_REQUIRED', p1Open: 3 })!
    expect(r.whyThisLead).toEqual(['3 critical item(s) are unresolved.'])
    expect(r.whatToDo[0]).toMatch(/Blocking items from the Master Profile/)
  })

  it('never offers added data as the way to clear a compliance hold', () => {
    const r = explainBlock({ ...base, blockCode: 'COMPLIANCE_HOLD' })!
    expect(r.whoCanClear).toMatch(/Adding data does not clear it/)
  })

  it('falls back to a generic explanation for an unknown code', () => {
    expect(explainBlock({ ...base, blockCode: 'SOMETHING_NEW' })!.meaning).toContain('something new')
  })
})
