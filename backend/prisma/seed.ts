/**
 * Development-only seed script. Creates:
 *  - a test CCR login account, and a test supervisor account (so the
 *    role-gated `assign` endpoint can be exercised locally)
 *  - one canonical, entirely fictional lead (fictional name/phone/email),
 *    whose credit report is the real captured Signzy fixture (identity
 *    fields redacted) run through the real mapper — see
 *    CANONICAL_BBS_LEAD_ID below.
 *
 * Guarded by NODE_ENV so it refuses to run against a production database.
 * No real customer PAN, name, phone, or bank statement is ever used.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient, Prisma, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { mapSignzyExperianLiteResponse } from '../src/modules/bureau/providers/signzy-response.mapper'
import { hashPan } from '../src/common/security/pan-hash'

const prisma = new PrismaClient()

/**
 * The ONE canonical rich E2E/dev fixture lead, `BBS-LD-900001`. Every
 * frontend mock service (debtAnalysisService, financialAnalysisService,
 * masterProfileService, cohortEngineService, planEngineService) already
 * keys its own data-rich fixture on this exact literal bbsLeadId — this
 * seed is what gives the SAME id a real, rich backend credit report too,
 * so a canonical end-to-end journey e2e test (and manual dev testing
 * against the real API) can exercise Debt Analysis → Financial Analysis →
 * Master Profile → Cohort Engine → BBS Plan against one coherent dataset
 * instead of two disconnected fixture universes.
 *
 * The credit report below is the REAL captured Signzy/Experian Lite
 * response (see backend/src/modules/bureau/fixtures/
 * signzy-experian-lite-success.json — identity fields redacted, every
 * structural element/amount/date real and unmodified), run through the
 * actual `mapSignzyExperianLiteResponse` mapper — never hand-fabricated —
 * so the 33 real accounts, the 748 score, and the real current-vs-
 * historical DPD distinction all land exactly as a real Signzy pull would
 * produce them.
 */
const CANONICAL_BBS_LEAD_ID = 'BBS-LD-900001'

async function seedUser(email: string, password: string, name: string, role: Role) {
  const passwordHash = await bcrypt.hash(password, 12)
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash, name, role, isActive: true },
    create: { email, passwordHash, name, role },
  })
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the development seed script against NODE_ENV=production')
  }

  const ccrEmail = process.env.DEV_SEED_CCR_EMAIL
  const ccrPassword = process.env.DEV_SEED_CCR_PASSWORD
  const ccrName = process.env.DEV_SEED_CCR_NAME ?? 'Dev CCR Agent'
  const supervisorEmail = process.env.DEV_SEED_SUPERVISOR_EMAIL
  const supervisorPassword = process.env.DEV_SEED_SUPERVISOR_PASSWORD
  const supervisorName = process.env.DEV_SEED_SUPERVISOR_NAME ?? 'Dev Supervisor'

  if (!ccrEmail || !ccrPassword || !supervisorEmail || !supervisorPassword) {
    throw new Error(
      'DEV_SEED_CCR_EMAIL / DEV_SEED_CCR_PASSWORD / DEV_SEED_SUPERVISOR_EMAIL / ' +
        'DEV_SEED_SUPERVISOR_PASSWORD must be set in backend/.env before seeding',
    )
  }

  const ccr = await seedUser(ccrEmail, ccrPassword, ccrName, Role.CCR)
  await seedUser(supervisorEmail, supervisorPassword, supervisorName, Role.SUPERVISOR)
  console.log(`Seeded CCR account: ${ccrEmail}`)
  console.log(`Seeded supervisor account: ${supervisorEmail}`)

  // Synthetic PAN, never a real one — hashed with the same one-way scheme
  // PublicContactService uses, so Cohort Engine's real KYC-completeness gate
  // (Lead.panRef !== null) sees genuine, non-fabricated evidence rather than
  // short-circuiting this canonical lead at KYC_PENDING forever.
  const canonicalPanRef = hashPan('ABCDE1234F', process.env.PAN_HASH_PEPPER ?? '')

  const lead = await prisma.lead.upsert({
    where: { bbsLeadId: CANONICAL_BBS_LEAD_ID },
    update: { panRef: canonicalPanRef },
    create: {
      bbsLeadId: CANONICAL_BBS_LEAD_ID,
      fullName: 'Ananya Rao',
      phone: '+91 90000 10001',
      email: 'ananya.rao@example.test',
      city: 'Bengaluru',
      source: 'ONLINE',
      panRef: canonicalPanRef,
      assignedCcrId: ccr.id,
      leadSubmissionStatus: 'COMPLETED',
      bureauReportStatus: 'COMPLETED',
      level1Status: 'COMPLETED',
      level2Status: 'IN_PROGRESS',
      level3Status: 'NOT_STARTED',
      recoveryPlanStatus: 'NOT_STARTED',
      notes: 'Seed data — canonical rich E2E/dev fixture lead.',
    },
  })

  // Real GRANTED consent evidence for the canonical lead — same purpose/
  // version convention PublicContactService uses for a real public-contact
  // submission — so the Consent/KYC stage of the canonical journey is a
  // real persisted row, never implied purely by the bureau report existing.
  await prisma.consentRecord.upsert({
    where: { id: `${lead.id}-seed-consent` },
    update: {},
    create: {
      id: `${lead.id}-seed-consent`,
      leadId: lead.id,
      purpose: 'public_contact_form_submission',
      version: 'contact-form-v1',
      status: 'GRANTED',
      grantedAt: new Date(),
      ipAddress: '127.0.0.1',
    },
  })

  // Run the REAL captured Signzy fixture through the REAL mapper — the
  // identity's firstName/surname/mobilePhone intentionally match the lead
  // above (Ananya Rao / ...10001) only to derive a consistent maskedIdNumber;
  // every bureau-side amount/date/account/enquiry below is the mapper's own
  // verified output, not hand-written.
  const signzyFixtureRaw = readFileSync(
    join(__dirname, '..', 'src', 'modules', 'bureau', 'fixtures', 'signzy-experian-lite-success.json'),
    'utf-8',
  )
  const mapped = mapSignzyExperianLiteResponse(signzyFixtureRaw, {
    firstName: 'Ananya',
    surname: 'Rao',
    mobilePhone: '9000010001',
  })

  const creditReportId = `${lead.id}-seed-credit-report`
  await prisma.creditReport.upsert({
    where: { id: creditReportId },
    update: {
      bureau: mapped.bureau,
      maskedIdNumber: mapped.maskedIdNumber,
      pulledAt: mapped.pulledAt,
      creditScore: mapped.creditScore,
      scoreBand: mapped.scoreBand,
      totalActiveAccounts: mapped.totalActiveAccounts,
      totalOutstandingBalance: mapped.totalOutstandingBalance,
      delinquentAccounts: mapped.delinquentAccounts,
      willfulDefaultFlag: mapped.willfulDefaultFlag,
      processingStatus: 'COMPLETED',
      rawResponse: signzyFixtureRaw,
      completedAt: new Date(),
    },
    create: {
      id: creditReportId,
      leadId: lead.id,
      bureau: mapped.bureau,
      maskedIdNumber: mapped.maskedIdNumber,
      pulledAt: mapped.pulledAt,
      creditScore: mapped.creditScore,
      scoreBand: mapped.scoreBand,
      totalActiveAccounts: mapped.totalActiveAccounts,
      totalOutstandingBalance: mapped.totalOutstandingBalance,
      delinquentAccounts: mapped.delinquentAccounts,
      willfulDefaultFlag: mapped.willfulDefaultFlag,
      processingStatus: 'COMPLETED',
      rawResponse: signzyFixtureRaw,
      completedAt: new Date(),
    },
  })

  // Full replace, not per-row upsert — mirrors BureauReportService's own
  // persistFetchedReport convention exactly (delete-then-recreate inside a
  // single transaction) so re-running this seed never appends duplicate
  // tradelines/enquiries alongside stale ones from a previous fixture version.
  await prisma.$transaction([
    prisma.creditAccount.deleteMany({ where: { creditReportId } }),
    prisma.creditEnquiry.deleteMany({ where: { creditReportId } }),
    ...mapped.accounts.map((account) =>
      prisma.creditAccount.create({
        data: {
          creditReportId,
          accountType: account.accountType,
          lender: account.lender,
          openedOn: account.openedOn,
          sanctionedAmount: account.sanctionedAmount,
          currentBalance: account.currentBalance,
          paymentStatus: account.paymentStatus,
          overdueAmount: account.overdueAmount,
          currentDpdDays: account.currentDpdDays,
          maxDpdDays: account.maxDpdDays,
          monthlyEmiAmount: account.monthlyEmiAmount,
          creditLimit: account.creditLimit,
          isSecured: account.isSecured,
          lifecycleStatus: account.lifecycleStatus,
          ...(account.paymentHistoryGrid
            ? { paymentHistoryGrid: account.paymentHistoryGrid as unknown as Prisma.InputJsonValue }
            : {}),
        },
      }),
    ),
    ...mapped.enquiries.map((enquiry) =>
      prisma.creditEnquiry.create({
        data: {
          creditReportId,
          enquiryDate: enquiry.enquiryDate,
          purpose: enquiry.purpose,
          memberName: enquiry.memberName,
        },
      }),
    ),
  ])

  await prisma.financialAssessment.upsert({
    where: { leadId_level_version: { leadId: lead.id, level: 1, version: 1 } },
    update: {},
    create: {
      leadId: lead.id,
      level: 1,
      version: 1,
      status: 'COMPLETED',
      data: { riskGrade: 'B', debtToIncomeEstimate: 0.28, eligibilityFlag: 'eligible' },
      assessedById: ccr.id,
    },
  })

  console.log(`Seeded canonical rich lead: ${lead.bbsLeadId} (${mapped.accounts.length} real Signzy accounts, score ${mapped.creditScore})`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
