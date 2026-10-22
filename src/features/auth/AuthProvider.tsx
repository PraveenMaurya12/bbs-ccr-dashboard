import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { env } from '@/lib/env'
import { refreshTokenStore } from '@/lib/refreshTokenStore'
import { tokenStore } from '@/lib/tokenStore'
import { apiRequest } from '@/services/api/client'
import { authService, type BackendAuthResponse, type BackendAuthUser } from './authService'
import type { AuthenticatedCcr, LoginCredentials } from './types'

type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  status: AuthStatus
  user: AuthenticatedCcr | null
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function clearSession() {
  tokenStore.clear()
  refreshTokenStore.clear()
}

interface BootstrapResult {
  status: AuthStatus
  user: AuthenticatedCcr | null
}

/**
 * Resolves the persisted-session bootstrap exactly once (no state updates
 * inside — those happen in the effect below). The refresh token the
 * backend hands back is single-use (rotated/revoked on exchange), so this
 * must not run twice: React StrictMode's dev-only mount→cleanup→mount
 * cycle would otherwise fire it twice for the same component instance, and
 * the second call would race the first with an already-revoked token.
 */
async function bootstrapSession(): Promise<BootstrapResult> {
  // Mock mode never restores a session across a reload — it always starts
  // unauthenticated and requires an explicit login.
  if (env.apiMode !== 'api') {
    return { status: 'unauthenticated', user: null }
  }

  const storedRefreshToken = refreshTokenStore.get()
  if (!storedRefreshToken) {
    return { status: 'unauthenticated', user: null }
  }

  try {
    // Exchange the persisted refresh token for a fresh access token …
    const refreshed = await apiRequest<BackendAuthResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: storedRefreshToken }),
    })
    tokenStore.set(refreshed.accessToken)
    refreshTokenStore.set(refreshed.refreshToken) // rotated — the old one is now revoked server-side

    // … then ask the backend who that token actually belongs to right now,
    // rather than trusting the refresh response alone (role/active status
    // may have changed since the token was issued).
    const me = await apiRequest<BackendAuthUser>('/auth/me')
    return { status: 'authenticated', user: { id: me.id, name: me.name, email: me.email, role: me.role } }
  } catch {
    clearSession()
    return { status: 'unauthenticated', user: null }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('initializing')
  const [user, setUser] = useState<AuthenticatedCcr | null>(null)
  const bootstrapPromise = useRef<Promise<BootstrapResult> | null>(null)

  useEffect(() => {
    let cancelled = false

    bootstrapPromise.current ??= bootstrapSession()

    bootstrapPromise.current.then((result) => {
      if (!cancelled) {
        setStatus(result.status)
        setUser(result.user)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (credentials: LoginCredentials) => {
    const authenticatedUser = await authService.login(credentials)
    setUser(authenticatedUser)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
