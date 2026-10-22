import type { ComplianceRoutingResult, FamilyNetworkVerificationResult, MissingInformationItemResult, PostStatementDebtResult } from '../master-profile.types'

/**
 * BBS Master Profile Module v3.0 §20 — consolidated, prioritized Missing
 * Information Register. Debt Analysis's and Financial Analysis's own
 * already-computed MIR items are folded in verbatim (never reinvented) and
 * tiered P2 by default — neither upstream module tags its own items with a
 * priority, so inventing a fine-grained P1/P2/P3 split for them would
 * fabricate urgency the source data doesn't actually carry. The genuinely
 * P1-tiered items below are ones THIS module can confidently judge as
 * blocking, because they come directly from its own real findings
 * (compliance routing, post-statement debt, unverified family members) —
 * matching §15.1's own P1 list, which is dominated by exactly these kinds
 * of items (related-party context, post-statement-debt purpose).
 */
export function buildMissingInformationRegister(
  debtItems: Array<{ category: string; description: string }>,
  financialItems: Array<{ category: string; description: string }>,
  complianceRouting: ComplianceRoutingResult,
  postStatementDebt: PostStatementDebtResult,
  familyNetwork: FamilyNetworkVerificationResult,
): MissingInformationItemResult[] {
  const items: MissingInformationItemResult[] = []

  if (complianceRouting.complianceHold) {
    items.push({ itemText: `Related-party employment context for ${complianceRouting.matchedEntity ?? 'the matched employer'}`, sourceModule: 'L2', priority: 'P1' })
  }

  if (postStatementDebt.detected) {
    for (const account of postStatementDebt.accounts) {
      items.push({ itemText: `Purpose of borrowing: ${account.lender} (opened ${account.openedOn}, post-statement)`, sourceModule: 'L1', priority: 'P1' })
    }
  }

  for (const member of familyNetwork.members) {
    items.push({ itemText: `${member.ccrAction}: ${member.name} (${member.inferredRelation})`, sourceModule: 'L2', priority: 'P1' })
  }

  for (const item of debtItems) {
    items.push({ itemText: item.description, sourceModule: 'L1', priority: 'P2' })
  }
  for (const item of financialItems) {
    items.push({ itemText: item.description, sourceModule: 'L2', priority: 'P2' })
  }

  return items
}
