import { delay } from './mock/delay'
import { mockLeads } from './mock/leads.mock'
import { env } from '@/lib/env'
import { apiRequest } from '@/services/api/client'
import type { Lead, LeadSource, StageStatus } from '@/types'

export interface LeadService {
  listLeads(): Promise<Lead[]>
  getLeadById(leadId: string): Promise<Lead | null>
}

class MockLeadService implements LeadService {
  async listLeads(): Promise<Lead[]> {
    return delay([...mockLeads])
  }

  async getLeadById(leadId: string): Promise<Lead | null> {
    const lead = mockLeads.find((l) => l.leadId === leadId) ?? null
    return delay(lead)
  }
}

interface BackendUserRef {
  id: string
  name: string
  email: string
}

interface BackendLead {
  id: string
  bbsLeadId: string
  fullName: string
  phone: string
  // Nullable — a public-website submission supplies neither (see backend
  // schema.prisma doc comment on Lead.email/Lead.city).
  email: string | null
  city: string | null
  source: string
  notes: string | null
  assignedCcrId: string | null
  assignedCcr: BackendUserRef | null
  leadSubmissionStatus: string
  bureauReportStatus: string
  level1Status: string
  level2Status: string
  level3Status: string
  recoveryPlanStatus: string
  createdAt: string
  updatedAt: string
}

interface PaginatedResponse<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function toStageStatus(value: string): StageStatus {
  return value.toLowerCase() as StageStatus
}

function toLead(backendLead: BackendLead): Lead {
  return {
    id: backendLead.id,
    leadId: backendLead.bbsLeadId,
    fullName: backendLead.fullName,
    phone: backendLead.phone,
    email: backendLead.email ?? '',
    city: backendLead.city ?? '',
    source: backendLead.source.toLowerCase() as LeadSource,
    assignedCcrId: backendLead.assignedCcrId ?? '',
    assignedCcrName: backendLead.assignedCcr?.name ?? 'Unassigned',
    createdAt: backendLead.createdAt,
    updatedAt: backendLead.updatedAt,
    notes: backendLead.notes ?? undefined,
    status: {
      leadSubmission: toStageStatus(backendLead.leadSubmissionStatus),
      bureauReportProcessing: toStageStatus(backendLead.bureauReportStatus),
      level1Profile: toStageStatus(backendLead.level1Status),
      level2Profile: toStageStatus(backendLead.level2Status),
      level3Assessment: toStageStatus(backendLead.level3Status),
      recoveryPlan: toStageStatus(backendLead.recoveryPlanStatus),
    },
  }
}

/** Calls the real backend's /leads endpoints. Used when VITE_API_MODE=api. */
class ApiLeadService implements LeadService {
  async listLeads(): Promise<Lead[]> {
    // No pagination UI yet — fetch one generously-sized page as the
    // foundation-stage behavior; revisit once Lead Management gets real
    // pagination controls.
    const page = await apiRequest<PaginatedResponse<BackendLead>>('/leads?page=1&pageSize=100')
    return page.items.map(toLead)
  }

  async getLeadById(leadId: string): Promise<Lead | null> {
    try {
      const backendLead = await apiRequest<BackendLead>(`/leads/${leadId}`)
      return toLead(backendLead)
    } catch {
      return null
    }
  }
}

export const leadService: LeadService =
  env.apiMode === 'api' ? new ApiLeadService() : new MockLeadService()
