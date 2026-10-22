/**
 * v3.0 §15.1's own "Refresh Flows by Trigger" table, made an inspectable,
 * testable artifact in its own right — not just the fact that re-running
 * `evaluate()` happens to correctly re-derive everything. Layer names (L1-L4)
 * are the spec's own vocabulary (§2): L1 Debt Analysis, L2 Financial
 * Analysis, L3 Master Profile, L4 Cohort Decision.
 *
 * §15.2's own "Refresh Contract" (identify affected layers → regenerate
 * those layers → regenerate downstream (L3, L4) → compare to prior version →
 * notify CCR on material change → preserve prior version in audit trail) is
 * carried in `expectedReevaluationBehavior` below, specialized per trigger.
 */

export type RefreshLayer = 'L1_DEBT_ANALYSIS' | 'L2_FINANCIAL_ANALYSIS' | 'L3_MASTER_PROFILE' | 'L4_COHORT_DECISION'

export type RefreshTriggerId = 'NEW_BANK_STATEMENT' | 'NEW_BUREAU_PULL' | 'CCR_DISCOVERY_COMPLETE' | 'COMPLIANCE_CLEARED' | 'POLICY_CHANGE' | 'MATERIAL_EVENT'

export interface RefreshTriggerDefinition {
  id: RefreshTriggerId
  label: string
  /** §15.1's own "Layers Re-run" column, in order. */
  layersRerun: RefreshLayer[]
  requiredConditions: string
  affectedAssessment: string
  expectedReevaluationBehavior: string
  /**
   * Whether THIS codebase can mechanically observe, from already-persisted
   * data, that this specific trigger (as opposed to one of the others) has
   * occurred for a given lead — stated plainly, including where it cannot.
   */
  mechanicallyDetectable: boolean
  detectionNote: string
}

export const REFRESH_TRIGGER_TAXONOMY: RefreshTriggerDefinition[] = [
  {
    id: 'NEW_BANK_STATEMENT',
    label: 'New bank statement received',
    layersRerun: ['L2_FINANCIAL_ANALYSIS', 'L3_MASTER_PROFILE', 'L4_COHORT_DECISION'],
    requiredConditions: 'A new bank statement is uploaded and Financial Analysis (L2) is regenerated from it for this lead.',
    affectedAssessment: 'Financial Analysis, then Master Profile, then the Cohort Decision — in that order.',
    expectedReevaluationBehavior:
      'Financial Analysis regenerates first (new version), Master Profile regenerates from the new Financial Analysis (new version), then Cohort Engine evaluate() re-runs all 24 rules against the new Master Profile and persists a new Cohort Decision version. The prior Cohort Decision version is preserved, never mutated, per §15.2 step 6.',
    mechanicallyDetectable: true,
    detectionNote:
      "Indirectly detectable via `isStale` (Master Profile's version has moved past this decision's `sourceMasterProfileVersion`) — but this codebase persists only ONE upstream-version pointer on CohortDecision (`sourceMasterProfileVersion`), not separate Debt/Financial Analysis version pointers. So a stale decision cannot be mechanically distinguished from NEW_BUREAU_PULL, CCR_DISCOVERY_COMPLETE, or MATERIAL_EVENT by cause alone — all four currently produce the identical `isStale: true` signal. Re-running evaluate() is the correct response regardless of which of the four actually occurred.",
  },
  {
    id: 'NEW_BUREAU_PULL',
    label: 'New bureau pull',
    layersRerun: ['L1_DEBT_ANALYSIS', 'L3_MASTER_PROFILE', 'L4_COHORT_DECISION'],
    requiredConditions: 'A new bureau report is pulled and Debt Analysis (L1) is regenerated from it for this lead.',
    affectedAssessment: 'Debt Analysis, then Master Profile, then the Cohort Decision — in that order.',
    expectedReevaluationBehavior:
      'Debt Analysis regenerates first (new version), Master Profile regenerates from the new Debt Analysis (new version), then Cohort Engine evaluate() re-runs all 24 rules against the new Master Profile and persists a new Cohort Decision version. The prior Cohort Decision version is preserved, never mutated.',
    mechanicallyDetectable: true,
    detectionNote:
      "Same `isStale` signal as NEW_BANK_STATEMENT — indistinguishable by cause from this codebase's persisted data alone (see that entry's note). Also structurally limited: `CreditReport.leadId` is `@unique` in this schema (confirmed during the Master Profile/Debt Analysis builds), so a genuine second bureau pull for the same lead cannot exist yet without a schema change — this trigger is honestly aspirational for a single-bureau-report lead today.",
  },
  {
    id: 'CCR_DISCOVERY_COMPLETE',
    label: 'CCR discovery complete',
    layersRerun: ['L3_MASTER_PROFILE', 'L4_COHORT_DECISION'],
    requiredConditions: "A CCR resolves one or more open Master Profile reconciliation/missing-information items (e.g. P1 MIR items), and Master Profile (L3) is regenerated to reflect the resolution — no L1/L2 regeneration is required for this trigger.",
    affectedAssessment: 'Master Profile only, then the Cohort Decision.',
    expectedReevaluationBehavior:
      'Master Profile regenerates (new version) from the same L1/L2 data plus the CCR-resolved facts, then Cohort Engine evaluate() re-runs against the new Master Profile and persists a new Cohort Decision version.',
    mechanicallyDetectable: true,
    detectionNote:
      "Same `isStale` signal as NEW_BANK_STATEMENT/NEW_BUREAU_PULL — a Master Profile version bump with no corresponding Debt/Financial Analysis version change is the closest honest proxy for this specific trigger, but this codebase does not persist a discrete 'CCR discovery' event log to confirm that was the actual cause versus MATERIAL_EVENT.",
  },
  {
    id: 'COMPLIANCE_CLEARED',
    label: 'Compliance cleared',
    layersRerun: ['L4_COHORT_DECISION'],
    requiredConditions: 'The latest Cohort Decision has an active, unresolved compliance hold (`complianceHold: true`, `complianceClearedAt: null`, `complianceDeclinedAt: null`).',
    affectedAssessment: 'The Cohort Decision only — L1/L2/L3 are never touched by this trigger.',
    expectedReevaluationBehavior:
      "Per §15.3: COMPLIANCE_HOLD is removed from active blocks, precedence is re-evaluated over the SAME preserved secondaryFlags (never a full 24-rule re-run against stale upstream data), the next-highest candidate is auto-assigned, and CCR is notified of the new state. Implemented by `CohortEngineService.clearCompliance()` (v3.0 §7.4).",
    mechanicallyDetectable: true,
    detectionNote: 'Directly detectable and directly actionable: `previous.complianceHold && !previous.complianceClearedAt && !previous.complianceDeclinedAt` is exactly the precondition `clearCompliance()`/`declineCompliance()` already enforce (see `loadDecisionForComplianceAction()`).',
  },
  {
    id: 'POLICY_CHANGE',
    label: 'Policy change',
    layersRerun: ['L4_COHORT_DECISION'],
    requiredConditions: "A Policy Registry threshold (e.g. `cohortEngine.*` config values) or `ruleVersion` changes, requiring every open lead's Cohort Decision to be re-evaluated under the new policy — without any new L1/L2/L3 fact having changed.",
    affectedAssessment: 'The Cohort Decision only.',
    expectedReevaluationBehavior: "Cohort Engine evaluate() re-runs all 24 rules against the SAME Master Profile version, but under the new `ruleVersion`/config, and persists a new Cohort Decision version — this is the same code path as any other evaluate() call, distinguished only by the reason it was invoked.",
    mechanicallyDetectable: false,
    detectionNote:
      "Not detectable from persisted data at all — no versioned policy-change event exists anywhere in this codebase (confirmed: `configuration.ts`'s `cohortEngine` block and the hardcoded `ruleVersion` string are both plain, undated constants, not a `RuleConfig` table with an effective-from timestamp). The only observable artifact after the fact is `ruleVersion` differing between two decision versions for the same lead. Detecting that a policy change SHOULD trigger re-evaluation is therefore necessarily an explicit, out-of-band CCR/ops-triggered `recalculate()` call — never automatic.",
  },
  {
    id: 'MATERIAL_EVENT',
    label: 'Material event',
    layersRerun: ['L3_MASTER_PROFILE', 'L4_COHORT_DECISION'],
    requiredConditions: "A material change is recorded against the customer's facts (e.g. an income transition, a medical shock, a new overdue, a lender decline, a legal-status change) and Master Profile (L3) is regenerated to reflect it.",
    affectedAssessment: 'Master Profile, then the Cohort Decision.',
    expectedReevaluationBehavior: 'Master Profile regenerates (new version) incorporating the material change, then Cohort Engine evaluate() re-runs against the new Master Profile and persists a new Cohort Decision version. This is also the mechanism that feeds R023 (Income Transition, §9.1) and R024 (Medical Shock, §9.2) once the underlying event is reflected upstream.',
    mechanicallyDetectable: true,
    detectionNote:
      "Same `isStale` signal as NEW_BANK_STATEMENT/NEW_BUREAU_PULL/CCR_DISCOVERY_COMPLETE — this codebase's single `sourceMasterProfileVersion` pointer cannot distinguish WHICH of these four caused the Master Profile version to move. The already-persisted `nextReviewEvent.eventTriggers` list (`missed_payment`, `income_shock`, `new_borrowing`, `dpd_change`, `new_overdue`, `lender_decline`, `legal_status_change`, `material_data_change`) names the specific material-event sub-types this engine expects CCR/upstream modules to watch for, even though the Cohort Decision row itself cannot tell them apart after the fact.",
  },
]

export function getRefreshTrigger(id: RefreshTriggerId): RefreshTriggerDefinition {
  const found = REFRESH_TRIGGER_TAXONOMY.find((t) => t.id === id)
  if (!found) throw new Error(`Unknown refresh trigger id: ${id}`)
  return found
}

export interface RefreshTriggerApplicability extends RefreshTriggerDefinition {
  /** Whether this trigger's required condition is CURRENTLY satisfied for the given lead's latest decision — a real, per-lead computed view, not just the static catalog. */
  currentlyApplicable: boolean
  applicabilityBasis: string
}

/**
 * §15.1 made inspectable per-lead: for the given decision + current Master
 * Profile version, says which of the 6 triggers are presently satisfied —
 * reading only already-computed fields, never recomputing anything itself.
 */
export function inspectRefreshTriggers(params: {
  decision: { complianceHold: boolean; complianceClearedAt: Date | null; complianceDeclinedAt: Date | null; sourceMasterProfileVersion: number | null }
  currentMasterProfileVersion: number | null
}): RefreshTriggerApplicability[] {
  const { decision, currentMasterProfileVersion } = params
  const masterProfileMoved = currentMasterProfileVersion !== null && decision.sourceMasterProfileVersion !== null && currentMasterProfileVersion !== decision.sourceMasterProfileVersion
  const complianceActionable = decision.complianceHold && !decision.complianceClearedAt && !decision.complianceDeclinedAt

  return REFRESH_TRIGGER_TAXONOMY.map((trigger) => {
    switch (trigger.id) {
      case 'NEW_BANK_STATEMENT':
      case 'NEW_BUREAU_PULL':
      case 'CCR_DISCOVERY_COMPLETE':
      case 'MATERIAL_EVENT':
        return {
          ...trigger,
          currentlyApplicable: masterProfileMoved,
          applicabilityBasis: masterProfileMoved
            ? `Master Profile has moved from version ${decision.sourceMasterProfileVersion} to ${currentMasterProfileVersion} since this decision — re-running evaluate() is recommended (cause not separately distinguishable from the other L3-triggered triggers; see detectionNote).`
            : 'Master Profile version is unchanged since this decision — this trigger is not currently satisfied.',
        }
      case 'COMPLIANCE_CLEARED':
        return {
          ...trigger,
          currentlyApplicable: complianceActionable,
          applicabilityBasis: complianceActionable
            ? 'An active, unresolved compliance hold exists on this decision — clearCompliance()/declineCompliance() is available now.'
            : 'No active, unresolved compliance hold exists on this decision.',
        }
      case 'POLICY_CHANGE':
        return {
          ...trigger,
          currentlyApplicable: false,
          applicabilityBasis: 'Never mechanically determinable from persisted data (see detectionNote) — always requires an explicit, out-of-band CCR/ops decision to re-run.',
        }
      default:
        return { ...trigger, currentlyApplicable: false, applicabilityBasis: 'Unhandled trigger.' }
    }
  })
}
