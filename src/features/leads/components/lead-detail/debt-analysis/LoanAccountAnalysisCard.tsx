import { FileChartLine } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

import type { DebtAccountTypeSlice } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'

// Figma's exact 5-color legend-dot palette (node 1457:7400, "Chart Legend
// Dots [1.1]" — Orange/Green/Purple/Pink/Blue), cycling for however many
// distinct account types the bureau report happens to contain — not tied
// to any specific account type.
const SLICE_COLORS = ['#fa7319', '#1fc16b', '#7d52f4', '#fb4ba3', '#335cff']

export function LoanAccountAnalysisCard({
  totalAccounts,
  slices,
}: {
  totalAccounts: number
  slices: DebtAccountTypeSlice[]
}) {
  if (totalAccounts === 0) {
    return (
      <SectionCard icon={FileChartLine} title="Loan & account analysis">
        <NotAvailable reason="No tradeline data is available for this lead yet." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={FileChartLine} title="Loan & account analysis">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <div className="relative h-[282px] w-[282px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="count"
                nameKey="accountType"
                innerRadius="62%"
                outerRadius="100%"
                stroke="none"
                isAnimationActive={false}
              >
                {slices.map((slice, i) => (
                  <Cell key={slice.accountType} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl leading-8 font-medium text-[#171717]">{totalAccounts}</p>
            <p className="text-base leading-6 tracking-[-0.176px] text-[#5c5c5c]">Total accounts</p>
          </div>
        </div>
        <div className="flex w-[296px] flex-1 flex-col gap-4">
          {slices.map((slice, i) => (
            <div key={slice.accountType} className="flex w-full items-center gap-2">
              <span
                className="size-5 shrink-0 rounded-full"
                style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
              />
              <span className="min-w-0 flex-1 text-lg leading-6 font-medium tracking-[-0.27px] text-[#5c5c5c]">
                {slice.accountType}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-lg leading-6 font-medium tracking-[-0.27px] whitespace-nowrap">
                <span className="text-[#171717]">{slice.count}</span>
                <span className="text-[#d1d1d1]">∙</span>
                <span className="text-[#5c5c5c]">{slice.percent}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}
