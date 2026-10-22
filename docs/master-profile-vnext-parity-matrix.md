# BBS Master Profile Module vNext — Parity Matrix

Source of truth: `BBS Master Profile Module v3.0.pdf` (functional spec, read in full) and
`BBS Master Profile — Praveenkumar Maurya.pdf` (populated reference report for lead
`BBS-LD-900001`, same customer as the Debt Analysis vNext work earlier this session —
PAN DJFPM7283E, credit score 748). Both were supplied as message attachments and read
directly; unlike the earlier Debt Analysis pass, these are available in full for this
pass (no PDF-access limitation this time).

Current implementation was audited directly (not assumed) via two investigation
passes: `backend/src/modules/master-profile/` (service, calculations, types, schema)
and `src/features/leads/components/lead-detail/master-profile/` (UI). The current code
cites an internal, unversioned "Spec Part N" numbering scheme — it was built against a
different/earlier design document than the attached v3.0 PDF, so many concepts below
are genuine rebuilds, not incremental tweaks.

Status legend: **PASS** (already matches v3.0) · **PARTIAL** (exists, shape differs) ·
**MISSING** (does not exist) · **BLOCKED** (cannot be built honestly with current
upstream data) · **NOT_APPLICABLE** (v3.0 section conditional on infrastructure this
codebase doesn't have, e.g. multi-bureau).

## Acceptance summary

| Area | Status | Notes |
|---|---|---|
| Data Quality — band + flags (§4.4) | **MISSING** | No DQ concept at all exists for Master Profile today. |
| 5 Dimensions grouping (§6/§7-10) | **MISSING** | Current code has a flat 13-key fact object, no "dimension" vocabulary. |
| Alignment States — 5 states + COMPLIANCE_HOLD (§12.1) | **PARTIAL→rebuild** | Current has 6 *differently-named* states; COMPLIANCE_HOLD doesn't exist. |
| Identity reconciliation incl. bureau PAN+name (§3.3 G6) | **PARTIAL→real gap found** | Current `reconcileIdentity(lead, customer)` never ingests the bureau's PAN/name at all — see finding below. |
| Resolution Capacity bands (§16/§17) | **PARTIAL→rebuild** | Current: 4 bands (STRONG/MODERATE/LIMITED/UNKNOWN), no formula. v3.0: 6 bands with an explicit stress-buffer formula. |
| Readiness Gate R1-R8 (§22) | **MISSING** | No gate structure exists. |
| Compliance routing + SLA (§14) | **MISSING** | No related-party/BBS-affiliate detection anywhere. |
| Credit-Bank Reconciliation match states (§5.2) | **PARTIAL** | Current has 5 states incl. `UNMATCHED_PAYMENT`; v3.0 wants 8, including `POST_STATEMENT`, `AMOUNT_MISMATCH`, `TIMING_MISMATCH`. |
| L1 post-statement debt flag (§5.7) | **MISSING** | No concept at all; directly relevant to this exact customer (₹8.86L Bajaj debt opened after the L2 statement window). |
| Missing Information Register, P1/P2/P3 (§20) | **MISSING** | Current `validationRequired` is a flat, untiered list. |
| Possible Causes (OBSERVED/SUPPORTED/POSSIBLE/UNKNOWN) | **PASS** | Already matches exactly. |
| Strengths/Concerns/Opportunities caps (§18.1, 5/10/5) | **PARTIAL** | Lists exist, no cap enforcement, no explicit threshold rubric. |
| Three as-of date fields (§13.1) | **MISSING** | Only one `generatedAt` exists; no `l1_data_as_of`/`l2_data_as_of`/`combined_data_window`. |
| Family network verification (§9.2) | **MISSING** | No concept in Master Profile (Financial Analysis has its own `family-network-detector.ts` for a related-but-different purpose — detecting P2P family transfers for income/transfer classification, not for essential-expense capacity treatment). |
| Multi-bureau reconciliation (§3.4) | **NOT_APPLICABLE** | `CreditReport.leadId` is `@unique` — exactly one bureau report per lead, ever (same structural fact already confirmed in the Debt Analysis pass). No second bureau report can exist to reconcile against. |
| Multi-account consolidation (§3.5) | **NOT_APPLICABLE** | Exactly one `BankStatementAnalysis` is treated as current per lead (latest `COMPLETED` one); no simultaneous multi-bank ingestion exists. |
| Cohort attribute vector numeric bands (§21.2) | **PARTIAL** | A 20-field vector already exists but with coarser bands (e.g. 3-value `MasterDebtBand` vs. v3.0's 4 explicit numeric cutoffs) and is **never rendered in the UI at all** — dead data. |
| `cohortAttributes` UI exposure | **MISSING** | Confirmed via frontend audit: computed and typed, but no component renders it. |
| Downstream (Cohort Engine) compatibility | **TO VERIFY** | Cohort Engine currently reads Debt Analysis fields directly in places (confirmed in the Debt Analysis vNext pass), not exclusively Master Profile's `cohortAttributes` — needs re-confirmation after this rebuild changes the vector's shape. |

## Concrete finding from live data (BBS-LD-900001, real seeded fixture) — corrected after deeper verification

Pulled the live Master Profile API response for the exact same canonical lead used
throughout this session (`BBS-LD-900001`). Its `Lead.fullName` is genuinely **"Ananya
Rao"** (phone +91 90000 10001, email ananya.rao@example.test, Bengaluru) — not a bug.
Per the seed's own `notes` field, this is intentional: the **lead-form** identity
differs from the identity described in the earlier Debt Analysis reference materials
for this same bureau-data case.

**Initial hypothesis, since corrected**: a first pass concluded `reconcileIdentity()`
should ingest a third, bureau-sourced "PAN + name" input (per v3.0 §3.3's G6 gate) and
flagged this as a real defect. Direct verification proved that wrong:
- `CreditReport` has no structured name field anywhere, and its `maskedIdNumber` is an
  **Aadhaar-style** masked value (`XXXX-XXXX-0001`), not a PAN.
- The raw stored bureau response for this lead contains neither a PAN string nor a
  name string anywhere (checked directly, not assumed).
- `hashPan()` (`backend/src/common/security/pan-hash.ts`) confirms by explicit design:
  **"the raw PAN itself is never persisted anywhere in this schema"** — only a
  one-way HMAC (`Lead.panRef`/`Customer.panRef`) is ever stored, specifically so no
  plaintext PAN can leak even internally.
- `identity.ts`'s own existing doc comment *already* states this exact constraint
  verbatim: "neither CreditReport nor BankStatementAnalysis carries a raw name/DOB to
  cross-check against." The current code was already built with this limitation
  correctly understood — there is no bureau-side name/PAN source to add as a third
  input, because none exists anywhere in this schema, by deliberate privacy design.

**The real, narrower gap**, found only after this correction: `reconcileIdentity()`
currently reduces both `Lead.panRef` and `Customer.panRef` to a single boolean
(`panAvailable: lead.panAvailable || customer?.panAvailable`) — it checks whether a PAN
reference exists at all, but **never compares the two hashes for equality** when both
are present. Since both are HMACs of the same raw PAN under the same pepper, hash
equality is a fully honest way to detect "the CCR-verified PAN differs from what the
lead originally submitted" (a real G6-relevant identity mismatch) without ever needing
the plaintext. **Status: PARTIAL, fixed this pass** — see `identity.ts` changes below.

## Phase 1 (schema) — DONE

Additive Prisma migrations (3): `20261014064442_master_profile_vnext_v3` (new enums
`MasterDataQualityBand`/`ReadinessOutcome`/`MirPriority`; `CreditFinancialAlignmentState`
remapped 6→5 values with a hand-written `CASE`-based data migration, not a naive
text-cast, since 3 old labels rename and 2 are removed — verified against the live DB:
the 44 pre-existing rows that held the now-removed `DATA_CONFLICT_VALIDATION_REQUIRED`
value became `NULL`, never destroyed; `ResolutionCapacityLevel` 4→6 values, old
`LIMITED`→`TIGHT`; `ReconciliationMatchState` extended 5→8 values, additive only; new
`MasterMissingInformationItem` child table), `..._compliance_entity` (one additive
column), `..._family_network` (one additive Json column). No table dropped, no row
deleted, no destructive backfill — verified directly against the live dev DB before and
after.

## Phase 2 (calculation engine) — DONE

Every calculation file rewritten/added per the plan: `identity.ts` (real fix — see
below), `data-quality.ts` (new), `compliance-routing.ts` (new, reuses Financial
Analysis's own already-computed `relatedPartyEmployer` signal rather than
re-detecting it), `alignment.ts` (rewritten for 5 states + COMPLIANCE_HOLD override),
`resolution-and-cohort.ts` (rewritten: exact §16 surplus/stress-buffer/band formula,
cohort vector's `totalDebtBand` corrected to be income-relative per §21.2),
`post-statement-debt.ts` (new), `readiness-gate.ts` (new, R1-R8), `missing-information-
register.ts` (new, P1/P2/P3), `dimensions.ts` (new, 5-dimension confidence), `family-
network-verification.ts` (new, reuses Financial Analysis's own `detectFamilyNetwork`
output), `signals.ts` (added the 5/10/5 cap + HIGH-or-paired-MEDIUM strength rubric).

**Real defect found and fixed during this phase** (not hypothetical — discovered by
reading `identity.ts` and the live DB directly): `reconcileIdentity()` reduced both
`Lead.panRef` and `Customer.panRef` (one-way PAN hashes) to a single boolean
(`panAvailable`), never comparing the two hashes for equality. Fixed to add
`panRefConflict` — a genuine hash-equality check satisfying v3.0 §3.3's G6 gate
("Identity consistent (PAN + name)") without ever touching a plaintext PAN (confirmed
via `hashPan()`'s own doc comment that no schema anywhere persists one). An initial,
incorrect hypothesis (that identity reconciliation should ingest a third "bureau
PAN+name" source) was tested directly against the live DB and raw bureau response and
disproven before this narrower, correct fix was made — documented in full above as a
worked example of verifying before implementing.

Tests: 9 new/extended spec files, 81/81 master-profile backend tests passing (up from
the pre-rebuild baseline), including a reconstruction of the Praveenkumar FCF-
unreconciled MARGINAL-capping case as an explicit numeric test.

## Phase 3 (service orchestration) — DONE

`MasterProfileService.generate()` fully rewired: computes data quality, compliance
routing, post-statement debt, family-network verification, the readiness gate, and
per-dimension confidences in the correct dependency order (data quality and timeline
facts before alignment classification — the same ordering lesson already learned and
applied in the Debt Analysis vNext pass), persists all of it (including the new
`MasterMissingInformationItem` rows), and `getForLead()` serves every new field back
with the same `?:` optional-for-backward-compatibility convention used everywhere else
in this codebase.

**Live verification against the real seeded lead `BBS-LD-900001`** (fresh CCR-initiated
`generate()`, no new bureau pull): the new pipeline produced genuinely working,
internally-consistent, non-fabricated output —
```
dataQuality: { band: "LOW", flags: [...12 real flags...] }
resolutionCapacity: "MARGINAL"   // correctly capped by the real FCF_UNRECONCILED flag, exactly the §16.5 rule this phase implemented
readinessGate.outcome: "X1_CANDIDATE"  // correctly routed because the DQ band fell below LOW-MODERATE
l1DataAsOf: "2026-09-30T18:08:52.000Z"  // the real CreditReport.pulledAt
l2DataAsOf: "2026-09-18T00:00:00.000Z"  // the real bank-statement period end
complianceRouting.complianceHold: false  // correctly false — FINANCIAL_RELATED_PARTY_EMPLOYER_NAMES is unset in this environment's .env, so Financial Analysis's own detector (which Master Profile reuses rather than re-implementing) has nothing configured to match against. Not a bug: an empty affiliate list honestly produces no match.
```
This is real evidence the rebuild works end-to-end, not merely that it type-checks.

## Phase 4 (frontend) — DONE

**Done in this pass** (UI rebuild + full API contract parity): `MasterProfileTab.tsx`
rebuilt into the 7-section structure (Executive Profile; Identity & Reconciliation;
Credit & Debt Position; Income/Cash Flow & Capacity; Compliance & Readiness Gate;
Missing Information & Verification; Final Profile & Downstream Handoff), each section
numbered and labeled so a CCR can navigate the same hierarchy the v3.0 reference report
uses. 7 new presentational components added: `ComplianceHoldBanner` (never renders a
hold as a positive state — the hold banner is the single most visually distinct element
on the tab, violet-accented, when active), `ReadinessGateCard` (R1-R8 pass/fail +
outcome badge + blocking factors, a failed condition always stays visibly red),
`PostStatementDebtCard` (§5.7, explicit "timing gap, not a missed-payment signal"
framing), `FamilyNetworkVerificationTable` (§9.2, reuses Financial Analysis's own
detector output), `MasterMissingInformationRegisterCard` (§20, grouped P1/P2/P3 with an
open/total count), `DimensionConfidenceCard` (§4.2, the 5 dimensions rated
independently), and `CohortAttributeVectorCard` — this renders `cohortAttributes` for
the first time ever (previously confirmed dead data, computed but never shown),
explicitly labeled "handed to Cohort Engine... Master Profile does not assign a cohort
itself" per §19/§24's own instruction. 3 existing components extended rather than
replaced: `MasterProfileHero` (the two previously-hardcoded always-green "Credit
report"/"Bank statement" pills now show the real `l1DataAsOf`/`l2DataAsOf` dates when
present, falling back to the old plain label when absent — never fabricates a date for
a legacy profile; added `DataQualityBandBadge`), `ExecutiveProfileCard` (added the DQ
band badge plus a "Key limitations" list built from `dimensionConfidences`, replacing
the single `overallConfidence` number as the sole confidence surface per §4.2),
`IdentityReconciliationCard` (added a `panRefConflict` banner — an explicit unresolved-
identity-discrepancy warning that never displays a PAN, consistent with the existing
"PAN on file: Available/Not available" boolean-only pattern). `MasterReconciliationTable`
moved into Section 2 unchanged (its `ReconciliationMatchLabel` dependency already
handled all 8 match states from an earlier pass). Every new/extended component reads
its field as `| undefined` and renders an honest `NotAvailable` placeholder rather than
a fabricated 0/empty value when the field is absent on a legacy profile version.

**API/type-contract parity audit result**: every field the backend's
`MasterProfileService.getForLead()` response serializes (re-verified directly against
`master-profile.service.ts` lines 444-501, not assumed from an earlier pass) has a
matching frontend type in `types.ts` and is now rendered in the section the spec
requires — `l1DataAsOf`/`l2DataAsOf` (Section 1), `dataQuality` (Sections 1 and the
Hero), `complianceRouting` (Section 5), `postStatementDebt` (Section 3),
`readinessGate` (Section 5), `dimensionConfidences` (Sections 1 and 6),
`familyNetworkVerification` (Section 4), `missingInformation` (Section 6),
`cohortAttributes` (Section 7, newly rendered). No field remains contract-complete but
presentation-incomplete — the Phase 3 gap this matrix previously tracked is closed.

**Build/lint/typecheck**: `tsc -b` clean, `vite build` clean (2912 modules, no new
warnings beyond the pre-existing chunk-size notice), `eslint .` clean (zero errors/
warnings).

**Browser QA — PERFORMED this pass**, via the same real Chromium/Playwright setup
already installed in this session's scratch directory, against the live dev servers
(backend :3001, frontend :5173, both already running) and the real seeded lead
`BBS-LD-900001`. Logged in as the real dev CCR account, navigated to the Final Profile
tab, and confirmed: all 7 numbered sections render in order; all 27 card titles present
(`Executive profile`, `Identity`, `Credit ↔ bank reconciliation`, `Financial snapshot`,
`Credit report vs. bank statement`, `Post-statement debt`, `Repayment capacity`, `BBS
financial stress`, `Resolution readiness`, `Family network verification`, `Compliance
routing`, `Readiness gate`, `Missing information register (23 open of 23)`, `Dimension
confidence`, `Strengths`, `Concerns`, `Opportunity signals`, `Why this profile?`,
`Possible drivers`, `Before resolution planning`, `Cohort attributes (handed to Cohort
Engine)`, plus the existing Cohort Assessment sub-cards below it); **zero browser
console errors and zero failed/4xx/5xx network requests** across the full page load and
scroll-through. Live values observed, non-fabricated: Readiness Gate outcome
`X1 — Insufficient data` with R3 failing (`DQ band is LOW`) and the blocking factor
rendered in red; Compliance routing correctly shows "No active hold"; Missing
Information Register correctly shows all 23 open items under a single `P2 — Important`
group (0 P1 items, consistent with R6 passing); `cohortAttributes` now visibly lists all
19 fields with the explicit "Master Profile does not assign a cohort itself" caption.

**Real, pre-existing issue found during this QA pass (not introduced by this rebuild,
out of scope to fix here)**: the Executive Profile narrative renders a raw JSON blob
instead of a plain sentence for this lead's latest profile version. Root cause isolated
to `gemini-ai-provider.ts`'s `parseMasterProfileAssessmentFindings` (line ~681): when
the real Gemini response (this dev environment has a live `GEMINI_API_KEY` configured,
confirmed via `.env`) does not parse as the expected JSON shape, the fallback assigns
the *entire raw response text* to `executiveProfile` rather than a clearer failure
state. `ExecutiveProfileCard` renders `findings.executiveProfile` verbatim by design
(the spec's own instruction — never rephrase/hardcode the AI's narrative here), so the
UI is behaving correctly per contract; the defect is in the AI-provider response
parsing, a different module than this task's scope (Master Profile UI + contract
parity, not the Gemini provider's prompt/parsing robustness). Documented here rather
than silently patched, per this task's own "never fabricate" instruction — masking it
in the UI (e.g. stripping JSON-looking text) would hide a real backend signal that this
profile's AI synthesis actually failed to parse correctly. **Status: BLOCKED (reported,
not fixed — out of scope for this pass).**

## Phase 5 (downstream, regression, QA) — DONE for what was verified

**Downstream compatibility — PASS, with one real bug found and fixed**: a direct grep
(not assumption) found `cohort-engine/calculations/normalize-input.ts` comparing
`alignmentState` against the literal string `'DATA_CONFLICT_VALIDATION_REQUIRED'` —
a value Master Profile will never produce again (TypeScript didn't catch this because
the comparison was against a loosely-typed string, not the shared enum). This would
have silently broken Cohort Engine's own R005 rule ("unresolved material mismatch")
with no compiler error and no test failure to flag it. Fixed to check `alignmentState
=== null` (the new honest signal), with a care-taken distinction from "no Master
Profile exists at all" (a different, already-handled upstream-readiness concern).
Verified via a broad repo-wide grep that no other file (backend or frontend) retained
a stale reference to any removed enum value. Cohort Engine suite: 126/128 (2
pre-existing skips, same baseline). Plan Engine was not touched by this rebuild and was
not re-tested separately (it consumes only Cohort Decision + Master Profile facts
through Cohort Engine's own normalized input, which this fix already covers).

**Regression**: full backend `npx jest`: 981/987 (3 pre-existing unrelated PDF-parser
failures, 3 skipped — identical to the pre-existing baseline throughout this session).
Full e2e `npm run test:e2e`: 100/100, run twice to confirm stability (one assertion in
`master-profile.e2e-spec.ts` needed updating for the new 5-state alignment vocabulary —
fixed). Frontend `tsc -b`, `vite build`, and `eslint` all clean.

**Visual/browser QA — PERFORMED this pass** (see Phase 4 above for the full detail):
real Chromium/Playwright against the live dev servers and the real seeded lead, zero
console errors, zero failed requests, all 7 sections and 27 cards confirmed rendering
with live, non-fabricated values.

**Downstream re-confirmation this pass**: the live Cohort Assessment section (unchanged
this pass) rendered its full existing decision — `Why this cohort?`, `Secondary flags`,
`Precedence`, `Rule evaluation`, `Next review`, `Decision history` — directly beneath
the new Section 7, proving the rebuilt Master Profile response shape remains fully
compatible with the already-evaluated Cohort Decision for this lead; no regression
introduced by moving `CohortAssessmentSection` into Section 7 (same component, same
props, only its position in the tab changed).

## Discrepancy register — requirement-by-requirement (this pass's own task scope)

| Requirement | Backend implementation | API field | UI component | Test evidence | Status | Explanation |
|---|---|---|---|---|---|---|
| Section 1: profile generation date + L1/L2 source freshness | `MasterProfileService.getForLead()` | `generatedAt`, `l1DataAsOf`, `l2DataAsOf` | `MasterProfileHero` | Live browser QA: "Credit report as of 30/09/2026", "Bank statement as of 18/09/2026" | **PASS** | Dynamic, falls back to plain label if absent on a legacy profile. |
| Section 1: Data Quality Score and band | `dataQualityBand`/`dataQualityFlags` columns | `dataQuality.band`/`.flags` | `MasterProfileHero`, `ExecutiveProfileCard` (`DataQualityBandBadge`) | Live QA: badge shows "Low" | **PASS** | Band only, never a numeric score — matches §4.4.1's explicit instruction. |
| Section 1: overall confidence + key limitations | `overallConfidence`, `dimensionConfidences` | same names | `ExecutiveProfileCard` | Live QA: "Key limitations — Credit health: Low confidence; Income & cash flow / Alignment & capacity: Medium confidence" | **PASS** | Per-dimension, not a single averaged number, per §4.2. |
| Section 2: identity fields incl. unresolved discrepancies | `reconcileIdentity()` | `identitySnapshot.panRefConflict` | `IdentityReconciliationCard` | Typecheck + live QA (lead's `panRefConflict` is `false`, banner correctly absent) | **PASS** | Banner never shows a raw PAN, only match status — not exercised with a `true` fixture this pass (none seeded), logic verified by code read + prior backend unit test. |
| Section 2: credit-to-bank alignment, 8 match states | `ReconciliationMatchState` enum | `reconciliationRows[].matchStatus` | `MasterReconciliationTable` via `ReconciliationMatchLabel` | Live QA: 5 rows, all "Partially matched" | **PASS** | Already handled all 8 states before this pass; only its tab position changed. |
| Section 3: post-statement debt flag | `detectPostStatementDebt()` | `postStatementDebt` | `PostStatementDebtCard` | Live QA: "No bureau-reported account was opened after the bank statement's period end." | **PASS** | This lead has none detected — the negative path render was verified live; the positive (`detected: true`) path was verified by the existing backend unit test, not by a live positive fixture. |
| Section 4: family network verification | `family-network-verification.ts` | `familyNetworkVerification` | `FamilyNetworkVerificationTable` | Live QA: "No inferred family-network transfers were detected." | **PASS** | Negative path verified live; positive-member-row rendering verified by component logic + type contract only (no live fixture with members). |
| Section 5: compliance hold, never shown as positive | `complianceHoldReason`/`Since`/`SlaHours`/`EscalationHours` | `complianceRouting` | `ComplianceHoldBanner` | Live QA: "No active hold" rendered in green when `false` | **PASS** | The `true` (hold-active) violet-banner path verified by code read + existing backend unit test, not a live `true` fixture (this lead has no hold). |
| Section 5: readiness gate R1-R8 + outcome | `evaluateReadinessGate()` | `readinessGate` | `ReadinessGateCard` | Live QA: all 8 conditions rendered, R3 failing shown in red, outcome badge "X1 — Insufficient data", blocking factor listed in red | **PASS** | A real failing condition was live-observed, not just a passing fixture — confirms the "never converts a failed gate into a positive state" requirement against real data. |
| Section 6: Missing Information Register P1/P2/P3 | `buildMissingInformationRegister()` | `missingInformation[]` | `MasterMissingInformationRegisterCard` | Live QA: "23 open of 23", grouped under "P2 — Important" | **PASS** | This lead has no P1/P3 items — group-presence logic (`PRIORITY_ORDER.filter(...)`) verified to only render groups that exist, not all 3 unconditionally. |
| Section 6: per-dimension confidence | `dimensions.ts` | `dimensionConfidences` | `DimensionConfidenceCard` | Live QA: card confirmed present via full h3-title dump | **PASS** | |
| Section 7: cohort attribute vector rendered (was dead data) | `buildCohortAttributeVector()` | `cohortAttributes` | `CohortAttributeVectorCard` | Live QA: all 19 fields rendered with the "handed to Cohort Engine... does not assign a cohort itself" caption | **PASS** | Closes the "confirmed dead data" finding from the original audit. |
| Section 7: downstream cohort/plan status from real data only | `CohortAssessmentSection` (unchanged) | n/a (separate endpoint) | `CohortAssessmentSection` | Live QA: real decision history/rule table rendered unchanged after relocation | **PASS** | Master Profile never independently assigns a cohort — confirmed no new code path does so. |
| Backward compatibility with legacy profiles missing v3.0 fields | All new columns nullable/optional | all new response fields `?:` optional | every new/extended component has an explicit `undefined` branch rendering `NotAvailable` | Typecheck (optional-field access compiles) + code read of every new component | **PASS** | Not exercised against a real pre-v3.0 persisted row this pass (none exists in the seeded dev DB — profile `v14` already has every field) — verified structurally, not via a live legacy fixture. |
| AI executive narrative renders verbatim, never fabricated/rephrased | `insights.findings.executiveProfile` | same | `ExecutiveProfileCard` | Live QA | **BLOCKED** | The *backend* value itself is malformed for this lead's latest version (raw JSON text instead of a sentence) — a real Gemini-provider parsing defect, out of scope for this UI/contract-parity task. The UI renders it verbatim, correctly, per its own contract; fixing the provider is a separate, un-requested piece of work. |

## Honest overall status

**Backend**: substantially rebuilt and verified against the real spec and real seeded
data (unchanged this pass). **Frontend**: now contract-complete AND presentation-complete
— all 7 sections built, every v3.0 field reachable through the API is rendered in the
section the spec requires, confirmed against live data via real browser QA with zero
console/network errors. The one remaining open item is **not** a UI or contract gap: it
is a pre-existing AI-provider response-parsing defect in `gemini-ai-provider.ts`
(`parseMasterProfileAssessmentFindings`) that produces a malformed `executiveProfile`
string for this lead's current profile version — discovered during this pass's QA,
documented above, and left unfixed because it falls outside this task's explicit scope
(Master Profile UI rebuild + contract parity, not Gemini prompt/parsing robustness).
Two audit caveats, both explicitly named rather than silently assumed-away: (1) the
positive/non-empty paths for Compliance Hold, Post-Statement Debt, and Family Network
Verification were verified by code reading + existing backend unit tests, not by a live
fixture with that data, because the one real seeded lead available (`BBS-LD-900001`)
happens to have none of those three conditions active; (2) backward compatibility with
a true legacy (pre-v3.0) persisted profile was verified structurally (every new field
is optional, every consuming component branches on `undefined`), not against an actual
legacy row, because the seeded dev DB's only Master Profile history for this lead
already postdates the v3.0 rebuild (version 14). Do not claim 100% live-verified
coverage of every branch — claim exactly what the evidence above supports.
