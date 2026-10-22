import type { MasterConfidenceLevel, MasterDataQualityBand } from '@/modules/master-profile/master-profile.types'
import type { CohortConfidenceLevel } from '@/modules/cohort-engine/cohort-engine.types'
import type { PathwayConfidenceLevel, PathwayEngineConfig, PathwayInput } from '../pathway-engine.types'

const RANK: Record<'HIGH' | 'MEDIUM' | 'LOW', number> = { HIGH: 3, MEDIUM: 2, LOW: 1 }
const FROM_RANK: Record<number, 'HIGH' | 'MEDIUM' | 'LOW'> = { 3: 'HIGH', 2: 'MEDIUM', 1: 'LOW' }

/**
 * §4.2 Method A — "Minimum of Key Dimensions" (default, no calibration
 * required; the spec's own recommended method until Method B is
 * calibrated). Reads 4 already-computed confidence values verbatim:
 *
 *   MIN(L3.income_cash_flow_confidence, L3.alignment_capacity_confidence,
 *       L4.capacity_confidence, L4.archetype_confidence)
 *
 * This codebase's Master Profile already exposes the first two by their
 * exact names (`dimensionConfidences.INCOME_CASH_FLOW` /
 * `.ALIGNMENT_CAPACITY`). Cohort Engine, however, computes only ONE
 * overall confidence rating — it has no separate capacity-specific or
 * archetype-specific confidence. Using that single value for BOTH
 * `L4.capacity_confidence` and `L4.archetype_confidence` is the most
 * honest substitution available (never a fabricated separate figure) —
 * documented here, not silently assumed to be two independent inputs.
 */
export function computeMethodAConfidence(income: MasterConfidenceLevel | null, alignment: MasterConfidenceLevel | null, l4Confidence: CohortConfidenceLevel | null): PathwayConfidenceLevel {
  const values = [income, alignment, l4Confidence, l4Confidence].filter((v): v is 'HIGH' | 'MEDIUM' | 'LOW' => v !== null)
  if (values.length < 4) return 'UNRESOLVED'
  const minRank = Math.min(...values.map((v) => RANK[v]))
  return FROM_RANK[minRank]!
}

/** §4.3 — "Pathway confidence cannot exceed L3 DQ band ceiling." */
export function applyDqBandCap(confidence: PathwayConfidenceLevel, dqBand: MasterDataQualityBand | null, config: PathwayEngineConfig): PathwayConfidenceLevel {
  if (dqBand === null) return confidence
  const cap = config.confidenceCapByDqBand[dqBand]
  if (confidence === 'UNRESOLVED' || cap === 'UNRESOLVED') return confidence === 'UNRESOLVED' ? confidence : cap
  const rankOf = (c: PathwayConfidenceLevel): number => (c === 'HIGH' ? 3 : c === 'MEDIUM' ? 2 : 1)
  return rankOf(confidence) <= rankOf(cap) ? confidence : cap
}

/** Combines Method A + the DQ-band cap into the one confidence value this engine persists — Method B (weighted composite) is PROPOSED/uncalibrated per §4.2's own banner and is never computed here. */
export function resolvePathwayConfidence(input: PathwayInput, config: PathwayEngineConfig): { confidence: PathwayConfidenceLevel; confidenceMethod: 'MIN_OF_DIMENSIONS' } {
  const raw = computeMethodAConfidence(input.l3.incomeCashFlowConfidence, input.l3.alignmentCapacityConfidence, input.l4.confidence)
  const capped = applyDqBandCap(raw, input.l3.dataQualityBand, config)
  return { confidence: capped, confidenceMethod: 'MIN_OF_DIMENSIONS' }
}
