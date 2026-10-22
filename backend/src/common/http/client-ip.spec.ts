import { extractClientIp, normalizeClientIp } from './client-ip'

describe('normalizeClientIp', () => {
  it('accepts a plain IPv4 client address', () => {
    expect(normalizeClientIp('203.0.113.5')).toBe('203.0.113.5')
  })

  it('accepts a plain IPv6 client address', () => {
    expect(normalizeClientIp('2001:db8::1')).toBe('2001:db8::1')
  })

  it('unwraps an IPv6-mapped IPv4 address (::ffff:x.x.x.x) down to the plain IPv4 form', () => {
    expect(normalizeClientIp('::ffff:203.0.113.5')).toBe('203.0.113.5')
  })

  it('returns null for a missing IP, never fabricating one', () => {
    expect(normalizeClientIp(null)).toBeNull()
    expect(normalizeClientIp(undefined)).toBeNull()
    expect(normalizeClientIp('')).toBeNull()
    expect(normalizeClientIp('   ')).toBeNull()
  })

  it('returns null for a value that is not a plausible IP at all', () => {
    expect(normalizeClientIp('not-an-ip')).toBeNull()
    expect(normalizeClientIp('<script>')).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeClientIp('  203.0.113.5  ')).toBe('203.0.113.5')
  })
})

describe('extractClientIp', () => {
  it('reads request.ip exactly as Express already resolved it (IPv4 client, no proxy)', () => {
    expect(extractClientIp({ ip: '203.0.113.5' })).toBe('203.0.113.5')
  })

  it('reads request.ip exactly as Express already resolved it (IPv6 client, no proxy)', () => {
    expect(extractClientIp({ ip: '2001:db8::1' })).toBe('2001:db8::1')
  })

  it('returns null when request.ip is missing (e.g. an unusual transport with no socket address)', () => {
    expect(extractClientIp({})).toBeNull()
  })
})
