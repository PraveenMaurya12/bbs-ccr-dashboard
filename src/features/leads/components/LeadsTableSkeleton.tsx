import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const COLUMNS = ['Date & time', 'Name', 'Contact', 'Credit score', 'PAN', 'Total overdue', 'Status', 'Action']

export function LeadsTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <Table role="status" aria-label="Loading leads">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {COLUMNS.map((column) => (
            <TableHead key={column} className="bg-[#f7f7f7]">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex} className="h-12">
            {COLUMNS.map((column) => (
              <TableCell key={column}>
                <Skeleton className="h-4 w-full max-w-24" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
