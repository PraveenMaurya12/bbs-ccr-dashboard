import type { DocumentType, LeadDocument } from '../types'

export interface ChecklistItemConfig {
  type: DocumentType
  label: string
  required: boolean
}

export interface ChecklistGroupConfig {
  title: string
  items: ChecklistItemConfig[]
}

/** The 4 groups / 10 canonical slots shown in the Documents tab — mirrors the backend's DocumentType enum exactly, nothing invented. */
export const DOCUMENT_CHECKLIST_GROUPS: ChecklistGroupConfig[] = [
  {
    title: 'Identity Documents',
    items: [
      { type: 'PAN_CARD', label: 'PAN Card', required: true },
      { type: 'AADHAAR_CARD', label: 'Aadhaar Card', required: true },
    ],
  },
  {
    title: 'Income Proof',
    items: [
      { type: 'SALARY_SLIP', label: 'Salary slip (Last 3 months)', required: true },
      { type: 'BANK_STATEMENT', label: 'Bank statement (Last 12 months)', required: true },
      { type: 'FORM_16', label: 'Form 16 / IT returns', required: false },
    ],
  },
  {
    title: 'Loan related documents',
    items: [
      { type: 'LOAN_STATEMENT', label: 'Loan statement', required: true },
      { type: 'FORECLOSURE_LETTER', label: 'Foreclosure / Settlement letter', required: false },
    ],
  },
  {
    title: 'Other Documents',
    items: [
      { type: 'ADDRESS_PROOF', label: 'Address proof', required: true },
      { type: 'EMPLOYMENT_PROOF', label: 'Employment proof', required: false },
      { type: 'OTHER_SUPPORTING', label: 'Other supporting document', required: false },
    ],
  },
]

export const TOTAL_CHECKLIST_SLOTS = DOCUMENT_CHECKLIST_GROUPS.reduce((sum, g) => sum + g.items.length, 0)

/**
 * A checklist row's own status is a simple Uploaded/Pending — it reflects
 * whether *any* document exists for that slot, not that document's
 * verification state (verification is shown per-card in the Uploaded
 * Documents grid instead, since a slot can have several revisions with
 * different verification outcomes).
 */
export function isSlotUploaded(documentType: DocumentType, documents: LeadDocument[]): boolean {
  return documents.some((doc) => doc.documentType === documentType)
}

export function countUploadedSlots(documents: LeadDocument[]): number {
  return DOCUMENT_CHECKLIST_GROUPS.flatMap((g) => g.items).filter((item) => isSlotUploaded(item.type, documents))
    .length
}
