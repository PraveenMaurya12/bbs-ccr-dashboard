import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/services/api/client'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'

interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>
  children: (data: T) => ReactNode
  isEmpty?: (data: T) => boolean
  emptyTitle?: string
  emptyDescription?: string
  loadingRows?: number
}

/** Standardizes loading / error / empty rendering for a TanStack Query result. */
export function QueryBoundary<T>({
  query,
  children,
  isEmpty,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  loadingRows,
}: QueryBoundaryProps<T>) {
  if (query.isPending) {
    return <LoadingState rows={loadingRows} />
  }

  if (query.isError) {
    const isUnauthorized =
      query.error instanceof ApiError && (query.error.status === 401 || query.error.status === 403)

    if (isUnauthorized) {
      return (
        <ErrorState
          title="Your session has expired"
          description="Log in again to continue."
          onRetry={undefined}
        >
          <Button asChild size="sm" variant="outline">
            <Link to="/login">Go to login</Link>
          </Button>
        </ErrorState>
      )
    }

    return (
      <ErrorState
        description={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => query.refetch()}
      />
    )
  }

  if (isEmpty?.(query.data)) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return <>{children(query.data)}</>
}
