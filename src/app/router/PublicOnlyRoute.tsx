import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { useAuth } from '@/features/auth/AuthProvider'

interface LocationState {
  from?: { pathname: string }
}

/** Wraps /login (and similar). An already-authenticated user is bounced to the dashboard (or wherever they were headed) instead of seeing the login form again. */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'initializing') {
    return <AuthLoadingScreen />
  }

  if (status === 'authenticated') {
    const from = (location.state as LocationState | null)?.from?.pathname ?? '/dashboard'
    return <Navigate to={from} replace />
  }

  return children
}
