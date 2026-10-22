# BBS Discrepancy Resolution Report

What was actually fixed this pass, with root causes, affected files, and test evidence.
Companion to `docs/bbs-complete-module-parity-matrix.md` (full audit findings) and
`docs/bbs-remaining-gaps-and-blockers.md` (what was found but deliberately not fixed,
and why).

## 1. L1 Debt Analysis — bureau mappers never detected write-off/settlement status

**Root cause**: Both `signzy-response.mapper.ts` and `experian-response.mapper.ts`
derived `CreditAccount.lifecycleStatus` only from the bureau's `Account_Status`/
`accountStatusDescription` field (ACTIVE/CLOSED). Neither ever read
`Written_off_Settled_Status`, `Settlement_Amount`, `Written_Off_Amt_Principal`, or
`Written_Off_Amt_Total` — fields the v3.0 spec's own §3.3/§3.5 name explicitly. This
meant `lifecycleStatus` could structurally never equal `'SETTLED'`/`'WRITTEN_OFF'`,
which in turn meant:
- Debt Risk Indicator Component 2 ("Adverse Account Status", 20 of 100 points) could
  never score above 0 for any lead with a real written-off or settled account.
- Risk Signal Engine codes `WRITTEN_OFF` and `SETTLED_ACCOUNT` could never fire.

**Verification before fixing**: independently decoded the real captured bureau fixtures
(`fixtures/signzy-experian-lite-success.json`, `fixtures/in-profile-response.matched-record.xml`
— both the same underlying real customer's real bureau data, captured via two
different integration paths) field-by-field. Confirmed: 2 of 33 real accounts carry
`Written_off_Settled_Status = 99` ("Clear Existing Status" — the spec's own explicitly
non-adverse code); every account's `Settlement_Amount`/`Written_Off_Amt_*` is "0" or
blank when present. No real example of a genuinely adverse value exists in either
fixture — meaning the fix had to be implemented from the spec's own explicit,
documented rules (0 = none; 99 = never adverse), never from a guessed code semantic.

**Fix**: both mappers now read the four fields above and override `lifecycleStatus` to
`'WRITTEN_OFF'`/`'SETTLED'` when the amount fields are genuinely non-zero, with a
defensive rule (matching the spec's own explicit instruction) that `Written_off_Settled_Status
=== 99` can never be interpreted as adverse even if an amount field were to disagree.
`SUIT_FILED`/`RESTRUCTURED`/`WILFUL_DEFAULT` remain deliberately unmapped — the spec
gives no code table for `SuitFiledWillfulDefaultWrittenOffStatus`/
`SuitFiled_WillfulDefault`, and every account in both real fixtures has this field
blank, so there is no real example to verify against; guessing would violate both
mappers' own established, pre-existing "never guess bureau-proprietary code semantics"
discipline.

**Files changed**:
- `backend/src/modules/bureau/providers/signzy-response.mapper.ts`
- `backend/src/modules/bureau/providers/experian-response.mapper.ts`
- `backend/src/modules/bureau/providers/signzy-response.mapper.spec.ts` (+4 tests)
- `backend/src/modules/bureau/providers/experian-response.mapper.spec.ts` (+1 regression test, +4 new tests)

**Test evidence**: all 9 new tests pass (regression guards confirming the real fixtures'
2 code-99 accounts are never coerced adverse; mutation-based tests confirming a real
non-zero write-off/settlement amount correctly overrides `lifecycleStatus`, with the
code-99 defensive override confirmed even against contradictory/malformed input).
Full bureau+debt-analysis suite: 157/157 passing. Full backend suite: 1236/1237 passing,
1 skipped, **zero failures** (see item 5 below for why this count differs from every
prior "baseline" cited this session).

**Live verification**: reprocessed the canonical lead's already-stored real bureau
response (`POST .../debt-analysis/reprocess` — no new bureau call) after the fix.
Confirmed no crash/regression; confirmed `settlement: {settledCount: 0, writtenOffCount:
0, ...}` — all zeros, exactly as expected since this specific customer's real data has
no adverse accounts. **Important, honest correction to a plausible-sounding hypothesis
from the audit pass**: this fix does **not** explain the pre-existing reference-report
discrepancies (Data Quality 96 vs. reference 86; Debt Risk Indicator 34 vs. reference
36) for this specific canonical lead — live-confirmed both scores are completely
unchanged after the fix, since the underlying real data has zero adverse-status signal
regardless of whether the mapper reads it. The fix is still correct and necessary for
any *other* lead with genuinely adverse accounts; it simply doesn't move this
particular lead's already-documented, still-open discrepancy.

## 2. L2 Financial Analysis — related-party employer detection silently disabled

**Root cause**: `detectRelatedPartyEmployer()` (a real, correctly-built, well-tested
detector) matches salary-source narrations against `config.relatedPartyEmployerNames`
— which defaults to an empty array and was never populated in this environment's
`.env`. The code's own design is deliberate and defensible (never hardcode one
deployment's specific employer name into source code as if it were general policy),
but the spec's own §6.7/§11.7 names the real entity explicitly (BBS's own parent NBFC),
making this a real, documented policy requirement, not a guess — populating it is
implementing the spec, not inventing a new rule.

**Fix**: added `FINANCIAL_RELATED_PARTY_EMPLOYER_NAMES=Golden Legand Leasing & Finance
Ltd,Golden Legand Leasing,GoldnLegand,GLLFL` to both `backend/.env` (this dev
environment) and `backend/.env.example` (documented, so future deployments don't
silently repeat this gap).

**Files changed**: `backend/.env`, `backend/.env.example`.

**Verification**: the detection logic itself was already covered by 330+ existing
tests; this was a pure configuration activation, not a code change, so no new test was
needed. Live re-verification was not performed (no safe reprocess-without-reupload path
exists for Financial Analysis — see remaining-gaps doc) — the dev server was restarted
to pick up the new value, confirmed via a clean health check, but re-exercising the
canonical lead's financial analysis would have required either mutating canonical
seeded data or an unnecessary new document-processing run, neither of which this task's
own data-safety instructions permit without a stated need.

## 3. L2 Financial Analysis — missing 5th Data Quality Score cap

**Root cause**: v4.0 spec §12.2 names 5 caps; the codebase implemented 4
(`unclassified_share`, `other_accounts_likely`, `fcf_unreconciled`,
`reconciliation_failed`) but never wired `business_personal_mixed→cap78` into
`buildDataQualityScore()`, even though the underlying `businessPersonalMixed` boolean
was already computed and used elsewhere in the same service.

**Fix**: added `dataQualityBusinessPersonalMixedCapPoints` to the config registry
(default 78, matching spec, env-overridable via
`FINANCIAL_DATA_QUALITY_BUSINESS_PERSONAL_MIXED_CAP`), wired the existing
`businessPersonalMixed` variable through to `buildDataQualityScore()`'s input, and
added the 5th cap to the applied-caps list.

**Files changed**: `backend/src/config/configuration.ts`, `backend/src/config/env.validation.ts`,
`backend/.env.example`, `backend/src/modules/financial-analysis/financial-analysis.types.ts`,
`backend/src/modules/financial-analysis/calculations/extended-metrics.ts`,
`backend/src/modules/financial-analysis/financial-analysis.service.ts`,
`backend/src/modules/financial-analysis/classification/test-helpers.ts` (shared test
config fixture), `backend/src/modules/financial-analysis/calculations/extended-metrics.spec.ts` (+1 test).

**Test evidence**: new test confirms the cap applies and `finalScore` is correctly
bounded by it. Full financial-analysis suite: 333/333 passing (was 330/333 under the
correct test invocation before this fix — see item 5).

## 4. L2 Financial Analysis — Score/Cashflow Divergence missing its own calibration caveat

**Root cause**: v4.0 spec §15.3 explicitly marks its own divergence thresholds "⚠️
PROPOSED — REQUIRES CALIBRATION... must be validated against a labelled sample before
production use." The implementation's trigger logic was correct, but presented the
result as settled, calibrated logic with no caveat anywhere in the backend response or
the frontend card — a reviewer or CCR would have no way to know these specific
thresholds are unvalidated.

**Fix**: added `thresholdsRequireCalibration: true` to `ScoreCashflowDivergenceResult`
and appended the spec's own caveat language to the `detail` string (always, divergent
or not) — the existing frontend card already renders `detail` verbatim, so this
required no frontend code change to surface, only a type addition for completeness.

**Files changed**: `backend/src/modules/financial-analysis/calculations/extended-metrics.ts`,
`backend/src/modules/financial-analysis/calculations/extended-metrics.spec.ts` (+1 test),
`src/features/leads/types.ts`, `src/features/leads/services/financialAnalysisService.ts` (mock fixture).

**Test evidence**: new test confirms the caveat is present in both the divergent and
non-divergent cases. Frontend `tsc -b`/`vite build`/`eslint` all clean after the type
addition.

## 5. L2 Financial Analysis — Cash Usage CCR Prompts only generated 1 of the spec's 5 questions

**Root cause**: v4.0 spec §10.5 names 5 fixed discovery questions to auto-generate when
`CASH_VISIBILITY_GAP` is flagged. Only the first ("What was the ₹X cash withdrawn in
[month] used for?") was implemented.

**Fix**: added the remaining 4 fixed questions verbatim, in the same deterministic
code path (no new inference — purely the spec's own template text).

**Files changed**: `backend/src/modules/financial-analysis/calculations/handoff-contracts.ts`,
`backend/src/modules/financial-analysis/calculations/handoff-contracts.spec.ts` (+1 test).

**Test evidence**: new test confirms all 5 spec'd questions appear when the gap is flagged.

## 6. Session-wide test-methodology correction (not a code fix, but material to every reported number)

**Root cause**: throughout this entire session, "the 3 pre-existing, unrelated
PDF-parser test failures" was repeatedly cited as a stable baseline across every
module's own parity matrix. This was caused by consistently running `npx jest`
directly, which does **not** pass `--experimental-vm-modules` (required by
`pdfjs-dist`'s ESM worker). The project's own `package.json` `test` script already
includes this flag (`node --experimental-vm-modules node_modules/jest/bin/jest.js`) —
it was simply never used for routine `npx jest ...` invocations during ad hoc test runs.

**Correction, not a fix**: re-running the exact same full suite via the project's own
correct invocation produces **1236/1237 passing, 1 skipped, zero failures** — the
backend unit suite is, and apparently always was, fully clean. No code was wrong; the
test-runner invocation was. This is recorded here because it materially changes how
every "X/Y passing, 3 known failures" line in every other document this session (and in
this pass's own module-by-module findings) should be read: the "3 failures" were never
real.

## Full regression after all fixes in this report

- Backend: `npx tsc --noEmit` clean. `npm run build` clean. `npm run lint` clean.
  `npm run test` (correct invocation): **1236/1237 passing, 1 skipped, 0 failures**.
  `npm run test:e2e`: **107/107 passing**.
- Frontend: `npx tsc -b` clean. `npm run build` clean (same pre-existing chunk-size
  warning only). `npm run lint` clean.
- Live verification: canonical lead's debt analysis reprocessed successfully against
  the real stored bureau response with zero errors; dev server restarted cleanly to
  pick up the new related-party employer config.
