# BBS Cross-Module Dependency Map

Companion to `docs/bbs-complete-module-parity-matrix.md`. Documents the real,
code-confirmed data contracts between modules, the processing sequence, and
failure/invalidation behavior — as actually implemented, not as an idealized
diagram. Confirmed by direct source reads across this session's Cohort Engine (L4),
Pathway Engine (L5), and Plan Engine (L6) rebuilds, plus a fresh audit of Debt
Analysis (L1) and Financial Analysis (L2) (see the complete parity matrix for
per-module detail).

## 1. The real processing sequence

```
Lead capture + consent (leads module, ConsentRecord)
        │
        ├──────────────────────┐
        ▼                      ▼
  L1 Debt Analysis       L2 Financial Analysis
  (bureau report)        (bank statement)
        │                      │
        └──────────┬───────────┘
                    ▼
         L3 Master Profile
       (reconciles L1 + L2,
        builds cohortAttributes,
        readiness gate R1-R8)
                    │
                    ▼
            L4 Cohort Engine
     (22-rule catalog, 11-priority
      precedence, primaryCohort +
      secondaryFlags + archetype)
                    │
                    ▼
           L5 Pathway Engine
    (PL001 gate inherits L4 blocks,
     20-rule catalog, 14-priority
     precedence, primaryPathway)
                    │
                    ▼
            L6 Plan Engine
  (consumes L3 capacity facts +
   L4 cohort + L5 pathway, never
   re-decides either; template
   routes on pathway, falls back
   to cohort for blocked states)
                    │
                    ▼
         CCR review / approval
    (submit-review → accept →
     activate; supervisor override
     at any decision layer)
```

L1 and L2 run independently and in parallel — neither reads the other directly.
L3 is the first point where both are consumed together. Every layer from L3 onward
is **strictly downstream** of the one before it and never recomputes a fact the
upstream layer already owns (confirmed architecturally at L4/L5/L6; see each
module's own parity matrix for the exact "never recomputes X" citations).

## 2. Real data contracts (confirmed by source read, not assumed)

### L1 → L3
Master Profile reads Debt Analysis's `getForLead()` response directly — confirmed
fields actually consumed: `score`, `scoreBand`, `riskSignals[]`, `debtRiskIndicator`
(total + band), `dataQuality` (score + band + flags), `missingInformation[]`,
account-level summary figures (`totalOutstanding`, `activeAccounts`, lender counts).
There is **no dedicated, literal "CohortSignalPackage" object** as the L1 spec's
§18.2 describes it — Master Profile and (indirectly, via Master Profile) Cohort
Engine read Debt Analysis's own internal response fields directly. This satisfies
the spec's intent (structured, confidence-tagged signals reach downstream modules)
without the spec's literal fixed-schema object existing as a named artifact. See
the complete parity matrix's L1 section for the full field-by-field account.

### L2 → L3
Master Profile reads Financial Analysis's `getForLead()` response directly —
confirmed fields actually consumed: `normalizedMonthlyIncome`, income stability
band + confidence, `debtServiceRatio` (fixed/total), `financialHealthScore` (total
+ band + components), `dataQuality` (score + band + flags, including the v4.0 caps
— see complete matrix for cap-logic confirmation), `eventProfile` (confirmed
real and read downstream: `incomeTransition.{detected, transitionMonth,
previousAverage, currentAverage, deltaPercent}` and `medicalEvents.{monthlyEntries,
shockMonths, chronic}` — both independently confirmed consumed by this session's
Pathway Engine work), risk-flag catalog (confirmed: `OTHER_ACCOUNTS_LIKELY` with a
real `evidence.selfTransferIncomeSharePercent`, `FCF_UNRECONCILED`). Same
"no literal CohortSignalPackage object" disposition as L1 — see complete matrix.

### L3 → L4
Cohort Engine reads Master Profile's `getForLead()` COMPLETED shape: `cohortAttributes`
(the 19-field vector built specifically for this purpose — confirmed rendered,
not dead data, per the Master Profile parity matrix), `readinessGate.outcome`,
`complianceRouting`, `postStatementDebt`, `missingInformation[]` (P1/P2 filtered),
`dataQuality.flags` (checked via array membership, e.g. `FCF_UNRECONCILED`),
`dimensionConfidences`. Precondition: Master Profile must be `COMPLETED` and not
stale (source-version-diff check), else Cohort Engine refuses to evaluate.

### L4 → L5
Pathway Engine reads Cohort Decision's own already-persisted `CohortRuleResult`
evidence fields directly (R006/R008/R009/R010/R012/R021 — confirmed reuse-not-recompute
discipline) plus Master Profile's `dataQuality.flags`, `missingInformation[]`,
`dimensionConfidences`. Precondition: Cohort Decision must be `COMPLETED` and not
stale. P001 gate inherits L4's BLOCKED/X1/X2/C6 states without re-declaring
`next_actions`.

### L4 + L5 → L6
Plan Engine reads Cohort Decision (cohort, capacity facts, archetype, secondary
flags, missing data) AND Pathway Decision (`primaryPathway`, `pathwayVariant`,
`pathwayStatus`, `blockingReason`, `riskFlags`, live `ttl.liveStatus`) — the
**Pathway Decision's own `primaryPathway` is authoritative**, never Cohort
Decision's own legacy static `pathway` field (confirmed fixed this session —
previously Plan Engine silently ignored the authoritative pathway when routing
templates; now genuinely pathway-keyed, see the Plan Engine parity matrix's
§8.1 entry). Preconditions: both Cohort Decision and Pathway Decision must be
`COMPLETED` and not stale; Pathway Decision's live TTL must not be `EXPIRED`
(new gate behavior, built and live-verified this session).

## 3. Staleness / invalidation behavior (confirmed, not assumed)

Every layer from L3 onward uses the **same discipline**: a cheap source-version-number
comparison at read time (`sourceXxxVersion` stored at generation time vs. the
current upstream version), never a timestamp heuristic alone. Confirmed present at:
- Master Profile (`l1DataAsOf`/`l2DataAsOf` vs. current Debt/Financial Analysis versions)
- Cohort Engine (`sourceMasterProfileVersion` vs. current Master Profile version)
- Pathway Engine (`sourceCohortDecisionVersion` vs. current Cohort Decision version)
- Plan Engine (checks **both** `sourceCohortDecisionVersion` and
  `sourcePathwayDecisionVersion` — `isStale = cohortStale || pathwayStale`)

No layer silently re-runs on a stale read — every `getForLead()` response surfaces
`isStale: boolean` and generation is refused (not silently forced) when it would be
generated from a stale upstream version. Re-evaluation is **always CCR-triggered**
(`evaluate()`/`reassess()`/`recalculate()` as an explicit action) — **no module in
this codebase has a scheduler, cron, or event-driven auto-reassessment** (confirmed
absent at every layer: Cohort Engine's own `nextReviewEvent`/refresh-trigger
taxonomy is data-only, Pathway Engine's TTL expiry is computed live-on-read but
never auto-fires a reassessment, Plan Engine's `reviewSchedule`/`monitoringTriggers`
are likewise data-only). This is a named, consistent architectural boundary across
the whole system, not a per-module oversight.

## 4. Module-authority boundaries (confirmed respected)

Re-verified this pass, per the task's own Section 5 requirement:
- Debt Analysis (L1) and Financial Analysis (L2): confirmed neither writes a
  cohort/pathway/plan field anywhere in their own service code (grepped).
- Master Profile (L3): confirmed `cohortAttributes` is read-only data handed
  downstream; no code path in `master-profile.service.ts` ever writes to
  `CohortDecision`.
- Cohort Engine (L4): confirmed never calls Pathway Engine or Plan Engine; its own
  precedence resolver never reads a Pathway/Plan field back.
- Pathway Engine (L5): confirmed P001 gate only ever **inherits** L4's blocked
  state — no code path recomputes or overrides `CohortDecision.primaryCohort`.
- Plan Engine (L6): confirmed template selection reads `cohort`/`pathway` read-only;
  no code path writes back to `CohortDecision` or `PathwayDecision`.
- CCR override at any layer creates a **new version** of that layer's own decision
  — it never reaches into a different layer's table.

## 5. Shared infrastructure actually present (confirmed by structural grep)

- **RBAC**: `Role` enum = `CCR | SUPERVISOR | ADMIN` only — no Credit/Risk/Compliance
  roles exist anywhere in this codebase. This is a real, confirmed constraint on any
  spec requirement calling for a distinct approver role (e.g. Plan Engine v3.0
  §20.3's per-field approval routing — named as BLOCKED in the Plan Engine matrix
  for exactly this reason).
- **AI provider abstraction**: `backend/src/modules/analysis/providers/` —
  `ai-provider.interface.ts` + `claude-ai-provider.ts`/`gemini-ai-provider.ts`/
  `mock-ai-provider.ts`, confirmed genuinely provider-independent (one interface,
  three real implementations) and consistently used as an advisory-narrative-only
  layer at every module that has one (Master Profile, Plan Engine) — never a
  decision input.
- **Notifications**: confirmed **no notification module/channel exists anywhere**
  in this codebase (no email/SMS/WhatsApp provider, no queue). Every spec's own
  "notify the customer" requirement is a named, consistent gap across L4/L5/L6.
- **Scheduler/cron/job queue**: confirmed absent (see §3 above).
- **Consent**: handled via `ConsentRecord` (read by Cohort Engine) + a DTO in the
  `leads` module — a real, working mechanism, just not a dedicated top-level module.

## 6. Modules with no attached specification this round

Per the task's own instruction to use attached specifications as the primary
source of truth and not invent new business rules: Lead Capture/Consent/Onboarding,
CCR Interaction UI workflow (beyond what L4/L5/L6 already require), Customer Action
Execution, Notifications, and most of "shared infrastructure" had **no attached
specification document** this round. These are inventoried at a structural level
only in the complete parity matrix (what exists today) — no new acceptance
criteria were invented for them, consistent with the task's own instruction not to
fabricate requirements where no authoritative document exists.
