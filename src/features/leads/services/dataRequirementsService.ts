import { env } from '@/lib/env'
import { apiRequest } from '@/services/api/client'
import { delay } from '@/services/mock/delay'
import type { DataRequirementsResponse, RecalculateAllResult } from '../types'

export interface DataRequirementsService {
  get(bbsLeadId: string): Promise<DataRequirementsResponse>
  /** Regenerates the Master Profile, then Cohort, Pathway and Plan in order. Never approves a plan. */
  recalculateAll(bbsLeadId: string): Promise<RecalculateAllResult>
}

class MockDataRequirementsService implements DataRequirementsService {
  async get() {
    return delay({ requirements: [], blocked: false, headline: null, profileAvailable: false, blockExplanation: null }, 200)
  }

  async recalculateAll() {
    return delay(
      { masterProfile: { generated: false, reason: 'Mock mode has no live upstream modules.' }, stages: null, requirements: { requirements: [], blocked: false, headline: null, profileAvailable: false, blockExplanation: null } },
      300,
    )
  }
}

class ApiDataRequirementsService implements DataRequirementsService {
  async get(bbsLeadId: string) {
    return apiRequest<DataRequirementsResponse>(`/leads/${bbsLeadId}/data-requirements`)
  }

  async recalculateAll(bbsLeadId: string) {
    return apiRequest<RecalculateAllResult>(`/leads/${bbsLeadId}/recalculate-all`, { method: 'POST' })
  }
}

export const dataRequirementsService: DataRequirementsService = env.apiMode === 'api' ? new ApiDataRequirementsService() : new MockDataRequirementsService()
