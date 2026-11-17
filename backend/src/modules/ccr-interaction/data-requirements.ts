/**
 * "What data does this lead still need?" — derived ONLY from what the
 * Master Profile has persisted (source dates, readiness gate, data-quality
 * flags, register items) plus the CCR question progress. Every requirement
 * names the evidence it comes from; nothing is guessed, and a requirement is
 * only listed when its condition currently holds.
 */

export type RequirementActionType = 'UPLOAD_BANK_STATEMENT' | 'ANSWER_CCR_QUESTIONS' | 'SUPERVISOR_REVIEW' | 'NONE'

export interface DataRequirement {
  code: string
  /** BLOCKING = currently holds the lead back from a cohort/pathway; IMPROVES = worth fixing but not the gate itself. */
  severity: 'BLOCKING' | 'IMPROVES'
  title: string
  why: string
  action: { type: RequirementActionType; label: string }
  /** Extra specifics for the UI (e.g. the period a new statement should cover). */
  detail?: Record<string, unknown>
}

export interface RequirementInputs {
  hasCreditReport: boolean
  hasBankStatement: boolean
  l1DataAsOf: string | null
  l2DataAsOf: string | null
  dataQualityBand: string | null
  dataQualityFlags: string[]
  readinessOutcome: string | null
  alignmentState: string | null
  complianceHold: boolean
  complianceReason: string | null
  postStatementDebt: { detected: boolean; accountCount: number } | null
  unresolvedP1Count: number
  unansweredCcrQuestions: number
}

/** Same threshold Master Profile's date-alignment check uses. */
export const STATEMENT_STALE_DAYS = 60
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** A new bank statement removes these; they describe the statement being out of step with the credit report. */
const FIXED_BY_FRESH_STATEMENT = new Set(['DATE_ALIGNMENT_WARNING', 'L1_DEBT_POST_STATEMENT', 'UNMATCHED_DEBT_PAYMENT', 'FCF_UNRECONCILED'])
/** Properties of the bureau report or of the method itself — no data a CCR can add changes them. */
const STRUCTURAL = new Set(['EMI_SCHEDULED_MISSING', 'HISTORY_INCOMPLETE', 'SINGLE_SNAPSHOT', 'ENQUIRY_NOT_CONVERTED', 'ACCOUNT_COUNT_MISMATCH'])

const dateOnly = (iso: string) => iso.slice(0, 10)

export function buildDataRequirements(i: RequirementInputs): DataRequirement[] {
  const out: DataRequirement[] = []
  const upload = { type: 'UPLOAD_BANK_STATEMENT' as const, label: 'Upload bank statement' }

  if (!i.hasCreditReport) {
    out.push({ code: 'CREDIT_REPORT_MISSING', severity: 'BLOCKING', title: 'No credit report yet', why: 'L1 needs a completed bureau report. It is pulled once, after consent and PAN are captured on the Lead details tab.', action: { type: 'NONE', label: 'Capture consent' } })
  }
  if (!i.hasBankStatement) {
    out.push({ code: 'BANK_STATEMENT_MISSING', severity: 'BLOCKING', title: 'No bank statement yet', why: 'L2 needs a bank statement (PDF, XLSX or CSV) to see income, expenses and repayments.', action: upload })
  }

  // Statement older than the credit report.
  if (i.l1DataAsOf && i.l2DataAsOf) {
    const gapDays = Math.round((new Date(i.l1DataAsOf).getTime() - new Date(i.l2DataAsOf).getTime()) / MS_PER_DAY)
    if (gapDays > STATEMENT_STALE_DAYS) {
      out.push({
        code: 'STATEMENT_NOT_CURRENT',
        severity: 'BLOCKING',
        title: 'Bank statement is out of date',
        why: `The statement ends ${dateOnly(i.l2DataAsOf)}, ${gapDays} days before the credit report (${dateOnly(i.l1DataAsOf)}). Behaviour from an earlier period can't be treated as the customer's current position, so the profile can't be classified.`,
        action: upload,
        detail: { statementEnds: dateOnly(i.l2DataAsOf), creditReportDate: dateOnly(i.l1DataAsOf), gapDays, needed: `A statement covering at least ${dateOnly(i.l2DataAsOf)} to ${dateOnly(i.l1DataAsOf)} (ideally the last 6 months up to the report date).` },
      })
    }
  }

  if (i.postStatementDebt?.detected) {
    const n = i.postStatementDebt.accountCount
    out.push({
      code: 'POST_STATEMENT_DEBT',
      severity: i.unresolvedP1Count > 0 ? 'BLOCKING' : 'IMPROVES',
      title: `${n} loan${n === 1 ? '' : 's'} opened after the statement period`,
      why:
        i.unresolvedP1Count > 0
          ? `${i.unresolvedP1Count} "purpose of borrowing" item(s) still need the CCR to ask the customer. A newer statement would also show how these loans are actually being repaid.`
          : 'The CCR has recorded the purposes (customer-declared, unverified). Repayment of these loans can only be verified from a newer bank statement.',
      action: i.unresolvedP1Count > 0 ? { type: 'ANSWER_CCR_QUESTIONS', label: 'Answer the blocking questions' } : upload,
    })
  } else if (i.unresolvedP1Count > 0) {
    out.push({ code: 'P1_ITEMS_OPEN', severity: 'BLOCKING', title: `${i.unresolvedP1Count} critical item(s) need CCR follow-up`, why: 'The Master Profile raised priority-1 information the CCR must confirm with the customer before a cohort can be assigned.', action: { type: 'ANSWER_CCR_QUESTIONS', label: 'Answer the blocking questions' } })
  }

  if (i.unansweredCcrQuestions > 0) {
    out.push({ code: 'CCR_QUESTIONS_OPEN', severity: 'IMPROVES', title: `${i.unansweredCcrQuestions} CCR question(s) not answered yet`, why: 'Recording what the customer says (or "not known") completes the verification interaction.', action: { type: 'ANSWER_CCR_QUESTIONS', label: 'Open CCR questions' } })
  }

  if (i.complianceHold) {
    out.push({ code: 'COMPLIANCE_HOLD', severity: 'BLOCKING', title: 'Compliance hold is active', why: `${i.complianceReason ?? 'A compliance signal requires review.'} Adding data does not clear a hold — a supervisor must clear or decline it from the Cohort section.`, action: { type: 'SUPERVISOR_REVIEW', label: 'Needs supervisor review' } })
  }

  // Why the band is LOW, split into what new data can and cannot change.
  const lowBand = i.dataQualityBand === 'LOW' || i.dataQualityBand === 'INSUFFICIENT'
  if (lowBand) {
    const fixable = i.dataQualityFlags.filter((f) => FIXED_BY_FRESH_STATEMENT.has(f))
    const structural = i.dataQualityFlags.filter((f) => STRUCTURAL.has(f))
    const other = i.dataQualityFlags.filter((f) => !FIXED_BY_FRESH_STATEMENT.has(f) && !STRUCTURAL.has(f))
    out.push({
      code: 'DATA_QUALITY_LOW',
      severity: 'BLOCKING',
      title: `Data quality is ${i.dataQualityBand === 'LOW' ? 'Low' : 'Insufficient'}`,
      why: `${i.dataQualityFlags.length} data-quality flag(s) are active (the band is Low-Moderate or better only with 10 or fewer). A current bank statement can clear ${fixable.length}; ${structural.length} come from the bureau report or the method and can't be changed by adding data${other.length ? `; ${other.length} reflect the transactions themselves` : ''}. After new data is added the system recalculates and shows the real result — it is not guaranteed to reach Low-Moderate.`,
      action: i.hasBankStatement ? upload : { type: 'NONE', label: '' },
      detail: { fixableByNewStatement: fixable, structural, reflectTransactions: other },
    })
  }

  if (i.alignmentState === null && i.hasBankStatement && i.hasCreditReport && !out.some((r) => r.code === 'STATEMENT_NOT_CURRENT')) {
    out.push({ code: 'ALIGNMENT_UNCLASSIFIED', severity: 'IMPROVES', title: 'Credit and financial position can’t be classified', why: 'Evidence is too thin to call the credit report and bank statement aligned, stressed or healthy — usually because monthly EMI obligations can’t be confirmed from the bureau report.', action: { type: 'NONE', label: '' } })
  }

  return out
}
