import { createHmac, timingSafeEqual } from 'node:crypto'

// Deliberately longer than a typical "click straight after minting" ticket
// scheme needs: the frontend prefetches one ticket per visible document as
// soon as the list loads (see DocumentsTab), specifically so the eventual
// "View" click can call window.open() with zero async work in between —
// Chromium silently blocks a popup's navigation (and locks the window handle
// behind a cross-origin SecurityError) once the click's user-activation
// window has lapsed, which a real network round-trip reliably does. Five
// minutes comfortably covers "page loaded, user looks around, then clicks".
const TICKET_TTL_MS = 5 * 60 * 1000

export interface ViewTicketPayload {
  documentId: string
  userId: string
}

/**
 * A short-lived, server-signed proof that an already-authenticated request
 * (see DocumentsController.issueViewTicket) is allowed to fetch one specific
 * document. Exists because browsers won't let a script attach an
 * Authorization header to a plain `<a target="_blank">`/`window.open()`
 * navigation, and (as of a fairly recent Chrome security tightening) won't
 * let a *different* tab navigate to a blob: URL created in the tab that
 * fetched it either — so opening a protected document in a real new tab
 * needs a URL that is itself the proof of authorization, scoped tightly
 * (one document, one user, ~2 minutes) so it's safe to put in a query
 * string. The issuing user's id travels with the ticket so a ticket-
 * authenticated view still attributes a real, non-null user in
 * DocumentAccessLog — not a different trust boundary than the normal
 * Bearer-JWT-authenticated endpoints, just a different transport for it.
 */
export function issueViewTicket(payload: ViewTicketPayload, secret: string): string {
  const expiresAt = Date.now() + TICKET_TTL_MS
  const body = `${payload.documentId}.${payload.userId}.${expiresAt}`
  const signature = createHmac('sha256', secret).update(body).digest('hex')
  return Buffer.from(`${body}.${signature}`).toString('base64url')
}

export function verifyViewTicket(ticket: string, documentId: string, secret: string): ViewTicketPayload | null {
  let decoded: string
  try {
    decoded = Buffer.from(ticket, 'base64url').toString('utf8')
  } catch {
    return null
  }

  const parts = decoded.split('.')
  if (parts.length !== 4) return null
  const [ticketDocumentId, userId, expiresAtRaw, signature] = parts as [string, string, string, string]

  if (ticketDocumentId !== documentId) return null

  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null

  const expectedSignature = createHmac('sha256', secret)
    .update(`${ticketDocumentId}.${userId}.${expiresAtRaw}`)
    .digest('hex')

  const expectedBuf = Buffer.from(expectedSignature, 'hex')
  const actualBuf = Buffer.from(signature, 'hex')
  if (expectedBuf.length !== actualBuf.length) return null
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null

  return { documentId: ticketDocumentId, userId }
}
