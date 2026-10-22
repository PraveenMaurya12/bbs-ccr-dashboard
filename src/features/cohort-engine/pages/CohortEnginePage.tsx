import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function CohortEnginePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cohort Engine"
        description="Placeholder — will be replaced once dashboard designs are provided."
      />
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>
            Cohort placement rules and Level 3 recommendations will surface here.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  )
}
