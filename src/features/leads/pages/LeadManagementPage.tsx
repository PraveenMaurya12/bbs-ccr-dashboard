import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { env } from '@/lib/env'
import { AddManualLeadDialog } from '../components/AddManualLeadDialog'
import { LeadsPagination } from '../components/LeadsPagination'
import { LeadsSectionHeader } from '../components/LeadsSectionHeader'
import { LeadsStatsRow } from '../components/LeadsStatsRow'
import { LeadsTable } from '../components/LeadsTable'
import { LeadsTableSkeleton } from '../components/LeadsTableSkeleton'
import { LeadsToolbar } from '../components/LeadsToolbar'
import {
  leadRecordsService,
  type LeadRecordsQuery,
  type LeadSortDirection,
  type LeadSortField,
} from '../services/leadRecordsService'
import { downloadCsv, leadsToCsv } from '../utils/exportCsv'
import type { CreateLeadFormValues } from '../schema'
import type { LeadFunnelStatus, LeadSourceChannel } from '../types'

const DEFAULT_PAGE_SIZE = 10

export default function LeadManagementPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [tab, setTab] = useState<'all' | LeadSourceChannel>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<LeadFunnelStatus[]>([])
  const [minCreditScore, setMinCreditScore] = useState<number | undefined>(undefined)
  const [maxCreditScore, setMaxCreditScore] = useState<number | undefined>(undefined)
  const [sortBy, setSortBy] = useState<LeadSortField | undefined>(undefined)
  const [sortDir, setSortDir] = useState<LeadSortDirection>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // Debounce free-text search so every keystroke doesn't refetch.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const creditScoreFilterAvailable = env.apiMode !== 'api'

  const query: LeadRecordsQuery = {
    search,
    tab,
    statuses,
    minCreditScore: creditScoreFilterAvailable ? minCreditScore : undefined,
    maxCreditScore: creditScoreFilterAvailable ? maxCreditScore : undefined,
    sortBy,
    sortDir,
    page,
    pageSize,
  }

  const leadsQuery = useQuery({
    queryKey: ['leadRecords', query],
    queryFn: () => leadRecordsService.list(query),
    placeholderData: (previous) => previous,
  })

  const createMutation = useMutation({
    mutationFn: (values: CreateLeadFormValues) =>
      leadRecordsService.create({
        fullName: values.fullName,
        phone: values.phone,
        email: values.email,
        city: values.city,
        source: values.source,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadRecords'] })
    },
  })

  function handleTabChange(nextTab: 'all' | LeadSourceChannel) {
    setTab(nextTab)
    setPage(1)
  }

  function handleStatusesChange(next: LeadFunnelStatus[]) {
    setStatuses(next)
    setPage(1)
  }

  function handleCreditScoreChange(min: number | undefined, max: number | undefined) {
    setMinCreditScore(min)
    setMaxCreditScore(max)
    setPage(1)
  }

  function handleResetFilters() {
    setStatuses([])
    setMinCreditScore(undefined)
    setMaxCreditScore(undefined)
    setPage(1)
  }

  function handleSort(field: LeadSortField) {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  async function handleExport() {
    const rows = await leadRecordsService.listAllMatching(query)
    const csv = leadsToCsv(rows)
    downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  const activeFilterCount =
    statuses.length + (minCreditScore !== undefined ? 1 : 0) + (maxCreditScore !== undefined ? 1 : 0)

  return (
    <div className="space-y-4">
      <LeadsSectionHeader
        onExport={handleExport}
        onAddManualLead={() => setAddDialogOpen(true)}
        exportDisabled={leadsQuery.isPending}
      />

      {leadsQuery.data ? (
        <LeadsStatsRow stats={leadsQuery.data.stats} />
      ) : (
        <div className="h-[88px] animate-pulse rounded-lg bg-[#f7f7f7]" />
      )}

      <LeadsToolbar
        tab={tab}
        onTabChange={handleTabChange}
        search={searchInput}
        onSearchChange={setSearchInput}
        statuses={statuses}
        onStatusesChange={handleStatusesChange}
        creditScoreFilterAvailable={creditScoreFilterAvailable}
        minCreditScore={minCreditScore}
        maxCreditScore={maxCreditScore}
        onCreditScoreChange={handleCreditScoreChange}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
      />

      <div>
        <div>
          {leadsQuery.isPending ? (
            <LeadsTableSkeleton rows={pageSize} />
          ) : leadsQuery.isError ? (
            <div className="p-6">
              <ErrorState onRetry={() => leadsQuery.refetch()} />
            </div>
          ) : leadsQuery.data.items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No leads match these filters"
                description="Try a different search term or reset your filters."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <LeadsTable
                leads={leadsQuery.data.items}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                onView={(lead) => navigate(`/leads/${lead.bbsLeadId ?? lead.id}`)}
              />
            </div>
          )}

          {leadsQuery.data ? (
            <div>
              <LeadsPagination
                page={page}
                totalPages={leadsQuery.data.totalPages}
                total={leadsQuery.data.total}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <AddManualLeadDialog
        key={addDialogOpen ? 'add-lead-open' : 'add-lead-closed'}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={(values) => createMutation.mutateAsync(values).then(() => {})}
      />
    </div>
  )
}
