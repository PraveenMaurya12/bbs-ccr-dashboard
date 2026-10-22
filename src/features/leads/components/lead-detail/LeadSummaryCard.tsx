import { useState } from 'react'
import { Check, Copy, Globe2, IndianRupee, MapPin } from 'lucide-react'

import { avatarBgClassFor, avatarImageFor } from '../../utils/avatars'
import { formatLeadSource } from '../../utils/leadDisplay'
import { LeadStatusBadge } from '../LeadStatusBadge'
import { JourneyTracker } from './JourneyTracker'
import type { LeadDetail } from '../../types'

const EMPLOYMENT_BADGE_LABEL: Record<string, string> = {
  salaried_private: 'Salaried',
  salaried_government: 'Salaried',
  self_employed: 'Self-employed',
  business_owner: 'Business owner',
  unemployed: 'Unemployed',
}

/** Exact colors from Figma's Status Badge component variants (node 1448:10984): information/blue for source, feature/purple for employment, faded/gray for location. */
function InfoBadge({
  icon: Icon,
  bgClassName,
  textClassName,
  children,
}: {
  icon: typeof Globe2
  bgClassName: string
  textClassName: string
  children: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md py-1 pr-2 pl-1 text-sm font-medium tracking-[-0.084px] ${bgClassName} ${textClassName}`}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </span>
  )
}

function CopyBbsLeadId({ bbsLeadId }: { bbsLeadId: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(bbsLeadId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access denied — silently no-op, nothing sensitive to protect here either way.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-sm font-medium text-[#335cff] hover:underline"
      aria-label={`Copy lead ID ${bbsLeadId}`}
    >
      {bbsLeadId}
      {copied ? (
        <Check className="size-5 text-[#1fc16b]" aria-hidden="true" />
      ) : (
        <Copy className="size-5" aria-hidden="true" />
      )}
    </button>
  )
}

/** Deterministic avatar index derived from the lead id, matching the Leads table's own convention. */
function stableAvatarIndex(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 9
  return hash + 1
}

export function LeadSummaryCard({ lead }: { lead: LeadDetail }) {
  const avatarIndex = stableAvatarIndex(lead.id)
  const employmentBadge = lead.customer?.employmentType
    ? (EMPLOYMENT_BADGE_LABEL[lead.customer.employmentType] ?? lead.customer.employmentType)
    : null
  const locationBadge = [lead.city, lead.customer?.state].filter(Boolean).join(', ')

  return (
    <div className="overflow-x-auto rounded-xl border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]">
      {/* Side-by-side only from xl (1280px) up — at 1024–1279px the 5-step
          tracker has nowhere to go if it competes with the avatar block for
          width, so it stacks full-width below instead of getting clipped. */}
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-3">
          <span
            className={`flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full ${avatarBgClassFor(avatarIndex)}`}
          >
            <img src={avatarImageFor(avatarIndex)} alt="" className="size-full object-cover" />
          </span>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[20px] leading-[28px] font-medium text-[#171717]">{lead.fullName}</h2>
              <LeadStatusBadge status={lead.status} size="md" />
            </div>
            <CopyBbsLeadId bbsLeadId={lead.bbsLeadId} />
            <div className="flex flex-wrap gap-2">
              <InfoBadge icon={Globe2} bgClassName="bg-[#ebf1ff]" textClassName="text-[#335cff]">
                {formatLeadSource(lead.source)}
              </InfoBadge>
              {employmentBadge ? (
                <InfoBadge icon={IndianRupee} bgClassName="bg-[#efebff]" textClassName="text-[#7d52f4]">
                  {employmentBadge}
                </InfoBadge>
              ) : null}
              {locationBadge ? (
                <InfoBadge icon={MapPin} bgClassName="bg-[#f5f5f5]" textClassName="text-[#5c5c5c]">
                  {locationBadge}
                </InfoBadge>
              ) : null}
            </div>
          </div>
        </div>

        <JourneyTracker lead={lead} />
      </div>
    </div>
  )
}
