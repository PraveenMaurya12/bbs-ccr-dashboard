import { buildComplianceRouting } from './compliance-routing'
import { buildMissingInformationRegister } from './missing-information-register'

const now = new Date('2026-10-22T00:00:00Z')

describe('buildComplianceRouting', () => {
  it('does NOT raise a compliance hold for a related-party employer match — it is not a blocker', () => {
    const routing = buildComplianceRouting({ detected: true, matchedName: 'ACME AFFILIATE LTD' }, now)
    expect(routing).toEqual({ complianceHold: false, reason: null, matchedEntity: null, since: null, slaHours: null, escalationHours: null })
  })

  it('reports no hold when nothing was detected', () => {
    expect(buildComplianceRouting({ detected: false, matchedName: null }, now).complianceHold).toBe(false)
  })

  it('therefore adds no P1 "related-party employment context" item to the missing-information register', () => {
    const routing = buildComplianceRouting({ detected: true, matchedName: 'ACME AFFILIATE LTD' }, now)
    const items = buildMissingInformationRegister([], [], routing, { detected: false, accountCount: 0, totalAmount: 0, repaymentUnverified: false, ccrPriority: null, accounts: [] }, { members: [], treatedAsEssentialPendingCcr: false })
    expect(items.filter((i) => i.priority === 'P1')).toEqual([])
  })
})
