import type { PathwayInput } from '../pathway-engine.types'

/**
 * The plain params pathway-engine.service.ts extracts from the Cohort
 * Decision + Master Profile `getForLead()` COMPLETED shapes. Every field
 * is read verbatim from one of those two upstream services — this engine
 * never recomputes an L1-L4 fact itself. Where a needed signal is only
 * available as a Cohort Engine RULE's own evidence (overdue amount,
 * legal-status match, debt-cycle signal, active-account count, exception
 * tier), it is read from that rule's persisted `evidence` field directly,
 * never re-derived from raw Debt/Financial Analysis data.
 */
export interface NormalizeInputParams {
  leadId: string
  bbsLeadId: string
  cohortDecision: {
    primaryCohort: string | null
    primaryState: string | null
    primaryReasonCode: string | null
    secondaryFlags: Array<{ key: string; label: string; reason: string }> | null
    capacityBand: string | null
    archetype: string | null
    confidence: string | null
    complianceHold: boolean
    complianceReason: string | null
    specialistReviewRequired: boolean
    manualReviewRequired: boolean
    lifecycleState: string | null
    version: number | null
    generatedAt: string | null
    ruleResults: Array<{ ruleId: string; matched: boolean; evidence: Record<string, unknown> }>
  }
  masterProfile: {
    version: number | null
    generatedAt: string | null
    dataQualityBand: string | null
    dataQualityFlags: string[]
    missingInformation: Array<{ priority: string }>
    resolutionCapacity: string | null
    dimensionConfidences: unknown
    bureauDsrPercent: number | null
    bankDsrPercent: number | null
    masterDsrPercent: number | null
  } | null
}

function findRuleEvidence(ruleResults: NormalizeInputParams['cohortDecision']['ruleResults'], ruleId: string): Record<string, unknown> | undefined {
  return ruleResults.find((r) => r.ruleId === ruleId)?.evidence
}

function ruleMatched(ruleResults: NormalizeInputParams['cohortDecision']['ruleResults'], ruleId: string): boolean {
  return ruleResults.some((r) => r.ruleId === ruleId && r.matched)
}

export function buildPathwayInput(params: NormalizeInputParams): PathwayInput {
  const { cohortDecision: cd, masterProfile: mp } = params

  const r008 = findRuleEvidence(cd.ruleResults, 'R008')
  const r012 = findRuleEvidence(cd.ruleResults, 'R012')
  const r021 = findRuleEvidence(cd.ruleResults, 'R021')
  const debtCycleSignal = ruleMatched(cd.ruleResults, 'R009') || ruleMatched(cd.ruleResults, 'R010')
  const legalStatusActive = ruleMatched(cd.ruleResults, 'R006')
  const currentOverdue = typeof r008?.currentOverdue === 'number' ? r008.currentOverdue : null
  const activeAccounts = typeof r012?.activeAccounts === 'number' ? r012.activeAccounts : null
  const exceptionTier = (r021?.tier as 'NONE' | 'SPECIALIST' | 'MANUAL_REVIEW' | undefined) ?? null
  const exceptionCount = typeof r021?.exceptionCount === 'number' ? r021.exceptionCount : null

  const dataQualityFlags = mp?.dataQualityFlags ?? []
  const fcfReconciled = mp?.dataQualityBand == null ? null : !dataQualityFlags.includes('FCF_UNRECONCILED')
  const p1Count = mp ? mp.missingInformation.filter((i) => i.priority === 'P1').length : 0

  return {
    leadId: params.leadId,
    bbsLeadId: params.bbsLeadId,
    l4: {
      decisionId: null, // filled in by the service, which alone has the raw Prisma row id
      version: cd.version,
      generatedAt: cd.generatedAt,
      primaryCohort: cd.primaryCohort as PathwayInput['l4']['primaryCohort'],
      primaryState: cd.primaryState as PathwayInput['l4']['primaryState'],
      primaryReasonCode: cd.primaryReasonCode as PathwayInput['l4']['primaryReasonCode'],
      secondaryFlags: cd.secondaryFlags ?? [],
      capacityBand: cd.capacityBand as PathwayInput['l4']['capacityBand'],
      archetype: cd.archetype as PathwayInput['l4']['archetype'],
      confidence: cd.confidence as PathwayInput['l4']['confidence'],
      complianceHold: cd.complianceHold,
      complianceReason: cd.complianceReason,
      specialistReviewRequired: cd.specialistReviewRequired,
      manualReviewRequired: cd.manualReviewRequired,
      lifecycleState: cd.lifecycleState,
      currentOverdue,
      legalStatusActive,
      debtCycleSignal,
      activeAccounts,
      exceptionTier,
      exceptionCount,
    },
    l3: {
      version: mp?.version ?? null,
      generatedAt: mp?.generatedAt ?? null,
      dataQualityBand: mp?.dataQualityBand as PathwayInput['l3']['dataQualityBand'],
      fcfReconciled,
      p1Count,
      resolutionCapacity: mp?.resolutionCapacity ?? null,
      incomeCashFlowConfidence: ((mp?.dimensionConfidences as Record<string, string> | null)?.INCOME_CASH_FLOW as PathwayInput['l3']['incomeCashFlowConfidence']) ?? null,
      alignmentCapacityConfidence: ((mp?.dimensionConfidences as Record<string, string> | null)?.ALIGNMENT_CAPACITY as PathwayInput['l3']['alignmentCapacityConfidence']) ?? null,
      bureauDsrPercent: mp?.bureauDsrPercent ?? null,
      bankDsrPercent: mp?.bankDsrPercent ?? null,
      masterDsrPercent: mp?.masterDsrPercent ?? null,
    },
  }
}
