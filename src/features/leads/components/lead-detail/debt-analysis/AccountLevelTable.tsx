import { useState } from 'react'
import { ListTree } from 'lucide-react'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrencyInr, formatDateOnly } from '../../../utils/leadDisplay'
import type { DebtInventoryAccount } from '../../../types'
import { MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'

/**
 * Layer 5 — the account-level table backing the Debt Diagnosis panel: one
 * row per real tradeline, expandable into a drawer with every field the
 * backend's `level1.debtInventory.accounts` passthrough exposes. Uses the
 * Radix Table/Sheet primitives already installed for this app — no new
 * dependency needed.
 */
export function AccountLevelTable({ accounts }: { accounts: DebtInventoryAccount[] }) {
  const [selected, setSelected] = useState<DebtInventoryAccount | null>(null)

  if (accounts.length === 0) {
    return (
      <SectionCard icon={ListTree} title="Account-level detail">
        <NotAvailable reason="No tradeline data is available for this lead yet." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ListTree} title="Account-level detail">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lender</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Balance</TableHead>
            <TableHead>Overdue</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account, i) => (
            <TableRow key={`${account.lender}-${i}`} className="cursor-pointer" onClick={() => setSelected(account)}>
              <TableCell className="font-medium text-[#171717]">{account.lender}</TableCell>
              <TableCell>{account.accountType}</TableCell>
              <TableCell>{formatCurrencyInr(account.currentBalance)}</TableCell>
              <TableCell className={account.overdueAmount > 0 ? 'text-[#fb3748]' : undefined}>{formatCurrencyInr(account.overdueAmount)}</TableCell>
              <TableCell>{account.lifecycleStatus ?? 'Not reported'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.lender}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-3 px-4 pb-4">
                <MetricRow label="Account type" value={selected.accountType} />
                <MetricRow label="Opened on" value={formatDateOnly(selected.openedOn)} />
                <MetricRow label="Current balance" value={formatCurrencyInr(selected.currentBalance)} />
                <MetricRow label="Overdue amount" value={formatCurrencyInr(selected.overdueAmount)} />
                <MetricRow label="Monthly EMI" value={selected.monthlyEmiAmount === null ? 'Not reported' : formatCurrencyInr(selected.monthlyEmiAmount)} />
                <MetricRow label="Current DPD" value={selected.currentDpdDays === null ? 'Not reported' : `${selected.currentDpdDays} days`} />
                <MetricRow label="Max historical DPD" value={selected.maxDpdDays === null ? 'Not reported' : `${selected.maxDpdDays} days`} />
                <MetricRow label="Credit limit" value={selected.creditLimit === null ? 'N/A (not revolving)' : formatCurrencyInr(selected.creditLimit)} />
                <MetricRow label="Secured" value={selected.isSecured === null ? 'Not reported' : selected.isSecured ? 'Yes' : 'No'} />
                <MetricRow label="Lifecycle status" value={selected.lifecycleStatus ?? 'Not reported'} />
                <MetricRow label="Payment status" value={selected.paymentStatus} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </SectionCard>
  )
}
