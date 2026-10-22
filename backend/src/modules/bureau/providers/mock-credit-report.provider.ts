import { Injectable } from '@nestjs/common'

import type { BureauIdentity } from '../identity'
import type { CreditReportProvider, FetchReportResult } from './credit-report-provider.interface'

/**
 * Development/test-only provider. Never calls the real Experian endpoint
 * and never transmits customer data anywhere — produces one clearly
 * synthetic report so the full trigger → fetch → persist → debt-analysis →
 * Gemini-insights pipeline can be exercised end-to-end without live bureau
 * credentials. Bound by default (CREDIT_REPORT_PROVIDER=mock) — switching
 * to "experian" requires real credentials and a completed response mapping
 * (see ExperianCreditReportProvider's doc comment).
 *
 * A mobile number ending in the digits below deterministically simulates
 * the real, verified "no bureau record found" outcome (see
 * experian-response.mapper.ts) — a test seam so e2e tests can exercise the
 * NO_RECORD path without needing a live Experian call.
 */
const NO_RECORD_MOBILE_SUFFIX = '0404'

@Injectable()
export class MockCreditReportProvider implements CreditReportProvider {
  readonly providerName = 'mock'

  async fetchReport(identity: BureauIdentity): Promise<FetchReportResult> {
    await new Promise((resolve) => setTimeout(resolve, 200))

    if (identity.mobilePhone.endsWith(NO_RECORD_MOBILE_SUFFIX)) {
      return {
        rawResponse: null,
        data: {
          bureau: 'MockBureau (Experian dev stub)',
          maskedIdNumber: 'N/A — no bureau record found',
          pulledAt: new Date(),
          creditScore: null,
          scoreBand: 'not_found',
          totalActiveAccounts: 0,
          totalOutstandingBalance: 0,
          delinquentAccounts: 0,
          willfulDefaultFlag: null,
          accounts: [],
          enquiries: [],
        },
      }
    }

    const now = new Date()
    const monthsAgo = (n: number) => {
      const d = new Date(now)
      d.setMonth(d.getMonth() - n)
      return d
    }

    const data = {
      bureau: 'MockBureau (Experian dev stub)',
      maskedIdNumber: `XXXX-XXXX-${identity.mobilePhone.slice(-4)}`,
      pulledAt: now,
      creditScore: 730,
      scoreBand: 'good',
      totalActiveAccounts: 1,
      totalOutstandingBalance: 65000,
      delinquentAccounts: 0,
      willfulDefaultFlag: false,
      accounts: [
        {
          accountType: 'Personal Loan',
          lender: 'Mock Dev Bank',
          openedOn: monthsAgo(18),
          sanctionedAmount: 100000,
          currentBalance: 65000,
          paymentStatus: 'REGULAR',
          overdueAmount: 0,
          currentDpdDays: 0,
          maxDpdDays: 0,
          monthlyEmiAmount: 6500,
          creditLimit: null,
          isSecured: false,
          lifecycleStatus: 'ACTIVE',
          closedOn: null,
          paymentHistoryGrid: Array.from({ length: 6 }, (_, i) => ({
            month: monthsAgo(5 - i).toISOString().slice(0, 7),
            dpdBucket: '0' as const,
          })),
        },
      ],
      enquiries: [{ enquiryDate: monthsAgo(1), purpose: 'Personal Loan', memberName: 'Mock Dev Bank' }],
    }

    // No real bureau wire response exists for the mock — nothing to
    // persist for reprocessing purposes.
    return { data, rawResponse: null }
  }
}
