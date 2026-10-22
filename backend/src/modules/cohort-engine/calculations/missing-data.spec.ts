import { assessMissingDataAndDocuments } from './missing-data'
import { cleanCohortInput } from './test-helpers'

describe('assessMissingDataAndDocuments', () => {
  it('returns no missing-data items for a fully-ready, consented, clean lead', () => {
    const result = assessMissingDataAndDocuments(cleanCohortInput())
    expect(result.missingData).toEqual([])
  })

  it('flags a missing bank statement with its required document and next action, never a dead end', () => {
    const input = cleanCohortInput({ readiness: { ...cleanCohortInput().readiness, financialAnalysisComplete: false } })
    const result = assessMissingDataAndDocuments(input)
    const item = result.missingData.find((m) => m.field === 'bankStatement')
    expect(item).toBeDefined()
    expect(item!.document).toBeTruthy()
    expect(item!.owner).toBeTruthy()
    expect(item!.nextAction.length).toBeGreaterThan(0)
    expect(result.requiredDocuments).toContain('Bank statement (last 12 months)')
  })

  it('flags consent and PAN/KYC gaps independently', () => {
    const input = cleanCohortInput({ lead: { ...cleanCohortInput().lead, consentGranted: false, panAvailable: false } })
    const result = assessMissingDataAndDocuments(input)
    expect(result.missingData.some((m) => m.field === 'consent')).toBe(true)
    expect(result.missingData.some((m) => m.field === 'panKyc')).toBe(true)
  })
})
