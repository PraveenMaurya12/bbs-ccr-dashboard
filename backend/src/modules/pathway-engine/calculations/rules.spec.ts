import {
  p001GateAndBlockInheritance,
  p004ArchetypeInfluence,
  p005FcfReconciliationGate,
  p006ComplianceGate,
  p007SpecialistReviewGate,
  p010ResolutionCapacityInheritance,
  p011ProductAvailabilityCheck,
  p012LenderApprovalRequirement,
  p013DataQualityBandCap,
  p014DimensionConfidenceCap,
  p015ExceptionCountThreshold,
  p016P1MissingInfoThreshold,
  p017SequentialPathwayLogic,
  p018NinetyDayEligibility,
  p019PathwayPrecedence,
  p020AlternativePathwayDetermination,
} from './rules'
import { cleanPathwayInput, testConfig } from './test-helpers'

const V = testConfig().ruleVersion

describe('P001 — L4 gate + block inheritance', () => {
  it('FIRED when L4 is BLOCKED', () => {
    expect(p001GateAndBlockInheritance(cleanPathwayInput({ l4: { primaryState: 'BLOCKED', primaryCohort: 'COMPLIANCE_HOLD' } }), V).evaluation).toBe('FIRED')
  })
  it('NOT_FIRED when L4 is a real terminal cohort', () => {
    expect(p001GateAndBlockInheritance(cleanPathwayInput(), V).evaluation).toBe('NOT_FIRED')
  })
  it('FIRED for X1/X2/C6', () => {
    for (const cohort of ['X1', 'X2', 'C6'] as const) {
      expect(p001GateAndBlockInheritance(cleanPathwayInput({ l4: { primaryState: cohort, primaryCohort: cohort } }), V).evaluation).toBe('FIRED')
    }
  })
})

describe('P004 — archetype influence (soft signal, never decisive)', () => {
  it('FIRED for a determinate archetype', () => {
    expect(p004ArchetypeInfluence(cleanPathwayInput({ l4: { archetype: 'DEBT_SPIRAL' } }), V).evaluation).toBe('FIRED')
  })
  it('NOT_FIRED for UNCLASSIFIED', () => {
    expect(p004ArchetypeInfluence(cleanPathwayInput({ l4: { archetype: 'UNCLASSIFIED' } }), V).evaluation).toBe('NOT_FIRED')
  })
})

describe('P005 — FCF reconciliation gate', () => {
  it('NOT_EVALUATED when FCF data is unavailable', () => {
    expect(p005FcfReconciliationGate(cleanPathwayInput({ l3: { fcfReconciled: null } }), V).evaluation).toBe('NOT_EVALUATED')
  })
  it('FIRED (blocks) when unreconciled', () => {
    expect(p005FcfReconciliationGate(cleanPathwayInput({ l3: { fcfReconciled: false } }), V).evaluation).toBe('FIRED')
  })
  it('NOT_FIRED when reconciled', () => {
    expect(p005FcfReconciliationGate(cleanPathwayInput({ l3: { fcfReconciled: true } }), V).evaluation).toBe('NOT_FIRED')
  })
})

describe('P006 — compliance gate (audit-only, folded into P001)', () => {
  it('FIRED when compliance hold active', () => {
    expect(p006ComplianceGate(cleanPathwayInput({ l4: { complianceHold: true } }), V).evaluation).toBe('FIRED')
  })
})

describe('P007 — specialist review gate', () => {
  it('FIRED when specialistReviewRequired', () => {
    expect(p007SpecialistReviewGate(cleanPathwayInput({ l4: { specialistReviewRequired: true } }), V).evaluation).toBe('FIRED')
  })
  it('FIRED for C6 even without the flag', () => {
    expect(p007SpecialistReviewGate(cleanPathwayInput({ l4: { primaryCohort: 'C6', specialistReviewRequired: false } }), V).evaluation).toBe('FIRED')
  })
})

describe('P010 — resolution capacity inheritance', () => {
  it('NOT_EVALUATED when L3 has no resolution capacity', () => {
    expect(p010ResolutionCapacityInheritance(cleanPathwayInput({ l3: { resolutionCapacity: null } }), V).evaluation).toBe('NOT_EVALUATED')
  })
  it('FIRED (copies through) when present', () => {
    const r = p010ResolutionCapacityInheritance(cleanPathwayInput({ l3: { resolutionCapacity: 'MARGINAL' } }), V)
    expect(r.evaluation).toBe('FIRED')
    expect(r.evidence.resolutionCapacity).toBe('MARGINAL')
  })
})

describe('P011/P012 — product availability / lender approval: always NOT_EVALUATED, no live integration', () => {
  it('P011 is always NOT_EVALUATED', () => expect(p011ProductAvailabilityCheck(V).evaluation).toBe('NOT_EVALUATED'))
  it('P012 is always NOT_EVALUATED', () => expect(p012LenderApprovalRequirement(V).evaluation).toBe('NOT_EVALUATED'))
})

describe('P013/P014 — DQ band cap / dimension confidence cap', () => {
  it('P013 NOT_EVALUATED when DQ band unavailable', () => expect(p013DataQualityBandCap(cleanPathwayInput({ l3: { dataQualityBand: null } }), V).evaluation).toBe('NOT_EVALUATED'))
  it('P013 FIRED when DQ band available', () => expect(p013DataQualityBandCap(cleanPathwayInput(), V).evaluation).toBe('FIRED'))
  it('P014 NOT_EVALUATED when any of the 4 dimensions is missing', () => expect(p014DimensionConfidenceCap(cleanPathwayInput({ l3: { incomeCashFlowConfidence: null } }), V).evaluation).toBe('NOT_EVALUATED'))
  it('P014 FIRED when all 4 dimensions are present', () => expect(p014DimensionConfidenceCap(cleanPathwayInput(), V).evaluation).toBe('FIRED'))
})

describe('P015 — exception count threshold (boundary: 4 proceeds, 5 specialist, 8 manual review)', () => {
  it('NONE tier -> NOT_FIRED', () => expect(p015ExceptionCountThreshold(cleanPathwayInput({ l4: { exceptionTier: 'NONE' } }), V).evaluation).toBe('NOT_FIRED'))
  it('SPECIALIST tier -> FIRED, MEDIUM severity', () => {
    const r = p015ExceptionCountThreshold(cleanPathwayInput({ l4: { exceptionTier: 'SPECIALIST', exceptionCount: 5 } }), V)
    expect(r.evaluation).toBe('FIRED')
    expect(r.severity).toBe('MEDIUM')
  })
  it('MANUAL_REVIEW tier -> FIRED, HIGH severity', () => {
    const r = p015ExceptionCountThreshold(cleanPathwayInput({ l4: { exceptionTier: 'MANUAL_REVIEW', exceptionCount: 8 } }), V)
    expect(r.evaluation).toBe('FIRED')
    expect(r.severity).toBe('HIGH')
  })
})

describe('P016 — P1 missing info threshold (boundary: 3 proceeds/flags, 4 blocks)', () => {
  it('3 -> NOT_FIRED (flagged, below threshold)', () => expect(p016P1MissingInfoThreshold(cleanPathwayInput({ l3: { p1Count: 3 } }), 4, V).evaluation).toBe('NOT_FIRED'))
  it('4 -> FIRED (blocks)', () => expect(p016P1MissingInfoThreshold(cleanPathwayInput({ l3: { p1Count: 4 } }), 4, V).evaluation).toBe('FIRED'))
})

describe('P017 — sequential pathway logic', () => {
  it('NOT_EVALUATED on first-ever evaluation', () => expect(p017SequentialPathwayLogic(false, null, 'STABILISE', V).evaluation).toBe('NOT_EVALUATED'))
  it('FIRED when the pathway changed', () => expect(p017SequentialPathwayLogic(true, 'STABILISE', 'CONSOLIDATE', V).evaluation).toBe('FIRED'))
  it('NOT_FIRED when unchanged', () => expect(p017SequentialPathwayLogic(true, 'STABILISE', 'STABILISE', V).evaluation).toBe('NOT_FIRED'))
})

describe('P018 — 90-day stabilisation eligibility (PROPOSED, never auto-selected)', () => {
  it('NOT_EVALUATED when primary pathway is not STABILISE', () => expect(p018NinetyDayEligibility(cleanPathwayInput(), 'RESTRUCTURE', V).evaluation).toBe('NOT_EVALUATED'))
  it('NOT_FIRED even when all internal (1-4) preconditions are met, because external (5-8) preconditions can never be confirmed in this codebase', () => {
    const input = cleanPathwayInput({ l4: { capacityBand: 'TIGHT', currentOverdue: 5000, complianceHold: false }, l3: { fcfReconciled: true } })
    const r = p018NinetyDayEligibility(input, 'STABILISE', V)
    expect(r.evaluation).toBe('NOT_FIRED')
    expect(r.evidence.internalPreconditionsMet).toBe(true)
    expect(r.evidence.externalPreconditionsAvailable).toBe(false)
  })
})

describe('P019/P020 — pathway precedence / alternative determination', () => {
  it('P019 always FIRED, reporting the matched priority', () => {
    const r = p019PathwayPrecedence(9, V)
    expect(r.evaluation).toBe('FIRED')
    expect(r.evidence.priority).toBe(9)
  })
  it('P020 NOT_EVALUATED when BLOCKED (no primary) — matches §22\'s own Praveenkumar example', () => {
    expect(p020AlternativePathwayDetermination(null, 'BLOCKED', 0, V).evaluation).toBe('NOT_EVALUATED')
  })
  it('P020 FIRED with a real alternatives count when READY', () => {
    const r = p020AlternativePathwayDetermination('RESTRUCTURE', 'READY', 2, V)
    expect(r.evaluation).toBe('FIRED')
    expect(r.evidence.alternativesCount).toBe(2)
  })
})
