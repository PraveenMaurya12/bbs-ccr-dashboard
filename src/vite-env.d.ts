/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** 'mock' (default) or 'api' — see src/lib/env.ts */
  readonly VITE_API_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
