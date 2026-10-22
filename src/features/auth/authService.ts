import { env } from '@/lib/env'
import { refreshTokenStore } from '@/lib/refreshTokenStore'
import { tokenStore } from '@/lib/tokenStore'
import { apiRequest } from '@/services/api/client'
import { delay } from '@/services/mock/delay'
import type { AuthenticatedCcr, LoginCredentials } from './types'

export interface AuthService {
  login(credentials: LoginCredentials): Promise<AuthenticatedCcr>
}

export interface BackendAuthUser {
  id: string
  email: string
  name: string
  role: 'CCR' | 'SUPERVISOR' | 'ADMIN'
}

export interface BackendAuthResponse {
  accessToken: string
  refreshToken: string
  user: BackendAuthUser
}

function toAuthenticatedCcr(user: BackendAuthUser): AuthenticatedCcr {
  return { id: user.id, name: user.name, email: user.email, role: user.role }
}

/**
 * Development-only mock authentication. Any well-formed credentials
 * "succeed" after a simulated delay — used whenever VITE_API_MODE is
 * 'mock' (the default). Never persists anything across a reload: mock
 * mode always starts unauthenticated, on purpose.
 */
class MockAuthService implements AuthService {
  async login(credentials: LoginCredentials): Promise<AuthenticatedCcr> {
    await delay(null, 900)

    return {
      id: 'ccr-mock-01',
      name: 'CCR Agent',
      email: credentials.email,
      // Mock mode has no real role concept — SUPERVISOR here only so the
      // Cohort Engine override action is reachable/demonstrable in mock mode.
      role: 'SUPERVISOR',
    }
  }
}

/** Calls the real backend. Stores the access token in memory only (see tokenStore). */
class ApiAuthService implements AuthService {
  async login(credentials: LoginCredentials): Promise<AuthenticatedCcr> {
    const response = await apiRequest<BackendAuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    })

    tokenStore.set(response.accessToken)

    // Only persist the refresh token (never the access token, never the
    // password) when the user opted in via "Keep me logged in" — otherwise
    // the session is memory-only and ends the moment the page reloads.
    if (credentials.keepLoggedIn) {
      refreshTokenStore.set(response.refreshToken)
    } else {
      refreshTokenStore.clear()
    }

    return toAuthenticatedCcr(response.user)
  }
}

export const authService: AuthService =
  env.apiMode === 'api' ? new ApiAuthService() : new MockAuthService()
