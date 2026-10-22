import type { DebtAccountFact, PostStatementDebtResult } from '../master-profile.types'

/**
 * BBS Master Profile Module v3.0 §5.7 — L1 (bureau) debt opened AFTER the
 * L2 (bank statement) period ended cannot have its repayment behaviour
 * assessed from the current statement at all — there is structurally no
 * observation window for it yet. Flagged here (§5.4's own "Hierarchy of
 * Truth" table: "Post-statement debt in L1 only -> L1 for obligation; flag
 * L1_DEBT_POST_STATEMENT") rather than silently reconciled as NOT_OBSERVED
 * (which would misleadingly suggest a missed/unobserved payment on an
 * account that could never have been observed in the first place).
 */
export function detectPostStatementDebt(accounts: DebtAccountFact[], l2PeriodEnd: Date | null): PostStatementDebtResult {
  if (l2PeriodEnd === null) {
    return { detected: false, accountCount: 0, totalAmount: 0, repaymentUnverified: false, ccrPriority: null, accounts: [] }
  }

  const postStatementAccounts = accounts.filter((a) => new Date(a.openedOn).getTime() > l2PeriodEnd.getTime())

  if (postStatementAccounts.length === 0) {
    return { detected: false, accountCount: 0, totalAmount: 0, repaymentUnverified: false, ccrPriority: null, accounts: [] }
  }

  return {
    detected: true,
    accountCount: postStatementAccounts.length,
    totalAmount: postStatementAccounts.reduce((sum, a) => sum + a.currentBalance, 0),
    repaymentUnverified: true,
    ccrPriority: 'P1',
    accounts: postStatementAccounts.map((a) => ({ lender: a.lender, outstanding: a.currentBalance, openedOn: a.openedOn })),
  }
}
