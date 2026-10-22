export interface LoginCredentials {
  email: string
  password: string
  keepLoggedIn: boolean
}

export interface AuthenticatedCcr {
  id: string
  name: string
  email: string
  /** Already present on the backend's own auth response — surfaced here so role-gated UI (e.g. the Cohort Engine override action) can hide itself from ordinary CCRs, not just rely on the backend's 403. */
  role: 'CCR' | 'SUPERVISOR' | 'ADMIN'
}
