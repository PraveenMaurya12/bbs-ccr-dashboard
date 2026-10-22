import type { PathwayEngineConfig, PathwayInput } from '../pathway-engine.types'

export function testConfig(overrides: Partial<PathwayEngineConfig> = {}): PathwayEngineConfig {
  return {
    ruleVersion: 'BBS_PATHWAY_V3.0',
    ttlDaysByPathway: { OPTIMISE: 90, STABILISE: 30, CONSOLIDATE: 45, RESTRUCTURE: 45, RESOLVE: 60, RECOVER: 180 },
    confidenceCapByDqBand: { HIGH: 'HIGH', MODERATE: 'MEDIUM', LOW_MODERATE: 'LOW', LOW: 'LOW', INSUFFICIENT: 'UNRESOLVED' },
    ...overrides,
  }
}

export interface PathwayInputOverrides {
  l4?: Partial<PathwayInput['l4']>
  l3?: Partial<PathwayInput['l3']>
}

/** A clean, fully-available, READY C3 baseline — individual tests override only what they need. */
export function cleanPathwayInput(overrides: PathwayInputOverrides = {}): PathwayInput {
  return {
    leadId: 'lead-1',
    bbsLeadId: 'BBS-LD-100001',
    l4: {
      decisionId: 'cd-1',
      version: 1,
      generatedAt: '2026-10-08T00:00:00.000Z',
      primaryCohort: 'C3',
      primaryState: 'C3',
      primaryReasonCode: null,
      secondaryFlags: [],
      capacityBand: 'STRESSED',
      archetype: 'CIRCUMSTANTIAL',
      confidence: 'HIGH',
      complianceHold: false,
      complianceReason: null,
      specialistReviewRequired: false,
      manualReviewRequired: false,
      lifecycleState: 'CCR_REVIEW',
      currentOverdue: 0,
      legalStatusActive: false,
      debtCycleSignal: false,
      activeAccounts: 3,
      exceptionTier: 'NONE',
      exceptionCount: 0,
      ...overrides.l4,
    },
    l3: {
      version: 1,
      generatedAt: '2026-10-08T00:00:00.000Z',
      dataQualityBand: 'HIGH',
      fcfReconciled: true,
      p1Count: 0,
      resolutionCapacity: 'STRONG',
      incomeCashFlowConfidence: 'HIGH',
      alignmentCapacityConfidence: 'HIGH',
      bureauDsrPercent: 30,
      bankDsrPercent: 28,
      masterDsrPercent: 45,
      ...overrides.l3,
    },
  }
}
