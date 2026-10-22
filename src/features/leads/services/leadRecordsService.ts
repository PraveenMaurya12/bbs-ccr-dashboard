import { env } from '@/lib/env'
import { apiRequest } from '@/services/api/client'
import { delay } from '@/services/mock/delay'
import { mockLeadRecords } from '../data/leadRecords.mock'
import type {
  CreateLeadRecordInput,
  LeadFunnelStatus,
  LeadRecord,
  LeadRecordStats,
  LeadSourceChannel,
} from '../types'

export type LeadSortField = 'dateTime' | 'phone'
export type LeadSortDirection = 'asc' | 'desc'

export interface LeadRecordsQuery {
  search?: string
  tab: 'all' | LeadSourceChannel
  statuses?: LeadFunnelStatus[]
  minCreditScore?: number
  maxCreditScore?: number
  sortBy?: LeadSortField
  sortDir?: LeadSortDirection
  page: number
  pageSize: number
}

export interface LeadRecordsResult {
  items: LeadRecord[]
  total: number
  totalPages: number
  stats: LeadRecordStats
}

export interface LeadRecordsService {
  list(query: LeadRecordsQuery): Promise<LeadRecordsResult>
  create(input: CreateLeadRecordInput): Promise<LeadRecord>
  /** All rows matching the query's filters (ignoring pagination) — used by CSV export. */
  listAllMatching(query: LeadRecordsQuery): Promise<LeadRecord[]>
}

function computeStats(records: LeadRecord[], isPartial = false): LeadRecordStats {
  return {
    total: records.length,
    newLead: records.filter((r) => r.status === 'new_lead').length,
    contacted: records.filter((r) => r.status === 'contacted').length,
    inProgress: records.filter((r) => r.status === 'in_progress').length,
    converted: records.filter((r) => r.status === 'converted').length,
    notEligible: records.filter((r) => r.status === 'not_eligible').length,
    isPartial,
  }
}

function applyFilters(records: LeadRecord[], query: LeadRecordsQuery): LeadRecord[] {
  let filtered = records

  if (query.tab !== 'all') {
    filtered = filtered.filter((r) => r.source === query.tab)
  }
  if (query.statuses && query.statuses.length > 0) {
    filtered = filtered.filter((r) => query.statuses!.includes(r.status))
  }
  if (query.minCreditScore !== undefined) {
    filtered = filtered.filter((r) => r.creditScore !== null && r.creditScore >= query.minCreditScore!)
  }
  if (query.maxCreditScore !== undefined) {
    filtered = filtered.filter((r) => r.creditScore !== null && r.creditScore <= query.maxCreditScore!)
  }
  if (query.search) {
    const term = query.search.trim().toLowerCase()
    if (term) {
      filtered = filtered.filter(
        (r) =>
          r.fullName.toLowerCase().includes(term) ||
          r.phone.toLowerCase().includes(term) ||
          (r.pan?.toLowerCase().includes(term) ?? false),
      )
    }
  }

  if (query.sortBy) {
    const dir = query.sortDir === 'desc' ? -1 : 1
    filtered = [...filtered].sort((a, b) => {
      const aVal = a[query.sortBy!]
      const bVal = b[query.sortBy!]
      return aVal < bVal ? -1 * dir : aVal > bVal ? 1 * dir : 0
    })
  }

  return filtered
}

function paginate(filtered: LeadRecord[], query: LeadRecordsQuery) {
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize))
  const page = Math.min(Math.max(1, query.page), totalPages)
  const start = (page - 1) * query.pageSize
  const items = filtered.slice(start, start + query.pageSize)
  return { items, total, totalPages }
}

/**
 * Mock-only fictional data (see types.ts). Keeps its own in-memory, mutable
 * copy of the seed dataset so "Add Manual Lead" persists for the rest of
 * the session.
 */
class MockLeadRecordsService implements LeadRecordsService {
  private records: LeadRecord[] = [...mockLeadRecords]

  async list(query: LeadRecordsQuery): Promise<LeadRecordsResult> {
    const stats = computeStats(this.records)
    const filtered = applyFilters(this.records, query)
    const { items, total, totalPages } = paginate(filtered, query)
    return delay({ items, total, totalPages, stats }, 250)
  }

  async listAllMatching(query: LeadRecordsQuery): Promise<LeadRecord[]> {
    return delay(applyFilters(this.records, query), 250)
  }

  async create(input: CreateLeadRecordInput): Promise<LeadRecord> {
    const record: LeadRecord = {
      id: `lead-manual-${Date.now()}`,
      dateTime: new Date().toISOString(),
      fullName: input.fullName,
      avatarIndex: (this.records.length % 9) + 1,
      phone: input.phone,
      creditScore: input.creditScore ?? null,
      pan: input.pan ?? null,
      totalOverdue: input.totalOverdue ?? null,
      status: 'new_lead',
      source: input.source,
    }

    this.records = [record, ...this.records]
    return delay(record, 300)
  }
}

// --- Real backend implementation ------------------------------------------

interface BackendLead {
  id: string
  bbsLeadId: string
  fullName: string
  phone: string
  source: string
  createdAt: string
  leadSubmissionStatus: string
  bureauReportStatus: string
  level1Status: string
  level2Status: string
  level3Status: string
  recoveryPlanStatus: string
}

interface BackendPaginated<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/**
 * Derives one of the 5 funnel buckets this screen displays from the real
 * lead's 6 independent pipeline-stage statuses. There is no single "funnel
 * status" field on the backend `Lead` model — this mapping is a documented,
 * deterministic read of real fields, not a fabricated value.
 */
export function deriveFunnelStatus(lead: BackendLead): LeadFunnelStatus {
  const stages = [
    lead.bureauReportStatus,
    lead.level1Status,
    lead.level2Status,
    lead.level3Status,
    lead.recoveryPlanStatus,
  ]

  if (stages.some((s) => s === 'FAILED' || s === 'REQUIRES_REVIEW')) return 'not_eligible'
  if (lead.recoveryPlanStatus === 'COMPLETED' || lead.level3Status === 'COMPLETED') return 'converted'
  if (stages.some((s) => s === 'IN_PROGRESS')) return 'in_progress'
  if (lead.bureauReportStatus === 'COMPLETED') return 'contacted'
  return 'new_lead'
}

function toSourceChannel(backendSource: string): LeadSourceChannel {
  return backendSource === 'PARTNER_DEALER' ? 'partner' : 'website'
}

function stableAvatarIndex(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 9
  }
  return hash + 1
}

function toLeadRecord(backendLead: BackendLead): LeadRecord {
  return {
    id: backendLead.id,
    bbsLeadId: backendLead.bbsLeadId,
    dateTime: backendLead.createdAt,
    fullName: backendLead.fullName,
    avatarIndex: stableAvatarIndex(backendLead.id),
    phone: backendLead.phone,
    // Not modeled on the real Lead — see types.ts doc comment. Never fabricated.
    creditScore: null,
    pan: null,
    totalOverdue: null,
    status: deriveFunnelStatus(backendLead),
    source: toSourceChannel(backendLead.source),
  }
}

const API_SOURCE_BY_TAB: Record<'website' | 'partner', string> = {
  website: 'ONLINE',
  partner: 'PARTNER_DEALER',
}

/**
 * Calls the real backend. Credit score / PAN / overdue amount are reported
 * as `null` (see types.ts) rather than invented. Stats are computed
 * client-side over up to STATS_SAMPLE_CAP real records — accurate for the
 * dataset sizes this app currently has, but not a substitute for a real
 * backend aggregate endpoint at scale (see README "Known limitations").
 */
class ApiLeadRecordsService implements LeadRecordsService {
  private static readonly STATS_SAMPLE_CAP = 1000
  // PaginationQueryDto caps pageSize at 100 (backend/src/common/dto/pagination.dto.ts)
  // — requesting more throws a 400. Must page in chunks, never in one shot.
  private static readonly BACKEND_MAX_PAGE_SIZE = 100

  private buildBackendQuery(query: LeadRecordsQuery, page: number, pageSize: number): string {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (query.search) params.set('search', query.search)
    if (query.tab !== 'all') params.set('source', API_SOURCE_BY_TAB[query.tab])
    return params.toString()
  }

  private async fetchAll(query: LeadRecordsQuery): Promise<BackendLead[]> {
    const first = await apiRequest<BackendPaginated<BackendLead>>(
      `/leads?${this.buildBackendQuery(query, 1, ApiLeadRecordsService.BACKEND_MAX_PAGE_SIZE)}`,
    )
    const cap = Math.min(first.total, ApiLeadRecordsService.STATS_SAMPLE_CAP)
    const items = [...first.items]

    let page = 2
    while (items.length < cap) {
      const next = await apiRequest<BackendPaginated<BackendLead>>(
        `/leads?${this.buildBackendQuery(query, page, ApiLeadRecordsService.BACKEND_MAX_PAGE_SIZE)}`,
      )
      if (next.items.length === 0) break
      items.push(...next.items)
      page += 1
    }

    return items.slice(0, cap)
  }

  async list(query: LeadRecordsQuery): Promise<LeadRecordsResult> {
    const backendLeads = await this.fetchAll(query)
    const records = backendLeads.map((lead) => toLeadRecord(lead))

    // Status is client-derived, so status/credit-score filtering and
    // sort-by-phone happen client-side after the backend's own
    // search/source filters have already narrowed the set.
    const filtered = applyFilters(records, { ...query, minCreditScore: undefined, maxCreditScore: undefined })
    const { items, total, totalPages } = paginate(filtered, query)
    const isPartial = backendLeads.length >= ApiLeadRecordsService.STATS_SAMPLE_CAP
    const stats = computeStats(records, isPartial)

    return { items, total, totalPages, stats }
  }

  async listAllMatching(query: LeadRecordsQuery): Promise<LeadRecord[]> {
    const backendLeads = await this.fetchAll(query)
    const records = backendLeads.map((lead) => toLeadRecord(lead))
    return applyFilters(records, { ...query, minCreditScore: undefined, maxCreditScore: undefined })
  }

  async create(input: CreateLeadRecordInput): Promise<LeadRecord> {
    const backendLead = await apiRequest<BackendLead>('/leads', {
      method: 'POST',
      body: JSON.stringify({
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        city: input.city,
        source: input.source === 'partner' ? 'PARTNER_DEALER' : 'ONLINE',
      }),
    })
    return toLeadRecord(backendLead)
  }
}

export const leadRecordsService: LeadRecordsService =
  env.apiMode === 'api' ? new ApiLeadRecordsService() : new MockLeadRecordsService()
