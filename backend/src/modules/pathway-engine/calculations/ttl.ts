import type { CohortPathway, PathwayEngineConfig } from '../pathway-engine.types'

export interface PathwayTtlResult {
  pathwayTtlDays: number | null
  ttlExpiresAt: Date | null
  invalidationTriggers: string[]
}

/** §12.2's own fixed per-pathway TTL table. Only a real (non-null) selected pathway ever gets a TTL — a blocked/null pathway has no validity period to expire (§22.3's own worked example: `"ttl": {"pathway_ttl_days": null, ..., "note": "TTL applies only to selected pathways; N/A for BLOCKED"}`). */
export function computePathwayTtl(pathway: CohortPathway | null, generatedAt: Date, config: PathwayEngineConfig): PathwayTtlResult {
  if (pathway === null) return { pathwayTtlDays: null, ttlExpiresAt: null, invalidationTriggers: [] }
  const days = config.ttlDaysByPathway[pathway]
  const expiresAt = new Date(generatedAt.getTime() + days * 24 * 60 * 60 * 1000)
  // §12.3's own invalidation-triggers table, verbatim.
  const invalidationTriggers = ['L4 re-evaluation (new cohort)', 'Material income change', 'New debt detected', 'Compliance hold added', 'Customer decline', 'Lender decline']
  return { pathwayTtlDays: days, ttlExpiresAt: expiresAt, invalidationTriggers }
}

export type LiveTtlStatus = 'ACTIVE' | 'EXPIRED' | 'EXPIRED_UNACCEPTED' | 'ACCEPTED_NO_EXPIRY' | 'NOT_APPLICABLE'

/**
 * §12.4/§12.5 TTL enforcement, computed fresh on every read — never
 * trusting a persisted snapshot, same discipline Cohort Engine's own
 * compliance-aging state already uses. `presentedAt`/`acceptedAt` are
 * this engine's own schema fields (set only via an explicit future
 * CCR action — no customer portal exists in this dashboard to drive them
 * automatically today, a documented limitation, not a silent gap).
 */
export function computeLiveTtlStatus(ttlExpiresAt: Date | null, presentedAt: Date | null, acceptedAt: Date | null, now: Date): LiveTtlStatus {
  if (ttlExpiresAt === null) return 'NOT_APPLICABLE'
  if (acceptedAt !== null) return 'ACCEPTED_NO_EXPIRY'
  const expired = now.getTime() > ttlExpiresAt.getTime()
  if (!expired) return 'ACTIVE'
  return presentedAt !== null ? 'EXPIRED_UNACCEPTED' : 'EXPIRED'
}
