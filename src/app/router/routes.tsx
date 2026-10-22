import { Navigate, createBrowserRouter } from 'react-router-dom'

import { AppLayout } from '@/components/layouts/AppLayout'
import CohortEnginePage from '@/features/cohort-engine/pages/CohortEnginePage'
import CustomerProfilesPage from '@/features/customer-profile/pages/CustomerProfilesPage'
import DashboardPage from '@/features/dashboard/pages/DashboardPage'
import ForgotPasswordPage from '@/features/auth/pages/ForgotPasswordPage'
import LoginPage from '@/features/auth/pages/LoginPage'
import LeadDetailPage from '@/features/leads/pages/LeadDetailPage'
import LeadManagementPage from '@/features/leads/pages/LeadManagementPage'
import FinancialAssessmentsPage from '@/features/level-1-credit/pages/FinancialAssessmentsPage'
import RecoveryPlansPage from '@/features/recovery-plans/pages/RecoveryPlansPage'
import SettingsPage from '@/features/settings/pages/SettingsPage'
import SupportPage from '@/features/support/pages/SupportPage'
import NotFoundPage from './NotFoundPage'
import { ProtectedRoute } from './ProtectedRoute'
import { PublicOnlyRoute } from './PublicOnlyRoute'

export const router = createBrowserRouter([
  // Standalone auth screens — no dashboard sidebar/header.
  {
    path: '/login',
    element: (
      <PublicOnlyRoute>
        <LoginPage />
      </PublicOnlyRoute>
    ),
  },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'leads', element: <LeadManagementPage /> },
          { path: 'leads/:bbsLeadId', element: <LeadDetailPage /> },
          { path: 'customers', element: <CustomerProfilesPage /> },
          { path: 'financial-assessments', element: <FinancialAssessmentsPage /> },
          { path: 'cohort-engine', element: <CohortEnginePage /> },
          { path: 'recovery-plans', element: <RecoveryPlansPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'support', element: <SupportPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
