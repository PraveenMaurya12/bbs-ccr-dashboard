# BBS Remaining Gaps and Blockers

Every confirmed, unresolved requirement from this pass's audit, why it remains
unresolved, its risk, its dependency, and the recommended next action. Companion to
`docs/bbs-complete-module-parity-matrix.md` (full findings) and
`docs/bbs-discrepancy-resolution-report.md` (what WAS fixed).

Each item below was deliberately **not** fixed this pass — either because the fix
requires a business/product decision this pass cannot make unilaterally, or because
the blast radius of a safe fix exceeded what could be implemented and fully regression-
tested within this pass's own time constraints without risking a new, worse defect in
a mature, heavily-tested module. None were silently dropped — each was root-caused.

## Requires an explicit product/business decision

### 1. L2 Financial Health Score: 9-component vs. the spec's 5-component model
**What**: v4.0 spec §14 defines a 5-component model (Income/20, Cash Flow/25, Debt/25,
Liquidity/15, Behavioural/15). The codebase retains its own earlier 9-component model.
**Why not fixed**: this is the single largest structural fork found in either L1 or L2.
Migrating to the spec's model means re-deriving score weights across every consumer —
the Financial Health Score feeds `ScoreCashflowDivergenceCard`, the Missing Information
Register's severity bands, `finalSummary`'s top-findings ranking, and (per the Cohort
Signal Package schema, §18.2) is intended to flow into Cohort Engine eventually. A
rewrite risks silently shifting score bands for every existing lead and breaking
threshold-dependent tests across the module without a much larger, dedicated pass.
**Risk if left as-is**: the system under-reports to the exact 5-component shape a
reviewer comparing against the spec would expect; scores themselves are not
necessarily *wrong*, just structured differently.
**Compounding issue found**: the code's own comments (service.ts, extended-metrics.ts)
cite "this module's own README note on the 9-vs-5-component fork" — **no such README
exists anywhere in the repo**. This should be resolved regardless of which model is
ultimately chosen: either write the README justifying the 9-component retention, or
commit to the migration.
**Recommendation**: a dedicated follow-up task, scoped and reviewed independently of
this audit, with explicit sign-off on which model is authoritative before any code
changes — not a decision this pass should make by rewriting a mature scoring engine
under time pressure.

### 2. L2 Financial Analysis: employment-type-specific income stability (3 sub-models)
**What**: v4.0 spec §6.3 replaces one CV-based formula with 3 distinct sub-models
(Salaried/Business/Gig), each with its own thresholds and bands.
**Why not fixed**: same class of risk as item 1 — a second, competing stability
classification would need to either replace or run alongside the existing one, and the
existing one is already consumed by `ccrBrief`, `cohortSignalPackage`, and the
Financial Health Score's own Income Health component. The code's own comment already
explains this exact tradeoff.
**Recommendation**: bundle with item 1's follow-up, since both are v4.0's two
headline scoring-model changes and are naturally reviewed together.

## Deferred for blast-radius/risk reasons (safe to fix, but not safely within this pass)

### 3. L1 Debt Analysis: DPD history '?'/blank defaulted to 0 in the display grid
**What**: §3.6's "unknown ≠ zero" rule is violated for the per-month `paymentHistoryGrid`
bucket shown to CCR/UI (both mappers: `dpdBucket(dpd ?? 0)`).
**Why not fixed**: the core numeric aggregates (`maxHistoricalDpd`, `dpdValues`) already
correctly filter out nulls — so Debt Risk Indicator scoring is NOT corrupted by this.
Only the display grid is affected. Introducing a genuine "unknown" bucket state
requires updating ~10 call sites across a 2500-line file (`debt-analysis.calculations.ts`),
each of which currently does a binary `dpdBucket === '0'` (clean) vs. not (delinquent)
check — every one needs individual review to decide whether "unknown" belongs in
neither bucket, which denominator it should affect, etc. Rushing this risks
introducing a new, worse miscount (e.g., an unknown month wrongly counted as
delinquent) in place of the current, narrower cosmetic-display defect.
**Recommendation**: a small, dedicated follow-up: extend `dpdBucket`'s return type to
include a 4th "unknown" value, then go through the ~10 call sites one at a time with
test coverage for each, rather than a single sweeping change.

### 4. L1 Debt Analysis: Debt Risk Indicator Component 7's completeness cap
**What**: §12 Component 7 (Historical Repayment) should cap at 5 points when
`history_completeness < 0.5`. The code's own comment claims "no completeness baseline
exists" to implement this — **independently confirmed false**: `historyCompleteness`
is computed elsewhere in the same file (for the unconsumed Cohort Signal Package) but
was never passed into this function's signature.
**Why not fixed this pass**: plumbing it through is low-risk on its own, but should be
done together with item 3 (both touch `historyCompleteness`'s own correctness — see
item 5 below) rather than in isolation.
**Recommendation**: fix alongside item 5 (the denominator cap) in the same follow-up,
since both affect the same underlying metric.

### 5. L1 Debt Analysis: `historyCompleteness` denominator capped at 12 months
**What**: the completeness-ratio denominator is `Math.min(ageInMonths, 12)` regardless
of true tracked history span, understating incompleteness for accounts with a real
36-month tracked history (confirmed present in the real fixture's
`Payment_History_Profile` strings, though that string format itself is never parsed —
see item 3's own note).
**Why not fixed**: changing the denominator changes `historyCompleteness`'s value for
every account with >12 months of real history, which could shift §12 Component 7's cap
behavior and the unconsumed Cohort Signal Package's `maxPossibleDpd` nullability for
existing leads — worth doing deliberately with its own before/after comparison, not as
a drive-by change bundled into this already-large pass.

## Confirmed-absent, require new infrastructure (named, consistent with prior modules' own documented scope boundaries)

### 6. Notifications (any channel)
No email/SMS/WhatsApp provider exists anywhere in this codebase. Named as a gap in
every one of L4/L5/L6's own spec requirements for "notify the customer."

### 7. Scheduler / cron / event-driven reassessment
Confirmed absent at every layer (L4's refresh triggers, L5's TTL expiry, L6's
monitoring triggers are all computed live-on-read or presented as data, never
auto-fired). Every reassessment in this system is CCR-triggered.

### 8. Outcome tracking / KPI pipeline
L5's §19 Suitability Validation Metrics and L2's would-be plan-outcome tracking both
require a retrospective outcome-tracking pipeline that doesn't exist for any module.

### 9. Credit/Risk/Compliance RBAC roles
`Role` enum = `CCR | SUPERVISOR | ADMIN` only. Blocks L6's §20.3 per-field approval
routing (already named in the Plan Engine's own parity matrix) and would also block
any future per-field approval requirement in L1/L2 if one were ever specified.

## Named, deliberate scope decisions (not gaps — spec itself marks these proposed/future, or this codebase's own data model makes them structurally inapplicable)

- L5's §4 Method B confidence, §11 90-day variant auto-selection, §13 illegal-transition
  enforcement — all previously documented in the Pathway Engine's own parity matrix.
- L6's §12.6 fee structure, §19.4 re-consent, §16.3 Execution Engine handoff — all
  previously documented in the Plan Engine's own parity matrix.
- L1's §3.4 account-type code table and §21 provenance taxonomy, and L2's §16.2 exact
  stress-rubric weighting — real gaps, lower severity (informational/categorization,
  not a financial-accuracy or compliance risk), not attempted this pass given the
  larger items above took priority under the task's own stated ordering ("financial
  calculation errors" and "security/compliance" before "lower-priority improvements").

## Summary table

| # | Item | Severity | Blocked by | Status |
|---|---|---|---|---|
| 1 | L2 9-vs-5-component FHS | High (spec-fidelity) | Product decision | Open |
| 2 | L2 employment-aware stability | High (spec-fidelity) | Product decision | Open |
| 3 | L1 DPD grid '?'→0 | Medium (display-only) | Blast radius (~10 call sites) | Open |
| 4 | L1 DRI Component 7 completeness cap | Low | Bundle with #5 | Open |
| 5 | L1 historyCompleteness denominator | Low-Medium | Needs its own before/after review | Open |
| 6-9 | Notifications/scheduler/KPIs/RBAC roles | N/A (infra) | No infrastructure exists | Named, not a per-module gap |
