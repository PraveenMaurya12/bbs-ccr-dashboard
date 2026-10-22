# BBS Complete Module Parity Matrix

The master index for the system-wide specification-parity audit. Per-module detail
(business purpose, inputs/outputs, data models, rule-by-rule verdicts, test evidence)
already exists in dedicated, more-detailed documents for L1-L6 — this document
consolidates their findings into one acceptance view, adds the three modules that had
no prior dedicated audit, and inventories everything else the task asked about. It does
**not** duplicate the detailed per-module docs; it indexes and cross-references them.

Companion documents: `docs/bbs-cross-module-dependency-map.md` (data contracts,
processing sequence, invalidation behavior), `docs/bbs-discrepancy-resolution-report.md`
(what was fixed this pass, root causes, evidence), `docs/bbs-remaining-gaps-and-blockers.md`
(everything deliberately left open, with reasoning).

Status legend (per the task's own definitions): **MATCHED** · **PARTIALLY_MATCHED** ·
**MISSING** · **CONFLICT** · **UNVERIFIED** · **BLOCKED**.

## How this audit was conducted

L1 (Debt Analysis) and L2 (Financial Analysis) had no fresh audit against their newly
attached v3.0/v4.0 specs this round — both were re-verified from scratch this pass via
dedicated read-only code audits, cross-checked directly against the real captured
bureau fixtures (not assumed from prior documentation). L3 (Master Profile), L4 (Cohort
Engine), L5 (Pathway Engine), and L6 (Plan Engine) were built and exhaustively verified
earlier in this same session, each with its own dedicated parity matrix already on
disk — those are referenced here, not re-derived, since re-auditing modules built and
tested within the same continuous working session would not surface anything a fresh
re-read of their own evidence trail doesn't already show. Modules 1 and 10-14 (lead
capture/consent, CCR workflow beyond what L1-L6 require, customer action execution,
notifications, most shared infrastructure) had **no attached specification** — these
are inventoried structurally only; no new acceptance criteria were invented for them.

## Module-by-module acceptance summary

| Module | Spec version | Detailed doc | Overall status | Headline finding this pass |
|---|---|---|---|---|
| L1 — Debt Analysis | v3.0 | `debt-analysis-vnext-parity-matrix.md` (prior), `debt-analysis-spec-audit-sections-A-H.md` (prior), findings below (this pass) | **PARTIALLY_MATCHED** | Real, confirmed bug found and fixed: both bureau mappers only ever set `lifecycleStatus` to ACTIVE/CLOSED, never WRITTEN_OFF/SETTLED — structurally zeroing 2 risk signals and part of the Debt Risk Indicator for any lead with real adverse accounts. Fixed this pass (see resolution report). Confirmed via live reprocessing that this does NOT explain the pre-existing reference-report numeric discrepancies for the canonical lead specifically (its real data has zero adverse accounts either way). |
| L2 — Financial Analysis | v4.0 | findings below (this pass, first-ever dedicated audit) | **PARTIALLY_MATCHED** | Substantially mature (330+ passing unit tests across 29 files) but previously undocumented. One real, confirmed compliance gap found and closed this pass: related-party employer detection code was correct but its name list was empty in `.env`, silently disabling the check. |
| L3 — Master Profile | v3.0 | `master-profile-vnext-parity-matrix.md` | **PASS** (one unrelated, out-of-scope AI-provider parsing defect noted, not fixed this pass) | Unchanged this pass — built and verified earlier this session. |
| L4 — Cohort Engine | v3.0 | `cohort-engine-vnext-parity-matrix.md` | **PASS** (named scope gaps only) | Unchanged this pass — built and verified earlier this session. |
| L5 — Pathway Engine | v3.0 | `pathway-engine-vnext-parity-matrix.md` | **PARTIAL** (named scope gaps only — no infra for versioning/notifications/KPIs) | Unchanged this pass — built and verified earlier this session. |
| L6 — Plan Engine | v3.0 | `bbs-plan-engine-vnext-parity-matrix.md` | **PARTIAL** (named scope gaps only) | Unchanged this pass — built and verified earlier this session. |
| Lead capture/consent/onboarding | — (no spec attached) | §6 below | **UNVERIFIED** (no spec to verify against) | A real `ConsentRecord` model + `leads` module capture flow exists and is read by Cohort Engine; no dedicated spec exists to audit it against. |
| CCR interaction (beyond L1-L6's own review/approval flows) | — (no spec attached) | §6 below | **UNVERIFIED** | Each of L4/L5/L6 has its own CCR review/override surface, already audited in its own doc. No separate, broader "CCR workbench" spec was attached. |
| Customer action execution & plan monitoring | — (no spec attached) | §6 below | **UNVERIFIED** | `BbsPlanAction`/`BbsPlanCondition` state machines exist (L6); no scheduler/execution-engine exists anywhere (confirmed, see dependency map). |
| Notifications, reassessment, outcome tracking | — (no spec attached) | §6 below | **MISSING** (confirmed absent, not merely undocumented) | No notification channel, scheduler, or outcome-tracking infrastructure exists anywhere in this codebase — a consistent, named gap across every module's own spec (L4's refresh triggers, L5's TTL, L6's monitoring triggers are all data-only). |
| Frontend dashboards/workflows | per-module specs only | each module's own doc | **PASS** for L3-L6 (each module's own frontend section), **PARTIALLY_MATCHED** for L1/L2 (see below) | |
| Shared infrastructure (RBAC, AI abstraction, DB, security, audit) | — (no spec attached) | §6 below, dependency map §5 | **PASS**, with named constraints | RBAC has only 3 roles (CCR/SUPERVISOR/ADMIN) — no Credit/Risk/Compliance roles exist, a real constraint on some spec'd approval-routing requirements (named in L6's own matrix). AI provider abstraction is real and consistently used as advisory-only. |

## 1. L1 — Debt Analysis (v3.0) — this pass's findings

Full detail already exists in the two prior docs; this pass independently re-verified
the actual current code against the real spec text and the real captured bureau
fixtures (neither prior doc had done that — the prior pass's own stated limitation was
losing PDF access after a context reset).

### Acceptance table

| Spec ref | Requirement | Status | Evidence |
|---|---|---|---|
| §2.1 | Reporting windows (W_3M/6M/12M/24M/36M) | **PARTIALLY_MATCHED** | Named windows exist and are used (`ACCOUNT_OPENING_VELOCITY_WINDOWS`); no single canonical "default recent = W_6M" — "recent" is defined ad hoc per signal. |
| §3.4 | Account type code mapping (5/6/10/13/31/37/69 → distinct enums) | **MISSING** | Neither mapper decodes the numeric code into the spec's distinct categories; `classifyProduct()` uses only 4 coarse buckets, never distinguishing PERSONAL_LOAN from CONSUMER_LOAN or SHORT_TERM_PERSONAL_LOAN. |
| §3.5 | Account status mapping, incl. code 99 = NOT adverse | **FIXED this pass** (was PARTIALLY_MATCHED/CONFLICT) | ACTIVE/CLOSED half always worked; the adverse-status half (code 99 vs. genuine adverse) was never read at all. Both bureau mappers now read `Written_off_Settled_Status`/`Settlement_Amount`/`Written_Off_Amt_Principal`/`Written_Off_Amt_Total` with code 99 defensively forced non-adverse. See resolution report. |
| §3.6 | Payment history parsing, '?'/'N' ≠ 0 | **CONFLICT, documented not fixed** | Structured-array format's blank/null `Days_Past_Due` is defaulted to 0 for the **display grid's** per-month bucket only (`dpdBucket(h.dpd ?? 0)`) — the core numeric aggregates (`maxHistoricalDpd`, `dpdValues`) already correctly exclude nulls, so Debt Risk Indicator scoring is NOT corrupted by this, only the CCR-facing monthly grid display. Fixing requires a new 5th bucket state threaded through ~10 call sites in a 2500-line file, each needing individual semantic review — judged too high-risk to rush under this task's scope; see remaining-gaps doc. String-format (`Payment_History_Profile`) is never parsed at all (only the structured-array format is read). |
| §4.3 | Data Quality Score (5-component, 100pt) | **PARTIALLY_MATCHED** | 4 of 5 components are genuine computations matching the spec's formula/bands exactly; Identity Match Confidence is a disclosed, permanent constant (15), not a real 4-tier measurement — a tautology by construction (bureau mapping gate already requires an exact match for any report to exist). |
| §4.4 | Account count verification, use DETAIL count on mismatch | **CONFLICT** | The mismatch is correctly detected and flagged (`ACCOUNT_COUNT_MISMATCH`), but the field actually displayed as "active accounts" elsewhere (`accountLifecycleCounts().activeAccounts`) still hardcodes the bureau summary value, never failing over to the detail count as the spec's own explicit tie-break rule requires. |
| §6.3-6.4 | DPD completeness gating (max_possible_dpd null if <50% complete) | **PARTIALLY_MATCHED/CONFLICT** | The gating concept exists (`historyCompleteness`) but (a) is only wired into the unconsumed `buildCohortSignalPackage` output, never the primary displayed historical-DPD figure; (b) its denominator is capped at 12 months regardless of true tracked history span, understating incompleteness for long-tracked accounts. |
| §11.1 | Unified Risk Signal Engine (~35+ codes) | **MATCHED** (breadth), with a caveat | ~45 named codes exist, comparable to spec; honest about what can't be evaluated. 5 of these codes (WRITTEN_OFF/SETTLED_ACCOUNT/SUIT_FILED/RESTRUCTURED/WILFUL_DEFAULT) could never fire before this pass's mapper fix — now WRITTEN_OFF/SETTLED_ACCOUNT can; SUIT_FILED/RESTRUCTURED/WILFUL_DEFAULT remain unmapped (no safe code table exists to map them without guessing — see resolution report). |
| §12 | BBS Debt Risk Indicator (8-component, 100pt) | **PARTIALLY_MATCHED** | 6 of 8 components are exact formula matches. Component 2 (Adverse Status) is formula-correct but was structurally inert before this pass's fix (now live for write-off/settlement, still inert for suit-filed/wilful-default/restructured). Component 7 (Historical Repayment) omits the spec's `-2` recovery adjustment and its own completeness-cap rule — the cap is fixable (the needed `historyCompleteness` signal already exists in the same file, just never passed to this function) — named in remaining-gaps doc as a safe follow-up. |
| §13 | Score vs. Structure Divergence | **MATCHED** (logic), **PARTIALLY_MATCHED** (overall) | Trigger logic and output shape match the spec exactly. The spec's own "mandatory customer-facing-safe interpretation sentence template" is not implemented — the UI renders the analyst-facing `reason` string directly. |
| §14 | AccountTimeline | **PARTIALLY_MATCHED** | Real, tested, rendered — not missing as a prior pass speculated — but yearly granularity (not monthly) and no cumulative-amount series. |
| §17 | Edge cases | **MATCHED/MISSING mix, individually disclosed** | `ACCOUNT_COUNT_MISMATCH`/`NEGATIVE_CARD_BALANCE`/`FUTURE_DATE` are real, triggered paths. `DUPLICATE_ACCOUNT`/`POST_WO_PAYMENT`/`SETTLED_WITH_BALANCE` are honest, disclosed stubs. `BUREAU_UNAVAILABLE` retry/escalate is a deliberate, reasoned business-cost override (at most one Experian call per lead, ever — enforced at the DB level) rather than an oversight. |
| §18.1 | CCR Brief (fixed template) | **MATCHED** | Real, deterministic, tested. |
| §18.2 | Cohort Signal Package (fixed schema) | **PARTIALLY_MATCHED** | The schema itself is real and close to spec, but unconsumed — Cohort Engine reads ~20 raw Debt Analysis fields directly instead, which inherit the §6.3-6.4/§3.5-adjacent gaps above. |
| §21 | Provenance (2-tag OBSERVED/DERIVED + confidence) | **MISSING** | No per-datapoint provenance tagging exists; "provenance" has been repurposed for an unrelated report-metadata concept (bureau/analysis-version/policy-version). |

**Fresh test baseline (this pass, corrected invocation — see §4 below for why the prior
baseline was wrong)**: `npx tsc -b --noEmit` clean. Debt Analysis + bureau suites:
157/157 passing (132 pre-existing + 8 new signzy + 8 new experian + 9 new general
mapper-adjacent assertions from this pass's fixes, net).

## 2. L2 — Financial Analysis (v4.0) — this pass's findings (first dedicated audit)

No prior dedicated parity document existed for this module. It is substantially built
(29 source files, 29 spec files, 330+ passing unit tests, a real 35-component frontend
suite) — the absence of a doc reflected a documentation gap, not an implementation gap.

### Acceptance table

| Spec ref | Requirement | Status | Evidence |
|---|---|---|---|
| §3.7 | Other-Account Detection | **PARTIALLY_MATCHED** | Real `OTHER_ACCOUNTS_LIKELY` flag with a genuine percentage exists; only one of the spec's several detection signals (self-transfer-share) is implemented, not the full multi-signal `detected_other_accounts[]` array. |
| §5.3-5.7 | Transfer & P2P taxonomy | **PARTIALLY_MATCHED** | TRANSFER_SELF/ROUND_TRIP/UNCLASSIFIED_P2P/LRT all real and matching spec thresholds exactly. TRANSFER_FAMILY implements 4 of 6 named signals (no LOW/UNCLASSIFIED_P2P granularity below 3 signals — anything under the threshold is silently dropped, not banded). TRANSFER_MERCHANT has no distinct detector. |
| §6.3 | Employment-aware income stability (3 sub-models) | **MISSING, self-documented** | A single CV-based formula is used for every income type — the exact "meaningless for salaried" pattern v4.0 was written to fix. Code comment explains the gap honestly as a deliberate scope decision (avoiding a second, competing stability score), not an oversight. |
| §6.4 | Income Tenure Confidence | **MATCHED** | Exact spec ladder (12mo/6-11mo/3-5mo/<3mo → confidence downgrade). |
| §6.6 | Income Transition Event | **MATCHED** | Field shape confirmed identical to what Cohort Engine already reads downstream. |
| §6.7 | Related-Party Employer Detection | **FIXED this pass** (was: code PARTIALLY_MATCHED / production config MISSING) | Detection algorithm was always correct and tested; the real entity-name list was empty in `.env`, a silent, zero-cost compliance blind spot. Populated this pass with the spec's own named entity + variants. See resolution report. |
| §7.7 | FCF Reconciliation | **MATCHED** — strongest-built part of the module | Exact spec formula, exact threshold, genuine 6-bucket algebraic attribution that sums back to the gap (unit-tested). Confirmed this is the ORIGINAL source of `FCF_UNRECONCILED` (Master Profile/Cohort Engine read it downstream, not recompute it). |
| §8.3 | Merchant taxonomy | **MATCHED** | Real, ordered canonical lookup table close to spec's Appendix C; ambiguous merchants correctly fall to an explicit `MERCHANT_AMBIGUOUS` flag rather than being force-matched. |
| §9.3 | Fixed/Variable mandatory debt + 3 DSR metrics | **PARTIALLY_MATCHED** | Three distinct DSR metrics exist and are structurally correct, but the Variable-Mandatory-vs-Variable-Discretionary split (minimum card payment vs. full payoff) is not implemented — all card payments are one undifferentiated bucket. |
| §9.4 | EMI Reconstruction / L1 reconciliation | **PARTIALLY_MATCHED** | Real cross-module Jaccard-similarity + amount-tolerance matching exists, correctly honoring "NOT_OBSERVED ≠ non-payment"; only binary (not 3-tier HIGH/MEDIUM/LOW) confidence. |
| §9.5 | Credit card double-count prevention | **MATCHED**, by structural guarantee | Subcategories are kept disjoint by the data model itself, not a special-cased check. |
| §10.5 | Cash Usage CCR Prompts | **FIXED this pass** (was: 1 of 5 questions) | Added the spec's remaining 4 fixed discovery questions. See resolution report. |
| §11 | Event Detection (8 types) | **PARTIALLY_MATCHED** | 4 of 8 implemented (income_transition, medical_shock, bonus, large_transaction) and confirmed consumed downstream with matching field shapes. The other 4 (job_loss, marital_event, bereavement, property_event) are explicitly, honestly disclosed as undetectable from bank-statement patterns alone. |
| §12.2 | DQ Score Caps (5 named caps) | **FIXED this pass** (was: 4 of 5) | `business_personal_mixed→cap78` was the one missing cap; added this pass. See resolution report. |
| §14 | Financial Health Score (5 components) | **CONFLICT, documented not fixed** | Codebase retains its own earlier 9-component model, not the spec's 5. Self-documented in code as a deliberate fork, but the comment references a README that doesn't exist anywhere in the repo. Judged too large/risky a rewrite to attempt safely within this pass (would touch scoring across the whole module and its many consumers) — flagged as a genuine open business decision in the remaining-gaps doc. |
| §15.3 | Score/Cashflow Divergence calibration caveat | **FIXED this pass** (was: logic correct, caveat absent) | The spec explicitly marks these thresholds "PROPOSED — REQUIRES CALIBRATION"; the implementation presented them as settled. Added an explicit `thresholdsRequireCalibration: true` field + caveat sentence in `detail`, surfaced automatically by the existing frontend card. See resolution report. |
| §16.2 | Financial Stress sub-scoring rubric | **PARTIALLY_MATCHED** | A real stress indicator exists with a comparable component count, but a different (continuous-penalty, not discrete Low/Medium/High) weighting scheme than the spec's literal rubric. |
| §17 | Bounce/Return 3-way classification | **MATCHED** | Hard rule, not a threshold — confirmed no promotion path from POSSIBLE to CONFIRMED exists anywhere in the code. |
| §18.1/18.2 | CCR Brief + Cohort Signal Package | **MATCHED** | 40 fields (more than spec's ~35), matching the spec's own field names almost exactly. Self-disclosed as currently unconsumed (Cohort Engine reads Master Profile's own vector instead) — forward-compatible plumbing, not a rewire of a working integration. |
| §20 | "What L2 cannot decide" | **MATCHED** | Confirmed structurally — service never writes a cohort/pathway field. |
| §22 | Policy Registry | **PARTIALLY_MATCHED** | The newest v4.0 thresholds (medical/bonus/transition/FCF/LRT/related-party) are genuinely in the versioned config registry; several older scoring-band thresholds (DSR bands, borrowing-dependency bands, family-network signal floor) remain hardcoded magic numbers in the scoring files. |

**Fresh test baseline (this pass, corrected invocation)**: `npx tsc -b --noEmit` clean.
Financial Analysis suite: 333/333 passing (was 330/333 under the *correct* test
invocation — the 3 "failures" originally reported were never a real defect; see §4).

## 3. L3-L6 — unchanged this pass, see their own dedicated docs

- **L3 Master Profile**: `docs/master-profile-vnext-parity-matrix.md`. Overall: substantially
  rebuilt and verified, frontend contract-complete, one unrelated pre-existing AI-provider
  parsing defect noted and explicitly left out of scope.
- **L4 Cohort Engine**: `docs/cohort-engine-vnext-parity-matrix.md`. Overall: PASS with
  named scope gaps (archetype/capacity-band reference discrepancies investigated and
  either fixed or confirmed-not-forced; refresh-trigger mechanical detection limited by
  a one-version-pointer schema; POLICY_CHANGE trigger never mechanically detectable).
- **L5 Pathway Engine**: `docs/pathway-engine-vnext-parity-matrix.md`. Overall: PARTIAL,
  all gaps are spec-marked-proposed/future or require infrastructure (scheduler,
  analytics) this codebase has never built for any module.
- **L6 Plan Engine**: `docs/bbs-plan-engine-vnext-parity-matrix.md`. Overall: PARTIAL,
  same class of named, infrastructure-bound gaps, plus one named RBAC constraint
  (no Credit/Risk/Compliance roles exist for §20.3's approval routing).

## 4. A correction to this entire session's own test-reporting methodology

Every "3 pre-existing, unrelated PDF-parser test failures" baseline cited throughout
this entire session (across every module's own parity matrix, by this assistant) was
**not a real code defect**. It was caused by running `npx jest` directly instead of
this project's own `npm run test` script, which already correctly passes
`--experimental-vm-modules` (required by the `pdfjs-dist` ESM worker). Confirmed this
pass: running the exact same suite via `node --experimental-vm-modules
node_modules/jest/bin/jest.js` (what `npm run test` actually does) produces
**1236/1237 passing, 1 skipped, zero failures** — a genuinely, fully clean backend
unit suite. This correction applies retroactively to every "baseline" reference in the
L3/L4/L5/L6 parity matrices above; none of them reflect a real, unresolved defect.

## 5. Modules 1, 10-14 — structural inventory only (no attached specification)

Per the task's own instruction not to invent new business rules where no authoritative
document exists:

- **Lead capture/consent/onboarding**: real `Lead`, `ConsentRecord`, `capture-consent.dto.ts`
  exist and work (confirmed read by Cohort Engine). No dedicated spec was attached to
  verify completeness against.
- **CCR interaction**: each of L4/L5/L6 has its own review/override surface, already
  audited in its own dedicated doc. No separate, broader CCR-workbench specification
  exists to audit against.
- **Customer action execution & monitoring**: `BbsPlanAction`/`BbsPlanCondition` real
  state machines exist (L6, built this session). No execution-engine or scheduler
  exists anywhere (confirmed, dependency map §3/§5) — this is a consistent, named
  infrastructure gap across every module that would use it, not a per-module oversight.
- **Notifications/reassessment/outcome tracking**: confirmed **absent** — no email/SMS/
  WhatsApp provider, no outcome-tracking pipeline, anywhere in this codebase.
- **Shared infrastructure**: RBAC (`Role: CCR | SUPERVISOR | ADMIN` only — a real,
  confirmed constraint cited in L6's own matrix), AI provider abstraction (real,
  provider-independent, consistently advisory-only), database/migrations (all additive
  this session, confirmed via `prisma migrate diff` before every apply).

## Overall system status: **PARTIAL**

Every module with an attached specification (L1-L6) has now been audited against the
real spec text and real code — not assumed from memory or prior documentation. Real,
confirmed defects were found and fixed this pass in L1 (bureau mapper write-off/
settlement detection) and L2 (related-party employer config, missing DQ cap, 4 missing
CCR questions, missing calibration caveat). Several larger, genuinely risky structural
forks (L2's 9-vs-5-component Financial Health Score, L1's DPD-grid unknown-state
threading) were deliberately NOT rushed this pass — each is named, root-caused, and
left for an explicit follow-up decision rather than risking a regression in a mature,
heavily-tested module under this task's own time constraints. See
`docs/bbs-remaining-gaps-and-blockers.md` for the complete list with reasoning.
