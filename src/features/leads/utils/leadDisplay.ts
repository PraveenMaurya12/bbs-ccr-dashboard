import { CheckCircle2, Clock, Phone, XCircle, Zap, type LucideIcon } from 'lucide-react'

import type { LeadFunnelStatus, PipelineStageStatus } from '../types'

export interface StatusMeta {
  label: string
  icon: LucideIcon
  textClassName: string
  bgClassName: string
}

/** Exact colors from Figma's Status Badge component (state-group "lighter" backgrounds, "base" text). */
export const STATUS_META: Record<LeadFunnelStatus, StatusMeta> = {
  new_lead: {
    label: 'New lead',
    icon: Zap,
    textClassName: 'text-[#fa7319]',
    bgClassName: 'bg-[#fff3eb]',
  },
  contacted: {
    label: 'Contacted',
    icon: Phone,
    textClassName: 'text-[#7d52f4]',
    bgClassName: 'bg-[#efebff]',
  },
  in_progress: {
    label: 'In Progress',
    icon: Clock,
    textClassName: 'text-[#f6b51e]',
    bgClassName: 'bg-[#fffaeb]',
  },
  converted: {
    label: 'Converted',
    icon: CheckCircle2,
    textClassName: 'text-[#1fc16b]',
    bgClassName: 'bg-[#e3f7ec]',
  },
  not_eligible: {
    label: 'Not Eligible',
    icon: XCircle,
    textClassName: 'text-[#fb3748]',
    bgClassName: 'bg-[#ffebec]',
  },
}

/** Colors for the Debt Analysis tab's risk-flag severities — same 3-tier palette as elsewhere in this file. */
export const DEBT_RISK_SEVERITY_META: Record<'High' | 'Medium' | 'Low', { textClassName: string; bgClassName: string }> = {
  High: { textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  Medium: { textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  Low: { textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
}

export type CreditScoreTier = 'poor' | 'fair' | 'good'

export function creditScoreTier(score: number): CreditScoreTier {
  if (score >= 700) return 'good'
  if (score >= 550) return 'fair'
  return 'poor'
}

export const CREDIT_SCORE_TIER_META: Record<CreditScoreTier, { textClassName: string; bgClassName: string }> = {
  good: { textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  fair: { textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  poor: { textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
}

/** Avatar circle background tints, cycling in the same order Figma's reference rows use. */
export const AVATAR_BG_CLASSES = [
  'bg-[#ffecc0]', // yellow/200
  'bg-[#c0eaff]', // sky/200
  'bg-[#ffc0c5]', // red/200
  'bg-[#ffc0c5]', // red/200
  'bg-[#cac0ff]', // purple/200
  'bg-[#ebebeb]', // neutral/gray/200
  'bg-[#ebebeb]', // neutral/gray/200
  'bg-[#c0d5ff]', // blue/200
  'bg-[#c0d5ff]', // blue/200
]

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatCurrencyInr(amount: number): string {
  if (amount === 0) return '₹ 0'
  return `₹ ${new Intl.NumberFormat('en-IN').format(amount)}`
}

/** PAN is never shown in full in any list/export view — only masked, whichever data source it came from. */
export function maskPan(pan: string | null): string {
  if (pan === null) return 'Protected'
  return `${pan.slice(0, 2)}XXXXX${pan.slice(-2)}`
}

/** Every raw backend LeadSource enum value the Lead Detail summary card may need to render. */
export const LEAD_SOURCE_LABEL: Record<string, string> = {
  ONLINE: 'Website',
  PARTNER_DEALER: 'Partner',
  WALK_IN: 'Walk-in',
  CALL_CENTER: 'Call Center',
  REFERRAL: 'Referral',
}

export function formatLeadSource(source: string): string {
  return LEAD_SOURCE_LABEL[source] ?? source
}

/** Display label + dot color for a single pipeline stage in the journey tracker. */
export const STAGE_STATUS_LABEL: Record<PipelineStageStatus, string> = {
  NOT_STARTED: 'Not started',
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  REQUIRES_REVIEW: 'Needs review',
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const day = date.getUTCDate()
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const hours = date.getUTCHours().toString().padStart(2, '0')
  const minutes = date.getUTCMinutes().toString().padStart(2, '0')
  return `${day} ${month}, ${hours}:${minutes}`
}

/** Same day/month formatting as formatDateTime, without the time — e.g. "12 Aug 2025". */
export function formatDateOnly(iso: string): string {
  const date = new Date(iso)
  const day = date.getUTCDate()
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const year = date.getUTCFullYear()
  return `${day} ${month} ${year}`
}

/** A calendar-month label for the Financial Analysis tab's monthly charts/tables — e.g. "Jan 2026". */
export function formatMonthLabel(iso: string): string {
  const date = new Date(iso)
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const year = date.getUTCFullYear()
  return `${month} ${year}`
}
