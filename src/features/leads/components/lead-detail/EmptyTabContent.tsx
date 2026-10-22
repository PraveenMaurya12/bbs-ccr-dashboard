import type { LucideIcon } from 'lucide-react'

import { EmptyState } from '@/components/shared/EmptyState'

/**
 * Shown for every tab whose backing data model/endpoint doesn't exist yet
 * (call logs, credit-bureau/bank-analysis results, the L3 profile, recovery
 * plan, documents, timeline). Fabricating sample data for these would
 * misrepresent real customer records, so each just names what's missing.
 */
export function EmptyTabContent({
  icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="py-6">
      <EmptyState icon={icon} title={title} description={description} />
    </div>
  )
}
