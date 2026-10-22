import { detectPostStatementDebt } from './post-statement-debt'
import type { DebtAccountFact } from '../master-profile.types'

function account(overrides: Partial<DebtAccountFact> = {}): DebtAccountFact {
  return { lender: 'Test Lender', accountType: 'Personal Loan', openedOn: '2025-05-01', currentBalance: 50000, monthlyEmiAmount: null, lifecycleStatus: 'ACTIVE', ...overrides }
}

describe('detectPostStatementDebt (BBS Master Profile Module v3.0 §5.7)', () => {
  const l2PeriodEnd = new Date('2026-03-31')

  it('detects an account opened after the L2 statement period ended, matching the real Praveenkumar case (Bajaj PL/CL opened Jul/Aug 2026 vs. a Mar 2026 statement end)', () => {
    const accounts = [
      account({ lender: 'Bajaj Finance CL', openedOn: '2026-07-21', currentBalance: 57333 }),
      account({ lender: 'Bajaj Finance PL', openedOn: '2026-08-12', currentBalance: 828697 }),
      account({ lender: 'HDFC Bank', openedOn: '2023-05-08', currentBalance: 49158 }),
    ]
    const result = detectPostStatementDebt(accounts, l2PeriodEnd)
    expect(result.detected).toBe(true)
    expect(result.accountCount).toBe(2)
    expect(result.totalAmount).toBe(57333 + 828697)
    expect(result.repaymentUnverified).toBe(true)
    expect(result.ccrPriority).toBe('P1')
    expect(result.accounts.map((a) => a.lender)).toEqual(expect.arrayContaining(['Bajaj Finance CL', 'Bajaj Finance PL']))
  })

  it('reports not-detected (never a fabricated positive) when every account predates the statement period end', () => {
    const accounts = [account({ openedOn: '2020-01-01' }), account({ openedOn: '2026-03-30' })]
    const result = detectPostStatementDebt(accounts, l2PeriodEnd)
    expect(result.detected).toBe(false)
    expect(result.accountCount).toBe(0)
    expect(result.ccrPriority).toBeNull()
  })

  it('reports not-detected (never a fabricated comparison) when the L2 period end is unavailable', () => {
    const result = detectPostStatementDebt([account({ openedOn: '2026-07-21' })], null)
    expect(result.detected).toBe(false)
  })
})
