import { delay } from './mock/delay'
import {
  mockCohortDecisions,
  mockLevel1Profiles,
  mockLevel2Profiles,
  mockLevel3Profiles,
} from './mock/assessments.mock'
import type {
  CohortDecision,
  Level1CreditProfile,
  Level2FinancialProfile,
  Level3CustomerProfile,
} from '@/types'

export interface AssessmentService {
  getLevel1ProfileByLeadId(leadId: string): Promise<Level1CreditProfile | null>
  getLevel2ProfileByLeadId(leadId: string): Promise<Level2FinancialProfile | null>
  getLevel3ProfileByLeadId(leadId: string): Promise<Level3CustomerProfile | null>
  getCohortDecisionByLeadId(leadId: string): Promise<CohortDecision | null>
}

class MockAssessmentService implements AssessmentService {
  async getLevel1ProfileByLeadId(leadId: string): Promise<Level1CreditProfile | null> {
    return delay(mockLevel1Profiles.find((p) => p.leadId === leadId) ?? null)
  }

  async getLevel2ProfileByLeadId(leadId: string): Promise<Level2FinancialProfile | null> {
    return delay(mockLevel2Profiles.find((p) => p.leadId === leadId) ?? null)
  }

  async getLevel3ProfileByLeadId(leadId: string): Promise<Level3CustomerProfile | null> {
    return delay(mockLevel3Profiles.find((p) => p.leadId === leadId) ?? null)
  }

  async getCohortDecisionByLeadId(leadId: string): Promise<CohortDecision | null> {
    return delay(mockCohortDecisions.find((d) => d.leadId === leadId) ?? null)
  }
}

export const assessmentService: AssessmentService = new MockAssessmentService()
