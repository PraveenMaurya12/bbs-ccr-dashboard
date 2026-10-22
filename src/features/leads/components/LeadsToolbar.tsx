import { Filter, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { STATUS_META } from '../utils/leadDisplay'
import type { LeadFunnelStatus, LeadSourceChannel } from '../types'

const TABS: { label: string; value: 'all' | LeadSourceChannel }[] = [
  { label: 'All', value: 'all' },
  { label: 'Website', value: 'website' },
  { label: 'Partner', value: 'partner' },
]

const ALL_STATUSES = Object.keys(STATUS_META) as LeadFunnelStatus[]

interface LeadsToolbarProps {
  tab: 'all' | LeadSourceChannel
  onTabChange: (tab: 'all' | LeadSourceChannel) => void
  search: string
  onSearchChange: (value: string) => void
  statuses: LeadFunnelStatus[]
  onStatusesChange: (statuses: LeadFunnelStatus[]) => void
  creditScoreFilterAvailable: boolean
  minCreditScore: number | undefined
  maxCreditScore: number | undefined
  onCreditScoreChange: (min: number | undefined, max: number | undefined) => void
  activeFilterCount: number
  onResetFilters: () => void
}

export function LeadsToolbar({
  tab,
  onTabChange,
  search,
  onSearchChange,
  statuses,
  onStatusesChange,
  creditScoreFilterAvailable,
  minCreditScore,
  maxCreditScore,
  onCreditScoreChange,
  activeFilterCount,
  onResetFilters,
}: LeadsToolbarProps) {
  function toggleStatus(status: LeadFunnelStatus, checked: boolean) {
    onStatusesChange(checked ? [...statuses, status] : statuses.filter((s) => s !== status))
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex w-full gap-1 rounded-[10px] bg-[#f7f7f7] p-1 sm:w-80">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onTabChange(t.value)}
            className={cn(
              'flex-1 rounded-md px-3 py-1 text-sm font-medium tracking-[-0.084px] transition-colors',
              tab === t.value
                ? 'bg-white text-[#171717] shadow-[0_6px_10px_0_rgba(14,18,27,0.06),0_2px_4px_0_rgba(14,18,27,0.03)]'
                : 'text-[#a3a3a3] hover:text-[#171717]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex flex-1 items-center justify-end gap-3">
        <div className="relative w-full max-w-[300px]">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-5 -translate-y-1/2 text-[#a3a3a3]"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            aria-label="Search leads by name, phone, or PAN"
            className="rounded-lg border-[#ebebeb] pl-9 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-[#ebebeb] px-1.5 py-0.5 text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">
            ⌘1
          </kbd>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-1.5 border-[#ebebeb]">
              <Filter className="size-5" aria-hidden="true" />
              Filter
              {activeFilterCount > 0 ? (
                <span className="bg-primary flex size-4 items-center justify-center rounded-full text-[10px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Status</p>
              <div className="space-y-2">
                {ALL_STATUSES.map((status) => (
                  <label key={status} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={statuses.includes(status)}
                      onCheckedChange={(checked) => toggleStatus(status, checked === true)}
                    />
                    {STATUS_META[status].label}
                  </label>
                ))}
              </div>
            </div>

            {creditScoreFilterAvailable ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Credit score</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Min"
                    value={minCreditScore ?? ''}
                    onChange={(e) =>
                      onCreditScoreChange(e.target.value ? Number(e.target.value) : undefined, maxCreditScore)
                    }
                    className="h-8"
                  />
                  <span className="text-muted-foreground text-sm">–</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Max"
                    value={maxCreditScore ?? ''}
                    onChange={(e) =>
                      onCreditScoreChange(minCreditScore, e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="h-8"
                  />
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                Credit score filtering isn't available yet — the connected backend doesn't expose a
                credit score per lead.
              </p>
            )}

            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={onResetFilters}>
                Reset filters
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
