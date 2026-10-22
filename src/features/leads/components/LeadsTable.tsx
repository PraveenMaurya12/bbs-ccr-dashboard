import { ArrowDown, ArrowUp, ArrowUpDown, Eye } from 'lucide-react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { avatarBgClassFor, avatarImageFor } from '../utils/avatars'
import { formatCurrencyInr, formatDateTime, maskPan } from '../utils/leadDisplay'
import { CreditScoreBadge } from './CreditScoreBadge'
import { LeadStatusBadge } from './LeadStatusBadge'
import type { LeadRecord } from '../types'
import type { LeadSortDirection, LeadSortField } from '../services/leadRecordsService'

// Exact column proportions from the Figma table (node 1380:94249), each
// column's px width / 1136px total content width — kept as percentages so
// they hold across the responsive viewport range rather than one fixed size.
const COLUMN_WIDTHS = {
  dateTime: '10.74%',
  name: '21.83%',
  contact: '12.24%',
  creditScore: '12.35%',
  pan: '12.35%',
  totalOverdue: '12.35%',
  status: '12.35%',
  action: '5.81%',
}

function SortableHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string
  field: LeadSortField
  sortBy: LeadSortField | undefined
  sortDir: LeadSortDirection
  onSort: (field: LeadSortField) => void
}) {
  const isActive = sortBy === field
  const Icon = isActive ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="flex items-center gap-0.5 text-[#5c5c5c] hover:text-[#171717]"
    >
      {label}
      <Icon className="size-4" aria-hidden="true" />
    </button>
  )
}

interface LeadsTableProps {
  leads: LeadRecord[]
  sortBy: LeadSortField | undefined
  sortDir: LeadSortDirection
  onSort: (field: LeadSortField) => void
  onView: (lead: LeadRecord) => void
}

export function LeadsTable({ leads, sortBy, sortDir, onSort, onView }: LeadsTableProps) {
  return (
    <Table className="table-fixed" style={{ minWidth: '1136px' }}>
      <colgroup>
        <col style={{ width: COLUMN_WIDTHS.dateTime }} />
        <col style={{ width: COLUMN_WIDTHS.name }} />
        <col style={{ width: COLUMN_WIDTHS.contact }} />
        <col style={{ width: COLUMN_WIDTHS.creditScore }} />
        <col style={{ width: COLUMN_WIDTHS.pan }} />
        <col style={{ width: COLUMN_WIDTHS.totalOverdue }} />
        <col style={{ width: COLUMN_WIDTHS.status }} />
        <col style={{ width: COLUMN_WIDTHS.action }} />
      </colgroup>
      <TableHeader>
        <TableRow className="h-9 hover:bg-transparent">
          <TableHead className="h-9 bg-[#f7f7f7]">Date & time</TableHead>
          <TableHead className="h-9 bg-[#f7f7f7]">Name</TableHead>
          <TableHead className="h-9 bg-[#f7f7f7]">
            <SortableHeader label="Contact" field="phone" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          </TableHead>
          <TableHead className="h-9 bg-[#f7f7f7]">Credit score</TableHead>
          <TableHead className="h-9 bg-[#f7f7f7]">PAN</TableHead>
          <TableHead className="h-9 bg-[#f7f7f7]">Total overdue</TableHead>
          <TableHead className="h-9 bg-[#f7f7f7]">Status</TableHead>
          <TableHead className="h-9 bg-[#f7f7f7]">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow key={lead.id} className="h-12 transition-colors hover:bg-[#f7f7f7]/60">
            <TableCell className="truncate text-[#171717]">{formatDateTime(lead.dateTime)}</TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full ${avatarBgClassFor(lead.avatarIndex)}`}
                >
                  <img src={avatarImageFor(lead.avatarIndex)} alt="" className="size-full object-cover" />
                </span>
                <span className="truncate text-[#171717]">{lead.fullName}</span>
              </div>
            </TableCell>
            <TableCell className="truncate text-[#171717]">{lead.phone}</TableCell>
            <TableCell>
              {lead.creditScore === null ? (
                <span className="text-muted-foreground text-xs">Not available</span>
              ) : (
                <CreditScoreBadge score={lead.creditScore} />
              )}
            </TableCell>
            <TableCell className="truncate text-[#171717]">
              <span
                className={lead.pan === null ? 'text-muted-foreground text-xs' : undefined}
                title="Masked — full PAN is never shown in a list view"
              >
                {maskPan(lead.pan)}
              </span>
            </TableCell>
            <TableCell className="truncate text-[#171717]">
              {lead.totalOverdue === null ? (
                <span className="text-muted-foreground text-xs">Not available</span>
              ) : (
                formatCurrencyInr(lead.totalOverdue)
              )}
            </TableCell>
            <TableCell>
              <LeadStatusBadge status={lead.status} />
            </TableCell>
            <TableCell>
              <button
                type="button"
                onClick={() => onView(lead)}
                className="flex size-6 items-center justify-center rounded-md text-[#5c5c5c] transition-colors hover:bg-[#ebebeb] hover:text-[#171717]"
                aria-label={`View lead ${lead.fullName}`}
              >
                <Eye className="size-5" aria-hidden="true" />
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
