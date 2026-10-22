import { HelpCircle, IdCard, Mail, Phone } from 'lucide-react'

import { HELP_CATEGORY_OPTIONS } from '../../schema'
import type { LeadDetail } from '../../types'

function helpCategoryLabel(value: string | null): string {
  if (!value) return 'Not provided'
  return HELP_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? value
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone
  label: string
  value: string
}) {
  return (
    <div className="flex flex-1 items-center gap-2.5 py-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f7f7f7] text-[#5c5c5c]">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs text-[#5c5c5c]">{label}</p>
        <p className="truncate text-sm font-medium text-[#171717]">{value}</p>
      </div>
    </div>
  )
}

export function ContactInfoStrip({ lead }: { lead: LeadDetail }) {
  return (
    <div className="grid grid-cols-1 divide-y divide-[#ebebeb] rounded-xl border border-[#ebebeb] bg-white px-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
      <InfoItem icon={Phone} label="Mobile" value={lead.phone || 'Not provided'} />
      <div className="sm:pl-6">
        <InfoItem icon={Mail} label="Email" value={lead.email ?? 'Not provided'} />
      </div>
      <div className="sm:pl-6">
        <InfoItem icon={IdCard} label="PAN" value="Protected" />
      </div>
      <div className="sm:pl-6">
        <InfoItem icon={HelpCircle} label="Need help with" value={helpCategoryLabel(lead.helpCategory)} />
      </div>
    </div>
  )
}
