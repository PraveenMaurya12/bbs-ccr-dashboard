import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, FileText, Loader2, Plus, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatDateOnly } from '../../../utils/leadDisplay'
import type { LeadDocument } from '../../../types'

const VERIFICATION_BADGE: Record<
  LeadDocument['verificationStatus'],
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  VERIFIED: { label: 'Verified', icon: CheckCircle2, className: 'bg-[#e3f7ec] text-[#1fc16b]' },
  PENDING: { label: 'Pending review', icon: AlertTriangle, className: 'bg-[#fff3eb] text-[#fa7319]' },
  REJECTED: { label: 'Rejected', icon: XCircle, className: 'bg-[#ffebec] text-[#fb3748]' },
}

function DocumentCard({
  document,
  onView,
  onVerify,
}: {
  document: LeadDocument
  onView: () => void
  onVerify: (status: 'VERIFIED' | 'REJECTED') => Promise<void>
}) {
  const [verifying, setVerifying] = useState<'VERIFIED' | 'REJECTED' | null>(null)
  const badge = VERIFICATION_BADGE[document.verificationStatus]

  async function handleVerify(status: 'VERIFIED' | 'REJECTED') {
    setVerifying(status)
    try {
      await onVerify(status)
    } finally {
      setVerifying(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#ebebeb] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#fb3748] text-[10px] font-bold text-white">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[#171717]">{document.originalFilename}</p>
            <p className="text-xs text-[#5c5c5c]">{formatDateOnly(document.uploadedAt)}</p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${badge.className}`}>
          <badge.icon className="size-3.5" aria-hidden="true" />
          {badge.label}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onView}>
          <Eye className="size-4" aria-hidden="true" />
          View
        </Button>
        {document.verificationStatus === 'PENDING' ? (
          <>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              onClick={() => handleVerify('VERIFIED')}
              disabled={verifying !== null}
            >
              {verifying === 'VERIFIED' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : 'Verify'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleVerify('REJECTED')}
              disabled={verifying !== null}
              aria-label="Reject document"
            >
              {verifying === 'REJECTED' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function UploadedDocumentsGrid({
  documents,
  onView,
  onVerify,
  onUploadClick,
}: {
  documents: LeadDocument[]
  onView: (document: LeadDocument) => void
  onVerify: (document: LeadDocument, status: 'VERIFIED' | 'REJECTED') => Promise<void>
  onUploadClick: () => void
}) {
  return (
    <div className="rounded-xl border border-[#ebebeb] bg-white p-4">
      <div className="flex items-center justify-between pb-3">
        <h3 className="text-base font-semibold text-[#171717]">Uploaded Documents ({documents.length})</h3>
        <Button type="button" size="sm" onClick={onUploadClick}>
          <Plus className="size-4" aria-hidden="true" />
          Upload Document
        </Button>
      </div>

      {documents.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#5c5c5c]">No documents uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              onView={() => onView(document)}
              onVerify={(status) => onVerify(document, status)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
