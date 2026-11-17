/**
 * MANUALLY-INVOKED script: loads people's SUPPLIED credit reports (Experian
 * INProfileResponse JSON, `raw_credit_<id>.json`) and Account Aggregator bank
 * statements (`raw_aa_<id>.json`) into the application through its existing
 * services — no bureau provider is ever called, and no AI provider other than
 * the mock one is used (set below, before the app is created).
 *
 * Per person: the two files are matched on <id> and then cross-checked
 * (mobile, PAN, name, DOB) — a pair that does not describe one person is
 * skipped entirely. A Lead is found by mobile number or created; the credit
 * report goes in through BureauReportService.reprocessStoredResponse (the
 * existing mapper path); the statement goes in through DocumentsService.upload
 * (the existing Financial Analysis path). Lead/Customer fields are only filled
 * when blank — a differing existing value is recorded as a conflict, never
 * overwritten — and an AuditLog row records every field's source and status.
 * Documents are left PENDING: verifying a document is a CCR's decision.
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only --compiler-options "{\"rootDir\":\".\",\"declaration\":false}" \
 *     -r tsconfig-paths/register scripts/ingest-source-documents.ts <dir> [--only 1011,1173] [--dry-run]
 */
process.env.AI_PROVIDER = 'mock'
process.env.CREDIT_REPORT_PROVIDER = 'mock'

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import type { Prisma } from '@prisma/client'

import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { hashPan } from '../src/common/security/pan-hash'
import type { AppConfig } from '../src/config/configuration'
import { BureauReportService } from '../src/modules/bureau/bureau-report.service'
import { DocumentsService } from '../src/modules/documents/documents.service'
import { FinancialAnalysisService } from '../src/modules/financial-analysis/financial-analysis.service'
import { LeadsService } from '../src/modules/leads/leads.service'
import {
  aaStatementToCsv,
  creditJsonToInProfileXml,
  crossCheckIdentity,
  parseAaStatement,
  parseCreditReport,
  type Conflict,
} from '../src/modules/source-ingestion/source-documents'

type FieldStatus = 'VERIFIED_BY_TWO_SOURCES' | 'REPORTED_BY_CREDIT_REPORT' | 'REPORTED_BY_BANK_STATEMENT'
interface FieldRecord {
  field: string
  status: FieldStatus
  source: string
  applied: boolean
  note?: string
}

interface PersonResult {
  id: string
  outcome: 'INGESTED' | 'SKIPPED'
  reason?: string
  bbsLeadId?: string
  createdLead?: boolean
  creditReport?: string
  financialAnalysis?: string
  fields?: FieldRecord[]
  conflicts?: Conflict[]
}

const sha256 = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex')

async function main() {
  const args = process.argv.slice(2)
  const dir = args.find((a) => !a.startsWith('--'))
  if (!dir) throw new Error('Usage: ingest-source-documents.ts <dir> [--only id,id] [--dry-run]')
  const dryRun = args.includes('--dry-run')
  const onlyArg = args.indexOf('--only')
  const only = onlyArg >= 0 ? new Set(args[onlyArg + 1].split(',')) : null

  const ids = readdirSync(dir)
    .filter((f) => /^raw_credit_.+\.json$/.test(f))
    .map((f) => f.slice('raw_credit_'.length, -'.json'.length))
    .filter((id) => !only || only.has(id))
    .sort((a, b) => Number(a) - Number(b))

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
  const prisma = app.get(PrismaService)
  const leads = app.get(LeadsService)
  const bureau = app.get(BureauReportService)
  const documents = app.get(DocumentsService, { strict: false })
  const financial = app.get(FinancialAnalysisService, { strict: false })
  const pepper = app.get(ConfigService).get<AppConfig>('app')!.publicContact.panHashPepper

  const foundActor = await prisma.user.findFirst({ where: { role: 'CCR', isActive: true } })
  if (!foundActor) throw new Error('No active CCR user found to attribute the ingestion to')
  const actor = foundActor

  const results: PersonResult[] = []

  for (const id of ids) {
    try {
      results.push(await ingestOne(id))
    } catch (error) {
      results.push({ id, outcome: 'SKIPPED', reason: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` })
    }
  }

  async function ingestOne(id: string): Promise<PersonResult> {
    const creditPath = join(dir!, `raw_credit_${id}.json`)
    const aaPath = join(dir!, `raw_aa_${id}.json`)
    let creditText: string
    let aaText: string
    try {
      creditText = readFileSync(creditPath, 'utf8')
      aaText = readFileSync(aaPath, 'utf8')
    } catch {
      return { id, outcome: 'SKIPPED', reason: 'Credit report and bank statement files are not both present' }
    }

    const creditJson = JSON.parse(creditText)
    const credit = parseCreditReport(creditJson)
    const statement = parseAaStatement(JSON.parse(aaText))

    const match = crossCheckIdentity(credit, statement)
    if (!match.sameIdentity) {
      return { id, outcome: 'SKIPPED', reason: `Documents do not describe the same person: ${match.blockers.join('; ') || 'no mobile/PAN agreement'}` }
    }
    if (!credit.exactMatch || credit.bureauScore === null) return { id, outcome: 'SKIPPED', reason: 'Credit report is not an exact-match report with a score' }
    if (!credit.mobile) return { id, outcome: 'SKIPPED', reason: 'No mobile number to match a lead on' }

    const { csv, ordered } = aaStatementToCsv(statement)
    const xml = creditJsonToInProfileXml(creditJson)

    const conflicts: Conflict[] = [...credit.conflicts, ...match.softConflicts]
    const fields: FieldRecord[] = []
    const agree = (field: 'mobile' | 'pan' | 'dateOfBirth' | 'name') => match.checks.find((c) => c.field === field)?.result === 'MATCH'

    if (dryRun) {
      return { id, outcome: 'SKIPPED', reason: `DRY RUN — would ingest (score ${credit.bureauScore}, ${credit.accountCount} tradelines, ${statement.transactions.length} transactions, ${ordered.ordering}/${ordered.dateBasis}, ${ordered.balanceContinuityBreaks} balance breaks)`, conflicts }
    }

    // --- Lead: find by mobile, else create. Never match by name. ---
    let lead = await prisma.lead.findFirst({ where: { phone: { contains: credit.mobile } }, include: { customer: true } })
    let createdLead = false
    if (!lead) {
      const created = await leads.create(
        {
          fullName: credit.fullName,
          phone: `+91 ${credit.mobile}`,
          ...(statement.holder.email ? { email: statement.holder.email } : {}),
          source: 'ONLINE',
          notes: `Test lead created from supplied credit report + bank statement (source id ${id}). Not a real enquiry.`,
        } as never,
        actor.id,
      )
      lead = await prisma.lead.findUniqueOrThrow({ where: { id: created.id }, include: { customer: true } })
      createdLead = true
      fields.push({ field: 'fullName', status: 'REPORTED_BY_CREDIT_REPORT', source: 'Experian credit report (applicant/tradeline holder name)', applied: true, note: agree('name') ? 'name also agrees with the bank statement holder name' : undefined })
      fields.push({ field: 'phone', status: 'VERIFIED_BY_TWO_SOURCES', source: 'credit report applicant mobile = bank statement holder mobile', applied: true })
      if (statement.holder.email) fields.push({ field: 'email', status: 'REPORTED_BY_BANK_STATEMENT', source: 'AA statement holder profile', applied: true })
    } else {
      // An existing lead: record any difference instead of overwriting.
      if (lead.fullName.trim().toLowerCase() !== credit.fullName.trim().toLowerCase()) {
        conflicts.push({ field: 'fullName', detail: `existing lead name differs from the credit report name — existing value kept` })
      }
      if (statement.holder.email && lead.email && lead.email.toLowerCase() !== statement.holder.email) {
        conflicts.push({ field: 'email', detail: 'existing lead email differs from the bank statement email — existing value kept' })
      } else if (statement.holder.email && !lead.email) {
        await prisma.lead.update({ where: { id: lead.id }, data: { email: statement.holder.email } })
        fields.push({ field: 'email', status: 'REPORTED_BY_BANK_STATEMENT', source: 'AA statement holder profile', applied: true })
      }
    }

    // --- Customer profile fields: fill blanks only. ---
    const customerPatch: Record<string, unknown> = {}
    const existingCustomer = lead.customer
    const fill = (field: 'dateOfBirth' | 'gender' | 'pinCode', value: string | null, status: FieldStatus, source: string) => {
      if (value === null) {
        fields.push({ field, status, source, applied: false, note: 'unknown — not reliably reported, left blank' })
        return
      }
      const current = field === 'dateOfBirth' ? existingCustomer?.dateOfBirth?.toISOString().slice(0, 10) : (existingCustomer as Record<string, unknown> | null)?.[field]
      if (current && current !== value) {
        conflicts.push({ field, detail: `existing value differs from the source document value — existing value kept` })
        fields.push({ field, status, source, applied: false, note: 'conflicts with existing value' })
        return
      }
      if (!current) customerPatch[field] = value
      fields.push({ field, status, source, applied: !current })
    }
    fill('dateOfBirth', match.softConflicts.some((c) => c.field === 'dateOfBirth') ? null : credit.dob ?? statement.holder.dob, agree('dateOfBirth') ? 'VERIFIED_BY_TWO_SOURCES' : credit.dob ? 'REPORTED_BY_CREDIT_REPORT' : 'REPORTED_BY_BANK_STATEMENT', agree('dateOfBirth') ? 'credit report DOB = bank statement DOB' : credit.dob ? 'Experian tradeline holder details' : 'AA statement holder profile')
    // Experian's own gender code: 1 = male, 2 = female. Any other code is left unknown rather than mapped.
    fill('gender', credit.genderCode === 1 ? 'male' : credit.genderCode === 2 ? 'female' : null, 'REPORTED_BY_CREDIT_REPORT', 'Experian tradeline holder Gender_Code')
    fill('pinCode', credit.pinCode, 'REPORTED_BY_CREDIT_REPORT', 'Experian tradeline holder address (all tradelines agree)')
    if (Object.keys(customerPatch).length > 0) {
      await leads.update(lead.bbsLeadId, { customer: customerPatch } as never, actor.id)
    }

    // --- PAN reference (hash only; the raw PAN is never stored). ---
    if (credit.pan) {
      const panRef = hashPan(credit.pan, pepper)
      if (lead.panRef && lead.panRef !== panRef) {
        conflicts.push({ field: 'pan', detail: 'existing lead PAN reference differs from the credit report PAN — existing value kept' })
      } else if (!lead.panRef) {
        const clash = await prisma.lead.findFirst({ where: { panRef, NOT: { id: lead.id } } })
        if (clash) conflicts.push({ field: 'pan', detail: `this PAN is already associated with lead ${clash.bbsLeadId} — not linked` })
        else {
          await prisma.lead.update({ where: { id: lead.id }, data: { panRef } })
          fields.push({ field: 'pan', status: agree('pan') ? 'VERIFIED_BY_TWO_SOURCES' : 'REPORTED_BY_CREDIT_REPORT', source: agree('pan') ? 'credit report PAN = bank statement PAN (suffix)' : 'Experian applicant/tradeline PAN', applied: true, note: 'stored as a one-way hash only' })
        }
      }
    } else {
      fields.push({ field: 'pan', status: 'REPORTED_BY_CREDIT_REPORT', source: 'Experian', applied: false, note: 'no valid PAN reported — unknown' })
    }

    // --- Credit report through the existing mapper path (no provider call). ---
    let creditOutcome: string
    const existingReport = await prisma.creditReport.findUnique({ where: { leadId: lead.id } })
    if (existingReport) {
      creditOutcome = `kept existing ${existingReport.processingStatus} report (${existingReport.bureau}) — supplied report not loaded over it`
      if (existingReport.rawResponse && sha256(existingReport.rawResponse) !== sha256(xml)) conflicts.push({ field: 'creditReport', detail: 'lead already has a different bureau report — kept' })
    } else {
      await prisma.creditReport.create({
        data: { leadId: lead.id, bureau: 'Experian', maskedIdNumber: 'PENDING', pulledAt: new Date(), creditScore: null, scoreBand: 'pending', totalActiveAccounts: 0, totalOutstandingBalance: 0, delinquentAccounts: 0, processingStatus: 'IN_PROGRESS', rawResponse: xml },
      })
      const r = await bureau.reprocessStoredResponse(lead.bbsLeadId)
      creditOutcome = r.reprocessed ? 'COMPLETED' : `FAILED: ${r.reason}`
    }

    // --- Bank statement through the existing upload + Financial Analysis path. ---
    let financialOutcome: string
    const csvBuffer = Buffer.from(csv, 'utf8')
    const checksum = sha256(csvBuffer)
    const already = await prisma.documentMetadata.findFirst({ where: { leadId: lead.id, documentType: 'BANK_STATEMENT', checksum } })
    if (already) {
      financialOutcome = 'statement already uploaded (same checksum) — not re-uploaded'
    } else {
      await documents.upload(lead.bbsLeadId, 'BANK_STATEMENT', { buffer: csvBuffer, originalname: `aa-statement-${id}.csv`, mimetype: 'text/csv', size: csvBuffer.length }, actor.id)
      financialOutcome = await waitForFinancial(lead.bbsLeadId)
    }

    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        leadId: lead.id,
        action: 'SOURCE_DOCUMENTS_INGESTED',
        entityType: 'Lead',
        entityId: lead.id,
        metadata: {
          sources: {
            creditReport: { file: `raw_credit_${id}.json`, sha256: sha256(creditText), reportDate: credit.reportDate, tradelines: credit.accountCount },
            bankStatement: { file: `raw_aa_${id}.json`, sha256: sha256(aaText), fip: statement.fipId, accountMasked: statement.account.maskedAccNumber, transactions: statement.transactions.length, dateBasis: ordered.dateBasis, ordering: ordered.ordering, balanceContinuityBreaks: ordered.balanceContinuityBreaks },
          },
          identityChecks: match.checks.map((c) => ({ field: c.field, result: c.result })),
          fields,
          conflicts,
          note: 'Fields marked VERIFIED_BY_TWO_SOURCES agree across both documents; the rest come from one document and are unverified. Derived values are produced by the analysis modules, not here.',
        } as unknown as Prisma.InputJsonValue,
      },
    })

    return { id, outcome: 'INGESTED', bbsLeadId: lead.bbsLeadId, createdLead, creditReport: creditOutcome, financialAnalysis: financialOutcome, fields, conflicts }
  }

  async function waitForFinancial(bbsLeadId: string): Promise<string> {
    const deadline = Date.now() + 180_000
    while (Date.now() < deadline) {
      const r = await financial.getForLead(bbsLeadId)
      if (r.reportAvailable && 'status' in r && (r.status === 'COMPLETED' || r.status === 'FAILED')) return r.status
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return 'TIMED_OUT waiting for analysis'
  }

  console.log(JSON.stringify(results, null, 2))
  await app.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
