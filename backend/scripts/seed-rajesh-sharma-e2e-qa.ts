/**
 * ONE-OFF, MANUALLY-INVOKED script — seeds a dedicated, synthetic test lead
 * ("Rajesh Kumar Sharma") reproducing the user-supplied BBS-CASE-2025-000417
 * reference case, for a full end-to-end QA pass through the REAL running
 * dev server (Debt Analysis -> Financial Analysis -> Master Profile ->
 * Cohort Engine -> Plan Engine).
 *
 * Deliberately bypasses the real Signzy bureau-pull API (this fictional
 * customer has no real bureau record to pull, and this dev server's own
 * .env points at a real Signzy sandbox endpoint+key — calling it for a
 * fake PAN would be a pointless, avoidable live external call). Instead,
 * the CreditReport/CreditAccount/CreditEnquiry rows are constructed
 * directly here, by hand, from the reference document's own Part B debt
 * inventory table — never a real Signzy fixture, since none exists for
 * this synthetic customer.
 *
 * The bank-statement side (Financial Analysis) is NOT seeded here — a
 * separate matching CSV is uploaded through the REAL `/documents` endpoint
 * afterward, so the real OCR/parsing/classification pipeline is genuinely
 * exercised (the actual point of an "end-to-end QA" pass).
 *
 * Usage: npx ts-node --transpile-only scripts/seed-rajesh-sharma-e2e-qa.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BBS_LEAD_ID = 'BBS-LD-TEST-RAJESH417'

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
      fullName: 'Rajesh Kumar Sharma',
      phone: '+91 98000 00021',
      email: 'rajesh.k.sharma@example.test',
      city: 'Pune',
      source: 'ONLINE',
      panRef: 'rajesh-sharma-e2e-qa-synthetic-panref',
      assignedCcrId: ccr.id,
      leadSubmissionStatus: 'COMPLETED',
      bureauReportStatus: 'COMPLETED',
      level1Status: 'COMPLETED',
      notes: 'DEDICATED SYNTHETIC E2E QA RECORD — reproduces user-supplied reference case BBS-CASE-2025-000417 (Rajesh Kumar Sharma). Safe to delete after verification.',
    },
  })

  await prisma.customer.create({
    data: {
      leadId: lead.id,
      fullName: 'Rajesh Kumar Sharma',
      phone: '+91 98000 00021',
      email: 'rajesh.k.sharma@example.test',
      city: 'Pune',
      occupation: 'Salaried — Junior Accounts Manager',
      companyName: 'Sai Logistics Pvt Ltd',
      monthlySalary: 38000,
      state: 'Maharashtra',
    },
  })

  await prisma.consentRecord.create({
    data: { leadId: lead.id, purpose: 'public_contact_form_submission', version: 'contact-form-v1', status: 'GRANTED', grantedAt: new Date(), ipAddress: '127.0.0.1' },
  })

  // --- L1: Credit Bureau Intelligence (Part B) ------------------------------
  const creditReport = await prisma.creditReport.create({
    data: {
      leadId: lead.id,
      bureau: 'Experian (synthetic — hand-constructed, no real bureau pull)',
      maskedIdNumber: 'XXXXX1234K',
      // NOTE: the reference document is dated "14 October 2025," but this
      // dev environment's own simulated "now" is 2026 (confirmed via other
      // fixtures seeded earlier this session, e.g. Praveenkumar's
      // "2026-10-07"). Every date below is therefore the reference
      // document's own stated date shifted +1 year, so "recent"/"trailing
      // N days" window calculations (enquiry burst, stacking cluster, DPD
      // aging) are genuinely recent relative to the REAL server clock, not
      // over a year stale relative to it.
      pulledAt: new Date('2026-10-12T00:00:00Z'),
      creditScore: 598,
      scoreBand: 'Below Average / Sub-prime',
      totalActiveAccounts: 6,
      // The reference document's own "Total Outstanding: ₹8,42,000" (Part B
      // summary) does not reconcile against the sum of the 6 active
      // accounts' own current-outstanding figures in its own debt inventory
      // table (₹5,90,500) — an internal inconsistency in the source
      // document itself. Using the document's own headline summary figure
      // here, not silently "fixing" it to match the per-account sum.
      totalOutstandingBalance: 842000,
      delinquentAccounts: 3,
      processingStatus: 'COMPLETED',
      completedAt: new Date(),
      willfulDefaultFlag: false,
    },
  })

  const accounts: Array<Parameters<typeof prisma.creditAccount.create>[0]['data']> = [
    { creditReportId: creditReport.id, accountType: 'Personal Loan', lender: 'HDFC Bank', openedOn: new Date('2024-03-15'), sanctionedAmount: 300000, currentBalance: 218000, overdueAmount: 42000, currentDpdDays: 92, maxDpdDays: 92, monthlyEmiAmount: 9850, isSecured: false, paymentStatus: 'Active - Overdue', lifecycleStatus: 'ACTIVE' },
    { creditReportId: creditReport.id, accountType: 'Personal Loan', lender: 'Bajaj Finserv', openedOn: new Date('2024-08-10'), sanctionedAmount: 150000, currentBalance: 98000, overdueAmount: 31400, currentDpdDays: 78, maxDpdDays: 78, monthlyEmiAmount: 6200, isSecured: false, paymentStatus: 'Active - Overdue', lifecycleStatus: 'ACTIVE' },
    { creditReportId: creditReport.id, accountType: 'Credit Card', lender: 'ICICI Bank', openedOn: new Date('2023-01-20'), sanctionedAmount: 80000, currentBalance: 76500, overdueAmount: 63000, currentDpdDays: 90, maxDpdDays: 90, monthlyEmiAmount: 4200, creditLimit: 80000, isSecured: false, paymentStatus: 'Active - Overdue', lifecycleStatus: 'ACTIVE' },
    { creditReportId: creditReport.id, accountType: 'Consumer Durable Loan', lender: 'Tata Capital', openedOn: new Date('2025-06-05'), sanctionedAmount: 60000, currentBalance: 22000, overdueAmount: 0, currentDpdDays: 0, maxDpdDays: 0, monthlyEmiAmount: 2100, isSecured: false, paymentStatus: 'Active - Regular', lifecycleStatus: 'ACTIVE' },
    { creditReportId: creditReport.id, accountType: 'Gold Loan', lender: 'Muthoot Finance', openedOn: new Date('2026-02-10'), sanctionedAmount: 120000, currentBalance: 118000, overdueAmount: 0, currentDpdDays: 0, maxDpdDays: 0, monthlyEmiAmount: 4500, isSecured: true, paymentStatus: 'Active - Regular', lifecycleStatus: 'ACTIVE' },
    { creditReportId: creditReport.id, accountType: 'Personal Loan', lender: 'Fullerton India', openedOn: new Date('2025-11-12'), sanctionedAmount: 80000, currentBalance: 58000, overdueAmount: 0, currentDpdDays: 0, maxDpdDays: 0, monthlyEmiAmount: 3400, isSecured: false, paymentStatus: 'Active - Regular', lifecycleStatus: 'ACTIVE' },
    { creditReportId: creditReport.id, accountType: 'Credit Card', lender: 'SBI Card', openedOn: new Date('2016-01-01'), sanctionedAmount: 50000, currentBalance: 0, overdueAmount: 0, currentDpdDays: 0, maxDpdDays: 0, isSecured: false, paymentStatus: 'Closed - Settled', lifecycleStatus: 'SETTLED', closedOn: new Date('2020-06-01') },
    { creditReportId: creditReport.id, accountType: 'Consumer Loan', lender: 'Home Credit', openedOn: new Date('2020-01-01'), sanctionedAmount: 40000, currentBalance: 0, overdueAmount: 0, currentDpdDays: 0, maxDpdDays: 0, isSecured: false, paymentStatus: 'Closed', lifecycleStatus: 'CLOSED', closedOn: new Date('2022-06-01') },
    { creditReportId: creditReport.id, accountType: 'Personal Loan', lender: 'Kotak Mahindra', openedOn: new Date('2018-01-01'), sanctionedAmount: 200000, currentBalance: 0, overdueAmount: 0, currentDpdDays: 0, maxDpdDays: 0, isSecured: false, paymentStatus: 'Closed', lifecycleStatus: 'CLOSED', closedOn: new Date('2021-06-01') },
  ]
  for (const account of accounts) await prisma.creditAccount.create({ data: account })

  // 7 enquiries in the trailing 6 months (Part B/CCR Pass 1: "applied for
  // loans during unemployment, all rejected") — dated within the
  // unemployment gap (~Jun-Jul 2025), matching the CCR's own explanation.
  const enquiryLenders = ['Bajaj Finserv', 'HDFC Bank', 'IDFC First Bank', 'Axis Bank', 'Tata Capital', 'Fullerton India', 'Muthoot Finance']
  const enquiryDates = ['2026-06-10', '2026-06-18', '2026-06-25', '2026-07-02', '2026-07-08', '2026-07-15', '2026-07-22']
  for (let i = 0; i < 7; i++) {
    await prisma.creditEnquiry.create({ data: { creditReportId: creditReport.id, enquiryDate: new Date(enquiryDates[i]!), purpose: 'Personal Loan', memberName: enquiryLenders[i]! } })
  }

  console.log(JSON.stringify({ reused: false, leadId: lead.id, bbsLeadId: BBS_LEAD_ID, creditReportId: creditReport.id, ccrId: ccr.id }))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
