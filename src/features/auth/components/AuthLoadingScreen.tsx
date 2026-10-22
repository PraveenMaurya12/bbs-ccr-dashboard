import { Loader2 } from 'lucide-react'

import { BrandLockup } from './BrandLockup'

/** Shown while AuthProvider is verifying a persisted session — never let the dashboard or login form flash before that resolves. */
export function AuthLoadingScreen() {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 bg-white p-6">
      <BrandLockup />
      <Loader2 className="text-muted-foreground size-6 animate-spin" aria-hidden="true" />
      <p className="sr-only" role="status">
        Checking your session…
      </p>
    </div>
  )
}
