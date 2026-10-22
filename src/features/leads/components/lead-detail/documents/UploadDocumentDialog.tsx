import { useRef, useState } from 'react'
import { ChevronDown, FileText, Loader2, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DOCUMENT_CHECKLIST_GROUPS } from '../../../utils/documentChecklist'
import { formatFileSize } from '../../../utils/leadDisplay'
import type { DocumentType } from '../../../types'

// Mirrors the backend's own allowlist exactly (see backend's DocumentsController.ALLOWED_DOCUMENT_MIME_TYPES)
// — checked here purely for fast, friendly feedback; the server re-validates independently either way.
const ACCEPTED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png'
// Mirrors the backend's ADDITIONAL_BANK_STATEMENT_MIME_TYPES exactly — only a BANK_STATEMENT upload
// additionally accepts these, since the Financial Analysis module's parsers treat XLSX/CSV as the
// robust, high-confidence path (PDF is accepted everywhere but only ever best-effort for that module).
const ADDITIONAL_BANK_STATEMENT_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]
const ADDITIONAL_BANK_STATEMENT_EXTENSIONS = '.xlsx,.csv'
// Mirrors the backend's DOCUMENT_MAX_FILE_SIZE_BYTES default (see backend/.env.example) — same caveat as above.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

interface UploadDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpload: (documentType: DocumentType, file: File, onProgress: (percent: number) => void) => Promise<void>
}

export function UploadDocumentDialog({ open, onOpenChange, onUpload }: UploadDocumentDialogProps) {
  const [documentType, setDocumentType] = useState<DocumentType | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setDocumentType('')
    setFile(null)
    setError(null)
    setProgress(null)
    setDragActive(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  const isBankStatement = documentType === 'BANK_STATEMENT'
  const acceptedMimeTypes = isBankStatement ? [...ACCEPTED_MIME_TYPES, ...ADDITIONAL_BANK_STATEMENT_MIME_TYPES] : ACCEPTED_MIME_TYPES
  const acceptedExtensions = isBankStatement ? `${ACCEPTED_EXTENSIONS},${ADDITIONAL_BANK_STATEMENT_EXTENSIONS}` : ACCEPTED_EXTENSIONS

  function validateAndSetFile(candidate: File) {
    if (!acceptedMimeTypes.includes(candidate.type)) {
      setError(
        isBankStatement
          ? 'Only PDF, JPEG, PNG, XLSX, and CSV files are accepted for a bank statement.'
          : 'Only PDF, JPEG, and PNG files are accepted.',
      )
      return
    }
    if (candidate.size > MAX_FILE_SIZE_BYTES) {
      setError(`This file is too large (max ${formatFileSize(MAX_FILE_SIZE_BYTES)}).`)
      return
    }
    setError(null)
    setFile(candidate)
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    const dropped = event.dataTransfer.files[0]
    if (dropped) validateAndSetFile(dropped)
  }

  async function handleSubmit() {
    if (!documentType || !file) return
    setProgress(0)
    setError(null)
    try {
      await onUpload(documentType, file, setProgress)
      handleOpenChange(false)
    } catch {
      setError('Could not upload this document. Please try again.')
      setProgress(null)
    }
  }

  const isUploading = progress !== null && progress < 100

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="upload-doc-type" className="text-sm font-medium text-[#171717]">
              Document category
            </label>
            <div className="relative">
              <select
                id="upload-doc-type"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                disabled={isUploading}
                className="h-auto w-full appearance-none rounded-[10px] border border-[#ebebeb] bg-white px-3 py-2.5 pr-9 text-sm text-[#171717] focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/30"
              >
                <option value="" disabled>
                  Select a document type
                </option>
                {DOCUMENT_CHECKLIST_GROUPS.map((group) => (
                  <optgroup key={group.title} label={group.title}>
                    {group.items.map((item) => (
                      <option key={item.type} value={item.type}>
                        {item.label} {item.required ? '' : '(Optional)'}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-[#5c5c5c]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[#171717]">File</span>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center gap-2 rounded-[10px] border-2 border-dashed p-6 text-center transition-colors ${
                dragActive ? 'border-[#335cff] bg-[#ebf1ff]' : 'border-[#ebebeb]'
              }`}
            >
              {file ? (
                <div className="flex w-full items-center justify-between gap-2 rounded-md bg-[#f7f7f7] px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-[#5c5c5c]" aria-hidden="true" />
                    <span className="truncate text-sm text-[#171717]">{file.name}</span>
                    <span className="shrink-0 text-xs text-[#5c5c5c]">{formatFileSize(file.size)}</span>
                  </div>
                  {!isUploading ? (
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      aria-label="Remove selected file"
                      className="shrink-0 text-[#5c5c5c] hover:text-[#171717]"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  <Upload className="size-6 text-[#5c5c5c]" aria-hidden="true" />
                  <p className="text-sm text-[#5c5c5c]">Drag and drop a file here, or</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    Choose file
                  </Button>
                  <p className="text-xs text-[#a3a3a3]">
                    {isBankStatement ? 'PDF, JPEG, PNG, XLSX, or CSV' : 'PDF, JPEG, or PNG'} — up to {formatFileSize(MAX_FILE_SIZE_BYTES)}
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptedExtensions}
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files?.[0]
                  if (selected) validateAndSetFile(selected)
                  e.target.value = ''
                }}
              />
            </div>
          </div>

          {progress !== null ? (
            <div className="flex flex-col gap-1">
              <div className="h-2 w-full rounded-full bg-[#ebebeb]">
                <div
                  className="h-full rounded-full bg-[#335cff] transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-[#5c5c5c]">{progress < 100 ? `Uploading… ${progress}%` : 'Finishing up…'}</p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isUploading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!documentType || !file || isUploading}>
            {isUploading ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Uploading…
              </>
            ) : (
              'Upload'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
