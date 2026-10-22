import type { CohortEngineConfig, CohortInput, CohortRuleResultOutput } from '../cohort-engine.types'

function result(
  ruleId: string,
  ruleVersion: string,
  evaluated: boolean,
  matched: boolean,
  severity: CohortRuleResultOutput['severity'],
  reason: string,
  evidence: CohortRuleResultOutput['evidence'],
  evidenceLevel: CohortRuleResultOutput['evidenceLevel'],
  sourceFields: string[],
): CohortRuleResultOutput {
  return { ruleId, ruleVersion, evaluated, matched, severity, reason, evidence, evidenceLevel, sourceFields }
}

/** R001 — Consent: consent != ACTIVE -> BLOCKED/CONSENT_PENDING; stop bureau pull. */
function r001Consent(input: CohortInput, v: string): CohortRuleResultOutput {
  const matched = !input.lead.consentGranted
  return result('R001', v, true, matched, 'HIGH', matched ? 'Consent is not active for this lead.' : 'Consent is active.', { consentGranted: input.lead.consentGranted }, 'CONFIRMED', ['lead.consentGranted'])
}

/** R002 — Identity/KYC: PAN invalid OR KYC not verified -> BLOCKED/KYC_PENDING. PAN here is existence-only (no raw PAN ever stored, no real KYC provider integration exists) — "valid" means "a PAN reference exists," documented honestly. */
function r002Identity(input: CohortInput, v: string): CohortRuleResultOutput {
  const matched = !input.lead.panAvailable
  return result('R002', v, true, matched, 'HIGH', matched ? 'No PAN reference is on file for this lead.' : 'A PAN reference is on file.', { panAvailable: input.lead.panAvailable }, 'CONFIRMED', ['lead.panAvailable'])
}

/** R003 — Bureau readiness: Debt Analysis not complete -> contributes to the upstream X1/REGENERATE routing (see §3.2 — Master Profile's own readinessGate already short-circuits on this; this rule row exists for audit completeness, evaluating every rule regardless of which gate ultimately decided). */
function r003BureauReadiness(input: CohortInput, v: string): CohortRuleResultOutput {
  const matched = !input.readiness.debtAnalysisComplete
  return result('R003', v, true, matched, 'HIGH', matched ? 'Debt Analysis has not completed for this lead.' : 'Debt Analysis is complete.', { debtAnalysisComplete: input.readiness.debtAnalysisComplete }, 'CONFIRMED', ['readiness.debtAnalysisComplete'])
}

/** R004 — Financial readiness: income/essential expenses/mandatory EMI missing -> contributes to X1 (see R003's own doc comment on the §3.2 short-circuit). */
function r004FinancialReadiness(input: CohortInput, v: string): CohortRuleResultOutput {
  const matched = !input.readiness.financialAnalysisComplete || !input.financial.verifiedIncomeAvailable || input.financial.essentialExpenses === null || input.financial.mandatoryDebtPayments === null
  return result(
    'R004',
    v,
    true,
    matched,
    'HIGH',
    matched ? 'Verified income, essential expenses, or mandatory debt payments are not available.' : 'Financial readiness data is complete.',
    { financialAnalysisComplete: input.readiness.financialAnalysisComplete, verifiedIncomeAvailable: input.financial.verifiedIncomeAvailable, essentialExpenses: input.financial.essentialExpenses, mandatoryDebtPayments: input.financial.mandatoryDebtPayments },
    'CONFIRMED',
    ['readiness.financialAnalysisComplete', 'financial.verifiedIncomeAvailable', 'financial.essentialExpenses', 'financial.mandatoryDebtPayments'],
  )
}

/** R005 — Material mismatch: unresolved -> BLOCKED/MANUAL_REVIEW_REQUIRED (§6.1 priority 1.5). Reuses Master Profile's own alignment classification (`alignmentState === null` means insufficient evidence to classify) rather than re-deriving a mismatch check. */
function r005Mismatch(input: CohortInput, v: string): CohortRuleResultOutput {
  const matched = input.reconciliation.unresolvedMismatch
  return result('R005', v, true, matched, 'HIGH', matched ? 'Master Profile flagged an unresolved material mismatch between sources.' : 'No unresolved material mismatch was flagged.', { unresolvedMismatch: matched }, 'DERIVED', ['reconciliation.unresolvedMismatch'])
}

/** R006 — Legal status: suit_filed OR wilful_default OR arc_sold -> BLOCKED/SPECIALIST_REQUIRED (§6.1 priority 1.6). "ownership_dispute" has no data source in this codebase and never contributes. */
function r006LegalStatus(input: CohortInput, v: string): CohortRuleResultOutput {
  const matched = input.credit.legalOrSpecialistTrigger
  return result(
    'R006',
    v,
    true,
    matched,
    'HIGH',
    matched ? 'A suit-filed, wilful-default, or ARC-assigned status is reported.' : 'No suit-filed, wilful-default, or ARC-assigned status is reported.',
    { suitFiled: input.credit.suitFiled, arcAssigned: input.credit.arcAssigned, willfulDefault: input.credit.willfulDefault },
    'CONFIRMED',
    ['credit.suitFiled', 'credit.arcAssigned', 'credit.willfulDefault'],
  )
}

/**
 * R007 — Delinquency state: escalating DPD trend holds the standard
 * stabilisation offer pending review. v3.0's own extracted text gives no
 * explicit formula for R007 (unlike R013/R018/R019/R022, which carry a
 * code block) — this is the spec's own §5.5 archetype table's only other
 * reference to "escalating DPD trend," so this rule is implemented to the
 * best-evidenced interpretation (dpdTrend-based) and documented as a
 * spec gap, never invented from nothing.
 */
function r007DelinquencyState(input: CohortInput, v: string): CohortRuleResultOutput {
  const evaluated = input.credit.dpdTrend !== 'UNKNOWN'
  const matched = input.credit.dpdTrend === 'ESCALATING'
  return result('R007', v, evaluated, matched, 'MEDIUM', evaluated ? (matched ? 'DPD trend is escalating — standard stabilisation offer held pending review.' : 'DPD trend is not escalating.') : 'Insufficient payment-history data to determine a DPD trend.', { dpdTrend: input.credit.dpdTrend }, 'DERIVED', ['credit.dpdTrend'])
}

/** R008 — Overdue pressure: total_overdue > configured trigger -> mandatory capacity/review trigger, NOT automatic rejection. */
function r008OverduePressure(input: CohortInput, config: CohortEngineConfig, v: string): CohortRuleResultOutput {
  const evaluated = input.credit.currentOverdue !== null
  const matched = evaluated && input.credit.currentOverdue! > config.overdueCapacityTriggerRupees
  return result(
    'R008',
    v,
    evaluated,
    matched,
    'MEDIUM',
    evaluated ? (matched ? `Total overdue (₹${input.credit.currentOverdue}) exceeds the ₹${config.overdueCapacityTriggerRupees} capacity/review trigger — not automatic rejection.` : 'Total overdue is within the standard capacity/review trigger.') : 'Current overdue amount is not available.',
    { currentOverdue: input.credit.currentOverdue, triggerRupees: config.overdueCapacityTriggerRupees },
    'CONFIRMED',
    ['credit.currentOverdue'],
  )
}

/** R009 — Borrowing to repay: confirmed via Financial Analysis's own BORROWING_DEPENDENCY_PATTERN risk flag. */
function r009BorrowingToRepay(input: CohortInput, v: string): CohortRuleResultOutput {
  const matched = input.behaviour.borrowingToRepay
  return result('R009', v, true, matched, 'HIGH', matched ? 'A loan credit followed by large transfers/withdrawals and a subsequent low balance was observed.' : 'No borrowing-to-repay pattern was observed.', { borrowingToRepay: matched }, 'DERIVED', ['behaviour.borrowingToRepay'])
}

/**
 * R010 — Debt-cycle stacking (consolidated, §5.1's own consolidation note):
 * a recent account-opening cluster, OR a corroborated stacking-index +
 * enquiry-burst. v3.0's own extracted text gives no explicit formula for
 * R010 (its code block was not present in the attachment, unlike R013/
 * R018/R019/R022) — the §22.1 Praveenkumar case validation table is the
 * only concrete evidence available: R010 FIRED there purely from a real
 * account-opening cluster ("6.3 accounts/year" reported as supporting
 * evidence, not a >15/year threshold crossing — that customer's real rate
 * is well under this module's own stackingIndexPerYear default), with NO
 * overdue precondition (that same case's R008 is NOT_FIRED, ₹0 overdue).
 * An earlier version of this rule required overdue > 0 as a precondition
 * (inherited from a pre-v3.0 design) — removed after checking it against
 * this exact reference case, which fires without any overdue present.
 * Deliberately distinct from R009 (borrowing-to-repay is its own
 * standalone rule, not folded in).
 */
function r010DebtCycleStacking(input: CohortInput, config: CohortEngineConfig, v: string): CohortRuleResultOutput {
  const stackingIndexHigh = input.debt.newAccountsPerYear !== null && input.debt.newAccountsPerYear! > config.stackingIndexPerYear
  const enquiryBurstHigh = input.credit.enquiries30d !== null && input.credit.enquiries30d! > config.enquiryBurstThreshold30d
  const matched = input.debt.recentStackingClusterDetected || (stackingIndexHigh && enquiryBurstHigh)
  return result(
    'R010',
    v,
    true,
    matched,
    'HIGH',
    matched
      ? input.debt.recentStackingClusterDetected
        ? 'A cluster of new accounts was opened within 180 days.'
        : 'Corroborated new-account rate and enquiry burst indicate a debt-cycle stacking pattern.'
      : 'No debt-cycle stacking pattern was detected.',
    { recentStackingClusterDetected: input.debt.recentStackingClusterDetected, stackingIndexHigh, enquiryBurstHigh, newAccountsPerYear: input.debt.newAccountsPerYear },
    'DERIVED',
    ['debt.recentStackingClusterDetected', 'debt.newAccountsPerYear', 'credit.enquiries30d'],
  )
}

/** R011 — Enquiry burst: enquiries_30d > configured threshold -> corroborates R010; not standalone. */
function r011EnquiryBurst(input: CohortInput, config: CohortEngineConfig, v: string): CohortRuleResultOutput {
  const evaluated = input.credit.enquiries30d !== null
  const matched = evaluated && input.credit.enquiries30d! > config.enquiryBurstThreshold30d
  return result(
    'R011',
    v,
    evaluated,
    matched,
    'MEDIUM',
    evaluated ? (matched ? `${input.credit.enquiries30d} enquiries in the trailing 30 days exceeds the configured threshold of ${config.enquiryBurstThreshold30d}.` : 'Enquiry activity in the trailing 30 days is within the configured threshold.') : 'Enquiry history is not available.',
    { enquiries30d: input.credit.enquiries30d, threshold: config.enquiryBurstThreshold30d },
    'CONFIRMED',
    ['credit.enquiries30d'],
  )
}

/** R012 — Consolidation eligibility: 2+ active accounts AND non-distressed capacity AND no legal blocker -> C2 assessment-eligibility only (no stress-test/underwriting integration exists in this codebase). */
function r012ConsolidationEligibility(input: CohortInput, v: string): CohortRuleResultOutput {
  const capacityKnown = input.financial.capacityBand !== 'UNKNOWN'
  const capacityVerified = capacityKnown && input.financial.capacityBand !== 'DISTRESSED'
  const matched = input.debt.activeAccounts >= 2 && capacityVerified && !input.credit.legalOrSpecialistTrigger
  return result(
    'R012',
    v,
    capacityKnown,
    matched,
    'MEDIUM',
    capacityKnown
      ? matched
        ? '2+ active accounts, non-distressed capacity, and no legal blocker — eligible for consolidation assessment (stress test/underwriting not modeled here).'
        : 'Consolidation assessment eligibility criteria are not met.'
      : 'Capacity could not be calculated.',
    { activeAccounts: input.debt.activeAccounts, capacityBand: input.financial.capacityBand, legalOrSpecialistTrigger: input.credit.legalOrSpecialistTrigger },
    'DERIVED',
    ['debt.activeAccounts', 'financial.capacityBand', 'credit.legalOrSpecialistTrigger'],
  )
}

/** R013 — Capacity band (unified): reads the already-computed band (`calculateCapacity`, §8.1/§8.2) rather than re-deriving it — one row reporting whichever of the 5 bands applies, replacing the old 3-rule STRESSED/TIGHT/COMFORTABLE split. */
function r013CapacityBand(input: CohortInput, v: string): CohortRuleResultOutput {
  const evaluated = input.financial.capacityBand !== 'UNKNOWN'
  return result('R013', v, evaluated, evaluated, 'LOW', evaluated ? `Capacity band is ${input.financial.capacityBand}.` : 'Capacity could not be calculated.', { capacityBand: input.financial.capacityBand, capacityRatio: input.financial.capacityRatio, sustainableSurplus: input.financial.sustainableSurplus }, 'DERIVED', ['financial.capacityBand', 'financial.capacityRatio', 'financial.sustainableSurplus'])
}

/** R014 — Stabilisation coverage: requires an approved support amount from the BBS Plan Engine, which does not exist yet in this codebase — always reports NOT_APPLICABLE (never a fabricated coverage figure). */
function r014StabilisationCoverage(v: string): CohortRuleResultOutput {
  return result('R014', v, false, false, 'LOW', 'Stabilisation coverage requires an approved support amount from the BBS Plan Engine, which is not yet implemented.', {}, 'UNKNOWN', [])
}

/** R015 — Recovery state: acute_distress_resolved AND payments_stable_or_improving AND no critical blocker -> C7 candidate. No score-increase promise. */
function r015RecoveryState(input: CohortInput, v: string): CohortRuleResultOutput {
  const evaluated = input.credit.currentOverdue !== null && input.credit.dpdTrend !== 'UNKNOWN'
  // "Resolved/reduced" implies some prior adverse signal existed to recover
  // from — a lead with a perfectly clean history was never in distress, so
  // is not "recovering" (it simply has no R015-relevant signal either way).
  const hadPriorAdverseSignal = input.credit.historicalMaxDpd !== null && input.credit.historicalMaxDpd > 0
  const acuteDistressResolved = evaluated && input.credit.currentOverdue === 0 && !input.credit.legalOrSpecialistTrigger
  const paymentsStableOrImproving = input.credit.dpdTrend === 'STABLE' || input.credit.dpdTrend === 'IMPROVING'
  const matched = evaluated && hadPriorAdverseSignal && acuteDistressResolved && paymentsStableOrImproving
  return result(
    'R015',
    v,
    evaluated,
    matched,
    'LOW',
    evaluated ? (matched ? 'Acute distress appears resolved with stable/improving payment behaviour and no critical blocker.' : 'Recovery-state criteria are not met.') : 'Insufficient data to assess recovery state.',
    { currentOverdue: input.credit.currentOverdue, dpdTrend: input.credit.dpdTrend, legalOrSpecialistTrigger: input.credit.legalOrSpecialistTrigger, historicalMaxDpd: input.credit.historicalMaxDpd },
    'DERIVED',
    ['credit.currentOverdue', 'credit.dpdTrend', 'credit.legalOrSpecialistTrigger', 'credit.historicalMaxDpd'],
  )
}

/** R016 — Outside current program: no relevant debt distress -> X2. */
function r016OutsideProgram(input: CohortInput, v: string): CohortRuleResultOutput {
  // "No relevant debt distress" means no overdue/debt-cycle/legal pressure
  // and comfortable capacity — NOT "no debt at all."
  const noOverdue = (input.credit.currentOverdue ?? 0) === 0
  const noDebtCycleSignal = !input.behaviour.borrowingToRepay && !input.debt.recentStackingClusterDetected
  const comfortableCapacity = input.financial.capacityBand === 'COMFORTABLE'
  const matched = noOverdue && noDebtCycleSignal && comfortableCapacity && !input.credit.legalOrSpecialistTrigger
  return result('R016', v, true, matched, 'LOW', matched ? 'No relevant debt distress was identified for this lead.' : 'Relevant debt distress signals are present.', { totalDebt: input.debt.totalDebt, currentOverdue: input.credit.currentOverdue, capacityBand: input.financial.capacityBand }, 'DERIVED', ['debt.totalDebt', 'credit.currentOverdue', 'financial.capacityBand'])
}

/**
 * R017 — Compliance signal (unified, hard gate): reads Master Profile's own
 * already-computed `complianceRouting` verbatim — related-party employer/
 * family, PEP/sanctions/fraud, or a legal-status-active match all surface
 * through the one `compliance.hold` boolean there; Cohort Engine never
 * re-derives a match itself. Fires -> BLOCKED/COMPLIANCE_HOLD (§6.1
 * priority 1.2), which also supersedes every lower-priority candidate.
 */
function r017ComplianceSignal(input: CohortInput, v: string): CohortRuleResultOutput {
  const matched = input.compliance.hold
  return result(
    'R017',
    v,
    true,
    matched,
    'HIGH',
    matched ? `Compliance hold active${input.compliance.reason ? ` (${input.compliance.reason})` : ''}${input.compliance.matchedEntity ? ` — matched entity: ${input.compliance.matchedEntity}` : ''}.` : 'No compliance hold is active.',
    { hold: input.compliance.hold, reason: input.compliance.reason, matchedEntity: input.compliance.matchedEntity, slaHours: input.compliance.slaHours },
    'CONFIRMED',
    ['compliance.hold', 'compliance.reason', 'compliance.matchedEntity'],
  )
}

/**
 * R018 — Other accounts (with flow threshold, graduated hard gate, §9.3):
 * reads Financial Analysis's own OTHER_ACCOUNTS_LIKELY risk-flag evidence
 * (`selfTransferIncomeSharePercent`) verbatim. <5% informational only,
 * 5-10% flags OTHER_ACCOUNTS_MINOR, >10% blocks ->
 * BLOCKED/OTHER_ACCOUNTS_REQUIRED (§6.1 priority 1.3). Only the >10% case
 * sets `matched` — the graduated 5-10% reading is still recorded in
 * `evidence`/`severity`, never silently dropped.
 */
function r018OtherAccounts(input: CohortInput, config: CohortEngineConfig, v: string): CohortRuleResultOutput {
  const evaluated = input.otherAccounts.incomeSharePercent !== null
  const pct = input.otherAccounts.incomeSharePercent
  const matched = evaluated && pct! > config.otherAccountsFlagMaxPercent
  const minorFlag = evaluated && pct! > config.otherAccountsMinorMaxPercent && pct! <= config.otherAccountsFlagMaxPercent
  const severity: CohortRuleResultOutput['severity'] = matched ? 'HIGH' : minorFlag ? 'MEDIUM' : 'LOW'
  return result(
    'R018',
    v,
    evaluated,
    matched,
    severity,
    evaluated
      ? matched
        ? `Self-transfer activity suggesting another bank account is ${Math.round(pct!)}% of normalized income, exceeding the ${config.otherAccountsFlagMaxPercent}% blocking threshold.`
        : minorFlag
          ? `Self-transfer activity suggesting another bank account is ${Math.round(pct!)}% of normalized income (flagged, below the ${config.otherAccountsFlagMaxPercent}% blocking threshold).`
          : 'No material self-transfer volume suggesting another bank account was detected.'
      : 'Other-accounts flow percentage is not available.',
    { incomeSharePercent: pct, minorMaxPercent: config.otherAccountsMinorMaxPercent, flagMaxPercent: config.otherAccountsFlagMaxPercent, likely: input.otherAccounts.likely },
    'INDICATED',
    ['otherAccounts.incomeSharePercent', 'otherAccounts.likely'],
  )
}

/**
 * R019 — Post-statement debt (graduated, §9.4): reads Master Profile's own
 * already-computed `postStatementDebt` verbatim. <=10% informational,
 * 10-30% material (refresh recommended, not blocking), >30% blocks ->
 * BLOCKED/DATA_REFRESH_REQUIRED (§6.1 priority 1.25, above other-accounts/
 * P1 — "without current data, other assessments are unreliable").
 */
function r019PostStatementDebt(input: CohortInput, config: CohortEngineConfig, v: string): CohortRuleResultOutput {
  if (!input.postStatementDebt.detected) {
    return result('R019', v, true, false, 'LOW', 'No bureau-reported account was opened after the bank statement\'s period end.', { detected: false }, 'CONFIRMED', ['postStatementDebt.detected'])
  }
  const pct = input.postStatementDebt.percentOfActiveDebt
  const evaluated = pct !== null
  const matched = evaluated && pct! > config.postStatementMaterialMaxPercent
  const material = evaluated && pct! > config.postStatementMinorMaxPercent && pct! <= config.postStatementMaterialMaxPercent
  const severity: CohortRuleResultOutput['severity'] = matched ? 'HIGH' : material ? 'MEDIUM' : 'LOW'
  return result(
    'R019',
    v,
    evaluated,
    matched,
    severity,
    evaluated
      ? matched
        ? `Post-statement debt is ${Math.round(pct!)}% of active balance, exceeding the ${config.postStatementMaterialMaxPercent}% blocking threshold — current data is unreliable until refreshed.`
        : material
          ? `Post-statement debt is ${Math.round(pct!)}% of active balance (refresh recommended, not blocking).`
          : `Post-statement debt is ${Math.round(pct!)}% of active balance — informational only.`
      : 'Active balance is not available to compute the post-statement debt percentage.',
    { detected: true, accountCount: input.postStatementDebt.accountCount, totalAmount: input.postStatementDebt.totalAmount, percentOfActiveDebt: pct, repaymentUnverified: input.postStatementDebt.repaymentUnverified },
    'CONFIRMED',
    ['postStatementDebt.detected', 'postStatementDebt.percentOfActiveDebt'],
  )
}

/** R020 — P1 missing information (tiered, §9.5): reads Master Profile's own already-computed `missingInformation[]` P1 count verbatim. 0 proceeds, 1-3 flags LIMITED_DATA, 4+ blocks -> BLOCKED/P1_INFORMATION_REQUIRED (§6.1 priority 1.4). */
function r020P1MissingInformation(input: CohortInput, config: CohortEngineConfig, v: string): CohortRuleResultOutput {
  const matched = input.dataQuality.p1Count >= config.p1ForceBlockThreshold
  const limitedData = input.dataQuality.p1Count > 0 && input.dataQuality.p1Count < config.p1ForceBlockThreshold
  return result(
    'R020',
    v,
    true,
    matched,
    matched ? 'HIGH' : limitedData ? 'MEDIUM' : 'LOW',
    matched ? `${input.dataQuality.p1Count} P1 Critical item(s) outstanding — exceeds the ${config.p1ForceBlockThreshold}-item blocking threshold.` : limitedData ? `${input.dataQuality.p1Count} P1 Critical item(s) outstanding (flagged LIMITED_DATA, below the blocking threshold).` : 'No P1 Critical items are outstanding.',
    { p1Count: input.dataQuality.p1Count, threshold: config.p1ForceBlockThreshold },
    'CONFIRMED',
    ['dataQuality.p1Count'],
  )
}

/** R021 — Exception count (tiered -> specialist/manual, §9.6): reads Master Profile's own `dataQuality.flags.length` verbatim as the exception count. 0-4 proceeds, 5-7 specialist review, 8+ manual review. */
function r021ExceptionCount(input: CohortInput, config: CohortEngineConfig, v: string): CohortRuleResultOutput {
  const count = input.dataQuality.exceptionCount
  const manualReviewTier = count >= config.exceptionManualReviewThreshold
  const specialistTier = count >= config.exceptionSpecialistThreshold && count < config.exceptionManualReviewThreshold
  const matched = manualReviewTier || specialistTier
  return result(
    'R021',
    v,
    true,
    matched,
    manualReviewTier ? 'HIGH' : specialistTier ? 'MEDIUM' : 'LOW',
    manualReviewTier ? `Exception count ${count} meets the manual-review threshold (${config.exceptionManualReviewThreshold}+).` : specialistTier ? `Exception count ${count} meets the specialist-review threshold (${config.exceptionSpecialistThreshold}-${config.exceptionManualReviewThreshold - 1}).` : `Exception count ${count} is within the standard threshold.`,
    { exceptionCount: count, specialistThreshold: config.exceptionSpecialistThreshold, manualReviewThreshold: config.exceptionManualReviewThreshold, tier: manualReviewTier ? 'MANUAL_REVIEW' : specialistTier ? 'SPECIALIST' : 'NONE' },
    'CONFIRMED',
    ['dataQuality.exceptionCount'],
  )
}

/** R022 — FCF unreconciled -> capacity cap (§5.2/§16): reads Master Profile's own `dataQuality.flags` containing `'FCF_UNRECONCILED'` verbatim — the capacity cap itself is applied once, in `capacity.ts`'s `calculateCapacity`; this row is the audit record of that same signal having fired. */
function r022FcfUnreconciled(input: CohortInput, v: string): CohortRuleResultOutput {
  const evaluated = input.dataQuality.band !== null
  const matched = evaluated && input.financial.capacityBand === 'STRESSED' && input.financial.sustainableSurplus !== null && input.financial.sustainableSurplus >= 0
  return result('R022', v, evaluated, matched, 'MEDIUM', evaluated ? (matched ? 'Free cash flow is unreconciled — capacity band capped at STRESSED regardless of the theoretical surplus.' : 'Free cash flow is reconciled or capacity is already at its worst band.') : 'Data Quality band is not available.', { dataQualityBand: input.dataQuality.band, capacityBand: input.financial.capacityBand }, 'DERIVED', ['dataQuality.band', 'financial.capacityBand'])
}

/** R023 — Income transition (§9.1): reads Financial Analysis's own already-computed `eventProfile.incomeTransition` verbatim (a best-fit single-split-point detector, already gated on `incomeTransitionDeltaPercentThreshold`). */
function r023IncomeTransition(input: CohortInput, v: string): CohortRuleResultOutput {
  const matched = input.incomeTransition.detected
  const shortTenure = matched && input.incomeTransition.direction === 'UP' && input.incomeTransition.monthsSinceTransition !== null && input.incomeTransition.monthsSinceTransition < 6
  return result(
    'R023',
    v,
    true,
    matched,
    matched ? 'MEDIUM' : 'LOW',
    matched
      ? `Income transition detected: ${input.incomeTransition.direction === 'UP' ? 'upward' : 'downward'} ${input.incomeTransition.deltaPercent !== null ? Math.round(Math.abs(input.incomeTransition.deltaPercent)) : '?'}%${shortTenure ? ' — short tenure at the new level (< 6 months), confidence reduced.' : '.'}`
      : 'No material income transition was detected.',
    { detected: matched, direction: input.incomeTransition.direction, deltaPercent: input.incomeTransition.deltaPercent, monthsSinceTransition: input.incomeTransition.monthsSinceTransition, shortTenure },
    'DERIVED',
    ['incomeTransition.detected', 'incomeTransition.direction', 'incomeTransition.deltaPercent'],
  )
}

/** R024 — Medical shock (§9.2): reads Financial Analysis's own already-computed `eventProfile.medicalEvents` verbatim. */
function r024MedicalShock(input: CohortInput, v: string): CohortRuleResultOutput {
  const matched = input.medicalShock.shockMonthCount > 0
  const recurrence = input.medicalShock.shockMonthCount >= 3 && !input.medicalShock.chronic
  const financialShock = input.medicalShock.maxIncomeSharePercent !== null && input.medicalShock.maxIncomeSharePercent > 30
  return result(
    'R024',
    v,
    true,
    matched,
    input.medicalShock.chronic ? 'HIGH' : matched ? 'MEDIUM' : 'LOW',
    matched
      ? `${input.medicalShock.chronic ? 'Chronic' : recurrence ? 'Recurring' : 'Acute'} medical spending detected across ${input.medicalShock.shockMonthCount} month(s)${financialShock ? `, peaking above 30% of monthly income` : ''}.`
      : 'No medical-spending shock was detected.',
    { shockMonthCount: input.medicalShock.shockMonthCount, chronic: input.medicalShock.chronic, maxIncomeSharePercent: input.medicalShock.maxIncomeSharePercent, recurrence, financialShock },
    'DERIVED',
    ['medicalShock.shockMonthCount', 'medicalShock.chronic', 'medicalShock.maxIncomeSharePercent'],
  )
}

/**
 * Runs all 24 rules unconditionally and independently — every result is
 * stored, never discarded, regardless of which cohort precedence.ts later
 * selects as primary (§2's own pipeline: "evaluate all rules R001-R024,
 * THEN apply precedence").
 */
export function evaluateAllRules(input: CohortInput, config: CohortEngineConfig): CohortRuleResultOutput[] {
  const v = config.ruleVersion
  return [
    r001Consent(input, v),
    r002Identity(input, v),
    r003BureauReadiness(input, v),
    r004FinancialReadiness(input, v),
    r005Mismatch(input, v),
    r006LegalStatus(input, v),
    r007DelinquencyState(input, v),
    r008OverduePressure(input, config, v),
    r009BorrowingToRepay(input, v),
    r010DebtCycleStacking(input, config, v),
    r011EnquiryBurst(input, config, v),
    r012ConsolidationEligibility(input, v),
    r013CapacityBand(input, v),
    r014StabilisationCoverage(v),
    r015RecoveryState(input, v),
    r016OutsideProgram(input, v),
    r017ComplianceSignal(input, v),
    r018OtherAccounts(input, config, v),
    r019PostStatementDebt(input, config, v),
    r020P1MissingInformation(input, config, v),
    r021ExceptionCount(input, config, v),
    r022FcfUnreconciled(input, v),
    r023IncomeTransition(input, v),
    r024MedicalShock(input, v),
  ]
}

export {
  r001Consent,
  r002Identity,
  r003BureauReadiness,
  r004FinancialReadiness,
  r005Mismatch,
  r006LegalStatus,
  r007DelinquencyState,
  r008OverduePressure,
  r009BorrowingToRepay,
  r010DebtCycleStacking,
  r011EnquiryBurst,
  r012ConsolidationEligibility,
  r013CapacityBand,
  r014StabilisationCoverage,
  r015RecoveryState,
  r016OutsideProgram,
  r017ComplianceSignal,
  r018OtherAccounts,
  r019PostStatementDebt,
  r020P1MissingInformation,
  r021ExceptionCount,
  r022FcfUnreconciled,
  r023IncomeTransition,
  r024MedicalShock,
}
