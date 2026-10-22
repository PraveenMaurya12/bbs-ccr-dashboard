import type { LeadPipelineStatus } from './status'

export type LeadSource = 'walk_in' | 'call_center' | 'online' | 'referral' | 'partner_dealer'

export interface Lead {
  id: string
  leadId: string
  fullName: string
  phone: string
  email: string
  city: string
  source: LeadSource
  assignedCcrId: string
  assignedCcrName: string
  createdAt: string
  updatedAt: string
  status: LeadPipelineStatus
  notes?: string
}
