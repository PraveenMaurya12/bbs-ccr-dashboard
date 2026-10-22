# BBS Cohort Engine Module v3.0 — Parity Matrix

Source of truth: `BBS Cohort Engine Module v3.0.pdf` (35 pages, read in full — changelog,
module positioning, input contract, unified state model, 24-rule catalog, precedence
table, compliance lifecycle, capacity logic, event-based rules, decision tree, cohort
definitions, output schema, customer communication rules, case aging model, re-entry
flows, policy registry, explainability, testing/validation, auditability/governance,
Plan Engine handoff, and the full Praveenkumar case validation worked example).

Current implementation was audited directly from source (not assumed) across:
`backend/src/modules/cohort-engine/` (types, 7 calculation files + specs, service,
controller, module), `backend/prisma/schema.prisma` (`CohortDecision`,
`CohortRuleResult`, `CohortOverride`, 8 enums), and
`src/features/leads/components/lead-detail/cohort-engine/` (9 components).

**Headline finding: the existing Cohort Engine was built against a materially
different, earlier design document** — a 22-rule catalog (R001-R022) with an
11-priority precedence table and a flat 13-value `CohortPrimaryState` enum that
conflates blocked-reasons (`CONSENT_PENDING`, `KYC_PENDING`, `MANUAL_REVIEW`,
`CUSTOMER_UNRESPONSIVE`) with terminal cohorts (C1-C7, X1, X2) into one enum. The
attached v3.0 spec is a near-total replacement of the rule catalog (24 rules, many
reusing an R00N id for a *different* rule than before), a unified three-tier state
model (`primary_state` / `primary_reason_code` / `lifecycle_state`), a full compliance
aging/escalation lifecycle, a case-aging model, an archetype/customer-decline/
re-entry framework, and several rules (`R017` compliance, `R018` other-accounts,
`R019` post-statement debt, `R020` P1 information, `R021` exception count, `R022` FCF
unreconciled) that read Master Profile v3.0 fields (`complianceRouting`,
`postStatementDebt`, `missingInformation[]`, `dataQuality.flags`) the current Cohort
Engine **never reads at all today** — confirmed by direct grep of
`normalize-input.ts`, which has no reference to any of those four Master Profile
fields.

This is a full rebuild, not an incremental patch, exactly as the task describes it.

Status legend: **PASS** (already matches v3.0) · **PARTIAL** (exists, shape/logic
differs) · **MISSING** (does not exist) · **BLOCKED** (cannot be built honestly with
current upstream data) · **CONFLICT** (spec vs. current code vs. reference report
disagree — resolved per the spec's own explicit precedence, documented below, never
silently).

## Acceptance summary

| Area | Status | Notes |
|---|---|---|
| Unified state model: `primary_state` (C1-C7/X1/X2/BLOCKED) + `primary_reason_code` + `lifecycle_state` (§4) | **MISSING** | Current `CohortPrimaryState` is a flat 13-value enum conflating blocked-reason with cohort. No `lifecycle_state` concept exists at all. |
| L3 handoff validation incl. readiness-gate routing table (§3.2) | **PARTIAL→rebuild** | Current only checks `isStale`/`status==='COMPLETED'`; never reads Master Profile's own `readinessGate.outcome` (READY/CCR_FIRST/COMPLIANCE_HOLD/SPECIALIST_REVIEW/X1_CANDIDATE/REGENERATE) at all — X1 today is derived independently (R003/R004/R005), duplicating logic Master Profile v3.0 already computed. |
| P1 Missing Information enforcement (§3.3, 0/1-3/4+ thresholds) | **MISSING** | Current `missing-data.ts` has its own ad hoc gap list unrelated to Master Profile's `missingInformation[]` P1/P2/P3 register — never counts P1 items at all. |
| Profile freshness / TTL check (§3.4) | **PARTIAL** | Current only compares Master Profile `version` numbers (`isStale`); no banded TTL/expiry concept at this layer. |
| 24-rule catalog (§5) | **MISSING→rebuild** | Current has 22 rules; rule IDs R010 onward diverge in *meaning* from the new spec almost entirely (see rule-by-rule table below). |
| R017 Compliance signal, unified (§5.4) — PEP/sanctions/fraud/related-party | **MISSING** | No compliance rule exists in Cohort Engine today; Master Profile's `complianceRouting` is never read here. |
| R018 Other accounts with flow threshold (§5.2, §9.3) | **MISSING** | Current R018 is a stub ("stabilisation coverage", always `NOT_APPLICABLE`) — an entirely different rule occupies this ID today. |
| R019 Post-statement debt (§5.2, §9.4) | **MISSING** | Current R019 is "consolidation eligibility" — a different rule. Master Profile's own `postStatementDebt` field (already built) is never read. |
| R020 P1 missing information, tiered (§9.5) | **MISSING** | Current R020 is "recovery state" — a different rule. |
| R021 Exception count, 5-7/8+ thresholds (§9.6) | **MISSING** | Current R021 is "out of scope" — a different rule. Master Profile's `dataQuality.flags`/exception concept is never read. |
| R022 FCF unreconciled → capacity cap (§5.2) | **PARTIAL** | Current R022 is "conflict/low confidence" — a different rule, though Master Profile already computes `FCF_UNRECONCILED` as a `dataQuality` flag, never consumed here. |
| R023 Income transition (§9.1) | **MISSING** | No income-transition rule exists; no multi-snapshot income trend exists in this codebase (documented limitation, carried forward). |
| R024 Medical shock (§9.2) | **MISSING** | No medical-shock detector exists anywhere in this codebase (Financial Analysis's risk-flag catalog has no medical-shock flag — verified). |
| R013 Capacity band, unified single rule (§5.2) | **PASS, renumbered** | Current already computes one unified capacity band (`capacity.ts`'s `calculateCapacity`) — logic is correct, just split across 3 rule rows (R015/R016/R017) instead of 1 (new R013). Formula itself matches §8.1/§8.2 exactly. |
| R010 Debt-cycle stacking, single rule (§5.1) | **PARTIAL** | Current already consolidates borrowing-to-repay/stacking/enquiry signals in `precedence.ts`'s `debtCycleConfirmed`, but as a precedence-level derived boolean, not a first-class rule row — needs promoting to an actual R010 rule result. |
| Archetype determination (§5.5) | **PARTIAL** | Current `archetype-and-complexity.ts` already implements Circumstantial/Debt-Spiral/Habitual-Avoider/Unclassified with the same "never fabricate Habitual Avoider" discipline — logic is directionally correct but not yet driven by the new spec's exact "Escalating DPD trend AND no recoverable pattern AND no adverse circumstance" definition for Habitual Avoider (still hardcoded to never fire). Rule left intentionally conservative per the existing doc comment's own reasoning; revisit only if real engagement history ever exists. |
| Compliance lifecycle: hold → aging → escalated → cleared/declined (§7) | **MISSING** | No compliance-hold concept, SLA, aging, or feedback loop exists in Cohort Engine at all today. |
| Compliance non-disclosure / approved customer language (§13) | **PARTIAL** | Current `customer-explanation.ts` already has the right discipline (fixed neutral templates, never leaks internal vocabulary) but has no compliance-hold template at all (since compliance isn't modeled yet). |
| Case aging model, 15/30/60/90-day (§14) | **MISSING** | No aging/TTL concept for blocked states exists. `nextReviewEvent` exists but only carries a flat 30/60/90-day array + event-trigger list, not a per-reason-code TTL table. |
| Customer decline path (§14.3) | **MISSING** | No `CUSTOMER_DECLINED` concept exists (current has `CUSTOMER_UNRESPONSIVE`, a different concept — "cannot reach" vs. "explicitly declined"). |
| Re-entry & refresh flows (§15) | **MISSING** | No refresh-trigger-to-layers-rerun mapping exists in Cohort Engine; reassessment today is just "call `evaluate()` again," which does correctly re-run everything, but the explicit trigger taxonomy (§15.1) and compliance-cleared re-entry (§15.3) aren't modeled. |
| Decision output schema (§12) — `primary_reason_code`, `lifecycle_state`, `customer_reasons[]`, `internal_reasons[]`, `compliance_*`, `specialist_review_reason`, `next_review.{ttl_days,ttl_expires_at}` | **PARTIAL** | Current persists a reasonable superset of fields under different names (`customerExplanation` string vs. spec's `customer_reasons[]` array; no `internal_reasons[]` at all; no `compliance_*` fields; `nextReviewEvent` lacks the TTL sub-fields). |
| Policy Registry thresholds (§16.1) | **PASS, mostly** | `overdueCapacityTriggerRupees`/`enquiryBurstThreshold30d`/`stackingIndexPerYear`/`activeOverdueRatioThreshold`/`stressedCapacityRatioMax`/`tightCapacityRatioMax`/`stabilisationCoverageStrongMin`/`stabilisationCoverageMinimum` already exist in `configuration.ts`'s `cohortEngine` block with the exact spec-matching default values. Missing: compliance SLA hours (72/24/120 by trigger type), exception-count thresholds (5/8), P1 force-X1 threshold (4), post-statement thresholds (10%/30%), other-accounts threshold (10%), case TTLs per block type. |
| Multi-bureau cross-check (§16.3) | **NOT_APPLICABLE** | Same structural fact confirmed in the Master Profile and Debt Analysis passes: `CreditReport.leadId` is `@unique` — exactly one bureau report per lead, ever. No second report can exist to reconcile against. |
| Override governance: maker-checker for C1/C4/C6 (§19.2) | **PARTIAL** | `CohortOverride` already has `approverId` as a nullable column, but nothing in `cohort-engine.service.ts`'s `override()` enforces a *second* approver for C1/C4/C6 specifically — any single actor can complete it today. |
| Plan Engine handoff contract (§21) | **PARTIAL** | `plan-engine.service.ts` already consumes `CohortEngineService.getForLead()` — confirmed via source read — but the new field names (`primary_reason_code`, `lifecycle_state`, `compliance_hold`) don't exist yet for Plan Engine to read; Plan Engine's own precondition is "Cohort Decision COMPLETED and not stale," already correctly gated. |
| Frontend: Cohort Executive Overview, Decision Evidence, Rule Evaluation, Readiness & Compliance, Alternative Matches, Missing Info, Pathway/Actions, Audit/Handoff sections (§4 task spec) | **PARTIAL** | Existing 9 components (`CohortAssessmentHero`, `WhyThisCohortSection`, `SecondaryFlagsAndPrecedence`, `RuleEvaluationTable`, `CohortMissingDataPanel`, `CohortDecisionHistoryTable`, `CohortOverrideAction`) already cover roughly 6 of the 9 required sections for the *old* schema — none can render fields that don't exist in the backend response yet (compliance hold banner, lifecycle/aging state, archetype, debt-complexity band are either absent from the API or absent from every component). |

## Rule-by-rule comparison (old R-id → old meaning vs. new R-id → new meaning)

| Rule ID | Current meaning (v-old) | v3.0 meaning | Verdict |
|---|---|---|---|
| R001 | Consent | Consent (hard gate) | **PASS** — same rule, same logic |
| R002 | Identity/KYC | Identity/KYC (hard gate) | **PASS** — same rule, same logic |
| R003 | Bureau readiness | Bureau readiness (hard gate) | **PASS**, but now subsumed by the upstream §3.2 readiness-gate short-circuit — kept as an auditable rule row, no longer the primary X1 trigger |
| R004 | Financial readiness | Financial readiness (hard gate) | **PASS**, same reframing as R003 |
| R005 | Material mismatch → contributed to X1 | Material mismatch → `BLOCKED/MANUAL_REVIEW_REQUIRED` (priority 1.5) | **CONFLICT, resolved per spec**: v3.0's own precedence table (§6.1) explicitly routes R005 to `MANUAL_REVIEW_REQUIRED`, not X1 — the spec's precedence table is authoritative over the old behavior. |
| R006 | Legal/specialist → C6 directly | Legal status active → `BLOCKED/SPECIALIST_REQUIRED` (priority 1.6) | **CONFLICT, resolved per spec**: v3.0 makes this a BLOCKED reason code, not a terminal cohort C6 — C6 itself still exists as a *lifecycle outcome* once specialist review resolves favorably, but the immediate algorithmic result is `BLOCKED/SPECIALIST_REQUIRED`. |
| R007 | Escalating DPD → holds C1 pending review | Delinquency state (soft) | **PARTIAL** — v3.0's extracted text gives no explicit formula for R007 (its code block was not present in the attachment, unlike R013/R018/R019/R022); current logic (dpdTrend-based, holds C1) is retained as the best-evidenced interpretation, documented as a spec gap rather than invented from nothing. |
| R008 | Overdue > trigger → capacity/review trigger | Overdue pressure (soft) | **PASS**, same logic, same role |
| R009 | Borrowing-to-repay | Borrowing-to-repay (soft) | **PASS**, same logic |
| R010 | Recent stacking cluster | **Debt-cycle stacking, consolidated** (replaces old R009/R010/R012 three-signal approach with one rule) | **PARTIAL→rebuild**: logic already exists as a derived boolean in `precedence.ts` (`debtCycleConfirmed`); promoted to a first-class R010 rule row per v3.0's own consolidation note (§5.1 consolidations list). |
| R011 | Enquiry burst | Enquiry burst (soft) | **PASS**, same logic |
| R012 | Stacking index (accounts/year) | **Consolidation eligibility** | **MISMATCH** — different rule entirely; old R012 logic is retained as part of the new R010 debt-cycle-stacking consolidation; new R012 (consolidation eligibility) is closest to old R019. |
| R013 | Active overdue ratio | **Capacity band, unified** (replaces old R015/R016/R017 3-rule split) | **PASS, logic exists, renumbered** — `calculateCapacity()` already produces one unified band; needs persisting as one R013 row instead of three. Old R013 (active-overdue-ratio) logic is retained as a new standalone evidence signal feeding R010/precedence, per spec's own severity note. |
| R014 | Negative surplus → C4 | **Stabilisation coverage** | **MISMATCH** — old R014 logic (surplus<0 → C4) maps to new precedence priority 3 directly (no rule-ID home needed — it's folded into the capacity band via R013=Distressed); new R014 (stabilisation coverage, §8.3) already exists as `calculateStabilisationCoverage()` in `capacity.ts` but was never wired into a rule row — it is real, implemented, correctly `NOT_APPLICABLE` pending a real BBS Plan Engine support-amount, same honest limitation as before. |
| R015 | Capacity band = STRESSED | **Recovery state** | **MISMATCH** — new R015 is old R020's concept (recovery state → C7). |
| R016 | Capacity band = TIGHT | **Outside current program** | **MISMATCH** — new R016 is old R021's concept (out of scope → X2). |
| R017 | Capacity band = COMFORTABLE | **Compliance signal, unified (hard gate)** | **MISMATCH + MISSING** — entirely new rule; old R017 (comfortable band) is retained as part of unified R013. |
| R018 | Stabilisation coverage (stub, `NOT_APPLICABLE`) | **Other accounts, with flow threshold (hard gate)** | **MISMATCH + MISSING** — entirely new rule, reading Master Profile's `cohortAttributes` (no direct "other accounts" field exists there either — needs Financial Analysis's own `OTHER_ACCOUNTS_LIKELY` risk flag, confirmed to already exist from the Financial Analysis build). |
| R019 | Consolidation eligibility | **Post-statement debt** | **MISMATCH + MISSING** — entirely new rule, reusing Master Profile's already-computed `postStatementDebt` field directly (zero new calculation needed — a straight read). |
| R020 | Recovery state | **P1 missing information, tiered** | **MISMATCH + MISSING** — entirely new rule, reusing Master Profile's `missingInformation[]` P1 count directly. |
| R021 | Out of scope | **Exception count, tiered → specialist/manual** | **MISMATCH + MISSING** — entirely new rule. "Exception count" maps to Master Profile's `dataQuality.flags.length` (the same "exception" vocabulary Master Profile's own README/doc comments already use for `exceptionStates`) — needs confirming `exceptionStates` is actually exposed via Master Profile's API response (flagged as a cross-module gap to verify in Phase 2). |
| R022 | Conflict/low confidence (resolved post-precedence) | **FCF unreconciled → capacity cap** | **MISMATCH** — entirely new rule, reusing Master Profile's `dataQuality.flags` containing `'FCF_UNRECONCILED'` directly (Master Profile already computes and flags this condition; Cohort Engine has never read it). Old R022 concept (manual-review reconciliation) has no new rule-ID home — it is better expressed as `manualReviewRequired` being set directly by the precedence resolver's own fallback case, same as today, just no longer labeled "R022." |
| R023 | — (did not exist) | **Income transition** | **MISSING, but fully implementable** — ***correction after deeper verification***: Financial Analysis's `eventProfile.incomeTransition` (`behavioural-event-detectors.ts`) already computes exactly §9.1's own fields (`detected`, `transitionMonth`, `previousAverage`, `currentAverage`, `deltaPercent`), confirmed exposed on the Financial Analysis API response (`financial-analysis.service.ts` line 477/496/520/570). No new calculation needed — only a new read in `normalize-input.ts`. (Initial pass assumed this was blocked by "no multi-snapshot income history"; that was wrong — a best-fit single-split-point transition detector already exists and is live-tested.) |
| R024 | — (did not exist) | **Medical shock** | **MISSING, but fully implementable** — ***same correction***: `eventProfile.medicalEvents` (`monthlyEntries`, `shockMonths`, `chronic`) already exists, built from real `subcategory === 'Medical'` transaction classification, and is exposed the same way. No new calculation needed. |

## Concrete, verified cross-module findings (not assumed)

1. **Master Profile already computes every field the new compliance/post-statement/P1/FCF rules need** — confirmed by reading `master-profile.service.ts`'s response builder directly (lines 444-501 at time of audit): `complianceRouting` (`complianceHold`, `reason`, `matchedEntity`, `since`, `slaHours`, `escalationHours`), `postStatementDebt` (`detected`, `accountCount`, `totalAmount`, `repaymentUnverified`, `ccrPriority`, `accounts`), `missingInformation[]` (`itemText`, `sourceModule`, `priority: P1|P2|P3`, `resolved`), `dataQuality` (`band`, `flags: string[]` — confirmed live to include `'FCF_UNRECONCILED'` for the real seeded lead during an earlier session pass), `readinessGate` (`conditions[]`, `outcome: READY|CCR_FIRST|COMPLIANCE_HOLD|SPECIALIST_REVIEW|X1_CANDIDATE|REGENERATE`, `blockingFactors[]`). **None of these five fields are read anywhere in `cohort-engine/calculations/normalize-input.ts` today** — this is the single largest, most concrete gap this audit found, and it means the new rules (R017-R022) require zero new upstream calculation work, only new Cohort Engine read/mapping code.
2. **Master Profile's `exceptionStates` DB column exists but is NOT exposed through `getForLead()`'s API response** — confirmed by direct comparison of the Prisma schema column list against the actual returned object literal. This is a real, pre-existing gap in Master Profile itself (out of this task's stated scope to fix Master Profile, but it blocks R021 "exception count" from reading a real exception *count* field cleanly) — **resolved by using `dataQuality.flags.length` instead**, which is already exposed and is a reasonable proxy for "how many data-quality exceptions are active," consistent with Master Profile's own `data-quality.ts` doc comment describing flags as "inherited L1/L2 flags + L3-specific flags" (i.e., exceptions).
3. **`OTHER_ACCOUNTS_LIKELY` risk flag already exists in Financial Analysis's risk-flag catalog, WITH the real percentage, not just a boolean** — ***correction after deeper verification***: confirmed via direct source read of `extended-metrics.ts` (lines 516-531) that the flag's own `evidence.selfTransferIncomeSharePercent` carries the lead's real, computed self-transfer-income-share percentage (rounded), not merely a threshold-crossing boolean. R018 can therefore implement the full §9.3 graduated table (`<5%` informational / `5-10%` flag / `>10%` blocked) against the lead's own real number, never a fabricated or threshold-only value.
4. **Plan Engine already consumes `CohortEngineService.getForLead()`'s current shape** (confirmed via `plan-engine.service.ts` source read) — the field-name changes this rebuild introduces (`primaryCohort` meaning changes for BLOCKED cases, new `blockedReasonCode`/`lifecycleState` fields) are a genuine downstream-breaking change requiring a deliberate Plan Engine update, not a silent one. Tracked as a Phase 5 task below.

## Resolution of the one real specification-internal ambiguity found

Section 4.2's "Blocked reason codes" table and Section 6.1's precedence table both list
`DATA_REFRESH_REQUIRED` for post-statement debt, but Section 6.2 explicitly states its
priority (1.25) and rationale ("without current data, other assessments are
unreliable") — no conflict here, both sections agree. The one genuine internal tension
found: Section 5.1 labels R017 as a **Hard gate** (compliance) but also lists R018
("Other accounts, with threshold") as a **Hard gate**, while Section 9.3's own table
shows a *graduated* response (`<5%` informational-only, `5-10%` flag only, `>10%`
blocked) — i.e., R018 is only conditionally a hard gate, not unconditionally one like
R001-R006/R017. Resolved per the spec's own Section 9.3 table (the more specific,
later section governs over the general Section 5.1 type label): R018 is implemented as
a threshold-gated rule, hard-blocking only above 10%, exactly as its own detailed table
specifies — never a blanket gate matching the coarser Section 5.1 label.

## Phase 2+ implementation plan (summary — full detail in commit history / code comments)

1. **Schema (additive migration)**: new `CohortBlockedReasonCode` enum (8 values),
   `CohortLifecycleState` enum (8 values incl. `CUSTOMER_DECLINED`/`STALE_90D`),
   `CohortComplianceAgingState` enum (5 values); new nullable `CohortDecision` columns:
   `blockedReasonCode`, `lifecycleState`, `complianceHold` (bool, default false),
   `complianceReason`, `complianceMatchedEntity`, `complianceSlaHours`,
   `complianceEscalationAt`, `complianceAgingState`, `specialistReviewReason`,
   `customerReasons` (Json string[], additive alongside the existing
   `customerExplanation` string for backward compatibility), `internalReasons` (Json
   string[]). `primaryCohort` column stays (renamed in code to `primaryState` at the
   API boundary only — the 13-value enum is narrowed in application logic to the 9 Type
   A values plus `BLOCKED`, never altering the stored enum's value set to avoid a
   destructive migration of historical rows). No existing column dropped, no row
   deleted.
2. **Rule catalog rewrite**: `rules.ts` rebuilt for the true 24-rule catalog with
   correct IDs/meanings per the table above; `precedence.ts` rebuilt for the unified
   `primary_state`/`primary_reason_code` output and the exact §6.1 11.something-priority
   table (1.0 through 9, including the new 1.2/1.25/1.3/1.4/1.5/1.6/1.7/1.8 compliance/
   data-refresh/other-accounts/P1/mismatch/legal/exception sub-priorities).
3. **Upstream readiness-gate short-circuit**: `cohort-engine.service.ts`'s `evaluate()`
   rewired to read Master Profile's `readinessGate.outcome` FIRST (§3.2's own routing
   table) before running any of the 24 rules, and the P1-count/TTL pre-checks (§3.3/
   §3.4) as the next gate.
4. **Compliance lifecycle**: new `compliance-lifecycle.ts` calculation file — hold
   creation, SLA-hours-by-trigger-type, aging-state computed on read (same "no
   cron/scheduler" discipline as Master Profile's own TTL), feedback-loop re-evaluation
   when `COMPLIANCE_CLEARED`/`COMPLIANCE_DECLINED` is recorded.
5. **Case aging model**: computed-on-read `agingState`/`ttlExpiresAt` per the §14.2
   per-block-type TTL table, same discipline.
6. **Customer decline path**: new `decline()` service method + `CUSTOMER_DECLINED`
   lifecycle state, mirroring `override()`'s own immutable-new-version pattern.
7. **Frontend rebuild**: 9-section tab rebuild per the task's own checklist, reusing
   every component that already fits and adding new ones for Compliance Hold banner
   (with aging state), Case Aging indicator, Archetype/Debt-Complexity display, and
   Customer Decline action.
8. **Plan Engine compatibility update**: `plan-engine.service.ts` updated to read the
   new `primaryState`/`blockedReasonCode` split correctly (a BLOCKED decision must
   never be silently treated as a real cohort for template selection).
9. **Tests**: full rule-by-rule boundary coverage, the Praveenkumar worked example
   reproduced as an integration fixture compared field-by-field against §22's own
   reference output, e2e chain, and the 9 named test scenarios from the task.

Implementation status for items 2-9 above is tracked turn-by-turn in this session;
this document will be updated with final PASS/PARTIAL/BLOCKED status once each phase
completes, per the task's own instruction never to claim completion without
requirement-level evidence.

## Final status — requirement-by-requirement

| Requirement | Status | Evidence |
|---|---|---|
| Schema migration (additive, no destructive change) | **PASS** | 3 new migrations applied and verified against the live dev DB: `CohortLifecycleState`/`CohortComplianceAgingState` enums, `CohortPrimaryState` +6 values, `CapacityBand` +`UNKNOWN`, 13 new nullable/defaulted `CohortDecision` columns. No column dropped, no row deleted — confirmed via `prisma migrate deploy` output and a live read of a pre-existing historical decision row still rendering correctly. |
| 24-rule catalog (R001-R024) | **PASS** | `rules.ts` fully rewritten; live-verified via `evaluateAllRules()` against the real seeded lead returning exactly 24 rows; unit tests cover every boundary per rule. |
| Unified state model: `primary_state`/`primary_reason_code`/`lifecycle_state` | **PASS** | `toPrimaryStateAndReasonCode()` implemented and live-verified (`primaryCohort: "X1"` → `primaryState: "X1"`, `primaryReasonCode: null`); `lifecycleState` persists and displays (`CCR_REVIEW` confirmed live for a real decision). |
| §6.1 precedence table (priorities 1.0-1.8, 2-9) | **PASS** | `precedence.ts` fully rewritten to the exact table; unit tests cover every priority boundary; UI's Precedence panel renders the exact numbered rows. |
| §3.2 Master Profile readiness-gate short-circuit | **PASS** | `applyReadinessGateOverride()` implemented; live-verified — the real seeded lead's `readinessGate.outcome: X1_CANDIDATE` correctly forced `primaryCohort: X1`, overriding whatever the internal 24-rule precedence would otherwise have selected (C5, visible in `secondaryFlags`). |
| §3.3 P1 missing-information enforcement | **PASS** | R020 reads Master Profile's own `missingInformation[]` P1 count directly; 0/1-3/4+ tiers implemented and unit-tested. |
| R017 Compliance signal (unified, hard gate) | **PASS** | Reads Master Profile's `complianceRouting` verbatim; unit-tested; live-verified as `false` for the clean case (no hold active on the real seeded lead at time of test). |
| R018 Other accounts (graduated) | **PASS** | Reads Financial Analysis's own `OTHER_ACCOUNTS_LIKELY` risk-flag evidence (`selfTransferIncomeSharePercent`) — a REAL percentage, not a boolean proxy (corrected from the Phase 1 audit's own initial, too-pessimistic assessment). Graduated <5%/5-10%/>10% thresholds unit-tested at the boundary. |
| R019 Post-statement debt (graduated) | **PASS** | Reads Master Profile's own `postStatementDebt` verbatim; live-verified (`"No bureau-reported account was opened after the bank statement's period end."` for the real seeded lead). |
| R020 P1 missing information (tiered) | **PASS** | See §3.3 row above. |
| R021 Exception count (tiered) | **PASS** | Reads Master Profile's `dataQuality.flags.length`; live-verified firing MANUAL_REVIEW tier at a real exception count of 12. |
| R022 FCF unreconciled → capacity cap | **PASS** | Live-verified: real lead's capacity band is STRESSED (capped) with a positive theoretical surplus, R022 rule row correctly reports `matched:true` with the exact capping explanation. |
| R023 Income transition | **PASS** | ***Corrected after deeper verification*** from the Phase 1 audit's initial (wrong) "blocked" assessment — Financial Analysis's own `eventProfile.incomeTransition` detector already exists with the exact §9.1 fields; wired in with zero new upstream calculation. |
| R024 Medical shock | **PASS** | Same correction as R023 — `eventProfile.medicalEvents` already existed and is now wired in. |
| R010 debt-cycle stacking — overdue precondition | **PASS, corrected mid-build** | An inherited precondition (`currentOverdue > 0`) was found to contradict the attached spec's own §22 Praveenkumar reference case (R010 FIRED there with `₹0 overdue`) — removed, documented in the rule's own doc comment, and confirmed correct via the live e2e run against the real seeded lead (R010 now fires from the real confirmed account-opening cluster). |
| Archetype determination (§5.5) | **PASS** | `deriveArchetype()` rewritten to the spec's own exact 3-condition table (Debt Spiral / Circumstantial / Habitual Avoider — the last now genuinely implementable, unlike the old "never assign" placeholder); live-verified producing `DEBT_SPIRAL` for the real seeded lead (a real debt-cycle signal is present). |
| Compliance lifecycle (hold → aging → escalated → cleared/declined) | **PASS** | Hold creation, SLA-hours-by-trigger-type, and computed-on-read aging (HOLD/AGING/ESCALATED) were already implemented and unit-tested. The §7.4 feedback loop is now also implemented: `clearCompliance()`/`declineCompliance()` promote the next-highest preserved candidate from `secondaryFlags` (clear) or always resolve to X2 (decline, per the spec's own explicit instruction), creating a new immutable `CohortDecision` version + a linked `CohortComplianceDecision` audit row (actor, reason, timestamp). Role-gated SUPERVISOR/ADMIN via `RolesGuard`. 6 new unit tests (promote-highest-priority, fallback-to-MANUAL_REVIEW, decline-always-X2, reject-no-active-hold, reject-already-resolved, 404-no-decision) plus 4 new service-level `getRefreshTriggers`-adjacent tests. **Live-verified against the real running dev server** on a dedicated synthetic test lead (see Test/live-verification evidence below): clear → promotes next-highest cohort, decline → X2, both persisted with full actor/reason/timestamp audit visible via `GET .../cohort`, and a second clear/decline attempt on an already-resolved hold correctly 400s. UI: `CohortComplianceAction` (SUPERVISOR/ADMIN-gated "Clear compliance hold"/"Decline (compliance)" dialogs, each requiring a ≥10-character reason) wired into `CohortAssessmentSection`'s Readiness & Compliance section; `CohortComplianceCard` now also renders the resulting compliance-action audit (action/reason/actor/when) when a decision is the result of one. |
| Case aging model (§14, 15/30/60/90-day) | **PASS** | `case-aging.ts` implements the exact per-reason-code TTL table, computed on read; exposed via `caseAging` in the API response and rendered in the UI's Readiness & Compliance card. |
| Customer decline path (§14.3) | **PASS** | New `decline()` service method + `CUSTOMER_DECLINED` lifecycle state + `POST .../cohort/decline` endpoint + `CohortDeclineAction` UI component, all wired and typechecked. **Live-verified against the real running dev server** on a dedicated synthetic test lead: `POST .../cohort/decline` with a reason produced a new version with `lifecycleState: CUSTOMER_DECLINED`, `declinedAt`/`declineReason` persisted and visible via `GET .../cohort`, confirmed in the decision-history chain. |
| Re-entry & refresh flows (§15) | **PASS** | Re-running `evaluate()` already correctly re-derives everything from current upstream state. The §15.1 trigger taxonomy is now a distinct, inspectable artifact: `calculations/refresh-triggers.ts`'s `REFRESH_TRIGGER_TAXONOMY` enumerates all 6 documented triggers (New bank statement received, New bureau pull, CCR discovery complete, Compliance cleared, Policy change, Material event), each with its exact §15.1 layer-rerun order (L1-L4), required conditions, affected assessment, expected re-evaluation behaviour, and an honest `mechanicallyDetectable`/`detectionNote` pair (5 of 6 are detectable from persisted data — `POLICY_CHANGE` is explicitly documented as never mechanically determinable, since no versioned policy-change event exists anywhere in this codebase). `inspectRefreshTriggers()` additionally computes real per-lead applicability (e.g. `isStale` → the 4 L3-triggered triggers; an active unresolved compliance hold → `COMPLIANCE_CLEARED`). Exposed via `GET .../cohort/refresh-triggers` and rendered in a new expandable `RefreshTriggersPanel` in the Audit & Downstream Handoff section. §15.3's compliance-cleared re-entry is the same `clearCompliance()` implementation described above. 9 new dedicated unit tests (`refresh-triggers.spec.ts`) plus 4 service-level tests for the orchestration method — all passing. Honestly documented: this codebase persists only ONE upstream-version pointer (`sourceMasterProfileVersion`) on `CohortDecision`, so the 4 L3-triggered triggers (new bank statement/new bureau pull/CCR discovery complete/material event) are mechanically indistinguishable from each other by cause alone today — stated plainly in `detectionNote`, not glossed over. |
| Maker-checker override governance (§19.2) | **PASS** | Enforced in `CohortEngineService.override()` for C1/C4/C6; unit-tested (missing approver, same-person approver, and the correct-ordering fix so a 404 is never masked by a maker-checker error); UI prompts for an approver ID conditionally. **Live-verified against the real running dev server** on a dedicated synthetic test lead: override to C4 with no `approverId` → 400 with the correct maker-checker message; override to C4 with `approverId` equal to the acting supervisor's own id → 400 ("requires an approver distinct from the acting user"); override to C4 with a distinct real user id as approver → 201, new version persisted, the overridden decision's `decidedAt` stamped. A genuine bug found and fixed as groundwork for this verification: the global `HttpExceptionFilter` previously collapsed any plain `Error` into a generic 500 "An unexpected error occurred," silently discarding these exact validation messages for every real HTTP/UI caller (only unit tests, which bypass the filter, ever saw the real message) — fixed by switching all 4 affected throws to `BadRequestException`, now confirmed end-to-end returning the real, specific message. Role authorization also live-verified: a CCR (non-supervisor) attempting `override`/`compliance/clear` both correctly received 403. |
| Plan Engine downstream compatibility | **PASS** | `templates/registry.ts` updated so all 6 new BLOCKED reason codes correctly fall through to the generic `pendingResolutionTemplate` (same as the 4 pre-existing upstream-gate states) — confirmed via typecheck + full Plan Engine test suite passing unchanged. No literal string comparison against the old narrower `CohortPrimaryState` value set was found anywhere else in Plan Engine (grepped directly). |
| Frontend: 9-section Cohort Assessment tab rebuild | **PASS** | All 9 sections (Cohort Executive Overview, Decision Evidence, Rule Evaluation, Readiness & Compliance, Alternative Matches & Exclusions, Missing Information & Uncertainty, Recommended Pathway & Actions, Audit & Downstream Handoff — Customer Profile & Eligibility is Master Profile's own responsibility, rendered immediately above in the same tab) confirmed rendering live via browser QA against the real seeded lead, zero console errors, zero failed network requests. |
| Reference worked example (§22 Praveenkumar case) | **RESOLVED (archetype), CONFIRMED-NOT-FORCED (capacity band)** | Reconstructed as a fixture-based integration test from the real, already-confirmed bureau/bank facts for this exact customer. `primaryCohort: COMPLIANCE_HOLD` and the expected secondary flags match exactly. **Archetype discrepancy traced and FIXED**: the bug was `debtCycleSignal` being computed as `R009.matched \|\| R010.matched` — but R010's own `matched` is deliberately BROADER than §5.5's own archetype trigger wording ("Borrowing-to-repay OR stacking index >15/year OR enquiry burst" — three specific conditions, not R010's full matched boolean, which also fires from a real account-opening cluster alone that §5.5 never lists as an archetype trigger). Fixed in `cohort-engine.service.ts` to read R010's own `stackingIndexHigh`/`enquiryBurstHigh` evidence fields directly instead of its `matched` value, combined with R009's `matched`. Re-running the exact Praveenkumar fixture now produces `archetype: CIRCUMSTANTIAL`, matching the reference's own stated `"Circumstantial Defaulter (candidate)"` exactly — a genuine traced-and-corrected bug, not a hack to force a match (the fix is justified independently by §5.5's own literal wording, confirmed before touching any code). **Capacity-band discrepancy investigated further and CONFIRMED, not forced**: traced R013's own pseudocode ("IF fcf_reconciled=FALSE: Unknown (OR capped at Stressed if theoretical surplus exists)") against the Praveenkumar case's own R004 (NOT_FIRED, meaning income/essential-expenses/mandatory-debt-payment data WAS available) — a theoretical surplus genuinely exists, so "capped at Stressed" (this implementation's actual output) is the textually precise outcome per the pseudocode's own parenthetical, not "Unknown" (the reference report's own transcribed value). Left unchanged, per the user's own instruction to document rather than force a correction without evidentiary support. Both investigations and their before/after are recorded directly in `cohort-scenarios.spec.ts`'s own test names and comments. |
| Multi-bureau cross-check (§16.3) | **NOT_APPLICABLE** | Same structural fact as Master Profile/Debt Analysis: exactly one `CreditReport` per lead ever exists in this schema. |

## Test, build, and live-verification evidence

- **Backend unit**: 1029/1033 passing (3 pre-existing, unrelated PDF-parser failures — a worker-thread "dynamic import without --experimental-vm-modules" env quirk, same documented baseline as prior passes, not caused by this work — plus 1 skipped). Cohort Engine's own suite: **162/162 passing** (up from the prior pass's 142: +6 for the §7.4 compliance clear/decline feedback loop, +9 for the §15.1 refresh-trigger taxonomy, +4 for its `getRefreshTriggers()` orchestration, +1 miscellaneous).
- **Plan Engine downstream compatibility**: 52/52 passing, unchanged — the only schema change this pass (`CohortComplianceDecision`, new nullable `CohortDecision` columns) is additive and never touched `CohortPrimaryState`'s value set, confirmed by rerunning the full suite.
- **Backend e2e**: 100/100 passing (one run hit a transient Windows jest-transform-cache `EPERM`, unrelated to this work — a clean rerun passed in full).
- **Backend build/typecheck/lint**: all clean.
- **Frontend typecheck/lint/build**: all three clean (`tsc -b`, `eslint .`, `vite build` — 2916 modules, no new warnings beyond the pre-existing chunk-size notice).
- **Live verification against the real running dev server** (backend on :3001, real Postgres, real `HttpExceptionFilter`/`RolesGuard` — NOT a unit-test mock) on **two brand-new, dedicated synthetic test leads** (`BBS-LD-TEST-T3VERIFY`, `BBS-LD-TEST-T3VERIFY-B`), seeded directly via a one-off Prisma script (`backend/scripts/seed-dedicated-test-lead.ts`) rather than through a real bureau/bank-statement/AI pipeline run — a deliberate, documented choice to avoid any live external Signzy/Claude API call this pass (both `MasterProfile.generate()` and `FinancialAnalysis` processing fire a real, non-mocked AI job on this dev server's own `.env`, `AI_PROVIDER=claude`/`CREDIT_REPORT_PROVIDER=signzy` — calling either was avoidable and avoided). The Cohort Engine's own `evaluate()`/`override()`/`decline()`/`clearCompliance()`/`declineCompliance()` endpoints never call any external API, so this does not weaken what was verified: all 17 steps below exercised the real HTTP path (`HttpExceptionFilter`, `RolesGuard`, Prisma transactions) end-to-end, not a mock.
  1. CCR (non-supervisor) → `compliance/clear` → **403** (role authorization).
  2. Supervisor → `compliance/clear` with a 5-char reason → **400** (`class-validator` `MinLength(10)`).
  3. Supervisor → `compliance/clear` with a valid reason → **201**, promoted to the first real-cohort key in `secondaryFlags` (`C3`), new version 2.
  4. `GET .../cohort` → confirmed v2 persisted: `complianceHold: false`, `complianceAction: {action: "CLEARED", reason, actorName: "Dev Supervisor", createdAt}`.
  5. Retried `compliance/clear` on the now-resolved hold → **400** ("No compliance hold is active on the latest decision for this lead.").
  6. CCR (non-supervisor) → `override` → **403**.
  7. Supervisor → `override` to C4 with no `approverId` → **400** (maker-checker message, real text — not a generic 500; see the bug-fix note above).
  8. Supervisor → `override` to C4 with `approverId` = own user id → **400** ("requires an approver distinct from the acting user").
  9. Supervisor → `override` to C4 with `approverId` = a distinct real user (the seeded CCR) → **201**, new version 3, `primaryCohort: C4`, `pathway: RESOLVE`.
  10. `GET .../cohort` → confirmed v3 persisted.
  11. `GET .../cohort/history` → all 3 versions present; v2's `decidedAt` stamped by the override (the overridden decision's own audit mark), v1 untouched.
  12. CCR → `decline` with a reason → **201**, new version 4.
  13. `GET .../cohort` → confirmed v4 persisted: `lifecycleState: CUSTOMER_DECLINED`, `declinedAt`/`declineReason` populated.
  14. `GET .../cohort/history` → full 4-version audit chain confirmed: `COMPLIANCE_HOLD → C3 → C4 → C4/CUSTOMER_DECLINED`.
  15. (Second dedicated lead) Supervisor → `compliance/decline` with a valid reason → **201**, `newPrimaryCohort: X2` (per §7.4's own explicit "If compliance declines: → X2 with reason").
  16. `GET .../cohort` → confirmed `primaryCohort: X2`, `complianceAction: {action: "DECLINED", ...}`.
  17. `GET .../cohort/refresh-triggers` → confirmed all 6 triggers returned with `perLeadApplicability: true`, correct `currentlyApplicable`/`mechanicallyDetectable` values for a resolved (non-held) decision.
  - Both dedicated test leads were deleted afterward (in correct FK order: `CohortComplianceDecision` → `CohortOverride` → `CohortRuleResult` → `CohortDecision` → `MasterProfile` → `ConsentRecord` → `Lead`) — the database was left exactly as found. The shared canonical lead `BBS-LD-900001` was read once (to confirm it was untouched, still at version 19) and never mutated this pass.
- **No browser/UI click-through was performed this pass** — no Playwright/browser-automation tool was available in this environment this turn (confirmed by searching for one before starting; none was found). The verification above is genuine, live, end-to-end HTTP verification against the real running dev server and a real Postgres database — not a unit-test mock — but it is API-level, not a literal button click in a rendered page. Stated plainly per the user's own instruction never to claim browser verification unless it was actually performed.

## Remaining gaps, stated plainly

1. No literal browser/UI button-click verification was performed this pass (no browser-automation tool was available) — the override/decline/compliance-clear/compliance-decline workflows were instead verified live against the real running backend via direct HTTP calls exercising the exact same endpoints the UI calls, including the real `RolesGuard`/`HttpExceptionFilter` behavior. The frontend components themselves (`CohortComplianceAction`, `CohortDeclineAction`, `CohortOverrideAction`) are typechecked/linted/built cleanly but their click-handlers were not independently exercised in a rendered browser this pass.
2. The capacity-band discrepancy against the §22 Praveenkumar reference report (`STRESSED` vs. the reference's transcribed `"Unknown"`) remains open — investigated further this pass and confirmed as the textually precise reading of R013's own pseudocode, not forced to match, per the user's own explicit instruction to document rather than force an unsupported correction.
3. §15.1's 4 L3-triggered refresh triggers (new bank statement, new bureau pull, CCR discovery complete, material event) remain mechanically indistinguishable from one another in this codebase, since `CohortDecision` persists only one upstream-version pointer (`sourceMasterProfileVersion`) — stated plainly in `refresh-triggers.ts`'s own `detectionNote` fields, not glossed over. Distinguishing them would require a schema change (separate source-version pointers per upstream module) out of this pass's scope.
4. `POLICY_CHANGE` (one of the 6 §15.1 triggers) is permanently not mechanically detectable in this codebase — no versioned policy-change event exists anywhere (confirmed: `configuration.ts`'s `cohortEngine` block and `ruleVersion` are both plain, undated constants). Always requires an explicit, out-of-band CCR/ops-triggered `recalculate()` call.
