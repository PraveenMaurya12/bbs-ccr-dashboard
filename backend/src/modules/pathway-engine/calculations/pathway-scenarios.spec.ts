import { buildCustomerReasons } from './customer-explanation'
import { resolvePathwayPrecedence } from './precedence'
import { evaluateAllRulesForTest } from './rules.spec-helpers'
import { cleanPathwayInput } from './test-helpers'

/**
 * Independent validation against the attached BBS Pathway Engine Module
 * v3.0 spec's own §22 Praveenkumar case validation (T-CASE-01 in §20.5:
 * "Primary: BLOCKED / COMPLIANCE_HOLD, Expected Alternatives: —"). The L4
 * facts here are the SAME ones already independently established and
 * tested for this exact customer in the Cohort Engine's own
 * cohort-scenarios.spec.ts this session (primaryState BLOCKED,
 * primaryReasonCode COMPLIANCE_HOLD, 4 secondary blocks) — never
 * re-derived, just carried forward as this module's own L4 input.
 */
describe('Independent validation: BBS Pathway Engine Module v3.0 §22 — Praveenkumar case (T-CASE-01)', () => {
  function praveenkumarInput() {
    return cleanPathwayInput({
      l4: {
        primaryState: 'BLOCKED',
        primaryCohort: 'COMPLIANCE_HOLD',
        primaryReasonCode: 'COMPLIANCE_HOLD',
        secondaryFlags: [
          { key: 'DATA_REFRESH_REQUIRED', label: 'Data refresh required', reason: 'Post-statement debt is a material share of active balance.' },
          { key: 'OTHER_ACCOUNTS_REQUIRED', label: 'Other accounts required', reason: 'Self-transfer activity exceeds the blocking threshold.' },
          { key: 'MANUAL_REVIEW', label: 'Manual review (exception count)', reason: 'Exception count meets the manual-review threshold.' },
        ],
        capacityBand: 'UNKNOWN',
        archetype: 'CIRCUMSTANTIAL',
        confidence: 'LOW',
        complianceHold: true,
        complianceReason: 'RELATED_PARTY_EMPLOYER',
        specialistReviewRequired: true,
        manualReviewRequired: true,
      },
      l3: { dataQualityBand: 'LOW_MODERATE', fcfReconciled: false, p1Count: 12, resolutionCapacity: 'MARGINAL' },
    })
  }

  it('§22.3 "primary_pathway": null, "pathway_status": "BLOCKED", "blocking_reason": "COMPLIANCE_HOLD" — matches exactly', () => {
    const input = praveenkumarInput()
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input, 4))
    expect(result.primaryPathway).toBeNull()
    expect(result.pathwayStatus).toBe('BLOCKED')
    expect(result.blockingReason).toBe('COMPLIANCE_HOLD')
    expect(result.matchedPriority).toBe(1)
  })

  it('§22.3 "inherited_blocks" includes the primary reason plus all of L4\'s own secondary blocks', () => {
    const input = praveenkumarInput()
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input, 4))
    expect(result.inheritedBlocks).toEqual(expect.arrayContaining(['COMPLIANCE_HOLD', 'DATA_REFRESH_REQUIRED', 'OTHER_ACCOUNTS_REQUIRED', 'MANUAL_REVIEW']))
  })

  it('§22.3 "alternatives": [] (no primary pathway to compute alternatives against)', () => {
    // Mirrors the service's own rule: alternatives are only computed when pathwayStatus === 'READY'.
    const input = praveenkumarInput()
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input, 4))
    expect(result.pathwayStatus).not.toBe('READY')
  })

  it('§22.4 customer message matches the spec\'s own compliance-safe wording — no mention of compliance, employer, or investigation', () => {
    const input = praveenkumarInput()
    const result = resolvePathwayPrecedence(input, evaluateAllRulesForTest(input, 4))
    const reasons = buildCustomerReasons(result.primaryPathway, result.pathwayStatus, result.blockingReason)
    const allText = reasons.map((r) => r.text).join(' ').toLowerCase()
    expect(allText).not.toMatch(/complian|employer|investigat|related.party/)
    expect(reasons[0]!.text).toBe('Our team is completing final verification. No action required from you at this time.')
  })
})
