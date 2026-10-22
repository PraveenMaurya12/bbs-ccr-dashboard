import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { QueryBoundary } from '@/components/shared/QueryBoundary'
import { documentService } from '../../../services/documentService'
import type { DocumentType, LeadDocument } from '../../../types'
import { DocumentChecklistCard } from './DocumentChecklistCard'
import { DocumentSummaryStrip } from './DocumentSummaryStrip'
import { UploadDocumentDialog } from './UploadDocumentDialog'
import { UploadedDocumentsGrid } from './UploadedDocumentsGrid'

export function DocumentsTab({ bbsLeadId }: { bbsLeadId: string }) {
  const queryClient = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const queryKey = ['leadDocuments', bbsLeadId]

  const documentsQuery = useQuery({
    queryKey,
    queryFn: () => documentService.list(bbsLeadId),
  })

  // Prefetched so that clicking "View" can call window.open() with zero
  // async work in between — see DocumentService.getViewUrl's doc comment.
  // A ref (not state) since nothing needs to re-render when an entry
  // arrives; DocumentCard reads it imperatively at click time instead.
  const viewUrlsRef = useRef<Map<string, string>>(new Map())
  useEffect(() => {
    const documents = documentsQuery.data
    if (!documents) return
    for (const doc of documents) {
      if (viewUrlsRef.current.has(doc.id)) continue
      documentService
        .getViewUrl(bbsLeadId, doc.id)
        .then((url) => viewUrlsRef.current.set(doc.id, url))
        .catch(() => {
          // Left unset — DocumentCard falls back to an on-demand fetch for
          // this one document if its prefetch happened to fail.
        })
    }
  }, [bbsLeadId, documentsQuery.data])

  const uploadMutation = useMutation({
    mutationFn: ({
      documentType,
      file,
      onProgress,
    }: {
      documentType: DocumentType
      file: File
      onProgress: (percent: number) => void
    }) => documentService.upload(bbsLeadId, documentType, file, onProgress),
    onSuccess: (created, variables) => {
      queryClient.setQueryData<LeadDocument[]>(queryKey, (prev) => [created, ...(prev ?? [])])
      // Uploading a BANK_STATEMENT fires the Financial Analysis pipeline
      // server-side (DocumentsService.upload -> FinancialAnalysisService.
      // createAndRun, fire-and-forget) — without this, the Financial
      // Analysis tab's cached query has no way to know a new analysis now
      // exists, and keeps showing whatever it last fetched (stale, or the
      // "no statement uploaded yet" empty state) until an unrelated
      // remount/staleTime expiry happens to trigger a refetch. Invalidating
      // here lets its own polling (keyed off the fresh status) take over
      // immediately, the same way its own reprocess mutation already does.
      if (variables.documentType === 'BANK_STATEMENT') {
        queryClient.invalidateQueries({ queryKey: ['financialAnalysis', bbsLeadId] })
      }
    },
  })

  const verifyMutation = useMutation({
    mutationFn: ({ documentId, status }: { documentId: string; status: 'VERIFIED' | 'REJECTED' }) =>
      documentService.verify(bbsLeadId, documentId, status),
    onSuccess: (updated) => {
      queryClient.setQueryData<LeadDocument[]>(queryKey, (prev) =>
        (prev ?? []).map((doc) => (doc.id === updated.id ? updated : doc)),
      )
    },
  })

  function handleView(document: LeadDocument) {
    const cachedUrl = viewUrlsRef.current.get(document.id)
    if (cachedUrl) {
      // Synchronous, zero-async-gap open — the whole reason this URL was prefetched.
      window.open(cachedUrl, '_blank')
      return
    }
    // Rare fallback (prefetch hadn't resolved yet, e.g. right after a fresh
    // upload) — this one open attempt may occasionally be blocked by the
    // browser since it now has an async gap before it; there's no way to
    // avoid that for a document whose ticket genuinely isn't ready yet.
    documentService.getViewUrl(bbsLeadId, document.id).then((url) => {
      viewUrlsRef.current.set(document.id, url)
      window.open(url, '_blank')
    })
  }

  return (
    <QueryBoundary query={documentsQuery} emptyTitle="No documents yet">
      {(documents) => (
        <div className="flex flex-col gap-4">
          <DocumentSummaryStrip documents={documents} />

          {/*
            xl (1280px), not lg (1024px): at exactly 1024px a 1/3 + 2/3 split
            leaves the checklist column too narrow (the same class of bug
            found and fixed earlier in LeadSummaryCard's journey tracker) —
            stacking through 1024–1279px avoids it entirely.
          */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-1">
              <DocumentChecklistCard documents={documents} />
            </div>
            <div className="xl:col-span-2">
              <UploadedDocumentsGrid
                documents={documents}
                onView={handleView}
                onVerify={(document, status) =>
                  verifyMutation.mutateAsync({ documentId: document.id, status }).then(() => {})
                }
                onUploadClick={() => setUploadOpen(true)}
              />
            </div>
          </div>

          <UploadDocumentDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            onUpload={(documentType, file, onProgress) =>
              uploadMutation.mutateAsync({ documentType, file, onProgress }).then(() => {})
            }
          />
        </div>
      )}
    </QueryBoundary>
  )
}
