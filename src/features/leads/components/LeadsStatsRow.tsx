import { CheckCircle2, Clock, Phone, User, XCircle, Zap, type LucideIcon } from 'lucide-react'

import type { LeadRecordStats } from '../types'

interface StatItem {
  label: string
  value: number
  icon: LucideIcon
  iconBgClassName: string
  iconClassName: string
}

export function LeadsStatsRow({ stats }: { stats: LeadRecordStats }) {
  const items: StatItem[] = [
    { label: 'Total Leads', value: stats.total, icon: User, iconBgClassName: 'bg-[#ebf1ff]', iconClassName: 'text-[#335cff]' },
    { label: 'New Leads', value: stats.newLead, icon: Zap, iconBgClassName: 'bg-[#fff3eb]', iconClassName: 'text-[#fa7319]' },
    { label: 'Contacted', value: stats.contacted, icon: Phone, iconBgClassName: 'bg-[#efebff]', iconClassName: 'text-[#7d52f4]' },
    { label: 'In Progress', value: stats.inProgress, icon: Clock, iconBgClassName: 'bg-[#fffaeb]', iconClassName: 'text-[#f6b51e]' },
    { label: 'Converted', value: stats.converted, icon: CheckCircle2, iconBgClassName: 'bg-[#e3f7ec]', iconClassName: 'text-[#1fc16b]' },
    { label: 'Not Eligible', value: stats.notEligible, icon: XCircle, iconBgClassName: 'bg-[#ffebec]', iconClassName: 'text-[#fb3748]' },
  ]

  return (
    <div className="overflow-x-auto border-y border-dashed border-[#ebebeb]">
      <div className="flex min-w-max items-center gap-7 py-6">
        {items.map((item, index) => (
          <div key={item.label} className="flex shrink-0 items-center gap-7">
            <div className="flex min-w-[136px] items-start gap-3">
              <span
                className={`flex shrink-0 items-center justify-center rounded-full p-2.5 ${item.iconBgClassName}`}
              >
                <item.icon className={`size-5 ${item.iconClassName}`} aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-[11px] font-medium whitespace-nowrap tracking-[0.22px] text-[#a3a3a3] uppercase">
                  {item.label}
                </p>
                <p className="text-base font-medium whitespace-nowrap tracking-[-0.176px] text-[#171717]">
                  {item.value}
                </p>
              </div>
            </div>
            {index < items.length - 1 ? (
              <span aria-hidden="true" className="h-10 w-px shrink-0 bg-[#ebebeb]" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
