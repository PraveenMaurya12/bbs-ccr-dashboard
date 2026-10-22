import { useMemo, useState } from 'react'
import { ListTree } from 'lucide-react'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrencyInr, formatDateOnly } from '../../../utils/leadDisplay'
import type { NormalizedTransactionRecord } from '../../../types'
import { FinancialEvidenceLevelBadge } from './FinancialEvidenceLevelBadge'
import { MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

// New BBS threshold (matches the backend's own default FINANCIAL_LARGE_TRANSACTION_MINIMUM_RUPEES) — purely a client-side display filter, the real flagging already happened server-side (see riskFlags' LARGE_TRANSACTION).
const LARGE_FILTER_THRESHOLD_RUPEES = 25000

/**
 * Every real transaction, sortable by amount, with a "large only" filter
 * (Rule 18's own Large/Unusual Transactions UI requirement) and a
 * click-row Sheet drawer for full detail — the same Radix Table+Sheet
 * drawer pattern the Debt Analysis module's AccountLevelTable already
 * established, reused here rather than reinvented.
 */
export function TransactionsTable({ transactions }: { transactions: NormalizedTransactionRecord[] }) {
  const [showLargeOnly, setShowLargeOnly] = useState(false)
  const [selected, setSelected] = useState<NormalizedTransactionRecord | null>(null)

  const visible = useMemo(() => {
    const filtered = showLargeOnly ? transactions.filter((t) => t.amount >= LARGE_FILTER_THRESHOLD_RUPEES) : transactions
    return [...filtered].sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())
  }, [transactions, showLargeOnly])

  if (transactions.length === 0) {
    return (
      <SectionCard icon={ListTree} title="Transactions">
        <NotAvailable reason="No transactions were extracted from this statement." />
      </SectionCard>
    )
  }

  return (
    <SectionCard
      icon={ListTree}
      title="Transactions"
      action={
        <button
          type="button"
          onClick={() => setShowLargeOnly((v) => !v)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${showLargeOnly ? 'bg-[#335cff] text-white' : 'bg-[#f7f7f7] text-[#5c5c5c]'}`}
        >
          Large only
        </button>
      }
    >
      <div className="max-h-[480px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Narration</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Evidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((t) => (
              <TableRow key={t.id} className="cursor-pointer" onClick={() => setSelected(t)}>
                <TableCell>{formatDateOnly(t.transactionDate)}</TableCell>
                <TableCell className="max-w-[240px] truncate" title={t.narration}>{t.narration}</TableCell>
                <TableCell>{t.subcategory ?? t.category}</TableCell>
                <TableCell className="text-[#5c5c5c]">{t.transactionType ?? '—'}</TableCell>
                <TableCell className={t.direction === 'DEBIT' ? 'text-[#fb3748]' : 'text-[#1fc16b]'}>
                  {t.direction === 'DEBIT' ? '-' : '+'}
                  {formatCurrencyInr(t.amount)}
                </TableCell>
                <TableCell><FinancialEvidenceLevelBadge level={t.evidenceLevel} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.narration}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-3 px-4 pb-4">
                <MetricRow label="Date" value={formatDateOnly(selected.transactionDate)} />
                <MetricRow label="Amount" value={formatCurrencyInr(selected.amount)} />
                <MetricRow label="Direction" value={selected.direction} />
                <MetricRow label="Balance" value={selected.balance !== null ? formatCurrencyInr(selected.balance) : 'Not reported'} />
                <MetricRow label="Category" value={selected.category} />
                <MetricRow label="Subcategory" value={selected.subcategory ?? 'Not classified'} />
                <MetricRow label="Transaction mode" value={selected.transactionType ?? 'Not identified'} />
                {selected.narrationDetail && (
                  <>
                    <MetricRow label="Reference number" value={selected.narrationDetail.referenceNumber ?? 'Not parsed'} />
                    <MetricRow label="Counterparty (raw)" value={selected.narrationDetail.counterpartyRaw ?? 'Not parsed'} />
                    <MetricRow label="Purpose" value={selected.narrationDetail.purpose ?? 'Not stated'} />
                    <MetricRow label="Counterparty bank" value={selected.narrationDetail.counterpartyBank ?? 'Not parsed'} />
                  </>
                )}
                <MetricRow label="Lender" value={selected.lender ?? 'N/A'} />
                <MetricRow label="Counterparty" value={selected.counterparty ?? 'Not identified'} />
                <MetricRow label="Confidence" value={`${Math.round(selected.confidence * 100)}%`} />
                <MetricRow label="Evidence level" value={<FinancialEvidenceLevelBadge level={selected.evidenceLevel} />} />
                <MetricRow label="Bounce evidence" value={selected.bounceEvidence ?? 'Not relevant'} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </SectionCard>
  )
}
