import { computeLiveTtlStatus, computePathwayTtl } from './ttl'
import { testConfig } from './test-helpers'

describe('computePathwayTtl (§12.2 — fixed per-pathway TTL table)', () => {
  const config = testConfig()
  const now = new Date('2026-10-08T00:00:00.000Z')

  it('null pathway -> no TTL at all (N/A for BLOCKED, §22.3\'s own worked example)', () => {
    expect(computePathwayTtl(null, now, config)).toEqual({ pathwayTtlDays: null, ttlExpiresAt: null, invalidationTriggers: [] })
  })

  it.each([
    ['STABILISE', 30],
    ['OPTIMISE', 90],
    ['CONSOLIDATE', 45],
    ['RESTRUCTURE', 45],
    ['RESOLVE', 60],
    ['RECOVER', 180],
  ] as const)('%s gets a %i-day TTL', (pathway, days) => {
    const result = computePathwayTtl(pathway, now, config)
    expect(result.pathwayTtlDays).toBe(days)
    expect(result.ttlExpiresAt!.getTime()).toBe(now.getTime() + days * 24 * 60 * 60 * 1000)
  })

  it('carries §12.3\'s own invalidation triggers', () => {
    const result = computePathwayTtl('STABILISE', now, config)
    expect(result.invalidationTriggers).toEqual(expect.arrayContaining(['L4 re-evaluation (new cohort)', 'Compliance hold added', 'Customer decline']))
  })
})

describe('computeLiveTtlStatus (§12.4/§12.5 — computed fresh on every read)', () => {
  const expiresAt = new Date('2026-11-07T00:00:00.000Z')

  it('NOT_APPLICABLE when there is no TTL at all', () => {
    expect(computeLiveTtlStatus(null, null, null, new Date('2026-10-08T00:00:00.000Z'))).toBe('NOT_APPLICABLE')
  })
  it('ACTIVE before expiry', () => {
    expect(computeLiveTtlStatus(expiresAt, null, null, new Date('2026-10-20T00:00:00.000Z'))).toBe('ACTIVE')
  })
  it('EXPIRED after expiry, never presented', () => {
    expect(computeLiveTtlStatus(expiresAt, null, null, new Date('2026-11-08T00:00:00.000Z'))).toBe('EXPIRED')
  })
  it('EXPIRED_UNACCEPTED after expiry, presented but not accepted', () => {
    expect(computeLiveTtlStatus(expiresAt, new Date('2026-10-10T00:00:00.000Z'), null, new Date('2026-11-08T00:00:00.000Z'))).toBe('EXPIRED_UNACCEPTED')
  })
  it('ACCEPTED_NO_EXPIRY once accepted, regardless of the clock (§12.4: "Accepted and in execution -> No expiration")', () => {
    expect(computeLiveTtlStatus(expiresAt, new Date('2026-10-10T00:00:00.000Z'), new Date('2026-10-12T00:00:00.000Z'), new Date('2027-01-01T00:00:00.000Z'))).toBe('ACCEPTED_NO_EXPIRY')
  })
})
