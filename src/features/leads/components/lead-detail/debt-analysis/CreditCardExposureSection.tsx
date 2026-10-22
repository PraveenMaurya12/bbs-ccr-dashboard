import { CreditCard } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { DebtUtilization } from '../../../types'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'
import { ThresholdBadge } from './ThresholdBadge'

/**
 * Layer 3 — Credit Card Exposure (Rule 6): every revolving facility shown
 * individually, each with its own BBS analytical utilization threshold, so
 * the portfolio average below never hides one high-utilization account —
 * the spec's own explicit requirement. Replaces the old portfolio-only
 * CreditUtilizationCard.
 */
export function CreditCardExposureSection({ utilization }: { utilization: DebtUtilization }) {
  if (!utilization.available) {
    return (
      <SectionCard icon={CreditCard} title="Credit card exposure">
        <NotAvailable reason={utilization.unavailableReason} />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={CreditCard} title="Credit card exposure">
      <MetricRow label="Portfolio utilization" value={`${utilization.utilizationPercent}%`} />
      <MetricRow label="Total credit limit" value={formatCurrencyInr(utilization.totalCreditLimit ?? 0)} />
      <MetricRow label="Current utilization" value={formatCurrencyInr(utilization.currentUtilization ?? 0)} />
      <MetricRow label="Available credit limit" value={formatCurrencyInr(utilization.availableCreditLimit ?? 0)} />

      <CardDivider />

      <div className="flex flex-col gap-2">
        {utilization.cards.map((card, i) => (
          <div key={`${card.lender}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-[#f7f7f7] p-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#171717]">{card.lender}</p>
              <p className="text-xs text-[#5c5c5c]">
                {formatCurrencyInr(card.currentBalance)} / {formatCurrencyInr(card.creditLimit)}
                {card.overdueAmount > 0 && <span className="text-[#fb3748]"> · overdue {formatCurrencyInr(card.overdueAmount)}</span>}
              </p>
            </div>
            <ThresholdBadge level={card.level} />
          </div>
        ))}
      </div>

      {utilization.highestUtilizedCard && (
        <p className="text-xs text-[#a3a3a3]">
          Highest-utilized: {utilization.highestUtilizedCard.lender} at {utilization.highestUtilizedCard.utilizationPercent}% — the portfolio
          average above does not hide this account.
        </p>
      )}
    </SectionCard>
  )
}
