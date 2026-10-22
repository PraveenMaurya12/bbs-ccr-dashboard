import { env } from '@/lib/env'
import { tokenStore } from '@/lib/tokenStore'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface BackendErrorEnvelope {
  success: false
  statusCode: number
  message?: string | string[]
}

interface BackendSuccessEnvelope<T> {
  success: true
  data: T
}

/**
 * Fetch wrapper for the real backend. Attaches the in-memory bearer token
 * (if any) and unwraps the backend's `{ success, data }` response envelope
 * — callers just get `T` back, or an `ApiError` carrying the HTTP status.
 */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = tokenStore.get()

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const errorBody = body as BackendErrorEnvelope | null
    const message = Array.isArray(errorBody?.message)
      ? errorBody.message.join(', ')
      : (errorBody?.message ?? `Request to ${path} failed`)
    throw new ApiError(message, response.status)
  }

  return (body as BackendSuccessEnvelope<T>).data
}
