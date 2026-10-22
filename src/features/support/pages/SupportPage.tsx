import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SupportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description="Placeholder — will be replaced once dashboard designs are provided."
      />
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>Internal help resources and escalation contacts will live here.</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  )
}
