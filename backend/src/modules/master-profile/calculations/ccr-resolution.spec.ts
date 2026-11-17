import { applyCcrResolutions, type CcrAnswerForResolution } from './ccr-resolution'
import type { MissingInformationItemResult } from '../master-profile.types'

const p1Item: MissingInformationItemResult = { itemText: 'Purpose of borrowing: Bajaj Finance Limited (opened 2026-08-12, post-statement)', sourceModule: 'L1', priority: 'P1' }
const l2Item: MissingInformationItemResult = { itemText: 'Each uploaded statement is analyzed independently; no other statement is currently on file.', sourceModule: 'L2', priority: 'P2' }
const l1Caveat: MissingInformationItemResult = { itemText: 'Not available at L1.', sourceModule: 'L1', priority: 'P2' }

const answer = (over: Partial<CcrAnswerForResolution>): CcrAnswerForResolution => ({ source: 'MASTER_PROFILE', questionText: p1Item.itemText, responseStatus: 'ANSWERED', answerText: 'Medical emergency', ...over })

describe('applyCcrResolutions', () => {
  it('resolves a Master Profile P1 item the CCR answered, labelled as CCR-declared', () => {
    const [r] = applyCcrResolutions([p1Item], [answer({})])
    expect(r).toMatchObject({ resolved: true, resolutionSource: 'CCR_DECLARED' })
  })

  it('leaves the item open for "not known", "declined", or a blank answer — nothing was learned', () => {
    for (const a of [answer({ responseStatus: 'NOT_KNOWN', answerText: null }), answer({ responseStatus: 'CUSTOMER_DECLINED', answerText: null }), answer({ answerText: '   ' })]) {
      expect(applyCcrResolutions([p1Item], [a])[0]).toMatchObject({ resolved: false, resolutionSource: null })
    }
  })

  it('does not resolve an item from an answer to a different question', () => {
    expect(applyCcrResolutions([p1Item], [answer({ questionText: 'Purpose of borrowing: SBI Cards (opened 2026-06-22, post-statement)' })])[0].resolved).toBe(false)
  })

  it('resolves an L2 register item from its "Regarding <category>: <description>" question', () => {
    const q = answer({ source: 'L2_FINANCIAL_ANALYSIS', questionText: `Regarding multi-account aggregation: ${l2Item.itemText}` })
    expect(applyCcrResolutions([l2Item], [q])[0]).toMatchObject({ resolved: true, resolutionSource: 'CCR_DECLARED' })
  })

  it('never resolves L1 system caveats, which are not questions to the customer', () => {
    const q = answer({ source: 'L1_DEBT_ANALYSIS', questionText: 'Not available at L1.' })
    expect(applyCcrResolutions([l1Caveat], [q])[0].resolved).toBe(false)
  })

  it("does not let an L1 or L2 answer resolve a Master Profile item with coincidentally similar text", () => {
    expect(applyCcrResolutions([p1Item], [answer({ source: 'L1_DEBT_ANALYSIS' })])[0].resolved).toBe(false)
  })

  it('keeps unanswered items unresolved and preserves their text and priority', () => {
    expect(applyCcrResolutions([p1Item, l1Caveat], [])).toEqual([
      { ...p1Item, resolved: false, resolutionSource: null },
      { ...l1Caveat, resolved: false, resolutionSource: null },
    ])
  })
})
