# BBS Master Profile vNext — Rebuild Plan

Companion to `docs/master-profile-vnext-parity-matrix.md`. Five phases, executed in
order, each verified before the next starts.

## Phase 1 — Prisma schema (additive)

- New enum `CreditFinancialAlignmentStateV2` is NOT created separately — the existing
  `CreditFinancialAlignmentState` enum values are replaced in place
  (`ALIGNED_HEALTHY`, `CREDIT_STRONG_FINANCIAL_STRESSED`,
  `CREDIT_STRESSED_FINANCIAL_STRONG`, `BOTH_STRESSED`, `COMPLIANCE_HOLD`) since nothing
  downstream reads the old 6 values by name except this module's own UI (confirmed by
  the frontend audit — only `AlignmentStateBadge` switches on them). A Prisma enum
  value rename is a schema change, not a data migration, since no persisted row's
  *meaning* needs reinterpreting — old rows simply become unreadable by the new enum,
  which is acceptable here because Master Profile rows are regenerated on demand
  (`version`-appended) and the per-row `isStale` check already assumes old versions may
  not match current logic.
- Extend `ReconciliationMatchState` with 3 new values: `AMOUNT_MISMATCH`,
  `TIMING_MISMATCH`, `POST_STATEMENT` (keeping existing 5).
- New `ResolutionCapacityLevel` values: replace 4-value enum with 6-value
  (`STRONG, MODERATE, TIGHT, MARGINAL, NONE, UNKNOWN`).
- New fields on `MasterProfile`:
  - `l1DataAsOf DateTime?`, `l2DataAsOf DateTime?` (the bureau pull date and bank
    statement period-end date, explicitly named per §13.1 — distinct from the existing
    `sourceCreditReportCompletedAt`/`sourceBankStatementCompletedAt` provenance
    timestamps, which track *this app's processing*, not the underlying *data's own*
    as-of date).
  - `dataQualityBand DataQualityBand?` (new enum: `HIGH, MODERATE, LOW_MODERATE, LOW,
    INSUFFICIENT`), `dataQualityFlags Json?` (string array).
  - `complianceHold Boolean @default(false)`, `complianceHoldReason String?`,
    `complianceHoldSince DateTime?`, `complianceSlaHours Int?`,
    `complianceEscalationHours Int?`.
  - `exceptionStates Json?` (array of `{code, applied: boolean, detail}`), replacing
    nothing (new concept) but overlapping conceptually with `dataQualityFlags` —
    kept separate because exceptions include non-DQ states too (e.g.
    `L1_DEBT_POST_STATEMENT`, `SINGLE_SNAPSHOT`) per §4.4.2's own L3-specific flag list.
  - `readinessOutcome ReadinessOutcome?` (new enum: `READY, CCR_FIRST,
    COMPLIANCE_HOLD, SPECIALIST_REVIEW, X1_CANDIDATE, REGENERATE`),
    `readinessConditions Json?` (the R1-R8 pass/fail table).
  - `postStatementDebt Json?` (`{detected, accountCount, totalAmount,
    repaymentUnverified, ccrPriority}`).
  - `dimensionConfidences Json?` (explicit per-dimension HIGH/MEDIUM/LOW for the 5 new
    dimensions, replacing the single `overallConfidence` as the primary confidence
    surface — `overallConfidence` is kept as a column for backward read compatibility
    but the UI stops treating it as the headline number, matching §4.2's "no single
    overall confidence" instruction).
- New `MasterMissingInformationItem` child table (real table, same justification as
  `MasterProfileReconciliationRow` — a CCR needs to mark one item resolved without a
  blob race, same precedent as every other "real table over Json list" decision this
  session): `id, masterProfileId, itemText, sourceModule (L1|L2|L1_L2), priority
  (P1|P2|P3 enum), resolved Boolean @default(false)`.
- Migration is additive-only: no column removed, no table dropped, no destructive
  backfill. Old `MasterProfile` rows simply won't populate the new columns until
  regenerated (same pattern `isStale` already handles for "this version predates a
  capability").
- Verify: `npx prisma validate` + `npx prisma migrate dev`.

## Phase 2 — Calculation engine rewrite

New/rewritten pure functions in `backend/src/modules/master-profile/calculations/`:

- `identity.ts` — `reconcileIdentity(lead, customer, creditReport)`: **add the bureau
  as a third source** (`BUREAU_VERIFIED`), compare PAN+name against Lead-form/
  CCR-verified name per §3.3 G6, flag `IDENTITY_MISMATCH` when they disagree. This is
  the confirmed real defect from the parity matrix — not speculative.
- `data-quality.ts` (new file) — `computeDataQualityBand(l1DqScore, l2DqScore,
  flags)`: implements the exact band table from §4.4.1 (HIGH/MODERATE/LOW-MODERATE/
  LOW/INSUFFICIENT) and the flag list from §4.4.2 (inherited L1/L2 flags + 9
  L3-specific flags), reading Debt Analysis's and Financial Analysis's own already-
  computed Data Quality Scores (both modules already expose a 0-100 DQ score — Debt
  Analysis's `dataQuality.total`/`.flags`, Financial Analysis's equivalent) rather than
  recomputing either.
- `dimensions.ts` (new file) — groups existing calculation outputs into the 5 named
  dimensions (§7-10: Identity & Compliance, Credit Health, Income & Cash Flow, Debt &
  Liquidity, Alignment & Capacity) with per-dimension confidence per §4.2's table
  (inherit from L1/L2 DQ band, HIGH if reconciliation passed, etc.) — a pure
  regrouping/labelling function, not new math.
- `compliance-routing.ts` (new file) — `detectRelatedPartyEmployer(employer, affiliate
  List)` + `buildComplianceRouting(...)`: BBS-affiliate-list match (configurable list,
  starting with the one named entity in the reference, "Golden Legand Leasing &
  Finance Ltd," documented as a Pilot-V1 hardcoded list needing Compliance sign-off —
  same disclosure convention as every other named threshold this session), SLA/
  escalation fields per §14.3, auto-routes to `COMPLIANCE_HOLD` as primary alignment
  state per §12.3's explicit supersession rule.
- `alignment.ts` (rewrite) — `classifyAlignment(...)`: 5 states + COMPLIANCE_HOLD
  override, per §12.1/§12.2's exact table; COMPLIANCE_HOLD always wins when active.
- `resolution-and-cohort.ts` (rewrite) — `computeResolutionCapacity(...)`: implements
  §16's exact formula (sustainable surplus = normalized income − fixed obligations −
  essential expenses incl. inferred-family-support − banded stress buffer) and §16.5's
  6-band table, with the explicit `FCF_UNRECONCILED → MARGINAL` cap rule. Also rewrite
  `buildCohortAttributeVector` against §21.2's exact numeric band cutoffs.
- `post-statement-debt.ts` (new file) — `detectPostStatementDebt(accounts,
  l2PeriodEnd)`: per §5.7, flags any Debt Analysis account `openedOn > l2PeriodEnd`,
  sums their outstanding, sets `repaymentUnverified: true`, `ccrPriority: 'P1'`.
- `missing-information-register.ts` (new file) — `buildMissingInformationRegister(...)`:
  P1/P2/P3 tiering per §20.2, deduplication rules per §20.1, folding in Debt
  Analysis's and Financial Analysis's own Missing Information Register items (both
  already produce one) plus Master-Profile-specific items (the reference report's own
  34-item register is dominated by L2-sourced items — confirms this should primarily
  surface upstream MIR items, tiered, not invent new ones from nothing).
- `family-network-verification.ts` (new file) — reads Financial Analysis's existing
  family-network-detector output (already built, used for P2P/income classification)
  and reframes it for capacity-calculation purposes per §9.2: each inferred family
  member starts `UNVERIFIED`, rule "treat as potentially essential pending CCR."
- `readiness-gate.ts` (new file) — `evaluateReadinessGate(...)`: the exact R1-R8 table
  from §22.1, outcome routing from §22.2.
- `signals.ts` (rewrite) — add the cap/threshold rubric from §18.1 (Strengths: Positive
  + HIGH confidence or 2×MEDIUM, max 5; Concerns: Attention+ severity, max 10;
  Opportunities: pathway-relevant, max 5) — same detection logic, add filtering/capping
  only.
- `debt-servicing.ts` — unchanged (Master DSR formula already matches §11 structurally
  per the earlier audit); re-verify numerically against the reference's own 20.6%/
  47.7%/4.86× figures once wired end-to-end.

**Tests**: one new/extended spec file per calculation file above, each covering the
exact numeric boundary cases the spec states (DQ band cutoffs at 40/60/80 and flag
counts at 2/5/10; resolution capacity surplus-percent cutoffs at 5/15/30; readiness
gate each of R1-R8 individually pass/fail; compliance SLA 72h/48h). Plus one
reconstruction of the Praveenkumar case itself as a fixture-based integration test
inside the calculations layer, checked field-by-field against the reference report's
own stated values (DQ band LOW-MODERATE, 8 exceptions, COMPLIANCE_HOLD, Resolution
Capacity MARGINAL, Master DSR 20.6%/47.7%, Debt Coverage 4.86×) — this is uniquely
verifiable because this exact customer's real bureau+statement data is already seeded
as `BBS-LD-900001`.

## Phase 3 — Service orchestration rewrite

- Rewire `MasterProfileService.generate()`'s pipeline to call the new functions in the
  right dependency order (data quality and dimension confidence need to be computed
  before alignment/readiness-gate, mirroring the exact lesson learned in the Debt
  Analysis pass's divergence-fix reordering).
- Add `getHistory()` if not already present (check first) for the reference's own
  "three-date versioning" and TTL concept (§13.3) — profile freshness TTL banding
  (90/30/15 days, no TTL during COMPLIANCE_HOLD) surfaced as a computed `expiresAt`/
  `isExpired` on read, not a cron job (no scheduler infra exists in this codebase,
  confirmed repeatedly this session — same named scope simplification as every prior
  module).
- New routes: none strictly required by the spec beyond existing GET/generate: the
  Cohort Brief/CCR Brief text templates (§23) can stay generated by the existing
  `insights` AI narrative layer (already produces an executive narrative) or a new thin
  deterministic endpoint mirroring Debt Analysis's own `getCallBriefForLead` pattern —
  decide once Phase 2 output shapes are final, document the choice either way.

## Phase 4 — Frontend rebuild

- Extend `src/features/leads/types.ts` with every new field (DQ band+flags, exception
  states, compliance routing, readiness gate, post-statement debt, MIR priority items,
  per-dimension confidences, 3 as-of dates), all `?:` optional for the same
  backward-compatibility reason established throughout this session.
- Rebuild `MasterProfileTab.tsx` into the reference report's own section order (the
  PDF's own 27-section structure, condensed to a reviewable UI hierarchy): Executive
  Summary → Input Validation & Exceptions → Data Quality (band+flags) → 5 Dimension
  cards (Identity & Compliance incl. compliance-hold banner; Credit Health; Income &
  Cash Flow incl. family-network-verification table; Debt & Liquidity; Alignment &
  Capacity incl. resolution capacity) → Credit-Bank Reconciliation table (8 match
  states) → Event Profile / Master Timeline → Strengths/Concerns/Opportunities (capped)
  → Possible Causes → Missing Information Register (P1/P2/P3) → Readiness Gate +
  Handoff → CCR Brief / Cohort Brief → What L3 Cannot Decide.
- Render `cohortAttributes` for the first time (confirmed dead data today).
- New `DataQualityBandCard`, `ComplianceHoldBanner`, `ReadinessGateCard`,
  `PostStatementDebtCard`, `MissingInformationRegisterCard` (reuse the Debt Analysis
  one's presentational pattern, not its data), `FamilyNetworkVerificationTable`.

## Phase 5 — Downstream compatibility, regression, QA

- Re-verify Cohort Engine's actual field-level dependency on Master Profile (grep,
  same technique used in the Debt Analysis pass) now that alignment-state names and
  the cohort vector's band values change — update `cohort-engine` consumers for any
  renamed value it switches on by literal string.
- Full backend/frontend build, lint, unit, e2e.
- Live verification against `BBS-LD-900001` (no new bureau pull), with the reference
  report as the acceptance check — mark any residual numeric gap BLOCKED with evidence,
  never forced.
- Visual QA via the same real-Chromium Playwright setup already installed this session
  (scratch-dir `playwright` package + downloaded Chromium binary) if the dev servers
  are still viable; otherwise re-install.

## Scope boundaries, stated up front (not discovered mid-build)

- Multi-bureau reconciliation (§3.4) and multi-account consolidation (§3.5): marked
  NOT_APPLICABLE — this codebase's schema structurally allows only one `CreditReport`
  and effectively one current `BankStatementAnalysis` per lead. Building speculative
  multi-source merge logic with no real multi-source data to exercise it against would
  be exactly the kind of unrequested, unverifiable scope this session has avoided
  elsewhere (Debt Analysis's own "no RuleConfig admin table" precedent).
- No scheduler/cron for TTL expiry or SLA escalation — surfaced as computed fields a
  CCR sees on read, consistent with this codebase's complete absence of background-job
  infrastructure (confirmed repeatedly across Financial Analysis, Debt Analysis, Cohort
  Engine, Plan Engine).
- Cohort Engine's own rule logic, precedence table, and cohort assignment are
  explicitly out of scope — Master Profile change here only ever *feeds* that engine,
  per v3.0's own "L3 cannot assign a cohort" principle (§19/§24) and this session's
  established module-boundary discipline.
