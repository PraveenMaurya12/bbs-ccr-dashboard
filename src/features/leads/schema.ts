import { z } from 'zod'

/** Mirrors the real backend's CreateLeadDto exactly — the same fields work in mock or API mode. */
export const createLeadSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().min(5, 'Enter a valid phone number'),
  email: z.email('Enter a valid email address'),
  city: z.string().min(1, 'City is required'),
  source: z.enum(['website', 'partner']),
})

export type CreateLeadFormValues = z.infer<typeof createLeadSchema>

/** The 5 categories the public contact form collects (see backend's public-contact submit-lead.dto.ts) — reused verbatim, never invented. */
export const HELP_CATEGORY_OPTIONS = [
  { value: 'loan_settlement', label: 'Loan settlement' },
  { value: 'high_emi', label: 'High EMI' },
  { value: 'credit_score', label: 'Credit score' },
  { value: 'recovery_pressure', label: 'Recovery pressure' },
  { value: 'something_else', label: 'Something else' },
] as const

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
] as const

export const MARITAL_STATUS_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
] as const

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'salaried_private', label: 'Salaried (Private)' },
  { value: 'salaried_government', label: 'Salaried (Government)' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'business_owner', label: 'Business owner' },
  { value: 'unemployed', label: 'Unemployed' },
] as const

/** Optional everywhere: a CCR may save one section of the Lead Details form at a time. */
export const leadDetailSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().min(5, 'Enter a valid phone number'),
  helpCategory: z.string().optional().or(z.literal('')),
  situation: z.string().max(200, 'Keep it under 200 characters').optional().or(z.literal('')),

  dateOfBirth: z.string().optional().or(z.literal('')),
  gender: z.string().optional().or(z.literal('')),
  maritalStatus: z.string().optional().or(z.literal('')),

  alternateMobile: z.string().optional().or(z.literal('')),
  email: z.email('Enter a valid email address').optional().or(z.literal('')),

  employmentType: z.string().optional().or(z.literal('')),
  companyName: z.string().optional().or(z.literal('')),
  designation: z.string().optional().or(z.literal('')),
  // Kept as plain strings (like every other text input) rather than
  // z.coerce.number() — mixing a coerced-number field into a schema whose
  // other fields are all strings makes zodResolver's input/output types
  // diverge in a way TypeScript can't reconcile. Parsed to a number only
  // at submit time, in toUpdateInput below.
  monthlySalary: z.string().optional().or(z.literal('')),
  officialEmail: z.email('Enter a valid email address').optional().or(z.literal('')),
  workingExperienceYears: z.string().optional().or(z.literal('')),

  city: z.string().optional().or(z.literal('')),
  addressLine1: z.string().optional().or(z.literal('')),
  addressLine2: z.string().optional().or(z.literal('')),
  pinCode: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),

  sameAsCurrentAddress: z.boolean(),
  permanentAddressLine1: z.string().optional().or(z.literal('')),
  permanentAddressLine2: z.string().optional().or(z.literal('')),
  permanentCity: z.string().optional().or(z.literal('')),
  permanentPinCode: z.string().optional().or(z.literal('')),
  permanentState: z.string().optional().or(z.literal('')),
})

export type LeadDetailFormValues = z.infer<typeof leadDetailSchema>
