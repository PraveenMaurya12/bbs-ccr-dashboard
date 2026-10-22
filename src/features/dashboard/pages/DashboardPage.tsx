import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'

import { PageHeader } from '@/components/shared/PageHeader'
import { QueryBoundary } from '@/components/shared/QueryBoundary'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { leadService } from '@/services/leadService'
import { recoveryPlanService } from '@/services/recoveryPlanService'
import type { StageStatus } from '@/types'

const STAGE_LABEL: Record<StageStatus, string> = {
  not_started: 'Not started',
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  requires_review: 'Needs review',
}

export default function DashboardPage() {
  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: () => leadService.listLeads(),
  })
  const recoveryPlansQuery = useQuery({
    queryKey: ['recovery-plans'],
    queryFn: () => recoveryPlanService.listRecoveryPlans(),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Placeholder overview — will be replaced once dashboard designs are provided."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QueryBoundary query={leadsQuery} loadingRows={1}>
          {(leads) => (
            <>
              <Card>
                <CardHeader>
                  <CardDescription>Total leads</CardDescription>
                  <CardTitle className="text-3xl">{leads.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Needs review</CardDescription>
                  <CardTitle className="text-3xl">
                    {
                      leads.filter((lead) =>
                        Object.values(lead.status).includes('requires_review'),
                      ).length
                    }
                  </CardTitle>
                </CardHeader>
              </Card>
            </>
          )}
        </QueryBoundary>
        <QueryBoundary query={recoveryPlansQuery} loadingRows={1}>
          {(plans) => (
            <Card>
              <CardHeader>
                <CardDescription>Active recovery plans</CardDescription>
                <CardTitle className="text-3xl">
                  {plans.filter((plan) => plan.status === 'in_progress').length}
                </CardTitle>
              </CardHeader>
            </Card>
          )}
        </QueryBoundary>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leads by pipeline stage</CardTitle>
          <CardDescription>Level 1 profile status across all leads</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={leadsQuery}>
            {(leads) => {
              const counts = leads.reduce<Record<string, number>>((acc, lead) => {
                const label = STAGE_LABEL[lead.status.level1Profile]
                acc[label] = (acc[label] ?? 0) + 1
                return acc
              }, {})
              const chartData = Object.entries(counts).map(([stage, count]) => ({
                stage,
                count,
              }))

              return (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} className="fill-primary" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            }}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  )
}
