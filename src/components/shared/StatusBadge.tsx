import { Badge } from '@/components/ui/badge'
import type { StageStatus } from '@/types'

const STATUS_LABEL: Record<StageStatus, string> = {
  not_started: 'Not started',
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  requires_review: 'Needs review',
}

const STATUS_VARIANT: Record<StageStatus, 'secondary' | 'outline' | 'success' | 'destructive' | 'warning'> = {
  not_started: 'outline',
  pending: 'secondary',
  in_progress: 'secondary',
  completed: 'success',
  failed: 'destructive',
  requires_review: 'warning',
}

export function StatusBadge({ status }: { status: StageStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
}
