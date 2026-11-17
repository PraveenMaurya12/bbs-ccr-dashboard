/**
 * Plain-language explanation of why a lead has no pathway: what the block
 * code means, why it fired for THIS lead (read from the persisted rule
 * evidence, never guessed), what to do next, and who can clear it. Pure.
 */

export interface BlockExplanation {
  code: string
  title: string
  /** What the code means, in everyday words. */
  meaning: string
  /** The specific evidence on this lead that triggered it. */
  whyThisLead: string[]
  /** Concrete next steps, in order. */
  whatToDo: string[]
  whoCanClear: string
  /** Secondary matches that are NOT extra blockers — where the case would likely go once cleared. */
  alsoMatched: { code: string; label: string }[]
}

export interface BlockExplanationInput {
  /** Cohort primaryReasonCode when the cohort is BLOCKED, else the pathway's own blockingReason. */
  blockCode: string | null
  secondaryFlagKeys: string[]
  ruleEvidence: Record<string, { matched: boolean; evidence: Record<string, unknown> } | undefined>
  dataQualityFlags: string[]
  p1Open: number
}

/** Plain labels for the secondary flags the UI shows as "inherited blocks". */
const SECONDARY_LABELS: Record<string, string> = {
  C1: 'Stabilisation ready',
  C2: 'Consolidation candidate',
  C3: 'Restructure candidate',
  C4: 'Resolution candidate — existing debt looks hard to service as it is',
  C5: 'Debt-cycle intervention — the customer appears to be borrowing to keep up',
  C7: 'Recovery / credit rebuild',
  BORROWING_TO_REPAY: 'New borrowing appears to be used to repay existing debt',
  DEBT_CYCLE_STACKING: 'Several new loans or enquiries in a short time',
  MEDICAL_SHOCK: 'A large medical expense was detected',
  MANUAL_REVIEW: 'A manual review trigger',
  P1_INFORMATION_REQUIRED: 'Critical information is still outstanding',
  CCR_REQUIRED: 'A CCR must follow up with the customer',
}

/** Flags a current bank statement can clear (same list the data-requirements panel uses). */
const CLEARED_BY_STATEMENT = new Set(['DATE_ALIGNMENT_WARNING', 'L1_DEBT_POST_STATEMENT', 'UNMATCHED_DEBT_PAYMENT', 'FCF_UNRECONCILED'])

const SUPERVISOR = 'A supervisor or admin, from the Cohort section on the Final Profile tab (Override), with a written reason.'

export function explainBlock(i: BlockExplanationInput): BlockExplanation | null {
  if (!i.blockCode) return null
  const alsoMatched = i.secondaryFlagKeys.filter((k) => k !== i.blockCode).map((k) => ({ code: k, label: SECONDARY_LABELS[k] ?? k.replace(/_/g, ' ').toLowerCase() }))
  const base = { code: i.blockCode, alsoMatched }

  switch (i.blockCode) {
    case 'SPECIALIST_REQUIRED':
    case 'SPECIALIST_REVIEW': {
      const legal = i.ruleEvidence.R006?.matched ? i.ruleEvidence.R006.evidence : null
      const exc = i.ruleEvidence.R021?.matched && i.ruleEvidence.R021.evidence.tier === 'SPECIALIST' ? i.ruleEvidence.R021.evidence : null
      const why: string[] = []
      const todo: string[] = []
      if (legal) {
        const found = [legal.suitFiled && 'a suit has been filed', legal.willfulDefault && 'a wilful default is reported', legal.arcAssigned && 'the debt was sold to an asset-reconstruction company'].filter(Boolean)
        why.push(`The credit report shows ${found.length ? found.join(' and ') : 'a legal or specialist status'}.`)
        todo.push('Have a specialist (legal / recovery) review the reported status — adding more data does not change it.')
        todo.push('Once reviewed, record the outcome by overriding the cohort with a written reason.')
      }
      if (exc) {
        const count = Number(exc.exceptionCount)
        const fixable = i.dataQualityFlags.filter((f) => CLEARED_BY_STATEMENT.has(f))
        why.push(`${count} data issues ("exceptions") are active on this profile. The rule sends 5–7 to a specialist and 8 or more to manual review. The active issues are: ${i.dataQualityFlags.join(', ')}.`)
        todo.push(
          fixable.length > 0
            ? `Upload a current bank statement — it can clear ${fixable.length} of them (${fixable.join(', ')}), which may bring the count below 5. Use the upload button in "Data needed" above.`
            : 'None of the active issues can be cleared by adding a new document, so the specialist review (or a supervisor override) is the way forward.',
        )
        todo.push('Recalculate afterwards — the system shows the real result; it does not guarantee the block will lift.')
      }
      if (why.length === 0) why.push('A specialist-review trigger was recorded on the cohort decision.')
      if (todo.length === 0) todo.push('Have a specialist review this case.')
      return {
        ...base,
        title: 'A specialist must review this case',
        meaning: 'The system will not choose a standard recovery pathway on its own for this customer. A specialist has to look at it first. This is a routine safeguard, not a decision against the customer.',
        whyThisLead: why,
        whatToDo: todo,
        whoCanClear: `A specialist reviews it; ${SUPERVISOR}`,
      }
    }
    case 'MANUAL_REVIEW':
      return {
        ...base,
        title: 'A person must review this case manually',
        meaning: 'The data contains a conflict or too many unresolved issues for the system to classify safely.',
        whyThisLead: [i.ruleEvidence.R005?.matched ? 'The credit report and bank statement disagree materially.' : '', i.ruleEvidence.R021?.matched ? `${String(i.ruleEvidence.R021.evidence.exceptionCount)} data issues are active (8 or more triggers manual review): ${i.dataQualityFlags.join(', ')}.` : ''].filter(Boolean),
        whatToDo: ['Resolve the conflicting or missing data (upload a current statement, answer the CCR questions).', 'Recalculate, or have a supervisor review and override with a written reason.'],
        whoCanClear: SUPERVISOR,
      }
    case 'CCR_REQUIRED':
    case 'P1_INFORMATION_REQUIRED':
      return {
        ...base,
        title: 'The CCR must get information from the customer first',
        meaning: 'Critical (priority 1) questions are still open — for example why a loan was taken after the bank statement ended.',
        whyThisLead: [`${i.p1Open} critical item(s) are unresolved.`],
        whatToDo: ['Open the Call details tab and answer the "Blocking items from the Master Profile" questions with what the customer says.', 'Submit — the system then recalculates automatically.'],
        whoCanClear: 'The assigned CCR, by recording the customer’s answers.',
      }
    case 'CONSENT_PENDING':
      return { ...base, title: 'Customer consent is not on file', meaning: 'A pathway cannot be chosen without recorded consent.', whyThisLead: ['No granted consent record exists for this lead.'], whatToDo: ['Capture consent (with PAN) on the Lead details tab.', 'Then recalculate.'], whoCanClear: 'The CCR, by capturing consent.' }
    case 'KYC_PENDING':
      return { ...base, title: 'KYC is incomplete', meaning: 'No PAN / KYC reference is on file for this lead.', whyThisLead: ['No PAN reference is stored.'], whatToDo: ['Capture the PAN with consent on the Lead details tab.', 'Then recalculate.'], whoCanClear: 'The CCR.' }
    case 'COMPLIANCE_HOLD':
      return { ...base, title: 'A compliance hold is active', meaning: 'A compliance signal requires sign-off before any pathway.', whyThisLead: ['A compliance hold is recorded on the cohort decision.'], whatToDo: ['Wait for the compliance review.'], whoCanClear: 'A supervisor or admin (Clear / Decline in the Cohort section). Adding data does not clear it.' }
    case 'DATA_REFRESH_REQUIRED':
    case 'OTHER_ACCOUNTS_REQUIRED':
    case 'INSUFFICIENT_DATA':
    case 'FCF_UNRECONCILED':
      return {
        ...base,
        title: 'More data is needed',
        meaning: 'There is not enough reliable evidence yet to choose a pathway.',
        whyThisLead: ['See the "Data needed" list above for the exact items.'],
        whatToDo: ['Add the data listed above (usually a current bank statement, or statements for other accounts).', 'Recalculate everything.'],
        whoCanClear: 'The CCR, by supplying the data.',
      }
    default:
      return { ...base, title: 'This case is blocked', meaning: `The blocking reason is ${i.blockCode.replace(/_/g, ' ').toLowerCase()}.`, whyThisLead: ['See the rule evaluation below for the evidence.'], whatToDo: ['Review the rule results below.'], whoCanClear: SUPERVISOR }
  }
}
