import { useQuery } from '@tanstack/react-query'

import { PageHeader } from '@/components/shared/PageHeader'
import { QueryBoundary } from '@/components/shared/QueryBoundary'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { leadService } from '@/services/leadService'

/**
 * Landing placeholder for the Level 1 / Level 2 / Level 3 assessment flow.
 * Each level will get its own dedicated screen (see the level-1-credit,
 * level-2-financial and level-3-assessment feature folders) once designs
 * are provided; for now this surfaces pipeline status across all three.
 */
export default function FinancialAssessmentsPage() {
  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: () => leadService.listLeads(),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Assessments"
        description="Placeholder list — will be replaced once dashboard designs are provided."
      />

      <Card>
        <CardContent>
          <QueryBoundary
            query={leadsQuery}
            isEmpty={(leads) => leads.length === 0}
            emptyTitle="No assessments yet"
          >
            {(leads) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Level 1</TableHead>
                    <TableHead>Level 2</TableHead>
                    <TableHead>Level 3</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">{lead.leadId}</TableCell>
                      <TableCell>{lead.fullName}</TableCell>
                      <TableCell>
                        <StatusBadge status={lead.status.level1Profile} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={lead.status.level2Profile} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={lead.status.level3Assessment} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  )
}
