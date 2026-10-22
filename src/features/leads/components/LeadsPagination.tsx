import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

function buildPageList(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages = new Set([1, 2, total - 1, total, current - 1, current, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)

  const result: (number | 'ellipsis')[] = []
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1]! > 1) {
      result.push('ellipsis')
    }
    result.push(page)
  })
  return result
}

interface LeadsPaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function LeadsPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: LeadsPaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const pages = buildPageList(page, totalPages)

  const buttonClass =
    'flex size-8 items-center justify-center rounded-lg text-[#5c5c5c] transition-colors hover:bg-[#f7f7f7] disabled:pointer-events-none disabled:opacity-40'

  return (
    <div className="flex flex-wrap items-center gap-4 pt-4">
      <p className="w-full text-sm text-[#5c5c5c] sm:w-auto">
        Showing {start} to {end} of {total} entries
      </p>

      <div className="flex flex-1 items-center justify-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={page === 1}
          onClick={() => onPageChange(1)}
          aria-label="First page"
        >
          <ChevronsLeft className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2">
          {pages.map((p, index) =>
            p === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="flex size-8 items-center justify-center text-sm text-[#5c5c5c]">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                className={cn(
                  'flex size-8 items-center justify-center rounded-lg border text-sm font-medium transition-colors',
                  p === page
                    ? 'border-transparent bg-[#f7f7f7] text-[#171717]'
                    : 'border-[#ebebeb] text-[#5c5c5c] hover:bg-[#f7f7f7]',
                )}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          className={buttonClass}
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={page === totalPages}
          onClick={() => onPageChange(totalPages)}
          aria-label="Last page"
        >
          <ChevronsRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-0.5 rounded-lg border border-[#ebebeb] bg-white py-1.5 pr-1.5 pl-2.5 text-sm text-[#5c5c5c] shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)] outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          {pageSize} entries / page
          <ChevronDown className="size-5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {PAGE_SIZE_OPTIONS.map((size) => (
            <DropdownMenuItem key={size} onClick={() => onPageSizeChange(size)}>
              {size} entries / page
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
