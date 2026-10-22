import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  children?: ReactNode
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'This section could not be loaded. Please try again.',
  onRetry,
  children,
}: ErrorStateProps) {
  return (
    <div className="border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center gap-3 rounded-lg border px-6 py-16 text-center">
      <AlertTriangle className="text-destructive size-8" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
      {children}
    </div>
  )
}
