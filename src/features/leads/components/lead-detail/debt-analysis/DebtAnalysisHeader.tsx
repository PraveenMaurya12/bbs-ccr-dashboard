import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatDateOnly, formatDateTime } from '../../../utils/leadDisplay'
import type { DebtAnalysisInsights } from '../../../types'

const INSIGHTS_STATUS_META: Record<DebtAnalysisInsights['status'], { label: string; textClassName: string; bgClassName: string }> = {
  QUEUED: { label: 'AI diagnosis: Queued', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  RUNNING: { label: 'AI diagnosis: Generating', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  COMPLETED: { label: 'AI diagnosis: Completed', textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  FAILED: { label: 'AI diagnosis: Failed', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
}

/**
 * Matches Figma's "Section Header [1.1]" component (node 1448:11791,
 * verified via Figma MCP get_design_context): title + description on the
 * left, neutral metadata chips on the right. Both the bureau and report-date
 * chip values come from the report's own metadata — never hardcoded to
 * "Experian", since the backend's `bureau` field is whatever the actual
 * provider/report says (see CreditReport.bureau).
 *
 * The AI-diagnosis status chip + re-run action reflect the separate
 * `DEBT_ANALYSIS_INSIGHTS` job lifecycle (QUEUED/RUNNING/COMPLETED/FAILED) —
 * a report can be a fully COMPLETED bureau pull while its AI diagnosis job
 * has failed or was never generated (e.g. older/seeded reports), and until
 * now there was no action anywhere in this tab to retry just that job. The
 * same `reprocess` endpoint used for a REQUIRES_REVIEW bureau mapping also
 * regenerates the AI insights job from the already-stored raw response —
 * no new backend endpoint needed, and no live bureau call is made.
 */
export function DebtAnalysisHeader({
  bureau,
  reportDate,
  insights,
  onReprocess,
  isReprocessing,
  reprocessRejectionReason,
}: {
  bureau: string
  reportDate: string
  insights: DebtAnalysisInsights | null
  onReprocess: () => void
  isReprocessing: boolean
  reprocessRejectionReason: string | null
}) {
  const canRetryInsights = insights === null || insights.status === 'FAILED'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium tracking-[-0.27px] text-[#171717]">Debt analysis</h2>
          <p className="text-sm text-[#5c5c5c]">
            Complete view of all loans, credit cards and credit obligations from credit report and verified documents.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg bg-[#f7f7f7] px-2 py-2 text-sm font-medium">
            <span className="text-[#5c5c5c]">Data source: </span>
            <span className="text-[#171717]">{bureau}</span>
          </span>
          <span className="rounded-lg bg-[#f7f7f7] px-2 py-2 text-sm font-medium">
            <span className="text-[#5c5c5c]">Report date: </span>
            <span className="text-[#171717]">{formatDateOnly(reportDate)}</span>
          </span>
          {insights?.generatedAt && (
            <span className="rounded-lg bg-[#f7f7f7] px-2 py-2 text-sm font-medium">
              <span className="text-[#5c5c5c]">Last analysed: </span>
              <span className="text-[#171717]">{formatDateTime(insights.generatedAt)}</span>
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              insights ? INSIGHTS_STATUS_META[insights.status].bgClassName : 'bg-[#f7f7f7]'
            } ${insights ? INSIGHTS_STATUS_META[insights.status].textClassName : 'text-[#a3a3a3]'}`}
          >
            {insights ? INSIGHTS_STATUS_META[insights.status].label : 'AI diagnosis: Not run'}
          </span>
          {canRetryInsights && (
            <Button size="sm" variant="outline" disabled={isReprocessing} onClick={onReprocess}>
              <RefreshCw className={`size-3.5 ${isReprocessing ? 'animate-spin' : ''}`} aria-hidden="true" />
              {isReprocessing ? 'Running…' : insights === null ? 'Run AI diagnosis' : 'Retry AI diagnosis'}
            </Button>
          )}
        </div>
      </div>
      {reprocessRejectionReason && <p className="text-xs text-[#fa7319]">{reprocessRejectionReason}</p>}
    </div>
  )
}
