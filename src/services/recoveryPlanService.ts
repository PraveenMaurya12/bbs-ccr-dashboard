import { delay } from './mock/delay'
import { mockRecoveryPlans } from './mock/recoveryPlans.mock'
import type { RecoveryPlan } from '@/types'

export interface RecoveryPlanService {
  listRecoveryPlans(): Promise<RecoveryPlan[]>
  getRecoveryPlanByLeadId(leadId: string): Promise<RecoveryPlan | null>
}

class MockRecoveryPlanService implements RecoveryPlanService {
  async listRecoveryPlans(): Promise<RecoveryPlan[]> {
    return delay([...mockRecoveryPlans])
  }

  async getRecoveryPlanByLeadId(leadId: string): Promise<RecoveryPlan | null> {
    const plan = mockRecoveryPlans.find((p) => p.leadId === leadId) ?? null
    return delay(plan)
  }
}

export const recoveryPlanService: RecoveryPlanService = new MockRecoveryPlanService()
