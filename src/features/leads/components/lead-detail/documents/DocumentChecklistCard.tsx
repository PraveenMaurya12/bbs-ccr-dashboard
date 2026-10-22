import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, CreditCard } from 'lucide-react'

import {
  DOCUMENT_CHECKLIST_GROUPS,
  TOTAL_CHECKLIST_SLOTS,
  countUploadedSlots,
  isSlotUploaded,
  type ChecklistGroupConfig,
} from '../../../utils/documentChecklist'
import type { LeadDocument } from '../../../types'

function ChecklistRow({
  item,
  uploaded,
}: {
  item: ChecklistGroupConfig['items'][number]
  uploaded: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
            item.required ? 'bg-[#fff3eb] text-[#fa7319]' : 'bg-[#efebff] text-[#7d52f4]'
          }`}
        >
          <CreditCard className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 truncate text-sm text-[#171717]">{item.label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-xs text-[#5c5c5c]">{item.required ? 'Required' : 'Optional'}</span>
        {uploaded ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-[#e3f7ec] px-2 py-1 text-xs font-medium text-[#1fc16b]">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Uploaded
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-[#fff3eb] px-2 py-1 text-xs font-medium text-[#fa7319]">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            Pending
          </span>
        )}
      </div>
    </div>
  )
}

function ChecklistGroup({ group, documents }: { group: ChecklistGroupConfig; documents: LeadDocument[] }) {
  const [expanded, setExpanded] = useState(true)
  const allUploaded = group.items.every((item) => isSlotUploaded(item.type, documents))
  const contentId = `checklist-group-${group.title.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <div className="border-b border-[#ebebeb] last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="flex items-center gap-2.5">
          {allUploaded ? (
            <CheckCircle2 className="size-4 text-[#1fc16b]" aria-hidden="true" />
          ) : (
            <span className="size-4 rounded-full border border-[#ebebeb]" aria-hidden="true" />
          )}
          <span className="text-sm font-medium text-[#171717]">{group.title}</span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-[#5c5c5c] transition-transform duration-200 motion-reduce:transition-none ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>
      <div
        id={contentId}
        className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0">
          <div className="flex flex-col divide-y divide-[#ebebeb] pl-1">
            {group.items.map((item) => (
              <ChecklistRow key={item.type} item={item} uploaded={isSlotUploaded(item.type, documents)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function DocumentChecklistCard({ documents }: { documents: LeadDocument[] }) {
  const pendingCount = TOTAL_CHECKLIST_SLOTS - countUploadedSlots(documents)

  return (
    <div className="rounded-xl border border-[#ebebeb] bg-white p-4">
      <div className="flex items-center justify-between pb-3">
        <h3 className="text-base font-semibold text-[#171717]">Document Checklist</h3>
        {pendingCount > 0 ? (
          <span className="rounded-md bg-[#fff3eb] px-2.5 py-1 text-xs font-medium text-[#fa7319]">
            {pendingCount} Pending
          </span>
        ) : (
          <span className="rounded-md bg-[#e3f7ec] px-2.5 py-1 text-xs font-medium text-[#1fc16b]">Complete</span>
        )}
      </div>
      <div className="flex flex-col">
        {DOCUMENT_CHECKLIST_GROUPS.map((group) => (
          <ChecklistGroup key={group.title} group={group} documents={documents} />
        ))}
      </div>
    </div>
  )
}
