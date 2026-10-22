import { env } from '@/lib/env'
import { tokenStore } from '@/lib/tokenStore'
import { ApiError, apiRequest } from '@/services/api/client'
import { delay } from '@/services/mock/delay'
import type { DocumentType, DocumentVerificationStatus, LeadDocument } from '../types'

export interface UploadProgressHandler {
  (percent: number): void
}

export interface DocumentService {
  list(bbsLeadId: string): Promise<LeadDocument[]>
  upload(
    bbsLeadId: string,
    documentType: DocumentType,
    file: File,
    onProgress?: UploadProgressHandler,
  ): Promise<LeadDocument>
  /**
   * Resolves to a URL that's immediately ready to `window.open()` — it does
   * NOT open anything itself. Callers (see DocumentsTab) must prefetch this
   * ahead of time and open the cached result synchronously inside the
   * actual click handler, with no `await` in between. Chromium silently
   * blocks a popup's navigation (and locks the window handle behind a
   * cross-origin SecurityError on further access) once the click's user-
   * activation window has lapsed — which any real network round-trip
   * between the click and window.open() reliably does. This was verified
   * directly: minting the ticket synchronously-ish inside the click handler
   * consistently failed to navigate the opened tab; prefetching ahead of
   * time and opening the ready URL with zero intervening await works.
   */
  getViewUrl(bbsLeadId: string, documentId: string): Promise<string>
  verify(bbsLeadId: string, documentId: string, status: 'VERIFIED' | 'REJECTED'): Promise<LeadDocument>
}

// --- Mock implementation ----------------------------------------------------

/** Keeps real File objects (not just metadata) per lead so "view" genuinely opens what was "uploaded". */
const mockFiles = new Map<string, File>()
const mockDocumentsByLead = new Map<string, LeadDocument[]>()

function mockIdFor(bbsLeadId: string, documentId: string): string {
  return `${bbsLeadId}:${documentId}`
}

class MockDocumentService implements DocumentService {
  async list(bbsLeadId: string): Promise<LeadDocument[]> {
    return delay([...(mockDocumentsByLead.get(bbsLeadId) ?? [])], 250)
  }

  async upload(
    bbsLeadId: string,
    documentType: DocumentType,
    file: File,
    onProgress?: UploadProgressHandler,
  ): Promise<LeadDocument> {
    // Simulated progress — there's no real network transfer in mock mode.
    for (const pct of [20, 45, 70, 100]) {
      onProgress?.(pct)
      await delay(null, 120)
    }

    const doc: LeadDocument = {
      id: `mock-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      documentType,
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      verificationStatus: 'PENDING',
      verifiedAt: null,
      uploadedAt: new Date().toISOString(),
      uploadedBy: { id: 'mock-user', name: 'Dev CCR Agent' },
      verifiedBy: null,
    }

    mockFiles.set(mockIdFor(bbsLeadId, doc.id), file)
    const existing = mockDocumentsByLead.get(bbsLeadId) ?? []
    mockDocumentsByLead.set(bbsLeadId, [doc, ...existing])
    return doc
  }

  async getViewUrl(bbsLeadId: string, documentId: string): Promise<string> {
    const file = mockFiles.get(mockIdFor(bbsLeadId, documentId))
    if (!file) throw new Error('Document not found')
    // Blob URLs are same-tab-origin-scoped either way, but since this mock
    // never involves a real network round-trip, prefetch-vs-click timing
    // isn't actually a concern here the way it is for the real backend.
    return URL.createObjectURL(file)
  }

  async verify(bbsLeadId: string, documentId: string, status: 'VERIFIED' | 'REJECTED'): Promise<LeadDocument> {
    const list = mockDocumentsByLead.get(bbsLeadId) ?? []
    const updated = list.map((doc) =>
      doc.id === documentId
        ? {
            ...doc,
            verificationStatus: status as DocumentVerificationStatus,
            verifiedAt: new Date().toISOString(),
            verifiedBy: { id: 'mock-user', name: 'Dev CCR Agent' },
          }
        : doc,
    )
    mockDocumentsByLead.set(bbsLeadId, updated)
    const result = updated.find((doc) => doc.id === documentId)
    if (!result) throw new Error('Document not found')
    return delay(result, 200)
  }
}

// --- Real backend implementation --------------------------------------------

class ApiDocumentService implements DocumentService {
  async list(bbsLeadId: string): Promise<LeadDocument[]> {
    return apiRequest<LeadDocument[]>(`/leads/${bbsLeadId}/documents`)
  }

  async upload(
    bbsLeadId: string,
    documentType: DocumentType,
    file: File,
    onProgress?: UploadProgressHandler,
  ): Promise<LeadDocument> {
    const formData = new FormData()
    formData.append('documentType', documentType)
    formData.append('file', file)

    return new Promise<LeadDocument>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${env.apiBaseUrl}/leads/${bbsLeadId}/documents`)
      const token = tokenStore.get()
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      }

      xhr.onload = () => {
        let body: { success?: boolean; data?: LeadDocument; message?: string | string[] } = {}
        try {
          body = JSON.parse(xhr.responseText)
        } catch {
          // Non-JSON error body (e.g. a raw 413 from a proxy) — fall through to the generic message below.
        }
        if (xhr.status >= 200 && xhr.status < 300 && body.data) {
          resolve(body.data)
        } else {
          const message = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Upload failed')
          reject(new ApiError(message, xhr.status))
        }
      }
      xhr.onerror = () => reject(new ApiError('Network error during upload', 0))
      xhr.send(formData)
    })
  }

  async getViewUrl(bbsLeadId: string, documentId: string): Promise<string> {
    // Mints a short-lived, single-document ticket (real Bearer-JWT auth,
    // via apiRequest) and builds a URL for the backend's ticket-authorized
    // `/view` endpoint — a real https URL, not a blob:. Neither `noopener`
    // nor `noreferrer` should be passed when this is eventually opened: on
    // the Chromium build this was tested against, passing either one makes
    // window.open() return null and silently fail to navigate, even with a
    // complete, valid destination URL. Not needed anyway — this always
    // points at our own backend, never a third-party URL.
    const { token } = await apiRequest<{ token: string; expiresInSeconds: number }>(
      `/leads/${bbsLeadId}/documents/${documentId}/view-ticket`,
      { method: 'POST' },
    )
    return `${env.apiBaseUrl}/leads/${bbsLeadId}/documents/${documentId}/view?token=${encodeURIComponent(token)}`
  }

  async verify(bbsLeadId: string, documentId: string, status: 'VERIFIED' | 'REJECTED'): Promise<LeadDocument> {
    return apiRequest<LeadDocument>(`/leads/${bbsLeadId}/documents/${documentId}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  }
}

export const documentService: DocumentService =
  env.apiMode === 'api' ? new ApiDocumentService() : new MockDocumentService()
