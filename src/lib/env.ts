export type ApiMode = 'mock' | 'api'

function resolveApiMode(): ApiMode {
  return import.meta.env.VITE_API_MODE === 'api' ? 'api' : 'mock'
}

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  /** 'mock' (default) keeps every screen on in-memory fixtures. 'api' switches select services to the real backend. */
  apiMode: resolveApiMode(),
} as const
