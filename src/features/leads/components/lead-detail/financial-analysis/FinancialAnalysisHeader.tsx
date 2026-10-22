import { Landmark } from 'lucide-react'

import { formatDateTime } from '../../../utils/leadDisplay'
import type { FinancialStatementInfo } from '../../../types'
import { DataAvailabilityBadge } from './DataAvailabilityBadge'

/** Account/statement header — bank/masked account/period/document/tx-count/generated-date/data-quality, per the spec's own requirement. */
export function FinancialAnalysisHeader({ statement }: { statement: FinancialStatementInfo }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ebebeb] bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#ebf1ff]">
          <Landmark className="size-5 text-[#335cff]" aria-hidden="true" />
        </span>
        <div>
          <p className="text-base font-medium text-[#171717]">
            {statement.bankName ?? 'Bank not reported'} {statement.accountNumberMasked ? `· ${statement.accountNumberMasked}` : ''}
            {statement.accountType ? ` · ${statement.accountType}` : ''}
          </p>
          <p className="text-xs text-[#5c5c5c]">
            {statement.statementPeriodStart && statement.statementPeriodEnd
              ? `${formatDateTime(statement.statementPeriodStart)} – ${formatDateTime(statement.statementPeriodEnd)}`
              : 'Statement period not reported'}
            {statement.accountHolderName ? ` · ${statement.accountHolderName}` : ''}
            {statement.ifscCode ? ` · ${statement.ifscCode}` : ''}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-[#5c5c5c]">
        <span>{statement.transactionCount ?? 0} transactions</span>
        <span>{statement.monthsCovered ?? 0} months</span>
        <span>Source: {statement.sourceFileFormat}</span>
        {statement.extractionConfidence !== null && (
          <span className={statement.sourceFileFormat === 'PDF' ? 'text-[#f6b51e]' : undefined}>
            Extraction confidence: {Math.round(statement.extractionConfidence * 100)}%
          </span>
        )}
        {statement.generatedAt ? <span>Generated {formatDateTime(statement.generatedAt)}</span> : <DataAvailabilityBadge availability="NOT_REPORTED" />}
      </div>
    </div>
  )
}
