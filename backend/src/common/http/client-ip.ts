const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV4_MAPPED_PREFIX = '::ffff:'

/**
 * Strips Node's IPv6-mapped-IPv4 prefix (e.g. `::ffff:127.0.0.1`) and
 * validates the result has a plausible IPv4/IPv6 shape — never fabricates
 * anything, only normalizes/validates a value Express itself already
 * resolved (see extractClientIp below). Returns null for anything that
 * doesn't look like a real address. Used for audit/security client-IP
 * capture (e.g. ConsentRecord.ipAddress) only — Signzy never reads this or
 * any other client-IP value (see SIGNZY_FIXED_REQUEST_VALUES in
 * signzy-http-client.ts).
 */
export function normalizeClientIp(rawIp: string | null | undefined): string | null {
  if (!rawIp) return null
  let ip = rawIp.trim()
  if (!ip) return null

  if (ip.toLowerCase().startsWith(IPV4_MAPPED_PREFIX)) {
    const unwrapped = ip.slice(IPV4_MAPPED_PREFIX.length)
    if (IPV4_PATTERN.test(unwrapped)) ip = unwrapped
  }

  if (IPV4_PATTERN.test(ip)) return ip
  // Loose shape check only — real RFC 4291 validation is involved, and
  // Express's own `trust proxy` + proxy-addr handling (see main.ts's
  // configureApp) has already done the actual parsing of any
  // X-Forwarded-For chain; this just guards against an obviously-garbage
  // value (not a real address at all) reaching Signzy.
  if (ip.includes(':') && /^[0-9a-fA-F:]+$/.test(ip)) return ip
  return null
}

/**
 * The real client IP for this request — ALWAYS reads Express's own
 * already-resolved `request.ip`, never a forwarded header directly. Which
 * hop (if any) `request.ip` trusts is controlled entirely by the
 * `trust proxy` setting applied once, centrally, in main.ts's
 * configureApp (driven by `TRUST_PROXY_HOPS`) — reading a header like
 * X-Forwarded-For here instead would let an untrusted direct client simply
 * forge it.
 */
export function extractClientIp(request: { ip?: string }): string | null {
  return normalizeClientIp(request.ip)
}
