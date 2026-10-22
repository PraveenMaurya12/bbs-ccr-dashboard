import type { BbsPlanActionOutput, BbsPlanActionTemplate, PlanInput } from '../plan-engine.types'

/**
 * v3.0 §10.1-10.4 — the canonical Action Library (PL005). Before this
 * pass, every template authored its own free-form `actionId` strings
 * ("immediate-1") with no shared catalog and no conditional-injection
 * algorithm reading L3/L4/L5 flags. `BbsPlanActionOwner` only has
 * CUSTOMER/BBS/CREDITOR (no separate LENDER/COMPLIANCE/SPECIALIST owner
 * type) — Lender actions (LND-prefixed) map to CREDITOR; Compliance and
 * Specialist actions (COMP- and SPEC-prefixed) map to BBS (internal
 * BBS-team actions), the closest honest fit within the existing enum.
 */
export const ACTION_LIBRARY: Record<string, BbsPlanActionTemplate> = {
  'CA-001': { actionId: 'CA-001', description: 'Provide missing bank statement.', ownerType: 'CUSTOMER', phase: 'IMMEDIATE', owner: 'Customer', timing: 'Within 7 business days', slaDays: 7 },
  'CA-002': { actionId: 'CA-002', description: 'Provide an updated bank statement.', ownerType: 'CUSTOMER', phase: 'IMMEDIATE', owner: 'Customer', timing: 'Within 7 business days', slaDays: 7 },
  'CA-003': { actionId: 'CA-003', description: 'Provide statements for any other accounts likely to be held.', ownerType: 'CUSTOMER', phase: 'IMMEDIATE', owner: 'Customer', timing: 'Within 7 business days', slaDays: 7 },
  'CA-004': { actionId: 'CA-004', description: 'Confirm income details.', ownerType: 'CUSTOMER', phase: 'IMMEDIATE', owner: 'Customer', timing: 'Within 5 business days', slaDays: 5 },
  'CA-005': { actionId: 'CA-005', description: 'Confirm essential expenses.', ownerType: 'CUSTOMER', phase: 'IMMEDIATE', owner: 'Customer', timing: 'Within 5 business days', slaDays: 5 },
  'CA-009': { actionId: 'CA-009', description: 'Provide lender details for the obligations in scope.', ownerType: 'CUSTOMER', phase: 'DAY_30', owner: 'Customer', timing: 'Within 7 business days', slaDays: 7 },
  'CA-011': { actionId: 'CA-011', description: 'Acknowledge the terms of the proposed arrangement.', ownerType: 'CUSTOMER', phase: 'DAY_30', owner: 'Customer', timing: 'Within 14 days', slaDays: 14 },
  'CA-012': { actionId: 'CA-012', description: 'Make the first payment under the arrangement.', ownerType: 'CUSTOMER', phase: 'DAY_30', owner: 'Customer', timing: 'Within 30 days', slaDays: 30 },
  'CCR-003': { actionId: 'CCR-003', description: 'Resolve the income discrepancy flagged by Master Profile reconciliation.', ownerType: 'BBS', phase: 'IMMEDIATE', owner: 'CCR', timing: 'Within 3 business days', slaDays: 3 },
  'BBS-001': { actionId: 'BBS-001', description: 'Process the consolidation application.', ownerType: 'BBS', phase: 'DAY_30', owner: 'BBS Operations', timing: 'Within 5 business days', slaDays: 5 },
  'BBS-002': { actionId: 'BBS-002', description: 'Coordinate with the lender on the proposed arrangement.', ownerType: 'BBS', phase: 'DAY_30', owner: 'BBS Operations', timing: 'Within 5 business days', slaDays: 5 },
  'BBS-003': { actionId: 'BBS-003', description: 'Prepare the resolution proposal.', ownerType: 'BBS', phase: 'DAY_30', owner: 'BBS Operations', timing: 'Within 5 business days', slaDays: 5 },
  'BBS-004': { actionId: 'BBS-004', description: 'Verify eligibility for the proposed pathway.', ownerType: 'BBS', phase: 'IMMEDIATE', owner: 'BBS Operations', timing: 'Within 5 business days', slaDays: 5 },
  'BBS-005': { actionId: 'BBS-005', description: 'Disburse the stabilisation fund. (PROPOSED — 90-Day Stabilisation variant, requires Business/Legal/Credit/Risk sign-off; never reachable while the variant is never auto-selected.)', ownerType: 'BBS', phase: 'DAY_30', owner: 'BBS Operations', timing: 'Within 5 business days', slaDays: 5 },
  'LND-001': { actionId: 'LND-001', description: 'Review the consolidation request.', ownerType: 'CREDITOR', phase: 'DAY_30', owner: 'Lender', timing: 'Within 15 days', slaDays: 15 },
  'LND-002': { actionId: 'LND-002', description: 'Review the restructure request.', ownerType: 'CREDITOR', phase: 'DAY_30', owner: 'Lender', timing: 'Within 15 days', slaDays: 15 },
  'LND-003': { actionId: 'LND-003', description: 'Accept or reject the proposed resolution.', ownerType: 'CREDITOR', phase: 'DAY_30', owner: 'Lender', timing: 'Within 15 days', slaDays: 15 },
  'LND-004': { actionId: 'LND-004', description: 'Confirm settlement terms.', ownerType: 'CREDITOR', phase: 'DAY_30', owner: 'Lender', timing: 'Within 15 days', slaDays: 15 },
  'COMP-001': { actionId: 'COMP-001', description: 'Review the related-party concern.', ownerType: 'BBS', phase: 'IMMEDIATE', owner: 'Compliance', timing: 'Within 72 hours', slaDays: 3 },
  'COMP-002': { actionId: 'COMP-002', description: 'Clear the compliance hold after review.', ownerType: 'BBS', phase: 'IMMEDIATE', owner: 'Compliance', timing: 'After review', slaDays: 3 },
}

function fromLibrary(id: string): BbsPlanActionOutput {
  const template = ACTION_LIBRARY[id]
  return { ...template, status: 'PENDING' }
}

/**
 * v3.0 §10.3's conditional-action-injection algorithm, verbatim, limited
 * to the flags this codebase can honestly evaluate today: missing-data
 * items (Cohort Engine's own register), FCF_UNRECONCILED and
 * COMPLIANCE_HOLD (both already in Pathway Decision's own `riskFlags`),
 * OTHER_ACCOUNTS_LIKELY (an L4 secondaryFlags key, also carried in
 * `riskFlags`), the pathway itself (CONSOLIDATE/RESTRUCTURE/RESOLVE), and
 * the 90-day variant. INCOME_TRANSITION/POST_STATEMENT_DEBT -> CCR-004/
 * CA-002 mappings are deferred (see this module's own parity matrix —
 * those source flags aren't currently surfaced to Plan Engine).
 */
export function generateConditionalActions(input: PlanInput): BbsPlanActionOutput[] {
  const actions: BbsPlanActionOutput[] = []

  if (input.missingDataCount > 0) {
    actions.push(fromLibrary('CA-001'), fromLibrary('CA-004'), fromLibrary('CA-005'))
  }
  if (input.riskFlags.includes('FCF_UNRECONCILED')) {
    actions.push(fromLibrary('CCR-003'))
  }
  if (input.riskFlags.includes('OTHER_ACCOUNTS_LIKELY')) {
    actions.push(fromLibrary('CA-003'))
  }
  if (input.pathway === 'CONSOLIDATE') {
    actions.push(fromLibrary('BBS-001'), fromLibrary('BBS-004'), fromLibrary('LND-001'), fromLibrary('CA-009'), fromLibrary('CA-011'))
  }
  if (input.pathway === 'RESTRUCTURE') {
    actions.push(fromLibrary('BBS-002'), fromLibrary('LND-002'), fromLibrary('CA-009'), fromLibrary('CA-011'))
  }
  if (input.pathway === 'RESOLVE') {
    actions.push(fromLibrary('BBS-002'), fromLibrary('BBS-003'), fromLibrary('LND-003'), fromLibrary('LND-004'), fromLibrary('CA-011'))
  }
  if (input.pathwayVariant === 'NINETY_DAY') {
    actions.push(fromLibrary('BBS-005'), fromLibrary('CA-012'))
  }
  if (input.riskFlags.includes('COMPLIANCE_HOLD')) {
    actions.push(fromLibrary('COMP-001'), fromLibrary('COMP-002'))
  }

  // Dedupe by actionId — the same flag combination (e.g. missing data +
  // CONSOLIDATE) never needs the same canonical action listed twice.
  const seen = new Set<string>()
  return actions.filter((a) => (seen.has(a.actionId) ? false : (seen.add(a.actionId), true)))
}
