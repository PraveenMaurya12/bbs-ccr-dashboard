import { delay } from './mock/delay'
import { mockCreditReports } from './mock/creditReports.mock'
import type { CreditReport } from '@/types'

export interface CreditReportService {
  getCreditReportByLeadId(leadId: string): Promise<CreditReport | null>
}

class MockCreditReportService implements CreditReportService {
  async getCreditReportByLeadId(leadId: string): Promise<CreditReport | null> {
    const report = mockCreditReports.find((r) => r.leadId === leadId) ?? null
    return delay(report)
  }
}

export const creditReportService: CreditReportService = new MockCreditReportService()
