import { Layers } from 'lucide-react'

import { formatCurrencyInr } from '../../../utils/leadDisplay'
import type { DebtAnalysisReport } from '../../../types'
import { ConcentrationBar } from '../shared/ConcentrationBar'
import { CardDivider, MetricRow, NotAvailable, SectionCard } from '../shared/SectionCard'
import { ThresholdBadge } from './ThresholdBadge'

const SECURED_COLOR = '#47c2ff'
const UNSECURED_COLOR = '#7d52f4'
const INSTALMENT_COLOR = '#1fc16b'
const REVOLVING_COLOR = '#7d52f4'
const SHORT_TERM_COLOR = '#fa7319'
const UNCLASSIFIED_COLOR = '#d1d1d1'

function amountFor(mix: DebtAnalysisReport['productMix'], category: string): number {
  return mix.find((m) => m.category === category)?.outstandingAmount ?? 0
}

/**
 * Layer 2 — Debt Structure (Rule 2, Rule 3, Rule 4): Secured vs Unsecured,
 * Loan vs Card (Instalment vs Revolving, per Rule 3), Short-term vs
 * Long-term, Lender concentration, Product concentration. Replaces the old
 * DebtBurdenCard with the full Rule 4 concentration breakdown and Rule 3
 * product categorization neither of which existed before this rebuild.
 */
export function DebtStructureSection({ report }: { report: DebtAnalysisReport }) {
  const { debtBurden, productMix } = report
  const instalment = amountFor(productMix, 'Instalment')
  const revolving = amountFor(productMix, 'Revolving')
  const shortTerm = amountFor(productMix, 'Short-term')
  const unclassified = amountFor(productMix, 'Unclassified')
  const productTotal = instalment + revolving + shortTerm + unclassified
  const longTerm = instalment + revolving

  return (
    <SectionCard icon={Layers} title="Debt structure">
      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Secured vs unsecured</p>
        {debtBurden.securedUnsecuredAvailable ? (
          <>
            <ConcentrationBar
              segments={[
                { percent: debtBurden.securedPercent ?? 0, color: SECURED_COLOR },
                { percent: debtBurden.unsecuredPercent ?? 0, color: UNSECURED_COLOR },
              ]}
            />
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-medium text-[#5c5c5c]">
              <span className="flex items-center gap-1">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: SECURED_COLOR }} /> Secured ({formatCurrencyInr(debtBurden.securedAmount ?? 0)})
              </span>
              <span className="flex items-center gap-1">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: UNSECURED_COLOR }} /> Unsecured ({formatCurrencyInr(debtBurden.unsecuredAmount ?? 0)})
              </span>
            </div>
          </>
        ) : (
          <NotAvailable reason="Secured/unsecured split is not available — no tradeline reports this classification." />
        )}
      </div>

      <CardDivider />

      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Loan vs card (Rule 3 product composition)</p>
        {productTotal > 0 ? (
          <>
            <ConcentrationBar
              segments={[
                { percent: Math.round((instalment / productTotal) * 100), color: INSTALMENT_COLOR },
                { percent: Math.round((revolving / productTotal) * 100), color: REVOLVING_COLOR },
                { percent: Math.round((shortTerm / productTotal) * 100), color: SHORT_TERM_COLOR },
                { percent: Math.round((unclassified / productTotal) * 100), color: UNCLASSIFIED_COLOR },
              ]}
            />
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-medium text-[#5c5c5c]">
              <span className="flex items-center gap-1"><span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: INSTALMENT_COLOR }} /> Instalment ({formatCurrencyInr(instalment)})</span>
              <span className="flex items-center gap-1"><span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: REVOLVING_COLOR }} /> Revolving ({formatCurrencyInr(revolving)})</span>
              <span className="flex items-center gap-1"><span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: SHORT_TERM_COLOR }} /> Short-term ({formatCurrencyInr(shortTerm)})</span>
              {unclassified > 0 && (
                <span className="flex items-center gap-1"><span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: UNCLASSIFIED_COLOR }} /> Unclassified ({formatCurrencyInr(unclassified)})</span>
              )}
            </div>
          </>
        ) : (
          <NotAvailable reason="No tradeline data is available for this lead yet." />
        )}
      </div>

      <CardDivider />

      <MetricRow
        label="Short-term debt share"
        value={productTotal > 0 ? `${formatCurrencyInr(shortTerm)} (${Math.round((shortTerm / productTotal) * 100)}%)` : 'N/A'}
      />
      <MetricRow
        label="Long-term (instalment + revolving) share"
        value={productTotal > 0 ? `${formatCurrencyInr(longTerm)} (${Math.round((longTerm / productTotal) * 100)}%)` : 'N/A'}
      />

      <CardDivider />

      <MetricRow
        label="Distinct lenders (all-time, incl. closed accounts)"
        value={debtBurden.numbersOfLenders}
      />

      <CardDivider />

      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.22px] text-[#a3a3a3] uppercase">Lender concentration (Rule 4)</p>
        {/* This list, and the "distinct lenders" count above, cover every lender this
            customer has EVER held a tradeline with. The Executive Overview's "Active
            lenders" tile is a deliberately different, smaller figure — only lenders
            with a currently open account — never to be read as the same number. */}
        {debtBurden.lenderConcentration.length === 0 ? (
          <NotAvailable reason="No tradeline data is available for this lead yet." />
        ) : (
          <div className="flex flex-col gap-2">
            {debtBurden.lenderConcentration.map((entry) => (
              <div key={entry.lender} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-[#171717]">{entry.lender}</span>
                <span className="shrink-0 text-sm text-[#5c5c5c]">{formatCurrencyInr(entry.outstandingAmount)}</span>
                <ThresholdBadge level={entry.sharePercent > 75 ? 'Very High' : entry.sharePercent > 50 ? 'High' : entry.sharePercent > 25 ? 'Moderate' : 'Low'} />
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
