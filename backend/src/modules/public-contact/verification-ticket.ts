import { createHmac, timingSafeEqual } from 'node:crypto'

const TICKET_TTL_MS = 10 * 60 * 1000

/**
 * A short-lived, server-signed proof that a specific mobile number just
 * passed real OTP verification. `submitLead` requires and re-validates
 * this ticket, so a client cannot skip OTP by calling the submit endpoint
 * directly — the signature can only have been produced by this server, for
 * this mobile, within the last 10 minutes.
 */
export function issueVerificationTicket(mobile: string, secret: string): string {
  const expiresAt = Date.now() + TICKET_TTL_MS
  const payload = `${mobile}.${expiresAt}`
  const signature = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}.${signature}`).toString('base64url')
}

export function verifyTicket(ticket: string, mobile: string, secret: string): boolean {
  let decoded: string
  try {
    decoded = Buffer.from(ticket, 'base64url').toString('utf8')
  } catch {
    return false
  }

  const parts = decoded.split('.')
  if (parts.length !== 3) return false
  const [ticketMobile, expiresAtRaw, signature] = parts as [string, string, string]

  if (ticketMobile !== mobile) return false

  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false

  const expectedSignature = createHmac('sha256', secret)
    .update(`${ticketMobile}.${expiresAtRaw}`)
    .digest('hex')

  const expectedBuf = Buffer.from(expectedSignature, 'hex')
  const actualBuf = Buffer.from(signature, 'hex')
  if (expectedBuf.length !== actualBuf.length) return false

  return timingSafeEqual(expectedBuf, actualBuf)
}
