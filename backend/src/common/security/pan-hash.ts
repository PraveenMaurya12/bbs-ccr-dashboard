import { createHmac } from 'crypto'

/**
 * One-way hash of a raw PAN, used ONLY to detect a repeat submission from
 * the same identity (`Lead.panRef`/`Customer.panRef`) — the raw PAN itself
 * is never persisted anywhere in this schema. Shared by every caller that
 * captures a raw PAN transiently (the public contact form, and the
 * CCR-attested consent-capture action), so the hashing scheme can never
 * drift between them.
 */
export function hashPan(pan: string, pepper: string): string {
  return createHmac('sha256', pepper).update(pan.toUpperCase()).digest('hex')
}
