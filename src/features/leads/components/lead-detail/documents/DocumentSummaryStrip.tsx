import { CheckCircle2, Clock, FileStack } from 'lucide-react'

import { TOTAL_CHECKLIST_SLOTS, countUploadedSlots } from '../../../utils/documentChecklist'
import type { LeadDocument } from '../../../types'

function StatItem({
  icon: Icon,
  iconBgClassName,
  iconClassName,
  label,
  value,
}: {
  icon: typeof FileStack
  iconBgClassName: string
  iconClassName: string
  label: string
  value: number
}) {
  return (
    <div className="flex min-w-[152px] items-start gap-3">
      <span className={`flex shrink-0 items-center justify-center rounded-full p-2.5 ${iconBgClassName}`}>
        <Icon className={`size-5 ${iconClassName}`} aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-medium tracking-[0.22px] whitespace-nowrap text-[#a3a3a3] uppercase">
          {label}
        </p>
        <p className="text-base font-medium tracking-[-0.176px] whitespace-nowrap text-[#171717]">{value}</p>
      </div>
    </div>
  )
}

export function DocumentSummaryStrip({ documents }: { documents: LeadDocument[] }) {
  const total = documents.length
  const verified = documents.filter((d) => d.verificationStatus === 'VERIFIED').length
  const pending = documents.filter((d) => d.verificationStatus === 'PENDING').length
  const uploadedSlots = countUploadedSlots(documents)
  const completionPercent = Math.round((uploadedSlots / TOTAL_CHECKLIST_SLOTS) * 100)

  return (
    <div className="grid grid-cols-1 gap-6 rounded-xl border border-[#ebebeb] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatItem
        icon={FileStack}
        iconBgClassName="bg-[#ebf1ff]"
        iconClassName="text-[#335cff]"
        label="Total Document"
        value={total}
      />
      <StatItem
        icon={CheckCircle2}
        iconBgClassName="bg-[#fff3eb]"
        iconClassName="text-[#fa7319]"
        label="Verified Documents"
        value={verified}
      />
      <StatItem
        icon={Clock}
        iconBgClassName="bg-[#efebff]"
        iconClassName="text-[#7d52f4]"
        label="Pending Documents"
        value={pending}
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[#171717]">Document Completion</p>
          <p className="text-sm font-medium text-[#171717]">{completionPercent}%</p>
        </div>
        <div className="h-2 w-full rounded-full bg-[#ebebeb]">
          <div
            className="h-full rounded-full bg-[#335cff] transition-[width]"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
        <p className="text-xs text-[#5c5c5c]">
          <span className="font-medium text-[#335cff]">
            {uploadedSlots}/{TOTAL_CHECKLIST_SLOTS}
          </span>{' '}
          documents uploaded
        </p>
      </div>
    </div>
  )
}
