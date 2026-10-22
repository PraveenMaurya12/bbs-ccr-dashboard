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
import { recoveryPlanService } from '@/services/recoveryPlanService'

const PLAN_TYPE_LABEL: Record<string, string> = {
  standard_emi: 'Standard EMI',
  restructured_emi: 'Restructured EMI',
  settlement: 'Settlement',
  legal_recovery: 'Legal recovery',
}

export default function RecoveryPlansPage() {
  const recoveryPlansQuery = useQuery({
    queryKey: ['recovery-plans'],
    queryFn: () => recoveryPlanService.listRecoveryPlans(),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recovery Plans"
        description="Placeholder list — will be replaced once dashboard designs are provided."
      />

      <Card>
        <CardContent>
          <QueryBoundary
            query={recoveryPlansQuery}
            isEmpty={(plans) => plans.length === 0}
            emptyTitle="No recovery plans yet"
            emptyDescription="Recovery plans appear here once a customer is placed into a cohort."
          >
            {(plans) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead ID</TableHead>
                    <TableHead>Plan type</TableHead>
                    <TableHead>Principal</TableHead>
                    <TableHead>Tenure</TableHead>
                    <TableHead>Owner CCR</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">{plan.leadId}</TableCell>
                      <TableCell>{PLAN_TYPE_LABEL[plan.planType]}</TableCell>
                      <TableCell>
                        {new Intl.NumberFormat('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          maximumFractionDigits: 0,
                        }).format(plan.principalAmount)}
                      </TableCell>
                      <TableCell>{plan.tenureMonths} months</TableCell>
                      <TableCell>{plan.ownerCcrName}</TableCell>
                      <TableCell>
                        <StatusBadge status={plan.status} />
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
