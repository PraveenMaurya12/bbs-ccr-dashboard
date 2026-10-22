import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const SETTINGS_SECTIONS = [
  {
    title: 'Profile',
    description: 'Manage your CCR account details and contact information.',
  },
  {
    title: 'Notifications',
    description: 'Choose how you are alerted about lead and assessment updates.',
  },
  {
    title: 'Team & permissions',
    description: 'Placeholder for future role and access management.',
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Placeholder — will be replaced once dashboard designs are provided."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">Coming soon</CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
