# BBS Debt Analysis Module vNext — Parity Matrix & Discrepancy Register

Working document for the Debt Analysis (L1) spec-parity audit against lead
`BBS-LD-900001` (customer PRAVEENKUMAR MOTILAL MAURYA, PAN DJFPM7283E, credit score
748), compared against the populated reference report (`BBS_L1_Debt_Analysis_Report`,
case BBS-20261007-001 — same underlying customer/bureau data).

**Important limitation of this working session**: the three attached PDFs (v3.0
functional spec, both reference-report variants) were read in full in an earlier part
of this conversation, but are not present as files on disk in this environment and
could not be re-fetched after a context reset. Findings below that cite the reference
report's own stated figures rely on the detailed record carried over from that earlier
reading, not a fresh re-read of the PDF bytes. Each finding is cross-checked against
either the actual persisted database row, the actual raw bureau response text, or the
actual source code — never asserted from memory alone.

## Acceptance summary (see linked sections below for full evidence)

| Area | Status | Evidence basis |
|---|---|---|
| Score-Structure Divergence (§13/§14) | **PASS** | Root-caused, fixed, live-verified exact match to reference ("8"). §1 |
| Total outstanding | **BLOCKED** (reference unsupported) | Live value traced to real raw bureau data; reference's figure unsupported by it. §2/§6 |
| Lender counts (active vs. all-time) | **PASS** | Two correct, distinct metrics; UI label added this pass. §3/§7/§11 |
| Data Quality Score (86 vs 96) | **BLOCKED** (not attributable) | Report-recency theory tested with real timestamps and refuted; remaining components not time-dependent; no reference component breakdown available to finish attribution. §4 |
| Debt Risk Indicator (36 vs 34) | **BLOCKED** (not attributable) | Same disposition as above, independently checked. §5 |
| Downstream compatibility (Master Profile/Cohort/Plan Engine) | **PASS** | Verified by direct code read — none of the three reads any field this pass changed. §8/§12 |
| Full spec audit (sections A–E, G, H) | **PASS**, with named gaps | Delegated audit against the code's own cited spec references (no PDF access); zero MISSING items; gaps enumerated and dispositioned individually. §9 |
| Rule 15 — Consolidation detection | **PASS** (new this pass) | Was a stale permanent stub; reimplemented, tested, rendered. §10 |
| 7-section UI rebuild | **PASS**, with one named limitation | All cards placed; 2 rendering gaps closed (lender label, AI account insights); reference's exact original section order not re-extractable this session (PDF inaccessible) — used the task's own proposed outline instead. §11 |
| Backend build/lint/unit/e2e | **PASS** | tsc clean; 966/972 unit (3 pre-existing unrelated failures); **100/100 e2e** (the one prior failure was root-caused and fixed — see §14). §13/§14 |
| Frontend build/lint/typecheck | **PASS** | All clean. §13 |
| Visual/browser QA | **PERFORMED** (real Chromium, not simulated) | Playwright/Chromium installed and driven directly against the live dev servers; see §15 for method and evidence. |

**Do not read this as 100% parity.** Two numeric discrepancies (Data Quality, Debt Risk
Indicator) remain genuinely unresolved — not because they were deprioritized, but
because the one piece of evidence that would resolve them (the reference report's own
per-component score breakdown) is not available in this session, and the "report
recency" theory was explicitly tested against real timestamps and ruled out rather than
assumed. Total outstanding (§2/§6) is also a standing, documented discrepancy — the
live figure is kept because it is the one supported by the actual persisted raw bureau
data. Everything else in this table — including the e2e suite (now 100/100) and
visual/browser QA (now actually performed with a real Chromium browser, not
simulated) — is evidenced, not assumed.

Status legend: **CONFIRMED FIX** (root-caused, fixed, verified live + regression-tested)
· **DOCUMENTED DISCREPANCY** (investigated to root cause; reference and live disagree;
not corrected because the live figure is the one supported by real underlying data) ·
**CLARIFIED** (apparent discrepancy; resolved as two legitimately different metrics,
no code change needed) · **OPEN** (not yet investigated).

## 1. Score vs. Structure Divergence (spec §13/§14) — CONFIRMED FIX

**Reference finding**: "Score-Structure Divergence = YES, 8 risk signals."
**Live finding (before fix)**: `divergenceFlag: false`, `riskSignalCount: 1`.

**Root cause**: `scoreStructureDivergence()` computed its `riskSignalCount` input
from `riskFlags()` — a much older, narrower catalog (3-4 checks, High/Medium severity
vocabulary) built for a separate "Risk Indicators" UI card — instead of the real,
~20-check structural risk-signal catalog (`riskSignalEngine()`: debt concentration,
top-lender concentration, recent borrowing/stacking, unsecured concentration, enquiry
conversion, etc.). The function's own `reason` string already said "risk signal(s) at
Attention or above" and the frontend's `ScoreStructureDivergenceCard.tsx` already
labelled the field "Risk signals at Attention or above" — both written assuming the
richer catalog, while the actual computation silently used the unrelated narrow one.
This meant `riskSignalCount` almost never reached the 3 (score≥750) or 5 (score≥700)
thresholds for any lead, so divergence correctly flagged by the reference (a "good"
748 score sitting on 94% single-lender concentration, 100% unsecured debt, 5 recently
opened accounts) silently never fired.

**Fix**: extracted the structural catalog's non-divergence-dependent checks into
`evaluateStructuralRiskSignals()` (shared by both `riskSignalEngine()` and
`scoreStructureDivergence()`, avoiding a circular dependency since the full catalog's
one remaining entry, SCORE_STRUCTURE_DIVERGENCE, itself depends on the divergence
verdict). `scoreStructureDivergence()` now counts triggered entries at severity
'Attention'/'Elevated'/'High'/'Critical' (excluding 'Informational' and the separate
'Data quality' category) as `riskSignalCount`, and surfaces their evidence strings
directly (previously surfaced `riskFlags()`'s unrelated evidence).

**Secondary finding, fixed on independent merits**: while verifying this, found
`riskSignalEngine()` carried two catalog entries — `UNSECURED_CONCENTRATION` and
`UNSECURED_DEBT_HEAVY` — with an identical trigger condition and identical evidence
string, with no code anywhere distinguishing them (`UNSECURED_DEBT_HEAVY` had zero
downstream consumers). This is a genuine duplicate, not a reference-driven edit:
removed `UNSECURED_DEBT_HEAVY`, keeping `UNSECURED_CONCENTRATION` (the one with a real
consumer in `finalSummaryTable()`). This was decided on its own correctness merits
before checking its effect on the reference-comparison number.

**Live result after both fixes** (reprocessed from the same persisted raw bureau
response, no new bureau pull):
```
riskSignalCount: 8, divergenceFlag: true
reason: "Score 748 (≥700) with 8 risk signal(s) at Attention or above."
```
Matches the reference's "YES, 8 risk signals" exactly. This was a root-cause fix
verified independently (via the structural-catalog bug and the duplicate-signal bug,
each individually justified) — the exact match to "8" is corroborating evidence the
fixes are correct, not the reason they were made.

**Files changed**: `backend/src/modules/debt-analysis/debt-analysis.calculations.ts`
(`evaluateStructuralRiskSignals()` extracted, `riskSignalEngine()` now a thin wrapper,
`scoreStructureDivergence()` new signature `(report, now, dq, recency, timeline)`,
`UNSECURED_DEBT_HEAVY` removed, call-site reordering in `buildDebtAnalysisSummary()` so
`dataQuality`/`timeline` compute before `divergence`). Tests updated/added in
`debt-analysis.calculations.spec.ts` (`scoreStructureDivergence` describe block
rewritten with real structural-signal fixtures; `riskSignalEngine`/`finalSummaryTable`
test helpers updated for the new call order). Full debt-analysis suite: 123/123 passing.

## 2. Total Outstanding Balance (spec §3, Current_Balance field) — DOCUMENTED DISCREPANCY

**Reference finding**: ₹9,52,899 total outstanding, with a stated per-lender
breakdown (Bajaj PL ₹8,28,697 + Bajaj CL ₹57,333 + HDFC CC ₹55,943 + Axis CC ₹7,770 +
HSBC CC ₹3,156 = ₹9,52,899).

**Live finding**: ₹9,46,114 (`creditProfile.totalOutstanding`,
`debtBurden.totalActiveDebt`, `summary.totalOutstanding` all agree).

**Root cause investigation**: compared live `debtBurden.lenderConcentration` against
the reference's own per-lender table. Bajaj combined (886,030 = 828,697 + 57,333),
Axis (7,770), and HSBC (3,156) all match the reference exactly. Only HDFC differs:
live 49,158 vs. reference 55,943 — a gap of 6,785, exactly the total discrepancy.
Queried the actual persisted `CreditAccount` row for this HDFC tradeline directly
(`currentBalance: "49158"`), then the actual raw bureau response text stored on the
`CreditReport` row for this lead: it contains `"Current_Balance":49158` for this
account (Identification_Number PVT3080001, HDFC Bank Ltd, Account_Number ...6295). The
string `55943` does not appear anywhere in the raw stored response.

**Conclusion**: the live figure (₹9,46,114) is the one faithfully computed from the
actual persisted raw bureau data for this account. ₹55,943 is not supported by any
field in the stored raw response. Per the task's own instruction not to force a
reference number by hardcoding or changing a correct formula, this is recorded as an
unresolved reference discrepancy rather than "corrected" — the reference report may
reflect a different bureau pull / snapshot date for this account than the one
currently persisted for this lead, which this integration has no way to verify further
without a live bureau re-pull (explicitly out of scope — "NEVER calls Experian again").
**No code change made.**

## 3. Total Lenders (`summary.totalLenders` / `debtBurden.numbersOfLenders`) — CLARIFIED

**Reference finding**: "Active Lenders: 4 (Bajaj Finance, HDFC Bank, HSBC, Axis Bank)."
**Live finding**: `summary.totalLenders: 21`, but `lenderExposure.activeLenders: 4`.

**Conclusion**: not a bug — two different, legitimately distinct metrics. `summary.
totalLenders`/`debtBurden.numbersOfLenders` count every distinct lender name across
all 33 historical accounts (active + closed), while `lenderExposure.activeLenders`
counts distinct lenders among only the 5 currently active accounts. The latter
(`4`) exactly matches the reference's own "4 active lenders" figure. **No code change
made** — both fields are real and already correctly scoped; any future UI work should
make sure each is labelled with its own population (all-time vs. active-only) rather
than presenting `totalLenders` as if it were the active-lender count.

## 4. Data Quality Score (spec §4.3) — BLOCKED (root cause not fully attributable)

Reference: 86/100, "High Confidence." Live: 96/100, "High confidence" (band matches,
numeric score differs by 10 points).

**"Report recency" theory explicitly tested and REFUTED with real timestamps**, per
instruction not to accept it without verification. Queried the actual persisted
`CreditReport` row: `pulledAt = 2026-09-30T18:08:52Z`, `createdAt = 2026-10-13` (today
— this lead's bureau data was freshly reseeded this session after an earlier,
documented dev-DB wipe by a parallel session). The reference report's own case ID
(`BBS-20261007-001`) implies it was generated on or near 2026-10-07. `reportRecencyScore`
bands are `<=30d: 15, <=90d: 10, <=180d: 5, else: 0` (`dataQualityScore()`,
`debt-analysis.calculations.ts:1446-1447`). Age at 2026-10-07 would be 7 days; age
today is ~13 days — **both land in the same `<=30d` band, both scoring 15/15**. A
component that scores identically in both scenarios cannot be the source of a 10-point
gap. Theory rejected on direct evidence, not assumed.

**Remaining components** (fieldCompleteness 28/30, internalConsistency 25/25,
accountLevelSufficiency 13/15 — live) are each computed directly and deterministically
from the persisted `CreditAccount` rows (field population counts, DPD/overdue
consistency checks, per-account completeness) — none are time-of-evaluation-dependent,
so none can drift between "when the reference was generated" and "now" the way
reportRecency can. The 10-point gap must therefore come from either (a) the reference's
original bureau snapshot having different per-account field population than what is
currently seeded for this lead (plausible, since the data was reseeded mid-session, and
seed fixtures are a hand/script-built approximation of the real Signzy response rather
than a byte-for-byte copy), or (b) a reference-side inconsistency. **Cannot be
root-caused further without the reference report's own per-component score breakdown**,
which was not captured in this session's record of the PDF content (only the headline
86/100 total was). No code change made — the live computation is internally consistent
and every component is independently verifiable against the real persisted data, which
is the standard applied to every other finding in this register.

**Status: BLOCKED** — same disposition as finding #2 (keep live value; do not force a
match without supporting source evidence).

## 5. BBS Debt Risk Indicator (spec §12) — BLOCKED (root cause not fully attributable)

Reference: 36/100, "Attention." Live: 34/100, "Attention" (band matches, numeric score
differs by 2 points).

Checked each of the 8 components for a timing-boundary dependency, the same way as
finding #4: `recentBorrowing` and `enquiryBehaviour` use rolling day-count windows
(12mo/180d/90d/7d) anchored to `now`, so they are, in principle, evaluation-time
sensitive. Queried the 5 recently-opened accounts' actual `openedOn` dates against both
candidate evaluation dates (2026-10-07 reference date vs. today): none falls within the
~6-day gap between those two dates, so neither window's membership changes — ruling out
the timing-boundary explanation for this indicator too, by direct date comparison
rather than assumption.

A 2-point gap this small most plausibly comes from the same underlying cause as finding
#4 (the reseed's account data not being byte-identical to the reference's original
bureau snapshot) acting on one or two small-weight components (`cardUtilisation`
weight 10, `enquiryBehaviour` weight 5, or `dataInconsistencies` weight 5 are the most
likely candidates given their size). Not resolvable further without the reference's own
component breakdown. No code change made.

**Status: BLOCKED** — band (`Attention`) matches; point value does not; live value kept.

## 6. Total Outstanding — FINAL STATUS: BLOCKED (reference unsupported by source data)

Confirmed in the prior pass (see finding #2 above): live ₹9,46,114 is faithfully
computed from the actual persisted raw bureau response (`Current_Balance: 49158` for
the one HDFC account that accounts for the entire gap); `55943` does not appear
anywhere in the raw stored response. Per instruction, the live value is kept. No
further evidence was found this pass to overturn that conclusion.

## 7. Lender counts — FINAL STATUS: PASS (already two correct, distinct metrics)

`lenderExposure.activeLenders: 4` (matches reference's "4 active lenders" exactly) and
`debtBurden.numbersOfLenders` / `summary.totalLenders: 21` (all-time distinct lenders
across all 33 historical accounts) are both real, independently correct fields reading
different populations. Confirmed via code read that `Cohort Engine` already consumes
specifically `debtBurden.numbersOfLenders` (the all-time figure) for its own stacking
signal — an existing, intentional downstream contract this pass must not disturb. The
only remaining action is a **UI labelling fix** (tracked under the Section 3 UI rebuild
below) so a CCR never reads "21" as if it were the active-lender count.

## 8. Downstream compatibility (Master Profile / Cohort Engine / Plan Engine) — PASS

Verified by direct code read (not assumption) that none of the three downstream
consumers touch any field changed by the Score-Structure Divergence fix:
- `master-profile.service.ts`'s `toDebtAnalysisFacts()` reads only `level1.*` fields
  (`toLevel1CreditIntelligence()`'s output) plus `debt.debtBurden.{securedPercent,
  unsecuredPercent}` — and `toLevel1CreditIntelligence()` itself (`debt-analysis.
  calculations.ts:2328-2383`) never references `scoreStructureDivergence`, `dataQuality`,
  `debtRiskIndicator`, or `riskSignalEngine` anywhere in its body.
- `cohort-engine.service.ts` reads `debt.debtBurden.numbersOfLenders` only (the
  all-time-lenders figure, untouched by this pass's fix).
- `plan-engine` module has zero references to the Debt Analysis service/calculations
  module at all — it consumes only Master Profile + Cohort Decision, per its own design.

No stale handoff data risk: all three continue to read values this pass either left
unchanged or only corrected in place (same field names/shapes, corrected values).

## 9. Full specification audit (A–H) — PASS, with named gaps (see full file)

Delegated to a separate audit pass (same PDF-access limitation as this document — it
checks the code against its own cited spec section/rule comments, not an independent
PDF read) covering sections A (credit snapshot/report quality), B (debt structure/
lender exposure), C (delinquency/repayment behaviour), D (credit behaviour/timeline),
E (debt stress/diagnostic findings — Risk Signal Engine, Debt Risk Indicator, Debt
Priority Matrix), G (diagnosis/action plan), H (CCR Brief/downstream handoff). Section F
(score-structure divergence/data quality) intentionally excluded — already covered in
depth above. Full table-by-table verdicts: `docs/debt-analysis-spec-audit-sections-A-H.md`.

**No MISSING (spec-cited-but-unimplemented) items were found anywhere.** Every spec
citation in this codebase has a corresponding implementation, even where that
implementation is an honest "cannot evaluate" stub. Items the audit flagged, and this
pass's disposition for each:

- **`identityVariants()` had zero test coverage** — the one gap in an otherwise
  thoroughly tested file. **Fixed**: added a `describe('identityVariants', ...)` block
  (2 tests) confirming it always returns `available: false` with its own documented
  reason and never fabricates a variant.
- **Rule 15 (`debtConsolidationDetection`) was a stale, permanently-unavailable stub**
  — its own reason ("closure date is not reported") contradicted this same file's
  `accountTimeline()`, which already reads `closedOn` from both bureau mappers. **Fixed
  — see §10 below**, the single largest piece of new functionality added this pass.
- **`buildCohortSignalPackage` (§19.2) is a shipped-but-unconsumed producer contract**
  — Cohort Engine's own evaluation pipeline does not yet read it (confirmed by a direct
  grep of `cohort-engine.service.ts`, which reads `debt.debtBurden.numbersOfLenders`
  directly, not the Cohort Signal Package). **Not fixed this pass** — wiring a new
  input into Cohort Engine's own evaluation pipeline is explicitly that module's
  owners' decision, outside this task's scope (Debt Analysis). Flagged here so it is
  visible rather than silently stale.
- **Two intentional, already-disclosed narrowings in the two headline composite
  scores** (`dataQualityScore`'s Identity Match Confidence hardcoded at 15/15;
  `debtRiskIndicator` omitting two spec'd bonus adjustments it says it cannot honestly
  evaluate) — investigated directly as a candidate explanation for the open Data
  Quality / Debt Risk Indicator numeric gaps (§4/§5 above). The Identity Match
  Confidence hardcoding is a structural guarantee (both bureau mappers only ever
  persist a report after `Match_result.Exact_match === 'Y'`), not a measurement of
  identity-variant ambiguity — a different concept from the name/phone/address
  variants `IdentityVariantsCard` surfaces separately. **Ruled out** as the explanation
  for either gap; no code change made; left as the disclosed, intentional design it
  already was.
- **Two test-coverage gaps actioned**: `getCallBriefForLead`'s malformed-AI-findings
  defensive coding (e.g. `primaryConcerns` not an array) had no test — added one
  confirming it degrades to empty lists rather than throwing. `buildAccountsNeedingValidation`'s
  high-card-utilisation and written-off/settled paths were only exercised indirectly —
  added a dedicated test covering both independently of the EMI-blank path.
- **Minor test-coverage gaps left as documented, not actioned this pass** (lower risk,
  straightforward filters with no hidden defaulting behavior): `DelinquencyResult`'s
  four DPD-threshold counters have no test isolating them by name;
  `creditHistoryAndTrend`'s populated-trend case (vs. the empty case) is untested.

## 10. Rule 15 — Consolidation/Refinancing Detection: NEW implementation this pass

`debtConsolidationDetection()` previously always returned `INSUFFICIENT_DATA` with the
reason "a closed account's closure date is not reported." That premise was stale: both
bureau mappers (`experian-response.mapper.ts`, `signzy-response.mapper.ts`) parse
`Date_Closed` into `closedOn`, already consumed elsewhere in this same file
(`accountTimeline()`). Reimplemented as a real signal: for each CLOSED account with a
known `closedOn`, finds the single largest account opened within 90 days afterward
whose `sanctionedAmount` is at least double the closed account's — "an old loan closing
while a new, larger loan opens shortly after," matching the function's own original
doc-comment description of Rule 15. The 90-day window and 2x size multiplier are both
new, disclosed BBS conventions (no literal spec number to cite), consistent with this
file's existing disclosure discipline for other non-spec'd thresholds.

**Tuning note, done BEFORE checking against the reference** (never chasing a number): a
first pass used a ">= size" test with no "largest match only" restriction, which
produced 28 events for this lead's dense 33-account/4-year history — almost any closed
account is smaller than almost any later one by pure chance at that density, so a
same-or-larger test with no de-duplication is noise, not signal. Tightened to "2x size,
single largest match per closed account" on reasoning alone (the realistic definition
of "replaced by a bigger loan"), which brought it to 16 events — still a real, verified
finding (this customer's loan sizes genuinely escalate over time, consistent with the
94% single-lender concentration and divergence findings elsewhere in this report), not
forced to any particular count.

Previously computed but never rendered anywhere in the UI (the `unavailable.*` bucket
is only ever read by `BankCrossCheckSection`, which renders `bankCrossCheck`/
`bounceAnalysis` only). Moved out of `DebtUnavailableSections` into its own top-level
`consolidationDetection` field (both backend and frontend types), and added a new
`DebtConsolidationCard` rendered in the rebuilt tab's "Credit Behaviour & Timeline"
section. Regression tests added: unavailable-when-no-accounts, detects-and-matches,
rejects-under-threshold, rejects-outside-window, matches-only-the-single-largest
candidate (5 tests, `debt-analysis.calculations.spec.ts`).

## 11. Frontend UI rebuild — PASS (see detailed notes in the final implementation report)

`DebtAnalysisTab.tsx` reorganized into the proposed 7 sections (Executive Overview;
Report Coverage & Data Quality; Debt Structure & Lender Exposure; Delinquency &
Repayment Behaviour; Credit Behaviour & Timeline; Stress, Diagnosis & Resolution
Opportunities; Final Assessment & Downstream Handoff) using the same `SectionGroupHeading`
component as the Financial Analysis tab (promoted to `components/lead-detail/shared/`
so both modules share one implementation instead of two copies). All 31 existing cards
were placed into one of the 7 sections — none dropped. Additional fixes made during
this pass:
- `DebtStructureSection` now explicitly labels the all-time distinct-lender count
  (`debtBurden.numbersOfLenders`) next to the lender-concentration list, with an
  inline comment distinguishing it from the Executive Overview's "Active lenders" tile
  (`lenderExposure.activeLenders`) — closing the gap flagged in §7 above (the two
  figures existed and were each independently correct, but only one was rendered).
- `DebtDiagnosisPanel` now renders a "Account insights" group — `findings.accountInsights`
  (a real `DebtDiagnosisFinding[]` on the AI output contract, each with its own
  evidence level) was never rendered anywhere in the tab before this pass.
- `DebtConsolidationCard` added (§10 above).
- **Honest limitation**: the exact section order/content of the reference PDF report
  could not be re-extracted this pass (not accessible in this session — see this
  document's own opening limitation note). The 7-section structure used is the
  proposed outline the task itself supplied as a fallback, not a fresh re-read of the
  reference's own layout.

Verified already-satisfied requirements (no change needed, confirmed by direct code
read): current vs. historical delinquency are kept strictly visually separate
(`DelinquencySection`'s own doc comment: "NEVER merged into one figure"); legacy
responses with missing additive fields cannot crash (every additive field on
`DebtAnalysisReport` is `?:` optional, read via defined-ness checks, e.g.
`ScoreStructureDivergenceCard`'s own doc comment); loading/empty/stale/failed-insights/
retry/reprocessing states were untouched by this pass (pre-existing, unchanged).

## 12. Downstream compatibility — PASS (see §8 above for the Score-Structure
Divergence fix's own check). Re-verified for this pass's additional changes:
`debtConsolidationDetection`'s new signature/shape and `DebtStructureSection`'s new
UI-only metric row touch no field any of Master Profile/Cohort Engine/Plan Engine
reads (confirmed via the same grep-based check as §8: none of the three modules
reference `consolidationDetection` or `unavailable.consolidationDetection` anywhere).

## 13. QA and regression results

**Backend**: `npx tsc -b --noEmit` clean. Full `npx jest`: **966 passed, 3 failed, 3
skipped, 972 total** — the 3 failures are the same pre-existing, unrelated PDF-parser
worker-setup failures present throughout this entire session (`pdf-statement-parser.spec.ts`,
a `--experimental-vm-modules` environment issue, nothing to do with Debt Analysis).
Debt-analysis module specifically: **132/132 passing** (up from 123 at the start of
this pass — 9 new tests: 5 consolidation-detection, 2 identityVariants, 2 service-level
defensive-coding tests). Master Profile + Cohort Engine + Plan Engine unit suites
(explicitly re-run for this acceptance pass per the task's own instruction): `npx jest
master-profile cohort-engine plan-engine` — **244 passed, 2 skipped, 246 total**, all
green.

## 14. e2e failure investigation and fix — RESOLVED

**Reproduction**: re-ran `canonical-journey.e2e-spec.ts` in isolation (`-t "has no
AnalysisJob stuck RUNNING"`) — passed instantly (82.8s wall time, but that includes the
full `beforeAll` suite bootstrap; the test itself is a single DB query). Re-ran the
full file standalone — passed, 13.6s. Re-ran the full `npm run test:e2e` suite twice
in a row — passed both times, 100/100. **The failure did not reliably reproduce**,
which itself rules out "application behavior" as the cause (a real app bug would fail
deterministically) and narrows it to either "test-timeout configuration" or
"shared-environment contention."

**Root cause — both factors are real, confirmed by direct evidence, not guessed**:
1. **A genuine, structural test-configuration bug** (`canonical-journey.e2e-spec.ts:378-391`):
   the test's own `pollUntil(..., 8000)` call explicitly budgets 8 seconds for AI jobs
   to finish, but the enclosing `it()` had no matching Jest-level timeout override, so
   it was bound by Jest's unconfigured 5000ms default (`test/jest-e2e.json` sets no
   `testTimeout`). This is a deterministic mismatch regardless of whether it happens to
   bite on any given run: if a RUNNING job takes longer than 5s to clear, Jest kills the
   test before the author's own 8-second grace period can complete. Every sibling
   `pollUntil` call in this same file (4 others) and in `cohort-engine.e2e-spec.ts`/
   `plan-engine.e2e-spec.ts` (11 more) already carries a correctly-sized explicit `it()`
   timeout (30000–60000ms) — this was the one place that convention was missed.
2. **Shared-environment contention, confirmed as the likely proximate trigger for the
   one observed failure**: queried `AnalysisJob` rows for `BBS-LD-900001` directly and
   found a real `DEBT_ANALYSIS_INSIGHTS` job for this exact lead that took ~49 seconds
   to complete (`createdAt` 14:34:58 → `completedAt` 14:35:47, 2026-10-13) — timed to
   this session's own earlier manual `POST .../debt-analysis/reprocess` calls against
   the shared dev database using the real Claude provider (not the e2e suite's mocked
   one). If the e2e suite's Phase 10 check happened to run while that real, slow job
   was still RUNNING, no poll budget inside the test could have helped — this was
   genuine cross-contamination from interactive QA activity on the same lead ID the
   e2e fixture also uses, not a defect in the app or the test's logic.

**Fix applied (test-only, smallest justified correction, per instruction)**: added an
explicit `10000` (10s) Jest timeout to the one `it()` block, comfortably exceeding its
own already-authored 8000ms poll budget — matching the convention already used by
every other `pollUntil`-containing test in the suite. **Did not** touch the poll's own
8000ms budget, did not weaken `expect(stuckJobs).toHaveLength(0)`, and did not add any
retry/skip logic — the assertion is exactly as strict as before.

**Result**: `npm run test:e2e` re-run three times after the fix (twice to confirm
stability, once as the final pre-report run): **100/100 passing each time**.

## 15. Visual/browser QA — PERFORMED (real Chromium, not simulated)

No project-level browser-automation skill or pre-installed Playwright/Puppeteer
dependency existed in this repo. Installed Playwright + a real Chromium binary via
`npx playwright install chromium` (network-fetched, cached under
`~/AppData/Local/ms-playwright/`) and a matching `playwright@1.64.0` npm package in an
isolated scratch directory (never added to the project's own `package.json`/lockfile).
Started both the backend (`npm run start:dev`, port 3001) and frontend (`npm run dev`,
Vite, port 5173) dev servers and drove a real headless Chromium against them.

**Method**: logged in as the real dev CCR user (with "Keep me logged in" checked, since
the session's refresh token only persists across a full navigation when that box is
checked — confirmed via `refreshTokenStore.ts`'s own doc comment), navigated to
`/leads/BBS-LD-900001`, clicked the Debt Analysis tab, and captured: full-page
screenshots (desktop 1440×900 and mobile 390×844), console errors, page errors
(uncaught exceptions), failed network requests (4xx/5xx and connection failures), a
precise `document.documentElement.scrollWidth` vs. `clientWidth` check (an exact,
non-visual signal for horizontal overflow/clipping), and targeted element-scoped crops
of the sections this pass changed.

**Results**:
- **All 7 section headings present, in the correct ascending order** (verified
  programmatically via string-index position in the rendered DOM text, not just visual
  inspection): Executive Overview (709) → Report Coverage & Data Quality (16809) →
  Debt Structure & Lender Exposure (19475) → Delinquency & Repayment Behaviour (23077)
  → Credit Behaviour & Timeline (24198) → Stress, Diagnosis & Resolution Opportunities
  (28205) → Final Assessment & Downstream Handoff (35454). Identical order at both
  viewport sizes.
- **Zero console errors, zero uncaught page errors, zero failed network requests** at
  both desktop and mobile viewports.
- **Zero horizontal overflow at mobile width**: `scrollWidth === clientWidth === 390`
  exactly — a precise, non-subjective confirmation that no card or table clips/overflows
  the viewport, not just an eyeballed screenshot.
- **Score-Structure Divergence card, visually confirmed**: "Divergence detected —
  Score 748 (≥700) with 8 risk signal(s) at Attention or above," with all 8 evidence
  bullets listed — an exact visual match to the live API trace in §1.
  Screenshot: `crop-divergence.png`.
- **Consolidation/refinancing card (Rule 15), visually confirmed**: "Pattern detected,"
  "Closed accounts with a known closure date: 28/28," with real evidence sentences
  (e.g. "SBI Cards and Payment Services Private Limited (₹3,538, closed 21 Jul 2026)
  was followed 22 day(s) later by a larger account at Bajaj Finance Limited (₹8,21,724,
  opened 12 Aug 2026)") — an exact visual match to the live API trace in §10.
  Screenshot: `crop-consolidation.png`.
- **Lender count distinction, visually confirmed**: Executive Overview shows "ACTIVE
  LENDERS: 4"; the Debt Structure & Lender Exposure section separately shows "Distinct
  lenders (all-time, incl. closed accounts): 21" right above the lender-concentration
  list — both on screen simultaneously, correctly labeled. Screenshots:
  `crop-executive-overview.png`, `crop-debt-structure.png`.
- **Current vs. historical delinquency**: confirmed structurally distinct in the
  rendered DOM (separate "Current (Rule 8)" and "Historical (Rule 9 — kept separate
  from current, above)" sub-headings, matching `DelinquencySection.tsx`'s own doc
  comment — "NEVER merged into one figure").
- **AI `accountInsights`, investigated and explained, not a bug**: the automated card
  check initially flagged this text as absent. Queried the live `/debt-analysis`
  response directly: `insights.findings.accountInsights` is a genuinely empty array
  (`[]`) for this lead's current completed AI analysis — the `FindingGroup` component
  (shared by every finding category, including the ones that DO render, like "Primary
  concern") correctly renders nothing for an empty array by design (`if (findings.length
  === 0) return null`), the same convention used throughout this codebase to avoid an
  empty heading with no content. This confirms the wiring added this pass is correct —
  it simply has nothing to show for this particular lead's current AI output, which is
  an honest result, not a rendering failure.
- **No runtime crash** from any additive/optional field — confirmed implicitly: this
  exact live response already includes every additive field this pass touched
  (`consolidationDetection`, the restructured `unavailable` object), and the page
  rendered with zero console/page errors.
- **Not exercised this pass** (would require fabricating a FAILED/REQUIRES_REVIEW state
  for a lead that is genuinely COMPLETED, which risks real data — not done, consistent
  with "preserve all existing data"): the loading/retry/reprocessing UI states. These
  are pre-existing code paths this pass did not modify; their correctness rests on code
  inspection (per the prior pass's report), not a live render, for this specific
  acceptance round.

All screenshots and the verification script remain in this session's scratch directory
(not committed to the repo — this is a QA artifact, not a project file).

**Backend e2e**: `npm run test:e2e`: **100 passed, 0 failed, 100 total** (fixed this
pass — see §14 for the full investigation and the one-line test-only correction).

**Frontend**: `npx tsc -b --noEmit` clean. `npm run build` succeeds (pre-existing
chunk-size warning only, unrelated). `npm run lint` clean, zero errors/warnings.

**Live API verification** (no new bureau pull — same persisted raw response,
reprocessed via `POST .../debt-analysis/reprocess`, which only re-runs the mapper):
confirmed `scoreStructureDivergence` now returns `riskSignalCount: 8, divergenceFlag:
true` (exact match to reference); confirmed `consolidationDetection` now returns a real
16-event result instead of a permanent stub; confirmed `lenderExposure.activeLenders: 4`
and `debtBurden.numbersOfLenders: 21` are both present and distinct.

**Visual/browser QA: NOT PERFORMED.** No browser automation tool is available in this
environment (confirmed multiple times this session, including earlier in this same
conversation for the Financial Analysis module). The 7-section rebuild was verified via
`tsc`, `vite build`, `eslint`, and a live API field-by-field trace, but never rendered
in an actual browser — layout, responsive behavior at mobile/desktop widths, and visual
regressions in the new section grouping are unverified by this pass and should be
treated as outstanding before sign-off.
