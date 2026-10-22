import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { useAuth } from '@/features/auth/AuthProvider'

/** Gates every dashboard route. Redirects to /login (preserving the attempted URL) when unauthenticated. */
export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'initializing') {
    return <AuthLoadingScreen />
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
