const STORAGE_KEY = 'bbs_ccr_refresh_token'

/**
 * Persists the refresh token (never the password, never the access token)
 * to localStorage — only written when the user checks "Keep me logged in"
 * during a real API-mode login. This is what lets a session survive a page
 * reload; without it, `tokenStore`'s in-memory access token is lost on
 * every reload and the user must sign in again.
 */
export const refreshTokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  },
  set: (token: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, token)
    } catch {
      // Storage unavailable (private browsing, etc.) — session just won't survive a reload.
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  },
}
