/**
 * ONE-OFF, MANUALLY-INVOKED script for Task 3 live-UI-verification only —
 * NOT part of the regular seed.ts fixture, and never run automatically.
 *
 * Creates a brand-new, dedicated, synthetic Lead (never BBS-LD-900001 or any
 * other shared/real-customer record) with a minimal but schema-valid
 * MasterProfile (COMPLETED) and a COMPLETED CohortDecision carrying an
 * active compliance hold — so the override, decline, and §7.4 compliance
 * clear/decline workflows can all be live-clicked through the real running
 * dev server without any live external bureau/AI API call (the upstream
 * Master Profile here is seeded directly, not independently re-derived —
 * documented honestly in the final report; Cohort Engine's own evaluate()
 * logic itself is already covered by this module's 162 unit tests).
 *
 * Usage: npx ts-node --transpile-only scripts/seed-dedicated-test-lead.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TEST_BBS_LEAD_ID = 'BBS-LD-TEST-T3VERIFY'

async function main() {
  const ccr = await prisma.user.findFirst({ where: { role: 'CCR' } })
  if (!ccr) throw new Error('No seeded CCR user found — run `npm run seed` first.')

  const existing = await prisma.lead.findUnique({ where: { bbsLeadId: TEST_BBS_LEAD_ID } })
  if (existing) {
    console.log(`Dedicated test lead ${TEST_BBS_LEAD_ID} already exists (id=${existing.id}) — reusing it.`)
    return { leadId: existing.id, bbsLeadId: TEST_BBS_LEAD_ID, ccrId: ccr.id }
  }

  const lead = await prisma.lead.create({
    data: {
      bbsLeadId: TEST_BBS_LEAD_ID,
      fullName: 'Task3 Verification Lead',
      phone: '+91 90000 90501',
      email: 'task3.verification@example.test',
      city: 'Bengaluru',
      source: 'ONLINE',
      panRef: 'task3-verification-synthetic-panref',
      assignedCcrId: ccr.id,
      leadSubmissionStatus: 'COMPLETED',
      bureauReportStatus: 'COMPLETED',
      level1Status: 'COMPLETED',
      level2Status: 'COMPLETED',
      level3Status: 'COMPLETED',
      notes: 'DEDICATED SYNTHETIC TEST RECORD — created for Cohort Engine v3.0 Task 3 (override/decline/compliance live-UI verification). Safe to delete after verification.',
    },
  })

  await prisma.consentRecord.create({
    data: { leadId: lead.id, purpose: 'public_contact_form_submission', version: 'contact-form-v1', status: 'GRANTED', grantedAt: new Date(), ipAddress: '127.0.0.1' },
  })

  const masterProfile = await prisma.masterProfile.create({
    data: {
      leadId: lead.id,
      version: 1,
      status: 'COMPLETED',
      generatedAt: new Date(),
      dataQualityBand: 'MODERATE',
      readinessOutcome: 'READY',
      overallConfidence: 'MEDIUM',
      alignmentState: 'ALIGNED_HEALTHY',
      resolutionCapacity: 'MODERATE',
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
      primaryCohort: 'COMPLIANCE_HOLD',
      lifecycleState: null,
      secondaryFlags: [
        { key: 'C3', label: 'Restructure candidate', reason: 'Surplus is non-negative but the current debt structure does not meet comfortable affordability.' },
        { key: 'C5', label: 'Debt-cycle intervention candidate', reason: 'A confirmed debt-cycle signal was present.' },
      ],
      archetype: 'UNCLASSIFIED',
      pathway: null,
      capacityBand: 'STRESSED',
      capacityRatio: 0.05,
      customerExplanation: 'We need to complete some verification before proceeding. Our team will contact you shortly.',
      customerReasons: ['We need to complete some verification before proceeding. Our team will contact you shortly.'],
      internalReasons: ['R017: Compliance signal fired (synthetic test fixture — related-party match).'],
      missingData: [],
      requiredDocuments: [],
      specialistReviewRequired: false,
      manualReviewRequired: false,
      confidence: 'MEDIUM',
      dataProvenance: [],
      consentVersion: 'contact-form-v1',
      complianceHold: true,
      complianceReason: 'RELATED_PARTY_EMPLOYER',
      complianceMatchedEntity: 'Synthetic Test Employer Pvt Ltd',
      complianceSlaHours: 72,
      complianceEscalationAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      complianceAgingState: 'COMPLIANCE_HOLD',
    },
  })

  await prisma.cohortRuleResult.createMany({
    data: [
      { decisionId: decision.id, ruleId: 'R017', ruleVersion: 'BBS_COHORT_V3.0', evaluated: true, matched: true, severity: 'HIGH', evidence: { signal: 'RELATED_PARTY_EMPLOYER' }, evidenceLevel: 'CONFIRMED', reason: 'Synthetic related-party employer match for live-UI verification.', sourceFields: ['compliance.hold'] },
      { decisionId: decision.id, ruleId: 'R013', ruleVersion: 'BBS_COHORT_V3.0', evaluated: true, matched: true, severity: 'MEDIUM', evidence: { band: 'STRESSED' }, evidenceLevel: 'DERIVED', reason: 'Synthetic stressed capacity band.', sourceFields: ['financial.capacityBand'] },
    ],
  })

  console.log(`Created dedicated test lead ${TEST_BBS_LEAD_ID} (leadId=${lead.id}), CohortDecision v1 = COMPLIANCE_HOLD (complianceHold:true).`)
  return { leadId: lead.id, bbsLeadId: TEST_BBS_LEAD_ID, ccrId: ccr.id }
}

main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
