import { env } from '@/lib/env'
import { apiRequest } from '@/services/api/client'
import { delay } from '@/services/mock/delay'
import { mockLeadRecords } from '../data/leadRecords.mock'
import { deriveFunnelStatus } from './leadRecordsService'
import type { LeadDetail, LeadDetailCustomer, PipelineStageStatus, UpdateLeadDetailInput } from '../types'

export interface LeadDetailService {
  get(bbsLeadIdOrId: string): Promise<LeadDetail>
  update(bbsLeadIdOrId: string, input: UpdateLeadDetailInput): Promise<LeadDetail>
}

// --- Mock implementation ----------------------------------------------------

const EMPTY_CUSTOMER: LeadDetailCustomer = {
  dateOfBirth: null,
  gender: null,
  maritalStatus: null,
  alternateMobile: null,
  employmentType: null,
  companyName: null,
  designation: null,
  monthlySalary: null,
  officialEmail: null,
  workingExperienceYears: null,
  addressLine1: null,
  addressLine2: null,
  pinCode: null,
  state: null,
  sameAsCurrentAddress: true,
  permanentAddressLine1: null,
  permanentAddressLine2: null,
  permanentCity: null,
  permanentPinCode: null,
  permanentState: null,
}

/**
 * lead-ref-08 (Bharat Mishra) reproduces the Figma reference screenshot's
 * customer profile fields exactly, so the Lead Detail page can be visually
 * compared against it in mock mode. Note: the reference screenshot's own
 * summary-card location badge ("Mumbai, MH") does not actually match its
 * own address-form fields ("Pondicherry"/"Telangana") — the same kind of
 * self-contradictory placeholder data seen elsewhere in this Figma file
 * (e.g. the Leads list's "245" vs "57" stat mismatch). Rather than fabricate
 * a fix for that contradiction, this mock derives the badge from the same
 * address fields the form shows, so the two stay internally consistent.
 */
const REFERENCE_CUSTOMER: LeadDetailCustomer = {
  dateOfBirth: '1993-05-10',
  gender: 'male',
  maritalStatus: 'married',
  alternateMobile: '8652491309',
  employmentType: 'salaried_private',
  companyName: 'Fintech solutio pvt ltd',
  designation: 'Operation executive',
  monthlySalary: 78500,
  officialEmail: 'Bharat.M@fintechsolutio.com',
  workingExperienceYears: 5,
  addressLine1: '88, Across Ganga College, Dikshit, Block No. 92,',
  addressLine2: 'Naralapalli, Pondicherry',
  pinCode: '675911',
  state: 'Telangana',
  sameAsCurrentAddress: true,
  permanentAddressLine1: '88, Across Ganga College, Dikshit, Block No. 92,',
  permanentAddressLine2: 'Naralapalli, Pondicherry',
  permanentCity: 'Pondicherry',
  permanentPinCode: '675911',
  permanentState: 'Telangana',
}

const MOCK_HELP_CATEGORIES = ['loan_settlement', 'high_emi', 'credit_score', 'recovery_pressure', 'something_else']
const MOCK_EMPLOYMENT_TYPES = ['salaried_private', 'salaried_government', 'self_employed', 'business_owner']
const MOCK_GENDERS = ['male', 'female', 'other']
const MOCK_MARITAL_STATUSES = ['single', 'married', 'divorced']
const MOCK_CITIES = ['Bengaluru', 'Mumbai', 'Pune', 'Hyderabad', 'Chennai', 'Delhi']
const MOCK_STATES = ['Karnataka', 'Maharashtra', 'Telangana', 'Tamil Nadu', 'Delhi']

function hashSeed(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 100000
  return hash
}

/** Every mock lead's Customer sub-profile — `city` lives on Lead, not Customer, so it is not part of this. */
function generateMockCustomer(seed: number): LeadDetailCustomer {
  const hasProfile = seed % 3 !== 0 // some mock leads genuinely have no Customer row yet
  if (!hasProfile) return EMPTY_CUSTOMER

  const year = 1975 + (seed % 30)
  const month = ((seed % 12) + 1).toString().padStart(2, '0')
  const day = ((seed % 28) + 1).toString().padStart(2, '0')

  return {
    ...EMPTY_CUSTOMER,
    dateOfBirth: `${year}-${month}-${day}`,
    gender: MOCK_GENDERS[seed % MOCK_GENDERS.length]!,
    maritalStatus: MOCK_MARITAL_STATUSES[seed % MOCK_MARITAL_STATUSES.length]!,
    employmentType: MOCK_EMPLOYMENT_TYPES[seed % MOCK_EMPLOYMENT_TYPES.length]!,
    companyName: seed % 2 === 0 ? 'Vertex Analytics Pvt Ltd' : 'Northbridge Retail Group',
    designation: seed % 2 === 0 ? 'Senior Associate' : 'Team Lead',
    monthlySalary: 25000 + (seed % 20) * 2500,
    workingExperienceYears: seed % 15,
    addressLine1: `${seed % 200} MG Road`,
    pinCode: `${560000 + (seed % 999)}`,
    state: MOCK_STATES[seed % MOCK_STATES.length]!,
    sameAsCurrentAddress: true,
  }
}

function findMockRecord(bbsLeadIdOrId: string) {
  const record = mockLeadRecords.find((r) => r.bbsLeadId === bbsLeadIdOrId || r.id === bbsLeadIdOrId)
  if (!record) throw new Error(`Lead ${bbsLeadIdOrId} was not found`)
  return record
}

const PIPELINE_STAGE_FROM_STATUS: Record<string, PipelineStageStatus> = {
  new_lead: 'PENDING',
  contacted: 'IN_PROGRESS',
  in_progress: 'IN_PROGRESS',
  converted: 'COMPLETED',
  not_eligible: 'FAILED',
}

function mockDetailFor(bbsLeadIdOrId: string): LeadDetail {
  const record = findMockRecord(bbsLeadIdOrId)
  const isReference = record.id === 'lead-ref-08'
  const seed = hashSeed(record.id)
  const customer = isReference ? REFERENCE_CUSTOMER : generateMockCustomer(seed)
  const city = isReference ? 'Pondicherry' : customer === EMPTY_CUSTOMER ? null : MOCK_CITIES[seed % MOCK_CITIES.length]!

  return {
    id: record.id,
    bbsLeadId: record.bbsLeadId ?? record.id,
    fullName: record.fullName,
    phone: record.phone,
    email: null,
    city,
    source: record.source === 'partner' ? 'PARTNER_DEALER' : 'ONLINE',
    helpCategory: MOCK_HELP_CATEGORIES[seed % MOCK_HELP_CATEGORIES.length]!,
    situation: 'I have multiple loans and need help consolidating repayments.',
    createdAt: record.dateTime,
    status: record.status,
    pipeline: {
      leadSubmissionStatus: 'COMPLETED',
      level1Status: record.creditScore !== null ? 'COMPLETED' : 'PENDING',
      level2Status: PIPELINE_STAGE_FROM_STATUS[record.status] ?? 'NOT_STARTED',
      level3Status: record.status === 'converted' ? 'COMPLETED' : 'NOT_STARTED',
      recoveryPlanStatus: record.status === 'converted' ? 'IN_PROGRESS' : 'NOT_STARTED',
    },
    customer,
  }
}

const mockUpdates = new Map<string, LeadDetail>()

class MockLeadDetailService implements LeadDetailService {
  async get(bbsLeadIdOrId: string): Promise<LeadDetail> {
    const saved = mockUpdates.get(bbsLeadIdOrId)
    return delay(saved ?? mockDetailFor(bbsLeadIdOrId), 250)
  }

  async update(bbsLeadIdOrId: string, input: UpdateLeadDetailInput): Promise<LeadDetail> {
    const current = mockUpdates.get(bbsLeadIdOrId) ?? mockDetailFor(bbsLeadIdOrId)
    const next: LeadDetail = {
      ...current,
      fullName: input.fullName ?? current.fullName,
      phone: input.phone ?? current.phone,
      helpCategory: input.helpCategory ?? current.helpCategory,
      situation: input.situation ?? current.situation,
      customer: input.customer ? { ...(current.customer ?? EMPTY_CUSTOMER), ...input.customer } : current.customer,
    }
    mockUpdates.set(bbsLeadIdOrId, next)
    return delay(next, 300)
  }
}

// --- Real backend implementation --------------------------------------------

interface BackendCustomer {
  dateOfBirth: string | null
  gender: string | null
  maritalStatus: string | null
  alternateMobile: string | null
  employmentType: string | null
  companyName: string | null
  designation: string | null
  monthlySalary: string | null // Prisma Decimal serializes as a string over JSON
  officialEmail: string | null
  workingExperienceYears: number | null
  addressLine1: string | null
  addressLine2: string | null
  pinCode: string | null
  state: string | null
  sameAsCurrentAddress: boolean
  permanentAddressLine1: string | null
  permanentAddressLine2: string | null
  permanentCity: string | null
  permanentPinCode: string | null
  permanentState: string | null
}

interface BackendLeadDetail {
  id: string
  bbsLeadId: string
  fullName: string
  phone: string
  email: string | null
  city: string | null
  source: string
  helpCategory: string | null
  situation: string | null
  createdAt: string
  leadSubmissionStatus: string
  bureauReportStatus: string
  level1Status: string
  level2Status: string
  level3Status: string
  recoveryPlanStatus: string
  customer: BackendCustomer | null
}

function toLeadDetail(backend: BackendLeadDetail): LeadDetail {
  return {
    id: backend.id,
    bbsLeadId: backend.bbsLeadId,
    fullName: backend.fullName,
    phone: backend.phone,
    email: backend.email,
    city: backend.city,
    source: backend.source,
    helpCategory: backend.helpCategory,
    situation: backend.situation,
    createdAt: backend.createdAt,
    status: deriveFunnelStatus(backend),
    pipeline: {
      leadSubmissionStatus: backend.leadSubmissionStatus as PipelineStageStatus,
      level1Status: backend.level1Status as PipelineStageStatus,
      level2Status: backend.level2Status as PipelineStageStatus,
      level3Status: backend.level3Status as PipelineStageStatus,
      recoveryPlanStatus: backend.recoveryPlanStatus as PipelineStageStatus,
    },
    customer: backend.customer
      ? { ...backend.customer, monthlySalary: backend.customer.monthlySalary ? Number(backend.customer.monthlySalary) : null }
      : null,
  }
}

class ApiLeadDetailService implements LeadDetailService {
  async get(bbsLeadId: string): Promise<LeadDetail> {
    const backend = await apiRequest<BackendLeadDetail>(`/leads/${bbsLeadId}`)
    return toLeadDetail(backend)
  }

  async update(bbsLeadId: string, input: UpdateLeadDetailInput): Promise<LeadDetail> {
    const backend = await apiRequest<BackendLeadDetail>(`/leads/${bbsLeadId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    return toLeadDetail(backend)
  }
}

export const leadDetailService: LeadDetailService =
  env.apiMode === 'api' ? new ApiLeadDetailService() : new MockLeadDetailService()
