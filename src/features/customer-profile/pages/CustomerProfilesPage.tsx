import { useQuery } from '@tanstack/react-query'

import { PageHeader } from '@/components/shared/PageHeader'
import { QueryBoundary } from '@/components/shared/QueryBoundary'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { customerService } from '@/services/customerService'

const STAGE_LABEL: Record<string, string> = {
  lead: 'Lead',
  credit_reviewed: 'Credit reviewed',
  financially_assessed: 'Financially assessed',
  cohort_decided: 'Cohort decided',
  in_recovery_plan: 'In recovery plan',
  onboarded: 'Onboarded',
  rejected: 'Rejected',
}

export default function CustomerProfilesPage() {
  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: () => customerService.listCustomers(),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Profiles"
        description="Placeholder list — will be replaced once dashboard designs are provided."
      />

      <Card>
        <CardContent>
          <QueryBoundary
            query={customersQuery}
            isEmpty={(customers) => customers.length === 0}
            emptyTitle="No customer profiles yet"
            emptyDescription="Customers appear here once a lead clears credit review."
          >
            {(customers) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Occupation</TableHead>
                    <TableHead>Stage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.customerId}</TableCell>
                      <TableCell>{customer.fullName}</TableCell>
                      <TableCell>{customer.city}</TableCell>
                      <TableCell>{customer.occupation}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{STAGE_LABEL[customer.stage]}</Badge>
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
