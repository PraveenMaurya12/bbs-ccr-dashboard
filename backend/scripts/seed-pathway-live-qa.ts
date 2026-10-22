/**
 * ONE-OFF, MANUALLY-INVOKED script — seeds a dedicated, synthetic test lead
 * with a real (non-BLOCKED) C3/Stressed-capacity Cohort Decision, so the
 * Pathway Engine's own READY/RESTRUCTURE path can be live-verified against
 * the real running dev server (not just the e2e suite's own ephemeral app
 * instance). Safe to delete after verification.
 *
 * Usage: npx ts-node --transpile-only scripts/seed-pathway-live-qa.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BBS_LEAD_ID = 'BBS-LD-TEST-PATHWAY-QA'

async function main() {
  const ccr = await prisma.user.findFirst({ where: { role: 'CCR' } })
  if (!ccr) throw new Error('No seeded CCR user found — run `npm run seed` first.')

  const existing = await prisma.lead.findUnique({ where: { bbsLeadId: BBS_LEAD_ID } })
  if (existing) {
    console.log(JSON.stringify({ reused: true, leadId: existing.id, bbsLeadId: BBS_LEAD_ID }))
    return
  }

  const lead = await prisma.lead.create({
    data: {
      bbsLeadId: BBS_LEAD_ID,
      fullName: 'Pathway Engine Live QA Lead',
      phone: '+91 97000 00099',
      email: 'pathway.liveqa@example.test',
      city: 'Bengaluru',
      source: 'ONLINE',
      panRef: 'pathway-live-qa-synthetic-panref',
      assignedCcrId: ccr.id,
      leadSubmissionStatus: 'COMPLETED',
      bureauReportStatus: 'COMPLETED',
      level1Status: 'COMPLETED',
      notes: 'DEDICATED SYNTHETIC LIVE-QA RECORD for BBS Pathway Engine v3.0 (L5). Safe to delete after verification.',
    },
  })

  const masterProfile = await prisma.masterProfile.create({
    data: {
      leadId: lead.id,
      version: 1,
      status: 'COMPLETED',
      generatedAt: new Date(),
      dataQualityBand: 'HIGH',
      readinessOutcome: 'READY',
      overallConfidence: 'HIGH',
      alignmentState: 'ALIGNED_HEALTHY',
      resolutionCapacity: 'MARGINAL',
      bureauDsrPercent: 55,
      bankDsrPercent: 50,
      masterDsrPercent: 52,
      dimensionConfidences: { IDENTITY_COMPLIANCE: 'HIGH', CREDIT_HEALTH: 'HIGH', INCOME_CASH_FLOW: 'HIGH', DEBT_LIQUIDITY: 'HIGH', ALIGNMENT_CAPACITY: 'HIGH' },
    },
  })

  const decision = await prisma.cohortDecision.create({
    data: {
      leadId: lead.id,
      version: 1,
      status: 'COMPLETED',
      ruleVersion: 'BBS_COHORT_V3.0',
      sourceMasterProfileVersion: masterProfile.version,
      sourceMasterProfileGeneratedAt: masterProfile.generatedAt,
      generatedAt: new Date(),
      primaryCohort: 'C3',
      lifecycleState: 'CCR_REVIEW',
      secondaryFlags: [],
      archetype: 'CIRCUMSTANTIAL',
      pathway: 'RESTRUCTURE',
      capacityBand: 'STRESSED',
      capacityRatio: 0.08,
      customerExplanation: 'Your current debt structure does not meet comfortable affordability.',
      customerReasons: ['Your current debt structure does not meet comfortable affordability.'],
      internalReasons: [],
      missingData: [],
      requiredDocuments: [],
      specialistReviewRequired: false,
      manualReviewRequired: false,
      confidence: 'HIGH',
      dataProvenance: [],
      consentVersion: 'contact-form-v1',
      complianceHold: false,
    },
  })

  await prisma.cohortRuleResult.createMany({
    data: [
      { decisionId: decision.id, ruleId: 'R006', ruleVersion: 'BBS_COHORT_V3.0', evaluated: true, matched: false, severity: 'HIGH', evidence: {}, evidenceLevel: 'CONFIRMED', reason: 'No legal status.', sourceFields: [] },
      { decisionId: decision.id, ruleId: 'R008', ruleVersion: 'BBS_COHORT_V3.0', evaluated: true, matched: false, severity: 'MEDIUM', evidence: { currentOverdue: 0 }, evidenceLevel: 'CONFIRMED', reason: 'No overdue.', sourceFields: [] },
      { decisionId: decision.id, ruleId: 'R009', ruleVersion: 'BBS_COHORT_V3.0', evaluated: true, matched: false, severity: 'HIGH', evidence: {}, evidenceLevel: 'DERIVED', reason: 'No borrowing-to-repay pattern.', sourceFields: [] },
      { decisionId: decision.id, ruleId: 'R010', ruleVersion: 'BBS_COHORT_V3.0', evaluated: true, matched: false, severity: 'HIGH', evidence: { stackingIndexHigh: false, enquiryBurstHigh: false }, evidenceLevel: 'DERIVED', reason: 'No debt-cycle stacking pattern.', sourceFields: [] },
      { decisionId: decision.id, ruleId: 'R012', ruleVersion: 'BBS_COHORT_V3.0', evaluated: true, matched: true, severity: 'MEDIUM', evidence: { activeAccounts: 3, capacityBand: 'STRESSED', legalOrSpecialistTrigger: false }, evidenceLevel: 'DERIVED', reason: '3 active accounts.', sourceFields: [] },
      { decisionId: decision.id, ruleId: 'R021', ruleVersion: 'BBS_COHORT_V3.0', evaluated: true, matched: false, severity: 'LOW', evidence: { tier: 'NONE', exceptionCount: 0 }, evidenceLevel: 'CONFIRMED', reason: 'Exception count within threshold.', sourceFields: [] },
    ],
  })

  console.log(`Created dedicated test lead ${BBS_LEAD_ID} (leadId=${lead.id}), CohortDecision v1 = C3/STRESSED (real, unblocked cohort).`)
  console.log(JSON.stringify({ reused: false, leadId: lead.id, bbsLeadId: BBS_LEAD_ID, ccrId: ccr.id }))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
