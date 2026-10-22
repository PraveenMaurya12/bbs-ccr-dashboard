/**
 * In-memory-only access token holder. Deliberately not persisted to
 * localStorage/sessionStorage — a page refresh clears it and the user must
 * log in again. That's a real limitation of this foundation (see README),
 * traded for not writing a bearer token to any browser-readable storage.
 */
let accessToken: string | null = null

export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token
  },
  clear: () => {
    accessToken = null
  },
}
