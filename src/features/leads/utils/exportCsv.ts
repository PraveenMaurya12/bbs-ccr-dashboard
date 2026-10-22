import { STATUS_META, formatDateTime, maskPan } from './leadDisplay'
import type { LeadRecord } from '../types'

const HEADERS = ['Date & time', 'Name', 'Contact', 'Credit score', 'PAN', 'Total overdue', 'Status', 'Source']

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function leadsToCsv(records: LeadRecord[]): string {
  const rows = records.map((record) =>
    [
      formatDateTime(record.dateTime),
      record.fullName,
      record.phone,
      record.creditScore === null ? 'Not available' : String(record.creditScore),
      maskPan(record.pan),
      record.totalOverdue === null ? 'Not available' : String(record.totalOverdue),
      STATUS_META[record.status].label,
      record.source,
    ]
      .map(csvEscape)
      .join(','),
  )

  return [HEADERS.join(','), ...rows].join('\n')
}

export function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
